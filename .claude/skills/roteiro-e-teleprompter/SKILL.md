---
name: roteiro-e-teleprompter
description: Escreve o roteiro de fala de uma apresentação do View Estúdio, um item por passo de cada tela (mensagem, munição e deixa), confere contra o brief e os fatos, e gera o teleprompter que acompanha o deck sozinho. Use na etapa de roteiro da nova-apresentacao, quando a pessoa pedir "o que eu falo", "o texto", "o teleprompter", ou quando uma tela mudou e o roteiro precisa acompanhar.
---

# Roteiro e teleprompter

O roteiro não é discurso pronto para ler. É o apoio de quem apresenta: em cada clique, o que precisa aterrissar, com o que sustentar e para onde levar. A pessoa fala do jeito dela por cima.

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`). Leia só a última linha (JSON) e traduza o `codigo` por `kit/mensagens.json`.

## Antes de escrever

1. Leia `brief.md` (promessa, para quem, a história, a tabela de fatos) e `minha-marca/marca.md` (o tom).
2. Monte o mapa de passos: para cada tela, quantos passos ela tem. Rode `./estudio checar <nome>` e leia `dados.por_tela`: cada item traz a tela e quantos passos ela tem (`beats`). Os avisos `roteiro-ausente` e `roteiro-descasado` em `dados.amarelos` também dizem o número. Ou abra as fotos de `prints/` (uma por passo).
3. Pergunte só se não souber: "Quem vai apresentar, e como gosta de falar: mais conversa ou mais direto?"

## O formato

Um arquivo por tela: `apresentacoes/<nome>/roteiro/SNN.json` (NN = número da tela com 2 dígitos, o mesmo do `sNN-...html`). Copie a forma de `kit/molde/roteiro/S01.json`:

```json
{
  "tela": 2,
  "titulo": "O número",
  "beats": [
    { "rotulo": "o número entra", "fala": "…", "nota": "…" }
  ]
}
```

- `beats` tem **exatamente** um item por passo da tela, na ordem. Passo 0 é o que aparece quando a tela abre.
- `rotulo`: o que acontece na tela naquele passo, em poucas palavras (não o que se fala).
- `fala`: as duas primeiras camadas. **Primeira frase = a mensagem**, o que tem de aterrissar (o teleprompter destaca essa frase). Depois, **a munição**: o argumento, o número com a fonte dita em voz alta, o exemplo concreto.
- `nota` (opcional): **a deixa**, a terceira camada. O que a tela faz agora ("esperar o número terminar de contar") ou a ponte para o próximo passo. Também onde cabe uma pergunta para a plateia.
- De 15 a 70 palavras por passo, somando `fala` e `nota`.

## Como escrever bem

- **Não narre a tela.** Se a frase dá para ler na tela, está sobrando. Cubra a tela e leia o passo: ele ainda diz algo que a tela não diz?
- Abertura com gancho: uma pergunta ou um fato que a plateia sente. Nunca "hoje eu vou falar sobre".
- Um número por vez, sempre com a fonte, e só os que estão na tabela de fatos do brief.
- Frases curtas. Verbo no começo. Português do Brasil, sem expressão que ninguém fala aqui.
- Sem travessão. Use ponto, vírgula ou dois-pontos.
- Sem promessa absoluta ("sempre", "nunca", "garante", "100%") quando o fato não sustenta.
- Nunca culpe a plateia ("vocês erram"): o problema é a situação, não a pessoa.
- Uma pergunta para a plateia onde a tela pede, de preferência no fim de um bloco.
- O fecho diz o que fazer agora, em uma frase.

## Conferir

1. `./estudio checar <nome>`: nenhum `roteiro-ausente`, `roteiro-descasado` ou `roteiro-invalido` em `dados.amarelos`.
2. Leia o roteiro inteiro de uma vez, em voz de quem apresenta, contra o brief: a promessa é cumprida? Todo número está na tabela de fatos? Algum passo narra a tela?
3. Corrija e rode de novo.

## Gerar o teleprompter

1. `./estudio teleprompter <nome>`: código `TELEPROMPTER_PRONTO`, arquivo em `arquivos.teleprompter` (`deck/teleprompter.html`, junto do deck). `ROTEIRO_INVALIDO` ou `ROTEIRO_VAZIO`: corrija os `SNN.json` pela `acao` do código.
2. Para ensaiar: `./estudio abrir <nome>` (no Codex, fora da área protegida). O endereço do deck vem em `dados.endereco` e o do teleprompter em `dados.teleprompter`. Diga à pessoa: "Abri a apresentação. Abra também o teleprompter, no mesmo navegador, em outra janela ou no segundo monitor: ele acompanha sozinho cada clique." e passe o endereço do teleprompter. O deck avisa o teleprompter pelo canal `estudio-roteiro`; os dois precisam estar abertos pelo mesmo endereço.
3. O botão "Seguir a apresentação" do teleprompter liga e desliga o acompanhamento.

## Quando uma tela muda

Mudou o número de passos de uma tela: reescreva o `SNN.json` dela, rode `checar` e `teleprompter` de novo. Nunca deixe roteiro descasado na entrega.
