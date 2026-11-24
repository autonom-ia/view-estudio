---
name: nova-apresentacao
description: Faz uma apresentação do começo ao fim no View Estúdio, pelo método que funciona - coleta com fonte, brief com promessa e sequência de telas (aprovação), piloto de 3 telas (aprovação), leva das outras telas, roteiro por passo, checagem mecânica, fotos lidas uma a uma, revisão independente e entrega. Use quando a pessoa quiser uma apresentação nova, continuar uma parada (apresentacoes/*/andamento.md), ou mudar telas de uma apresentação existente.
---

# Nova apresentação

Uma apresentação boa parece filme: cada tela diz uma coisa só, o movimento conta a história e a fala completa o que a tela não diz. O caminho para chegar lá é sempre o mesmo, e a pessoa decide em dois portões: o brief e o piloto.

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`), de dentro da pasta do estúdio. Leia só a última linha (JSON): `ok`, `codigo`, `resumo`, `arquivos`, `avisos`, `dados`. Saída 2 = reprovado: corrija pela causa e rode de novo. Traduza `codigo` por `kit/mensagens.json`. No Codex, `checar`, `fatos`, `acessibilidade`, `prints`, `pdf`, `cena`, `abrir`, `comparar` e `ler` rodam fora da área protegida.

## O andamento

Cada apresentação tem `apresentacoes/<nome>/andamento.md`, que você escreve e atualiza ao fim de cada etapa:

```
# Andamento: <nome>
etapa: <coleta | brief | piloto | leva | roteiro | checagem | prints | revisao | entrega | entregue>
brief aprovado: <data e as palavras da pessoa, ou "não">
piloto aprovado: <data e as palavras da pessoa, ou "não">
revisão: <rodada N, nota>
próximo passo: <uma frase>

## Pendências
- <o que só a pessoa resolve, como confirmar um número ou autorizar uma foto; apague quando ela resolver>
```

Se a sessão cair, você volta daqui. Aprovação só vale com as palavras da pessoa, copiadas sem resumir. "Pode seguir", "faz tudo", "capricha" ditos antes de ver o brief ou o piloto não aprovam nada: mostre e espere.

## Etapa 1. Coleta (duas perguntas, o resto com fonte)

**Perguntas obrigatórias (só estas duas)**, uma por mensagem, e só a que a pessoa ainda não respondeu:
1. "Sobre o que é a apresentação, e para quem você vai apresentar? Conte do seu jeito, em uma ou duas frases."
2. "O que você quer que essa plateia faça depois de ver? Por exemplo: comprar, aprovar, aprender ou mudar alguma coisa."

Todo o resto você deduz e propõe no brief em vez de perguntar: o que a plateia já sabe e do que desconfia, a história, a sequência de telas, o tom. Não pergunte o que dá para tirar das duas respostas e do material.

Depois das duas, uma mensagem só, opcional: "Quer me contar mais alguma coisa? Quanto tempo você vai ter, se é ao vivo, gravada ou só para enviar, os números e documentos que quer usar, uma apresentação de que você gosta. Se tiver arquivos, pode me mandar aqui mesmo. Se preferir, eu decido." com "Pode decidir por mim ★" e "Quero contar". Tempo, formato, material e gosto visual são sempre opcionais: se a pessoa delegar, siga sem perguntar de novo, com uns 10 minutos ao vivo (e o PDF para enviar depois) e só os fatos que ela já contou. No brief, em **Insumos faltando**, diga o que melhora se ela mandar material.

Arquivo que a pessoa mandar vai para `referencias/`. Leia tudo o que estiver lá. Todo fato que for para a tela precisa de fonte: documento, site, planilha ou "a própria pessoa disse em <data>". Sem fonte, o fato fica fora ou vira pergunta para a plateia. Nunca invente número, cliente ou resultado para preencher a falta de material.

Sem marca guardada (`minha-marca/tokens.css`), faça a marca agora, antes do `nova`, com a skill `minha-marca`, sem nenhuma pergunta e sem amostra para aprovar: ela usa as duas respostas e o material que a pessoa mandou, e quem mostra a marca à pessoa é o piloto (portão 2). O `nova` já copia a marca para a apresentação.

Escolha um nome curto (letras minúsculas, números e hífen) e rode:
`./estudio nova <nome> --titulo "<título da apresentação>"`
- `APRESENTACAO_CRIADA`: a pasta está em `arquivos.pasta`. Aviso `MARCA_DE_EXEMPLO` (a marca não foi feita antes): faça a marca agora, sem perguntas, e copie para a apresentação como diz o aviso.
- `APRESENTACAO_JA_EXISTE`: pergunte se é para continuar aquela ou criar com outro nome.

**Apresentação sobre um negócio** (pitch, proposta comercial, apresentação institucional, de um negócio com site ou nome no Google): leia sozinho em vez de perguntar o que dá para ver. Logo depois do `nova`, rode `./estudio ler <nome> --negocio "Nome do negócio, cidade"` (some `--site <endereço>` ou `--google <link do Google Maps>` se a pessoa passou). Rode com timeout de 10 minutos (no Claude Code, `timeout` 600000). Sem entrar em conta nenhuma, ele lê o perfil do Google (endereço, telefone, horário de cada dia, nota e avaliações sem o nome de quem escreveu) e o site atual inteiro (achado pelo Google, se a pessoa não passou). Guarda tudo em `apresentacoes/<nome>/coleta/` e anota cada fato, com fonte e data, na parte "Lido pelo estúdio" da tabela de fatos do `brief.md`. Leia `coleta/google/lugar.json` e `coleta/site/texto.md`, e traduza cada aviso pelo código. Horário vem do perfil do Google ou da pessoa, nunca de trecho de resultado de busca. Ler a internet é permitido; publicar ou enviar qualquer coisa, não. O Instagram não é lido. As fotos lidas ficam em `coleta/site/fotos/`; só vão para `deck/assets/` com o sim da pessoa no portão 1. O que for lido não vira pergunta separada: endereço, número e avaliação que forem para a tela a pessoa confirma no brief, na mesma pergunta.

## Etapa 2. Brief (portão 1)

**Primeiro, o repertório.** Antes da sequência de telas e da tese visual, estude `kit/repertorio/` seguindo `kit/repertorio/como-usar.md`: abra o arquivo da ação da plateia (o "o que fazer depois" da coleta), escolha 2 ou 3 fichas pela dúvida da plateia e tire de cada uma uma decisão concreta de abertura, número-âncora, ritmo de revelação ou fecho com pedido. A direção visual vem depois e serve a essa estrutura; quando ela vem antes, a primeira revisão sai fraca. Confira ao vivo o link das escolhidas.

Escreva `apresentacoes/<nome>/brief.md` por cima do molde, com o que vem abaixo. Se o `ler` rodou, mantenha a parte "Lido pelo estúdio" (de `<!-- estudio:lido:inicio -->` a `<!-- estudio:lido:fim -->`) do jeito que está, logo abaixo da sua tabela de fatos: a próxima leitura troca só ela. Fato lido que a pessoa confirmar ou corrigir vai para a tabela de cima, com a fonte "a própria pessoa disse em <data>".
- **Promessa**: o que a plateia ganha, numa frase. É a régua de tudo.
- **Para quem** e **o que fazer depois** (da coleta).
- **A história**: contexto, conflito e resolução, em três frases.
- **Sequência de telas** (o beat-sheet), uma linha por tela: número, mensagem única da tela (uma frase), papel (abertura, conceito, número, caso, virada, pico, fecho), passos da tela (o que entra a cada clique) e a transição de entrada (dissolve é o padrão; corte, empurra ou match quando a história pede).
- **Os 2 ou 3 picos**: as telas que a plateia vai lembrar. Pelo menos um vira cena em movimento (skill `cena-em-video`) quando o tempo permitir.
- **Fatos e números**: a tabela com as colunas Fato, Fonte e Data (troque as linhas do exemplo do molde, que têm a fonte "Exemplo fictício do View Estúdio" e não valem). Só entra na tela e na fala o que está aqui; o `./estudio fatos` confere número, contato e @.
- **Referências estudadas**: uma linha por ficha do repertório (o `id`, o link, a decisão que você tirou dela e o que não vai copiar).
- **Tese visual**: uma frase que diz como a apresentação vai parecer (luz, tipo de foto, ritmo), ligada à marca e ao assunto.
- **Insumos faltando**: o que você assumiu por falta de material, e o que melhora se a pessoa mandar.

Regras do brief: uma ideia por tela; nenhuma tela com mais de 3 coisas novas por clique; a abertura parte do problema de quem assiste, nunca da biografia de quem fala; o fecho diz o que fazer agora.

Mostre o brief à pessoa em texto corrido e curto (promessa, história, a lista de telas com a mensagem de cada uma), sem tabela técnica. Pergunte: "Esse é o caminho da apresentação. Posso desenhar as 3 primeiras telas?" com "Pode ★", "Quero mudar algo". Ajuste até aprovar. Grave a aprovação no `andamento.md`.

## Etapa 3. Piloto de 3 telas (portão 2)

Antes de desenhar:
0. Releia as **Referências estudadas** do brief: a direção visual serve à abertura, à âncora, ao ritmo e ao fecho que você tirou delas, nunca ao visual delas.
1. Se estiverem instaladas, carregue as skills `frontend-design` e `ui-ux-pro-max`. Use-as para a direção visual, a tipografia e o ritmo.
2. Leia o molde: `kit/molde/deck/index.html`, as três telas de `kit/molde/deck/slides/` e o cabeçalho de `deck/assets/vendor/palco/cena.js`. Ele explica como cada tela declara os passos sem programar.
3. Leia `minha-marca/marca.md` (se existir) e a tese visual do brief.

Desenhe 3 telas: a **capa**, uma **tela comum** (a mais frequente da apresentação) e o **pico**. Elas substituem as telas do molde.

Como uma tela é feita:
- Um arquivo por tela em `deck/slides/sNN-<nome>.html` (NN = número da tela com 2 dígitos), 1920 por 1080, com `../assets/marca/tokens.css`, `../assets/vendor/palco/tela.css`, `../assets/vendor/gsap/gsap.min.js` e `../assets/vendor/palco/cena.js` no fim do corpo.
- Cada clique é um passo: `data-beat="N"` diz em que passo o elemento entra (0 abre com a tela), `data-entra` diz como (sobe, surge, desliza, cresce, revela, risca, palavras, conta), `data-recua` e `data-sai` tiram o foco. Movimento próprio vai em `window.CENA` (ganchos `beats` e `assentar`, sempre os dois).
- No `deck/index.html`, uma `<section class="slide">` por tela, com `<iframe data-src="slides/sNN-....html">` e `data-transicao` quando não for dissolve.
- Tudo local: imagem e vídeo em `deck/assets/`. Nenhum endereço da internet.

O que faz a tela ser boa:
- Hierarquia por tipografia grande, foto, luz, cor e movimento. **Nada de grade de cartões com borda e fundo**, nada de lista de tópicos com ícone. Teste anti-genérico: troque o nome da empresa; se a tela serve para outra, refaça.
- Texto visível com 18 px ou mais. Título que se lê do fundo da sala.
- Número com a fonte escrita na própria tela, em letra pequena (mas 18 px ou mais).
- Texto que se lê sobre o fundo: sobre foto, degradê ou vídeo, ponha véu, sombra ou outro enquadramento. O `checar` mede o contraste contra o fundo de verdade. Texto só decorativo (marca d'água) leva `aria-hidden="true"`.
- Imagem com texto alternativo (`alt`); imagem só de enfeite, `alt=""`.
- O movimento tem sentido: entra o que a fala vai explicar, na ordem da fala.
- Sem `<select>` nativo. Respeite movimento reduzido (o `cena.js` já cuida, se você não forçar animação fora dele).

Conferir antes de mostrar:
1. `./estudio checar <nome>`. Saída 2: leia `dados.vermelhos` (cada um com `tela`, `beat`, `tipo`, `detalhe`), corrija pela causa e rode de novo até `ok:true`. Leia também `dados.amarelos`; roteiro ausente é normal nesta etapa.
   Depois, `./estudio fatos <nome>` (código `FATOS_OK`) e `./estudio acessibilidade <nome>` (código `ACESSIBILIDADE_OK` ou `ACESSIBILIDADE_COM_AVISOS`). Saída 2: leia `dados.vermelhos` e corrija. Fato sem fonte: confirme com a pessoa e registre no brief, ou tire da tela; nunca invente a fonte.
2. `./estudio prints <nome>` (código `PRINTS_PRONTOS`; a lista das fotos vem em `dados.fotos`). Abra **cada** imagem com a ferramenta de ler arquivo, uma a uma, e procure: texto cortado, encostado ou sobreposto; contraste fraco; tela vazia ou genérica; algo que não bate com a mensagem da tela. Corrija e tire as fotos de novo.
3. `./estudio abrir <nome>` (código `DECK_ABERTO`; o endereço vem em `dados.endereco`) e diga: "Abri as 3 primeiras telas. Use as setas: para baixo avança o passo, para os lados troca de tela."

Pergunte: "É esse o visual?" com "É esse ★", "Quero mudar algo". Ajuste até aprovar. Grave a aprovação no `andamento.md`. A partir daqui, o visual está travado: mudança de linguagem visual só com nova aprovação.

## Etapa 4. Leva

Faça as outras telas seguindo a sequência do brief, no mesmo idioma visual do piloto. Copie a anatomia das telas do piloto, não as do molde.
- Picos com cena em movimento: skill `cena-em-video`.
- Depois de cada 4 ou 5 telas, rode `./estudio checar <nome>` e `./estudio fatos <nome>` e corrija os vermelhos antes de seguir.
- Se uma tela pedir algo que o brief não previu (número novo, caso novo), pare e pergunte à pessoa; atualize o brief.

## Etapa 5. Roteiro por passo

Skill `roteiro-e-teleprompter`. Ela escreve `roteiro/SNN.json` para cada tela, com um item por passo, e gera o teleprompter.

## Etapa 6. Checagem mecânica

`./estudio checar <nome>` com `ok:true` e sem amarelo de roteiro (`roteiro-ausente`, `roteiro-descasado`). Os outros amarelos: leia um por um, corrija o que for defeito e anote no `andamento.md` o que ficou de propósito.

`./estudio fatos <nome>` com `ok:true`: agora ele também lê a fala do roteiro. E `./estudio acessibilidade <nome>` com `ok:true` (os amarelos dele: corrija os simples).

## Etapa 7. Fotos lidas

`./estudio prints <nome>`: uma foto por tela e por passo, no estado assentado, listadas em `dados.fotos`. Abra **todas**, uma a uma. Aviso `TELA_LISA`: uma foto saiu quase toda de uma cor só; se não foi de propósito, algo não carregou. Para cada tela, escreva no `andamento.md` uma linha: "tela NN: ok" ou o problema e o que você corrigiu. Corrigiu algo: rode `checar` e `prints` de novo. Nunca declare pronto pelas fotos que você não abriu.

## Etapa 8. Revisão

A pessoa não espera de tela vazia. Antes de começar, rode `./estudio abrir <nome>` e diga o texto de `ANDAMENTO_ABRI`. Depois, antes de cada passo, uma frase de andamento de `kit/mensagens.json`: `ANDAMENTO_CONFERENCIA` (checar), `ANDAMENTO_FOTOS` (prints), `ANDAMENTO_OLHARES` (as 4 lentes; na primeira vez, o aviso da skill `revisar` vai no lugar dele), `ANDAMENTO_AJUSTES` (correções) e `ANDAMENTO_PRONTO` (passou). Nunca diga nota, número de vezes nem nome de etapa técnica.

Skill `revisar`. Ela chama 4 revisores independentes e devolve nota e problemas. Meta 8,5, até 3 rodadas. Não bateu na terceira: mostre à pessoa o que falta e deixe ela decidir.

## Etapa 9. Entrega

Skill `entregar`: PDF, teleprompter, pasta pronta e como apresentar. Marque `etapa: entregue`.

## Mudar uma apresentação que já existe

1. Leia `andamento.md`, `brief.md` e as fotos em `prints/`.
2. Mudança de conteúdo (texto, número, tela nova): atualize o brief primeiro, depois a tela, o roteiro daquela tela, `checar`, `prints` (leia as telas mexidas) e, se mudou mais de 3 telas, uma rodada de `revisar`.
3. Mudança de visual geral, ou pedido vago: siga o "Pedido vago: antes e depois" numa tela de teste e peça aprovação antes de mexer nas outras.

## Pedido vago: antes e depois

"Mais vida", "mais elegante", "mais impacto", "não sei, não gostei": você traduz em 2 ou 3 mudanças concretas, que se veem ou se ouvem (o texto, a letra, a cor, a foto, o espaço, o movimento, a fala), e mostra o antes e o depois. Nunca pergunte "o que você quer dizer com isso?": proponha e mostre.
1. `./estudio antes <nome>` (`ANTES_GUARDADO`): guarda `deck/`, `roteiro/`, `cenas/` e `brief.md` como estão, antes de mexer. Vídeo e arquivo pesado não são copiados: ficam ligados ao original. Por isso, para mudar uma cena, use sempre `./estudio cena` (grava o vídeo novo ao lado e só então troca); nunca grave por cima do mesmo arquivo. `ANTES_EM_ABERTO` (saída 2): a pessoa ainda não escolheu na comparação anterior; rode o `escolher` do passo 5 com a resposta dela, nunca um antes novo por cima.
2. Faça as 2 ou 3 mudanças, cada uma ligada ao pedido, nas telas e no roteiro. Mudou a tela, ajuste a fala daquela tela.
3. Escreva `arquivos.mudancas` (`revisao/antes-depois/mudancas.json`) com as palavras da pessoa em `pedido` e cada mudança com `titulo` (o que mudou, em palavras do dia a dia), `porque` (como atende o pedido) e `telas` (os números das telas em que ela aparece).
4. `./estudio comparar <nome>` (`COMPARACAO_PRONTA`): abre o antes e o depois lado a lado, só nas telas que mudaram, clique por clique, com as mudanças numeradas. Saída 2: `POUCAS_MUDANCAS` (menos de 2) ou `NADA_MUDOU` (nenhuma tela, clique ou fala mudou); corrija e rode de novo. Saída 1 com `ANTES_VIDEO_MUDOU`: um vídeo foi gravado por cima; siga a ação da mensagem.
5. Diga em uma frase cada mudança e pergunte: "Qual fica?" com "O depois ★", "Voltar como estava" e "Outro caminho". Com a resposta, rode `./estudio escolher <nome> depois`, `antes` ou `outro`. Nunca desfaça de memória:
   - "O depois": `FICOU_O_DEPOIS`. Grave no `andamento.md` o que ficou e rode `checar`, `fatos` e `acessibilidade`.
   - "Voltar como estava": `VOLTOU_COMO_ESTAVA`. Tudo voltou ao que o passo 1 guardou; abra a apresentação de novo.
   - "Outro caminho": `PRONTO_PARA_OUTRO_CAMINHO`. A apresentação voltou ao original e o antes continua guardado. Pule o passo 1: faça outra leitura do pedido a partir do passo 2, e a nova comparação mostra o original contra a tentativa nova.

## Onde você para e pergunta

Na coleta (só as duas perguntas e a opcional), no brief (portão 1), no piloto (portão 2), no antes e depois, quando aparece fato novo sem fonte, e quando a revisão não bate a meta na terceira rodada. Nada mais: o resto é com você.
