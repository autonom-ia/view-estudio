---
name: revisar
description: Revisa uma apresentação do View Estúdio com 4 revisores independentes (diretor de arte, diretor geral, revisor de fatos e QA), cada um sem o histórico da conversa, com nota de 0 a 10 e problemas por tela; meta 8,5 em até 3 rodadas, e na terceira sem meta para e mostra à pessoa o que falta. Use na etapa de revisão da nova-apresentacao e quando a pessoa pedir "dá uma nota", "revisa", "está bom?".
---

# Revisar

Quem fez não dá nota. Esta skill abre 4 revisores novos, que não viram nada desta conversa, entrega a cada um só o pacote da apresentação e a lente dele, e junta o resultado. Ela não pergunta nada à pessoa, a não ser no fim da terceira rodada sem meta.

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`). Leia só a última linha (JSON) e traduza o `codigo` por `kit/mensagens.json`.

## 1. Antes de chamar os revisores

A checagem mecânica vem antes do julgamento. Rode e leia:
1. `./estudio checar <nome>`: precisa de `ok:true`. Vermelho não vai para revisor: corrija antes.
2. `./estudio prints <nome>`: fotos novas de todas as telas e passos.
3. Guarde a última linha do `checar` em `apresentacoes/<nome>/revisao/checar-rN.json` (N = número da rodada).

## 2. O pacote

Cada revisor recebe só caminhos de arquivos, nunca a sua opinião:
- `apresentacoes/<nome>/brief.md` (promessa, para quem, história, sequência, fatos com fonte);
- `apresentacoes/<nome>/prints/` (uma foto por tela e passo);
- `apresentacoes/<nome>/roteiro/` (a fala por passo);
- `apresentacoes/<nome>/deck/` (o código das telas);
- `minha-marca/marca.md`, se existir;
- `referencias/` (as fontes dos fatos);
- `apresentacoes/<nome>/revisao/checar-rN.json` (relatório mecânico).

O que **nunca** entra no pedido ao revisor: a nota esperada ou a meta, qual versão é a nova, o problema que você acha que existe, "justifique por que não deu mais", nem qualquer parte desta conversa.

## 3. As 4 lentes

Peça a cada revisor: nota de 0 a 10 (uma casa decimal), os problemas do mais grave ao menos grave (cada um com tela, passo, o que está errado e a correção proposta) e o que está bom e não deve ser mexido.

**Diretor de arte.** "Você é diretor de arte. Olhe as fotos em <prints> e o código em <deck>. Avalie: existe uma tese visual clara e coerente do começo ao fim? A tipografia cria hierarquia sem precisar de caixa? O ritmo varia (tela cheia, tela de respiro, pico)? Foto e luz servem à mensagem? O movimento tem sentido? Há grade de cartões, lista com ícone ou qualquer elemento genérico? Faça o teste: trocando o nome da empresa, esta tela serve para outra? Aponte cada tela que falha."

**Diretor geral.** "Você dirige a apresentação. Leia <brief.md>, depois veja <prints> na ordem e leia <roteiro>. Avalie: cumpre a promessa do brief para essa plateia? Em 5 segundos de cada tela dá para saber a mensagem dela? Existe história (contexto, conflito, resolução) e os picos chegam na hora certa? O tom combina com <marca.md>? O texto soa como gente falando, sem jargão e sem frase de efeito vazia? O fecho diz o que fazer?"

**Revisor de fatos.** "Você confere fatos. Liste todo número, data, nome, citação e afirmação de fato que aparece em <prints> e em <roteiro>. Para cada um, procure a fonte na tabela de fatos de <brief.md> e nos arquivos de <referencias>. Marque: confere, diverge (diga o certo), sem fonte. Marque também afirmação absoluta que a fonte não sustenta. Não use conhecimento de fora como fonte."

**QA.** "Você testa qualidade. Leia <checar-rN.json> inteiro (vermelhos e amarelos). Abra o código em <deck>: o index tem `lang`, as telas têm título, imagens têm texto alternativo, vídeo é mudo e sem autoplay, nenhum `<select>`, nenhum endereço da internet, as telas usam `cena.js` (que respeita movimento reduzido e o teclado: setas para baixo e espaço avançam, para cima volta, para os lados troca de tela). Veja <prints> procurando texto cortado, sobreposto, pequeno ou com contraste fraco. Confira se cada tela tem roteiro com o mesmo número de passos."

## 4. Como abrir os revisores

**Antes da primeira rodada**, avise a pessoa em uma frase do tempo e do consumo, sem pedir licença: "Vou chamar 4 revisores independentes; cada rodada leva alguns minutos e gasta mais do seu plano do que uma resposta comum, e podem ser até 3 rodadas." Nas rodadas seguintes não repita o aviso.

- **Claude Code:** use a ferramenta de subagente (Agent ou Task), **um subagente novo por lente**, os quatro em paralelo. Passe o texto da lente com os caminhos completos.
- **Codex:** use subagente, se existir. Se não, e o comando `codex` existir no computador (confira com `command -v codex` no Mac ou `Get-Command codex` no Windows), rode um processo novo, só leitura, por lente: `codex exec --sandbox read-only --cd "<pasta do estúdio>" "<texto da lente>"`. Avise antes, em uma frase: "Vou chamar revisores separados para conferir. O Codex vai pedir licença. Pode aprovar."
- **Sem subagente e sem o comando `codex`** (ou se ele falhar): não tente instalar nada nem procurar outro jeito. Vá direto para as 4 lentes em sequência, cada uma começando do zero: releia só o pacote, escreva a avaliação sem consultar o que você pensou como autor, e só depois passe à próxima lente.

Cada rodada usa revisores novos. Nunca reaproveite o da rodada anterior.

## 5. Juntar e conferir

1. Nota da rodada = média das 4 notas. **Passa com 8,5 ou mais e nenhuma lente abaixo de 7,5.**
2. Revisor também erra. Antes de aplicar cada correção, confira: o fato contra a fonte; o problema visual contra a foto; a sugestão contra o brief aprovado e o piloto aprovado. Mudança que contraria o que a pessoa aprovou vira pergunta para ela, não correção.
3. Grave `apresentacoes/<nome>/revisao/rodada-N.md`: as 4 notas, a média, os problemas aceitos (com a correção feita), os recusados (com o porquê).
4. Atualize o `andamento.md` (`revisão: rodada N, nota X`).

## 6. Rodadas

- **Passou:** volte para a skill que chamou (normalmente `nova-apresentacao`, etapa de entrega).
- **Não passou e N < 3:** corrija os problemas aceitos, do mais grave ao menos grave. Rode `checar`, `prints` (leia as telas mexidas) e uma nova rodada com revisores novos.
- **Não passou na rodada 3:** pare. Diga à pessoa, em até 4 frases, a nota, o que melhorou e os 2 ou 3 problemas que faltam, com a tela de cada um. Pergunte: "Como você prefere seguir?" com "Corrigir esses pontos e revisar de novo ★", "Entregar assim" e "Eu mesmo vou ajustar".

Diferença de até 0,1 entre rodadas é ruído, não progresso.

## Quando a pessoa pede só uma nota

Rode uma rodada, conte em até 3 frases a nota, o que está melhor e o maior problema (com a tela), e pergunte se ela quer que você corrija.
