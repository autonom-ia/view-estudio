---
name: nova-apresentacao
description: Faz uma apresentação do começo ao fim no View Estúdio, pelo método que funciona - coleta com fonte, brief com promessa e sequência de telas (aprovação), piloto de 3 telas (aprovação), leva das outras telas, roteiro por passo, checagem mecânica, fotos lidas uma a uma, revisão independente e entrega. Use quando a pessoa quiser uma apresentação nova, continuar uma parada (apresentacoes/*/andamento.md), ou mudar telas de uma apresentação existente.
---

# Nova apresentação

Uma apresentação boa parece filme: cada tela diz uma coisa só, o movimento conta a história e a fala completa o que a tela não diz. O caminho para chegar lá é sempre o mesmo, e a pessoa decide em dois portões: o brief e o piloto.

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`), de dentro da pasta do estúdio. Leia só a última linha (JSON): `ok`, `codigo`, `resumo`, `arquivos`, `avisos`, `dados`. Saída 2 = reprovado: corrija pela causa e rode de novo. Traduza `codigo` por `kit/mensagens.json`. No Codex, `checar`, `prints`, `pdf`, `cena` e `abrir` rodam fora da área protegida.

## O andamento

Cada apresentação tem `apresentacoes/<nome>/andamento.md`, que você escreve e atualiza ao fim de cada etapa:

```
# Andamento: <nome>
etapa: <coleta | brief | piloto | leva | roteiro | checagem | prints | revisao | entrega | entregue>
brief aprovado: <data e as palavras da pessoa, ou "não">
piloto aprovado: <data e as palavras da pessoa, ou "não">
revisão: <rodada N, nota>
próximo passo: <uma frase>
```

Se a sessão cair, você volta daqui. Aprovação só vale com as palavras da pessoa, copiadas sem resumir. "Pode seguir", "faz tudo", "capricha" ditos antes de ver o brief ou o piloto não aprovam nada: mostre e espere.

## Etapa 1. Coleta (com fonte)

Uma pergunta por mensagem, no máximo 5, e só as que faltam:
1. Para quem é a apresentação (quem senta na cadeira, o que já sabe, o que desconfia)?
2. O que essa plateia precisa fazer depois (comprar, aprovar, aprender, mudar algo)?
3. Quanto tempo, e é ao vivo, gravada ou enviada como PDF?
4. Que números, fatos e casos reais você quer usar, e de onde eles vêm? (Peça os arquivos na pasta `referencias/`.)
5. Tem fotos, logo, vídeos, uma apresentação antiga? (Também em `referencias/`.)

Leia tudo o que a pessoa puser em `referencias/`. Todo fato que for para a tela precisa de fonte: documento, site, planilha ou "a própria pessoa disse em <data>". Sem fonte, o fato fica fora ou vira pergunta para a plateia.

Escolha um nome curto (letras minúsculas, números e hífen) e rode:
`./estudio nova <nome> --titulo "<título da apresentação>"`
- `APRESENTACAO_CRIADA`: a pasta está em `arquivos.pasta`. Aviso `MARCA_DE_EXEMPLO`: diga em uma frase que está usando a marca de exemplo e ofereça a skill `minha-marca` depois.
- `APRESENTACAO_JA_EXISTE`: pergunte se é para continuar aquela ou criar com outro nome.

## Etapa 2. Brief (portão 1)

Escreva `apresentacoes/<nome>/brief.md` por cima do molde, com:
- **Promessa**: o que a plateia ganha, numa frase. É a régua de tudo.
- **Para quem** e **o que fazer depois** (da coleta).
- **A história**: contexto, conflito e resolução, em três frases.
- **Sequência de telas** (o beat-sheet), uma linha por tela: número, mensagem única da tela (uma frase), papel (abertura, conceito, número, caso, virada, pico, fecho), passos da tela (o que entra a cada clique) e a transição de entrada (dissolve é o padrão; corte, empurra ou match quando a história pede).
- **Os 2 ou 3 picos**: as telas que a plateia vai lembrar. Pelo menos um vira cena em movimento (skill `cena-em-video`) quando o tempo permitir.
- **Fatos e números**: a tabela com fato, fonte e data. Só entra na tela o que está aqui.
- **Tese visual**: uma frase que diz como a apresentação vai parecer (luz, tipo de foto, ritmo), ligada à marca e ao assunto.
- **Insumos faltando**: o que você assumiu por falta de material, e o que melhora se a pessoa mandar.

Regras do brief: uma ideia por tela; nenhuma tela com mais de 3 coisas novas por clique; a abertura parte do problema de quem assiste, nunca da biografia de quem fala; o fecho diz o que fazer agora.

Mostre o brief à pessoa em texto corrido e curto (promessa, história, a lista de telas com a mensagem de cada uma), sem tabela técnica. Pergunte: "Esse é o caminho da apresentação. Posso desenhar as 3 primeiras telas?" com "Pode ★", "Quero mudar algo". Ajuste até aprovar. Grave a aprovação no `andamento.md`.

## Etapa 3. Piloto de 3 telas (portão 2)

Antes de desenhar:
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
- O movimento tem sentido: entra o que a fala vai explicar, na ordem da fala.
- Sem `<select>` nativo. Respeite movimento reduzido (o `cena.js` já cuida, se você não forçar animação fora dele).

Conferir antes de mostrar:
1. `./estudio checar <nome>`. Saída 2: leia `dados.vermelhos` (cada um com `tela`, `beat`, `tipo`, `detalhe`), corrija pela causa e rode de novo até `ok:true`. Leia também `dados.amarelos`; roteiro ausente é normal nesta etapa.
2. `./estudio prints <nome>` (código `PRINTS_PRONTOS`; a lista das fotos vem em `dados.fotos`). Abra **cada** imagem com a ferramenta de ler arquivo, uma a uma, e procure: texto cortado, encostado ou sobreposto; contraste fraco; tela vazia ou genérica; algo que não bate com a mensagem da tela. Corrija e tire as fotos de novo.
3. `./estudio abrir <nome>` (código `DECK_ABERTO`; o endereço vem em `dados.endereco`) e diga: "Abri as 3 primeiras telas. Use as setas: para baixo avança o passo, para os lados troca de tela."

Pergunte: "É esse o visual?" com "É esse ★", "Quero mudar algo". Ajuste até aprovar. Grave a aprovação no `andamento.md`. A partir daqui, o visual está travado: mudança de linguagem visual só com nova aprovação.

## Etapa 4. Leva

Faça as outras telas seguindo a sequência do brief, no mesmo idioma visual do piloto. Copie a anatomia das telas do piloto, não as do molde.
- Picos com cena em movimento: skill `cena-em-video`.
- Depois de cada 4 ou 5 telas, rode `./estudio checar <nome>` e corrija os vermelhos antes de seguir.
- Se uma tela pedir algo que o brief não previu (número novo, caso novo), pare e pergunte à pessoa; atualize o brief.

## Etapa 5. Roteiro por passo

Skill `roteiro-e-teleprompter`. Ela escreve `roteiro/SNN.json` para cada tela, com um item por passo, e gera o teleprompter.

## Etapa 6. Checagem mecânica

`./estudio checar <nome>` com `ok:true` e sem amarelo de roteiro (`roteiro-ausente`, `roteiro-descasado`). Os outros amarelos: leia um por um, corrija o que for defeito e anote no `andamento.md` o que ficou de propósito.

## Etapa 7. Fotos lidas

`./estudio prints <nome>`: uma foto por tela e por passo, no estado assentado, listadas em `dados.fotos`. Abra **todas**, uma a uma. Aviso `TELA_LISA`: uma foto saiu quase toda de uma cor só; se não foi de propósito, algo não carregou. Para cada tela, escreva no `andamento.md` uma linha: "tela NN: ok" ou o problema e o que você corrigiu. Corrigiu algo: rode `checar` e `prints` de novo. Nunca declare pronto pelas fotos que você não abriu.

## Etapa 8. Revisão

Skill `revisar`. Ela chama 4 revisores independentes e devolve nota e problemas. Meta 8,5, até 3 rodadas. Não bateu na terceira: mostre à pessoa o que falta e deixe ela decidir.

## Etapa 9. Entrega

Skill `entregar`: PDF, teleprompter, pasta pronta e como apresentar. Marque `etapa: entregue`.

## Mudar uma apresentação que já existe

1. Leia `andamento.md`, `brief.md` e as fotos em `prints/`.
2. Mudança de conteúdo (texto, número, tela nova): atualize o brief primeiro, depois a tela, o roteiro daquela tela, `checar`, `prints` (leia as telas mexidas) e, se mudou mais de 3 telas, uma rodada de `revisar`.
3. Mudança de visual geral: mostre uma tela de teste e peça aprovação antes de mexer nas outras.

## Onde você para e pergunta

Na coleta (só o que falta), no brief (portão 1), no piloto (portão 2), quando aparece fato novo sem fonte, e quando a revisão não bate a meta na terceira rodada. Nada mais: o resto é com você.
