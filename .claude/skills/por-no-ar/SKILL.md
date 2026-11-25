---
name: por-no-ar
description: Põe a apresentação pronta no ar com um link para mandar. Quem tem acesso publica em sites.autonomia.site pelo próprio estúdio, só com a confirmação da pessoa, a cada vez (e volta para uma versão anterior, se ela pedir). Fora disso, prepara um arquivo e explica passo a passo, em palavras simples, como a própria pessoa põe no ar de graça em Netlify, Cloudflare Pages ou GitHub Pages; nesses serviços o estúdio não se conecta, não pede senha e não publica nada. Use quando a pessoa pedir "pôr no ar", "um link para mandar", "publicar", "hospedar", "atualizar a que está no ar", ou na entrega.
---

# Pôr no ar

O que vai para o ar é a apresentação pronta para abrir em qualquer navegador: a tela inicial, as telas, as letras, as fotos e os vídeos das cenas. Nunca vão o brief, o roteiro, a coleta, a revisão, as fotos de conferência, os rascunhos (`_lab/` e nome com `_` na frente direto em `deck/`) nem as composições de cena (`*-hf/`). Quem monta o que sobe é o comando, nunca você.

**O teleprompter não vai para o ar.** Ele leva a fala inteira e as anotações de quem apresenta, e o link vai para a plateia. Quem apresenta usa o teleprompter no próprio computador, com `./estudio abrir <nome>`.

Há dois caminhos:

