---
name: revisar
description: Revisa uma apresentação do View Estúdio com 4 revisores independentes (diretor de arte, diretor geral, revisor de fatos e QA), cada um sem o histórico da conversa, com nota de 0 a 10 pela régua do estúdio e problemas por tela; cada revisor recebe o que a rodada anterior aceitou e recusou; meta 8,5 em até 3 rodadas, e na terceira sem meta para e mostra à pessoa o que falta. Use na etapa de revisão da nova-apresentacao e quando a pessoa pedir "dá uma nota", "revisa", "está bom?".
---

# Revisar

Quem fez não dá nota. Esta skill abre 4 revisores novos, que não viram nada desta conversa, entrega a cada um só o pacote da apresentação e a lente dele, e junta o resultado. Só pergunta à pessoa quando uma mudança contraria o que ela aprovou (seção 5) e no fim da terceira rodada sem meta.

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`). Leia só a última linha (JSON) e traduza o `codigo` por `kit/mensagens.json`.

## 1. Antes de chamar os revisores

A checagem mecânica vem antes do julgamento. A pessoa acompanha com a apresentação aberta: rode `./estudio abrir <nome>` antes de tudo e diga uma frase de andamento antes de cada passo (`ANDAMENTO_*` em `kit/mensagens.json`; a skill `nova-apresentacao`, etapa 8, diz qual em cada passo). Rode e leia (N = número da rodada):
1. `./estudio checar <nome>`: precisa de `ok:true`. Vermelho não vai para revisor: corrija antes.
2. `./estudio prints <nome>`: fotos novas de todas as telas e passos, em `prints/` (`<tela>-b<passo>.jpg`).
3. Guarde a última linha do `checar` em `apresentacoes/<nome>/revisao/checar-rN.json`.
4. `./estudio revisao <nome> --rodada N` (código `REVISAO_PRONTA`): escreve `apresentacoes/<nome>/revisao/contexto-rN.md`, com a régua das notas (`kit/regua-revisao.md`) e o que as rodadas anteriores aceitaram e recusaram. Aviso `RODADA_ILEGIVEL`: corrija o `rodada-K.json` indicado antes de seguir.

## 2. O pacote

Cada revisor recebe só caminhos de arquivos, nunca a sua opinião:
- `apresentacoes/<nome>/revisao/contexto-rN.md` (a régua das notas e o que já foi aceito e recusado, sem nota de rodada nenhuma), **a primeira leitura**; no diretor geral, logo depois do teste da plateia;
- `apresentacoes/<nome>/brief.md` (promessa, para quem, história, sequência, fatos com fonte);
- `apresentacoes/<nome>/prints/` (uma foto por tela e passo);
- `apresentacoes/<nome>/roteiro/` (a fala por passo);
- `apresentacoes/<nome>/deck/` (o código das telas);
- `minha-marca/marca.md`, se existir;
- `referencias/` (as fontes dos fatos);
- `apresentacoes/<nome>/revisao/checar-rN.json` (relatório mecânico).

O que **nunca** entra no pedido ao revisor: a nota esperada ou a meta, a nota de rodada anterior, o que é ruído entre notas, qual versão é a nova, o problema que você acha que existe, "justifique por que não deu mais", nem qualquer parte desta conversa.

## 3. As 4 lentes

O pedido do diretor de arte, do revisor de fatos e do QA começa com: "Leia primeiro <contexto-rN.md>: dê a nota pela régua dele e não reabra o que está em Recusados sem fato novo." O do diretor geral começa pelo teste da plateia e só depois manda ler o contexto (ver abaixo): quem já leu o que foi corrigido não é mais alguém da plateia. Peça a cada revisor: nota de 0 a 10 (uma casa decimal), os problemas do mais grave ao menos grave (cada um com tela, passo, o que está errado e a correção concreta) e o que está bom e não deve ser mexido. O revisor só lê; não edita nada.

**Diretor de arte.** "Você é diretor de arte. Olhe as fotos em <prints> e o código em <deck>. Avalie: existe uma tese visual clara e coerente do começo ao fim? A tipografia cria hierarquia sem precisar de caixa? O ritmo varia (tela cheia, tela de respiro, pico)? Foto e luz servem à mensagem? O movimento tem sentido? Há grade de cartões, lista com ícone ou qualquer elemento genérico? Faça o teste: trocando o nome da empresa, esta tela serve para outra? Aponte cada tela que falha."

**Diretor geral.** Começa pelo **teste da plateia**, dentro desta lente (não é um quinto revisor): "Antes de ler qualquer outro arquivo, abra só as fotos em <prints> do último passo de cada tela (o maior número depois de -b), na ordem, olhando cada uma por uns 5 segundos, como alguém da plateia que nunca ouviu falar do assunto e não está ouvindo quem apresenta. Responda em uma linha cada: 1) o que esta apresentação promete; 2) o que ela pede para a plateia fazer no fim; 3) só pelas telas, sem ouvir quem apresenta, dá para saber o que fazer no fim (sim ou não, e por quê). Escreva as 3 respostas antes de abrir qualquer outro arquivo e não as mude depois." E então: "Agora leia <contexto-rN.md>: dê a nota pela régua dele e não reabra o que está em Recusados sem fato novo. Você dirige a apresentação. Leia <brief.md>, depois veja <prints> na ordem e leia <roteiro>. Avalie: cumpre a promessa do brief para essa plateia? Em 5 segundos de cada tela dá para saber a mensagem dela? Existe história (contexto, conflito, resolução) e os picos chegam na hora certa? O tom combina com <marca.md>? O texto soa como gente falando, sem jargão e sem frase de efeito vazia? O fecho diz o que fazer? Compare suas 3 respostas do teste da plateia com a promessa e o pedido final do brief: se não batem, ou se a 3 é não, esse é o problema mais grave da sua lista."

**Revisor de fatos.** "Você confere fatos. Liste todo número, data, nome, citação e afirmação de fato que aparece em <prints> e em <roteiro>. Para cada um, procure a fonte na tabela de fatos de <brief.md> e nos arquivos de <referencias>. Marque: confere, diverge (diga o certo), sem fonte. Marque também afirmação absoluta que a fonte não sustenta. Não use conhecimento de fora como fonte."

**QA.** "Você testa qualidade. Leia <checar-rN.json> inteiro (vermelhos e amarelos) e explique cada amarelo em uma linha. Abra o código em <deck>: o index tem `lang`, as telas têm título, imagens têm texto alternativo, vídeo é mudo e sem autoplay, nenhum `<select>`, nenhum endereço da internet, as telas usam `cena.js` (que respeita movimento reduzido e o teclado: setas para baixo e espaço avançam, para cima volta, para os lados troca de tela). Veja <prints> procurando texto cortado, sobreposto, pequeno ou com contraste fraco. Confira se cada tela tem roteiro com o mesmo número de passos."

## 4. Como abrir os revisores

Antes da primeira rodada, no lugar do texto de `ANDAMENTO_OLHARES` (não diga os dois), avise a pessoa em uma frase do tempo e do consumo: "Agora quatro olhares independentes conferem a apresentação, cada um de um jeito. Leva alguns minutos; se eles pedirem ajustes, eu arrumo e eles olham de novo, até 3 vezes. Isso gasta uma parte maior do seu plano do que uma conversa comum. Enquanto isso, a apresentação fica aberta para você olhar." Não pergunte; só avise e siga. Daí em diante, use o `ANDAMENTO_OLHARES`.

Escolha o jeito na ordem abaixo e use o primeiro que existir:
- **Claude Code:** use a ferramenta de subagente (Agent ou Task), **um subagente novo por lente**, os quatro em paralelo. Passe o texto da lente com os caminhos completos.
- **Codex com subagente:** um subagente novo por lente, como no Claude Code.
- **Codex sem subagente, com o programa `codex` instalado:** confira antes se ele existe (`command -v codex` no Mac; `Get-Command codex` no PowerShell). Se existir, rode um processo novo, só leitura, por lente: `codex exec --sandbox read-only --cd "<pasta do estúdio>" "<texto da lente>"`. Avise antes, em uma frase: "Vou chamar ajudantes separados para conferir. O Codex vai pedir licença. Pode aprovar."
- **Sem subagente e sem o programa `codex`** (ou se ele falhar): não tente instalar nada nem chamar o que não existe. Vá direto para as 4 lentes em sequência, cada uma começando do zero: releia só o pacote, escreva a avaliação sem consultar o que você pensou como autor, e só depois passe à próxima lente.

Cada rodada usa revisores novos. Nunca reaproveite o da rodada anterior.

## 5. Juntar e conferir

1. Nota da rodada = média das 4 notas. **Passa com 8,5 ou mais e nenhuma lente abaixo de 7,5.** Fato sem fonte ou divergente, problema de QA que impede alguém de acompanhar (texto ilegível ou cortado, tela que não avança) e teste da plateia com "não" na terceira pergunta bloqueiam mesmo com média alta. Plateia com resposta que não bate com o brief, ou com "não" na terceira pergunta, põe o diretor geral no teto 7 (a régua manda): se a nota dele veio acima, devolva a ele; o comando `revisao` já conta 7 no lugar dela.
2. Revisor também erra. Antes de aplicar cada correção, confira: o fato contra a fonte; o problema visual contra a foto; a sugestão contra o brief aprovado e o piloto aprovado. Mudança que contraria o que a pessoa aprovou vira pergunta para ela, não correção.
3. Grave `apresentacoes/<nome>/revisao/rodada-N.md`: as 4 notas, a média, as respostas do teste da plateia, os problemas aceitos (com a correção feita), os recusados (com o porquê). Grave também `apresentacoes/<nome>/revisao/rodada-N.json`, que o comando `revisao` passa aos revisores da rodada seguinte:
   ```json
   {
     "rodada": 2,
     "notas": { "arte": 8.2, "geral": 8.6, "fatos": 8.8, "qa": 9.0 },
     "plateia": { "promessa": "o que a plateia entendeu", "pedido": "o que ela viu pedido no fim", "sem_fala": true, "bate_com_brief": true },
     "bloqueios": [],
     "aceitos": [{ "lente": "arte", "tela": 3, "problema": "o que estava errado", "conserto": "o que foi feito" }],
     "recusados": [{ "lente": "fatos", "problema": "o que foi pedido", "porque": "por que ficou como está" }]
   }
   ```
   `lente` é `arte`, `geral`, `fatos` ou `qa`. `plateia` é obrigatório. `bate_com_brief` é você quem marca, comparando as respostas 1 e 2 da plateia com a promessa e o pedido final do brief: `false` quando não batem. `sem_fala: false` já conta como bloqueio no comando `revisao`; com `sem_fala` ou `bate_com_brief` em `false`, ele também acusa em `dados.notas[].alertas` o diretor geral acima do teto 7 e conta o geral como 7 na média, na lente mínima e no "passou" (a nota que veio fica em `geral_dada`). `reavaliacao` só existe quando você mede a estabilidade (ver "Como medir a meta"). `bloqueios` lista o que impede passar mesmo com média alta (fato sem fonte, QA que impede acompanhar, plateia sem fala = não); pendência que só a pessoa resolve não entra aqui, vai para `andamento.md` > Pendências (a skill `entregar` pergunta antes de entregar).
4. Atualize o `andamento.md` (`revisão: rodada N, nota X`).

## 6. Rodadas

- **Passou:** volte para a skill que chamou (normalmente `nova-apresentacao`, etapa de entrega).
- **Não passou e N < 3:** corrija os problemas aceitos, do mais grave ao menos grave. Rode `checar`, `prints` (leia as telas mexidas), `revisao --rodada N+1` e uma nova rodada com revisores novos, que também conferem se a correção anterior pegou.
- **Não passou na rodada 3:** pare. Diga à pessoa, em até 4 frases, o que melhorou e o que falta para ficar pronta: os 2 ou 3 problemas, com a tela de cada um, em palavras do dia a dia. Sem número, sem contar vezes. Pergunte: "Como você prefere seguir?" com "Corrigir esses pontos e revisar de novo ★", "Entregar assim" e "Eu mesmo vou ajustar".

Só para você, nunca no pedido ao revisor: diferença de até 0,3 numa lente entre rodadas pode ser ruído do revisor, não progresso.

## Como medir a meta

São duas metas, medidas em separado. Depois de gravar o `rodada-N.json`, rode `./estudio revisao <nome>` e leia `dados`:
- **Passar em até 2 rodadas** (indicador interno do estúdio, para medir o método; a regra da revisão continua sendo até 3 rodadas): `dados.passou_na_rodada` é 1 ou 2 (`dados.metas.em_ate_2_rodadas` é `true`). A média é comparada sem arredondar: 8,45 não passa.
- **Estabilidade (cada lente varia no máximo 0,3):** não se mede entre rodadas, porque entre elas houve conserto. Mede-se reavaliando o **mesmo estado** da apresentação: na rodada que você quer medir, sem mexer em nada, abra mais 4 revisores novos, com o mesmo pacote e o mesmo `contexto-rN.md`, e grave as notas deles em `reavaliacao.notas` do `rodada-N.json`. `dados.estabilidade` traz a maior diferença de cada lente entre as duas avaliações; `dados.metas.estabilidade` é `true` quando nenhuma lente passa de 0,3, e `null` enquanto não houver reavaliação. Os revisores da reavaliação não sabem que são reavaliação nem veem a nota dos primeiros.

## Quando a pessoa pede só uma nota

Rode uma rodada. Conte à pessoa, em até 3 frases, como a apresentação está em palavras do dia a dia ("está quase pronta", "falta pouco", "ainda precisa de ajustes"), o que está melhor e o maior problema (com a tela), sem dizer o número. Pergunte se ela quer que você corrija.
