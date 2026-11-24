// Serviço de publicação falso, para os testes do comando publicar. Segue o contrato HTTP de
// sites.autonomia.site: login por código (iniciar/consultar), lista de sites, envio em partes,
// concluir e voltar. Também simula o que o servidor real faz fora do caminho feliz: pedido com
// expira_em no passado (relógio diferente), aprovação no meio da espera, resposta do concluir que se
// perde (socket cai ou o proxy devolve 504) e códigos de erro que o contrato não listava.
// Toda resposta é JSON; erro é {"ok":false,"codigo","mensagem"}. Só escuta em 127.0.0.1.
// Portado do Site Estúdio (kit/testes/servico-falso.mjs): o painel é o mesmo para sites e apresentações.
import http from 'node:http';
import crypto from 'node:crypto';

const CODIGO_CURTO = 'BCDF-GHJK';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function responder(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(corpo));
}
const erro = (res, status, codigo) => responder(res, status, { ok: false, codigo, mensagem: `frase simples de ${codigo}` });

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    req.on('data', (p) => pedacos.push(p));
    req.on('end', () => resolve(Buffer.concat(pedacos)));
    req.on('error', reject);
  });
}

export async function subirServicoFalso({ parteMax = 1000 } = {}) {
  const e = {
    iniciados: 0,
    consultas: 0,
    pedidos: new Map(),
    chaves: new Set(),
    envios: new Map(),
    tentativasDaParte: new Map(),
    derrubarParte: new Set(),
    publicados: [],
    voltas: [],
    autorizacoes: [],
    erroAoAbrir: null,
    erroAoConcluir: null,
    erroAoVoltar: null,
    enderecoDoSite: null,
    expiraDelta: 600000, // expira_em = agora + expiraDelta; negativo simula relógio local adiantado
    aprovarNaConsulta: 0, // aprova os pendentes quando a contagem de consultas chegar a este número
    concluirCai: null, // 'socket' publica e derruba; '504' publica e responde como proxy; 'sem_publicar' derruba e deixa pendente
    pendentes: [],
    aberturas: 0,
    listagens: 0,
  };
  let base = '';

  function login(caminho, res, dados) {
    if (caminho === '/api/estudio/login/iniciar') {
      e.iniciados += 1;
      const dispositivo = `disp_${crypto.randomBytes(24).toString('hex')}`;
      e.pedidos.set(dispositivo, { estado: 'pendente', nome: dados.nome_maquina });
      return responder(res, 200, {
        ok: true, codigo_dispositivo: dispositivo, codigo_curto: CODIGO_CURTO, endereco: `${base}/estudio/ligar`,
        expira_em: Date.now() + e.expiraDelta, intervalo_s: 5,
      });
    }
    e.consultas += 1;
    if (e.aprovarNaConsulta && e.consultas >= e.aprovarNaConsulta) aprovarPendentes();
    const p = e.pedidos.get(dados.codigo_dispositivo);
    if (!p) return responder(res, 404, { ok: false, estado: 'invalido', erro: 'Pedido desconhecido.' });
    if (p.estado === 'recusado') return responder(res, 403, { ok: false, estado: 'recusado', erro: 'Recusado.' });
    if (p.estado === 'entregue') return responder(res, 410, { ok: false, estado: 'ja_entregue', erro: 'Já entregue.' });
    if (p.estado === 'pendente') return responder(res, 202, { ok: true, estado: 'aguardando', mensagem: 'Aguardando.' });
    p.estado = 'entregue';
    const chave = `se_pub_${crypto.randomBytes(32).toString('base64url')}`;
    e.chaves.add(chave);
    return responder(res, 200, { ok: true, estado: 'entregue', chave, email: 'pessoa@exemplo.com' });
  }

  async function parte(req, res, id, n) {
    const envio = e.envios.get(id);
    if (!envio) return erro(res, 404, 'ENVIO_INEXISTENTE');
    const vez = (e.tentativasDaParte.get(n) || 0) + 1;
    e.tentativasDaParte.set(n, vez);
    if (vez === 1 && e.derrubarParte.has(n)) {
      req.socket.destroy(); // queda de rede no meio do envio
      return undefined;
    }
    const bytes = await lerCorpo(req);
    if (bytes.length > parteMax) return erro(res, 413, 'PARTE_GRANDE_DEMAIS');
    if (sha256(bytes) !== req.headers['x-parte-sha256']) return erro(res, 400, 'PARTE_CORROMPIDA');
    if (envio.partes.has(n) && !envio.partes.get(n).equals(bytes)) return erro(res, 409, 'PARTE_DIFERENTE');
    envio.partes.set(n, bytes);
    return responder(res, 200, { ok: true, recebidas: envio.partes.size, partes: envio.total });
  }

  const aprovarPendentes = () => e.pedidos.forEach((p) => { if (p.estado === 'pendente') p.estado = 'aprovado'; });
  const enderecoDe = (slug) => e.enderecoDoSite || `${base}/no-ar/${slug}/`;

  function publicarNoDisco(slug, zip) {
    const versao = e.publicados.filter((p) => p.slug === slug).length + 1;
    e.publicados.push({ slug, versao, zip });
    return versao;
  }

  function concluir(req, res, id) {
    const envio = e.envios.get(id);
    if (!envio) return erro(res, 404, 'ENVIO_INEXISTENTE');
    if (envio.partes.size !== envio.total) return erro(res, 409, 'FALTAM_PARTES');
    const zip = Buffer.concat([...Array(envio.total).keys()].map((n) => envio.partes.get(n)));
    if (sha256(zip) !== envio.sha256) return erro(res, 400, 'PACOTE_CORROMPIDO');
    e.envios.delete(id);
    const modoQueda = e.concluirCai;
    e.concluirCai = null;
    if (modoQueda === 'sem_publicar') {
      e.pendentes.push({ slug: envio.slug, zip });
      return req.socket.destroy();
    }
    const versao = publicarNoDisco(envio.slug, zip);
    if (modoQueda === 'socket') return req.socket.destroy();
    if (modoQueda === '504') {
      res.writeHead(504, { 'content-type': 'text/html' });
      return res.end('<html>Gateway Timeout</html>');
    }
    if (e.erroAoConcluir) return erro(res, e.erroAoConcluir.status, e.erroAoConcluir.codigo);
    return responder(res, 200, { ok: true, slug: envio.slug, versao, endereco: enderecoDe(envio.slug) });
  }

  // GET /api/estudio/sites: versão no ar = a última publicada de cada site.
  function listar(res) {
    e.listagens += 1;
    const slugs = [...new Set(e.publicados.map((p) => p.slug))];
    const sites = slugs.map((slug) => {
      const versoes = e.publicados.filter((p) => p.slug === slug).map((p) => ({ versao: p.versao, quando: Date.now(), bytes: p.zip.length }));
      return { slug, endereco: enderecoDe(slug), estado: 'no_ar', versao: versoes[versoes.length - 1].versao, versoes };
    });
    const limites = { sites_max: 5, sites_usados: sites.length, publicacoes_hoje: e.publicados.length, publicacoes_max_dia: 20, mb_max: 50 };
    return responder(res, 200, { ok: true, sites, limites });
  }

  async function estudio(req, res, partes) {
    const autorizacao = String(req.headers.authorization || '');
    e.autorizacoes.push(autorizacao);
    if (!autorizacao.startsWith('Bearer ') || !e.chaves.has(autorizacao.slice('Bearer '.length))) return erro(res, 401, 'CHAVE_INVALIDA');
    if (req.method === 'PUT' && partes[0] === 'envios' && partes[2] === 'partes') return parte(req, res, partes[1], Number(partes[3]));
    const dados = JSON.parse((await lerCorpo(req)).toString('utf8') || '{}');
    if (req.method === 'GET' && partes.length === 1 && partes[0] === 'sites') return listar(res);
    if (partes[0] === 'envios' && partes[2] === 'concluir') return concluir(req, res, partes[1]);
    if (partes[0] === 'sites' && partes[2] === 'voltar') {
      e.voltas.push(dados);
      if (e.erroAoVoltar) return erro(res, e.erroAoVoltar.status, e.erroAoVoltar.codigo);
      if (dados.versao === 99) return erro(res, 404, 'VERSAO_INEXISTENTE');
      return responder(res, 200, { ok: true, versao: dados.versao ?? 1 });
    }
    if (partes[0] === 'sites' && partes[2] === 'envios') {
      e.aberturas += 1;
      if (e.erroAoAbrir) return erro(res, e.erroAoAbrir.status, e.erroAoAbrir.codigo);
      const id = crypto.randomBytes(8).toString('hex');
      const total = Math.max(1, Math.ceil(dados.bytes / parteMax));
      e.envios.set(id, { slug: partes[1], sha256: dados.sha256, total, partes: new Map() });
      return responder(res, 201, { ok: true, envio_id: id, parte_max: parteMax, partes: total, expira_em: Date.now() + 3600000 });
    }
    return erro(res, 404, 'ROTA_DESCONHECIDA');
  }

  const servidor = http.createServer(async (req, res) => {
    const caminho = new URL(req.url, 'http://127.0.0.1').pathname;
    if (caminho.startsWith('/no-ar/')) return res.end('site no ar');
    if (caminho.startsWith('/fora/')) return erro(res, 503, 'SEM_CERTIFICADO');
    if (caminho.startsWith('/api/estudio/login/')) {
      const dados = JSON.parse((await lerCorpo(req)).toString('utf8') || '{}');
      return login(caminho, res, dados);
    }
    if (caminho.startsWith('/api/estudio/')) return estudio(req, res, caminho.slice('/api/estudio/'.length).split('/'));
    return erro(res, 404, 'ROTA_DESCONHECIDA');
  });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${servidor.address().port}`;
  return {
    base,
    estado: e,
    aprovar: aprovarPendentes,
    // O servidor termina, mais tarde, o concluir cuja resposta se perdeu ('sem_publicar').
    publicarPendentes: () => e.pendentes.splice(0).forEach((p) => publicarNoDisco(p.slug, p.zip)),
    recusar: () => e.pedidos.forEach((p) => { p.estado = 'recusado'; }),
    revogarTudo: () => e.chaves.clear(),
    fechar: () => new Promise((resolve) => { servidor.closeAllConnections(); servidor.close(resolve); }),
  };
}