- **sites.autonomia.site**: o estúdio publica, mas só com a confirmação da pessoa, a cada vez. O endereço fica `<nome>.sites.autonomia.site`, com cadeado de site seguro. Precisa de acesso, que a pessoa pede em sites.autonomia.site (é o mesmo acesso dos sites; sites e apresentações contam juntos no limite de endereços).
- **Netlify, Cloudflare Pages ou GitHub Pages**: quem envia é a pessoa, na conta dela. Você explica, um passo por mensagem, e espera ela dizer que fez. Você nunca entra na conta dela, nunca pede senha, código de verificação ou cartão, e nunca usa chave ou token desses serviços.

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`). Leia só a última linha (JSON) e traduza o `codigo` por `kit/mensagens.json`.

## 1. Antes de perguntar

1. Vermelho não vai para o ar. Rode `./estudio checar <nome>`, `./estudio fatos <nome>` e `./estudio acessibilidade <nome>`; os três precisam de `ok:true`. Eles anotam a aprovação para a apresentação como está agora: qualquer mudança depois (numa tela, no brief ou no roteiro) pede os três de novo, e o `publicar` e o `pacote` recusam com `PUBLICAR_CONFERIR_ANTES` até lá. Nunca contorne nem anote aprovação à mão.
2. Leia `apresentacoes/<nome>/andamento.md` > Pendências e, na tabela de fatos do `brief.md`, o que ainda não foi confirmado pela pessoa.
3. Pergunte onde ela prefere, com no máximo 3 opções:
   - "Num endereço de sites.autonomia.site: eu ponho no ar daqui, só com a sua confirmação ★"
   - "Netlify: é arrastar um arquivo, na sua conta"
   - "Cloudflare Pages ou GitHub Pages: também na sua conta"

Os três têm plano grátis que serve para uma apresentação. As telas desses serviços mudam com o tempo: se um botão não tiver o nome daqui, diga o que procurar ("a opção de enviar ou subir arquivos") em vez de inventar um caminho.

## 2. Pôr no ar em sites.autonomia.site

Diga, com estas palavras ou parecidas: "Eu ponho no ar só com a sua confirmação, em sites.autonomia.site. Quem tiver o link vê a apresentação inteira, então confira se não há nada que só a sua equipe pode ver. Se você ainda não tem acesso, peça em sites.autonomia.site." Pergunte "Posso pôr a apresentação no ar agora?" com "Pode pôr no ar ★" e "Ainda não". Havendo pendência ou fato não confirmado, ponha na mesma pergunta, antes do pedido, cada um em palavras simples, como "Antes de pôr no ar: o número de clientes é mesmo 1.200?". O que ela confirmar sai das Pendências e vai para a tabela de fatos do `brief.md`, com a fonte "a própria pessoa disse em <data>"; o que ela corrigir, corrija. Mexeu no `brief.md`, numa tela ou no roteiro, até para anotar uma confirmação: rode as três conferências de novo antes de publicar (o sim dela continua valendo). Só siga com o sim dela; cada publicação nova pede um sim novo.

1. Rode `./estudio publicar <nome>`. No Codex, fora da área protegida (ele usa a internet). Dê a ele até 5 minutos para terminar: no Claude Code, rode com `timeout` de 300000. Quase sempre termina em menos de 2 minutos, mas uma apresentação com vídeo numa internet lenta demora mais, e cortar no meio deixa você sem a resposta.
2. `PUBLICAR_AGUARDANDO_LOGIN`: é a primeira vez neste computador (ou o acesso dele venceu). Mostre `dados.codigo_curto` bem visível e diga: "Abri a página de autorização no navegador. Entre com o Google, digite o código e clique em Autorizar. Me avise quando fizer." O endereço está em `dados.endereco`. O navegador mostra o nome do computador, a hora e o lugar de quem pediu: só autorize se foi ela que acabou de pedir. Quando ela avisar, rode o mesmo `./estudio publicar <nome>` de novo; ele continua o mesmo pedido. Se de novo vier `PUBLICAR_AGUARDANDO_LOGIN`, pergunte se ela já digitou o código e repita.
   `PUBLICAR_ACESSO_LIBERADO`: ela autorizou enquanto a publicação esperava. Rode o mesmo `./estudio publicar <nome>` de novo na hora, sem perguntar outra vez.
3. `PUBLICADO`: diga o endereço (`dados.endereco`) e confira com ela (seção 6). `PUBLICADO_CERTIFICADO_PENDENTE`: a apresentação subiu, mas o cadeado leva alguns minutos; peça para abrir daqui a pouco e não publique de novo só por isso.
4. `PUBLICAR_CONCLUSAO_INCERTA`: tudo chegou, mas a confirmação não voltou a tempo. Não publique por cima: espere uns 3 minutos e rode o mesmo `./estudio publicar <nome>`; ele confere primeiro se a versão já está no ar e, se estiver, só confirma.
5. Qualquer outro código: diga o `texto` de `kit/mensagens.json` e faça a `acao`. Nenhum erro deixa a apresentação no ar pela metade.

**Endereço de outra pessoa ou nome recusado** (`PUBLICAR_SITE_DE_OUTRA_PESSOA`, `PUBLICAR_NOME_RECUSADO`): o endereço sai do nome da apresentação. Proponha um nome curto, parecido e livre (letras minúsculas, números e hífen, de 2 a 40). Com o sim dela para o endereço novo, rode `./estudio publicar <nome> --no-ar <outro>`. A apresentação continua a mesma, sem cópia; só o endereço muda, e o estúdio guarda o nome novo em `apresentacoes/<nome>/no-ar.json` para as próximas vezes e para voltar versão. O sim para o endereço novo vale como a confirmação desta publicação. Nunca tente publicar por cima do endereço de outra pessoa.

**Endereço com algo no ar que não foi esta apresentação que pôs** (`PUBLICAR_ENDERECO_JA_EM_USO`): é um site dela, outra apresentação, ou uma versão publicada de outro computador ou de uma cópia da apresentação; publicar ali (ou voltar versão) tira aquilo do ar. Pergunte: "Usar outro endereço ★" ou "Trocar o que está lá por esta apresentação". Outro endereço: `--no-ar <outro>`, como acima. Trocar: só com esse sim, rode `./estudio publicar <nome> --por-cima`. Nunca use `--por-cima` por conta própria.

**Apresentação movida ou copiada** (`PUBLICAR_PASTA_MUDOU`): ela foi publicada de outro lugar deste computador. Siga a ação da mensagem: movida, uma vez `--por-cima` com o sim dela; duas cópias, pergunte qual fica no ar (a outra pode ir para outro endereço com `--no-ar`).

**Tela que usa um arquivo que fica fora** (`PACOTE_CITA_ARQUIVO_FORA`): leve o arquivo para `deck/assets/` e troque o caminho na tela. **Esperar** (`PUBLICAR_ESPERE_UM_POUCO`): espere uns 2 minutos e rode de novo, sem perguntar outra vez.

**Grande demais ou arquivo que o serviço não aceita** (`PUBLICAR_SITE_GRANDE_DEMAIS`, `PUBLICAR_TIPO_NAO_ACEITO`, `PUBLICAR_NOME_DE_ARQUIVO_RECUSADO`, `PUBLICAR_NOMES_REPETIDOS`, `PUBLICAR_ARQUIVOS_DEMAIS`, `PUBLICAR_PACOTE_RECUSADO`): o teto é 200 MB, e o que mais pesa costuma ser vídeo de cena. Vídeo `.mov` ou `.m4v` vira `.mp4` (skill `cena-em-video`). Depois de corrigir, rode as três conferências e pergunte de novo antes de publicar. Modelo 3D recusado pelo serviço (`PUBLICAR_3D_INVALIDO`, `PUBLICAR_3D_GRANDE`, `PUBLICAR_BIN_SOLTO`): o arquivo é da apresentação, não tire; faça a `acao` (exportar o modelo de novo, ou como `.glb`).

**Atualizar depois:** depois de mudar a apresentação e com as três conferências aprovadas de novo, pergunte de novo e rode `./estudio publicar <nome>`. Cada publicação vira uma versão nova; as anteriores ficam guardadas por um tempo. O link continua o mesmo.

**Voltar para a versão anterior:** se a pessoa pedir, confirme e rode `./estudio publicar <nome> --voltar` (a anterior) ou `./estudio publicar <nome> --voltar <número>` (`PUBLICAR_VERSAO_VOLTOU`).

**Tirar este computador do acesso:** se a pessoa pedir (computador emprestado, vendido ou de outra pessoa), rode `./estudio publicar --sair`. Isso apaga só a cópia guardada aqui. Para cortar de vez, diga: "Entre na página da sua conta em sites.autonomia.site e revogue este computador." O endereço está em `dados.revogar_em`. Sem isso, uma cópia de segurança antiga do estúdio ainda publicaria em nome dela. Tirar uma apresentação do ar também é pela página da conta.

O acesso deste computador fica guardado em `.ferramentas/publicar/`. Nunca abra, mostre, copie nem envie esses arquivos.

## 3. Preparar o arquivo para Netlify, Cloudflare Pages ou GitHub Pages

1. Com as três conferências aprovadas (passo 1 da seção 1), rode `./estudio pacote <nome>` (código `PACOTE_PRONTO`). O arquivo fica em `arquivos.zip` (`apresentacoes/<nome>/<nome>-apresentacao.zip`), com a tela inicial na raiz e o SHA-256 ao lado. Ele leva só o que sobe: sem teleprompter, sem rascunho, sem brief e sem roteiro.
   Se vier `PACOTE_ARQUIVO_PRIVADO`, há em `deck/` algo que não vai para a internet: arquivo oculto, atalho, `.env`, chave, ou cópia de segurança (nome terminado em `.old`, `.backup`, `.bak`, `.orig`, `.tmp`, `.swp` ou `~`; pasta `backup`, `backups`, `old`, `_old` ou `tmp`). Mostre a lista, pergunte e tire de `deck/` antes de seguir.
2. Mostre onde está: `./estudio abrir <nome> --pasta`.
3. Nunca mande a pessoa enviar a pasta `deck` inteira: ela leva o teleprompter e os rascunhos. É sempre o arquivo preparado, ou o que sai dele.

Os serviços pedem, às vezes, o conteúdo solto em vez do arquivo. Para isso, diga: "Clique duas vezes no arquivo que eu preparei para abrir. No Windows, clique com o botão direito e escolha Extrair tudo. Aparece ao lado um item com o mesmo nome, com tudo dentro."

## 4. Netlify

1. "Abra o endereço app.netlify.com/drop no navegador."
2. "Crie uma conta grátis (pode entrar com o e-mail ou com o Google). Sem conta, a apresentação some depois de um tempo."
3. "Arraste para a área indicada o que saiu do arquivo que eu preparei."
4. "Espere terminar. Ele mostra um endereço terminado em `.netlify.app`. Abra e confira."
5. Opcional: "Em Configurações do site, dá para trocar o nome do endereço por um mais curto."

**Atualizar depois:** prepare o arquivo de novo (seção 3) e diga: "No painel, na parte de publicações (Deploys), arraste o que saiu do arquivo novo. O endereço continua o mesmo."

## 5. Cloudflare Pages ou GitHub Pages

**Cloudflare Pages**

1. "Abra dash.cloudflare.com e crie uma conta grátis."
2. "No menu, entre em Workers e Pages e escolha criar um projeto de Pages, na opção de enviar arquivos (Upload assets ou Direct Upload). Não escolha a opção de ligar ao Git."
3. "Dê um nome ao projeto: ele vira o endereço, terminado em `.pages.dev`."
4. "Envie o arquivo que eu preparei."
5. "Clique para publicar (Deploy) e abra o endereço que aparece."

**Atualizar depois:** "No projeto, crie uma nova publicação (Create deployment) e envie o arquivo novo."

**GitHub Pages**

O GitHub Pages esconde arquivo e pasta cujo nome começa com `_` (por exemplo `assets/_logo.png`). Se a apresentação tiver algum, prefira Netlify ou Cloudflare Pages.

1. "Abra github.com e crie uma conta grátis, se ainda não tiver."
2. "Crie um repositório novo (o botão New). Dê um nome curto e deixe como público. No plano grátis, a página só sai de repositório público, e qualquer pessoa vê os arquivos."
3. "Na página do repositório, clique em enviar arquivos (uploading an existing file)."
4. "Abra o que saiu do arquivo que eu preparei, selecione tudo o que está dentro (o `index`, o `slides`, o `assets`) e arraste, sem levar o item de fora. O `index` precisa ficar na primeira tela do repositório." Se forem mais de 100 arquivos, arraste em mais de uma vez.
5. "Clique em confirmar (Commit changes)."
6. "Vá em Settings, depois em Pages. Em Source, escolha publicar a partir de um ramo (Deploy from a branch), escolha `main` e depois `/ (root)`, e salve."
7. "Em um ou dois minutos aparece o endereço, no formato `seu-usuario.github.io/nome-do-repositorio`. Abra e confira."

**Atualizar depois:** envie os arquivos novos do mesmo jeito, por cima dos antigos, e confirme.

## 6. Depois que estiver no ar

1. Peça para a pessoa abrir o endereço no celular e no computador e conferir com você: a primeira tela abre, as setas avançam, as outras telas aparecem, os vídeos das cenas tocam, as letras são as da marca.
2. Diga: "Para apresentar, use o seu computador com o teleprompter, que eu abro para você. O link é para quem vai assistir ou rever depois."
3. Registre em `apresentacoes/<nome>/andamento.md`: onde está, o endereço e a data.

## Regras

- Nunca entre na conta da pessoa, nunca peça senha, código ou cartão, e nunca use chave de acesso de serviço nenhum. O acesso de sites.autonomia.site é do próprio estúdio: só o `./estudio publicar` usa, e você nunca o lê nem mostra.
- Só publique com `./estudio publicar`, em sites.autonomia.site, e só depois de a pessoa confirmar, a cada vez. Nunca publique por conta própria, nem por ferramenta de navegador.
- Nunca ponha no ar com `checar`, `fatos` ou `acessibilidade` vermelhos.
- Nunca suba o teleprompter, o brief, o roteiro nem a pasta `deck` inteira.
- Explique um passo por mensagem e espere a pessoa dizer que fez.
