# View Estúdio

> **Assistente (Claude Code ou Codex): se você chegou aqui porque alguém pediu para instalar,** leia o `AGENTS.md` inteiro e siga a skill `instalar-estudio` (em `.agents/skills/instalar-estudio/SKILL.md`). Antes do primeiro comando, diga à pessoa em uma frase como aprovar as caixinhas de licença. Fale simples, um passo por vez.

Apresentações que parecem filme, feitas por conversa, no seu computador.

Você conta para o assistente (Claude Code ou Codex) para quem é a apresentação e o que a plateia precisa fazer depois. Ele monta o caminho da história, mostra 3 telas para você aprovar, faz o resto, escreve o que falar em cada clique, confere tudo e entrega a apresentação pronta e o PDF.

- **Grátis e local.** Nada sobe para a internet, nada é pago, não precisa de conta. A apresentação fica numa pasta do seu computador.
- **Telas com movimento.** Cada clique revela uma parte da tela, com transição costurada entre uma tela e outra. Se você quiser, uma cena animada vira vídeo dentro da tela.
- **Teleprompter que acompanha sozinho.** Abra o roteiro numa segunda janela ou monitor: ele segue cada clique.
- **Conferência de verdade.** Antes de entregar, o estúdio mede cada tela no navegador (letra pequena, texto encostado, arquivo faltando) e quatro revisores independentes dão nota: direção de arte, direção geral, fatos e qualidade.
- **Com a sua marca.** Cores, letras e logo ficam guardados uma vez e valem para todas as apresentações.
- **Mac e Windows.** No Mac está testado de ponta a ponta. No Windows está **em validação**: o instalador, o `estudio.cmd` e a atualização ainda não rodaram numa máquina Windows de verdade.

## Como instalar

1. Instale o **Claude Code** ou o **Codex** (no app ou no Terminal) e entre com a sua conta.
2. Abra o programa e cole este texto:

```
instale: https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip
```

3. Responda ao assistente. Ele olha o computador, pede licença antes de cada coisa e instala tudo numa pasta só, `view-estudio`, dentro da sua pasta pessoal. Leva uns 10 minutos e ocupa menos de 1 GB.
4. No fim, abra o programa direto na pasta `view-estudio` (o assistente mostra como). É lá que ele sabe fazer as suas apresentações.

Se o seu programa não conseguir baixar pelo link, veja as alternativas em [`instalar/comandos-unicos.md`](instalar/comandos-unicos.md).

## Como usar

Escreva do seu jeito. Por exemplo:

- "Quero fazer uma apresentação para apresentar o Café Aurora a um investidor, 10 minutos."
- "Preciso de uma aula de 20 minutos sobre como a Clínica Horizonte agenda pacientes, para a equipe nova."
- "Ajusta a minha marca: as cores estão no logo que coloquei na pasta referencias."
- "Dá uma nota para a minha apresentação."
- "Gera o PDF."

O caminho é sempre o mesmo:

1. **Conversa rápida**: para quem, para quê, quanto tempo, de onde vêm os números.
2. **Brief**: a promessa da apresentação e a lista de telas. Você aprova.
3. **Piloto**: capa, uma tela comum e o momento mais forte. Você aprova o visual.
4. **O resto das telas**, no mesmo visual.
5. **Roteiro** do que falar em cada clique, e o teleprompter.
6. **Conferência** automática e fotos de cada tela, lidas uma a uma.
7. **Revisão** por quatro revisores independentes, até nota 8,5.
8. **Entrega**: a apresentação, o teleprompter e o PDF.

## As suas pastas

| Pasta | O que vai nela |
|---|---|
| `minha-marca/` | Cores, letras, logo e o jeito de falar da sua marca |
| `apresentacoes/` | Uma pasta por apresentação, com o PDF |
| `referencias/` | Fotos, documentos e números que você quer usar |

Essas pastas são suas: a atualização do estúdio nunca mexe nelas.

## Atualizar e desinstalar

- Para atualizar, peça: "atualizar o estúdio". Ele baixa a versão nova só deste repositório, confere o arquivo e guarda a anterior.
- Para desinstalar, peça: "desinstalar o estúdio". Ele apaga só os programas; as suas pastas ficam.

## Para quem quer mexer no estúdio

- Comandos: `./estudio <comando>` (no Windows, `.\estudio.cmd`). A última linha de cada comando é um JSON numa linha só: `{"ok","comando","codigo","resumo","arquivos","avisos","dados"}`. Saída 0 é ok, 1 é erro, 2 é reprovado na conferência.
- Testes: `npm test` (Node 22 ou mais novo). Os testes que precisam de navegador são pulados quando não há Chrome.
- Instruções do assistente: a fonte é o `AGENTS.md` e `.claude/skills/`. O `CLAUDE.md` e `.agents/skills/` são gerados por `./estudio espelhar`; `./estudio espelhar --conferir` reprova se estiverem diferentes.
- Regras do código: Node sem dependência em tempo de execução (só o motor de cena, `hyperframes@0.8.181`, fixado), versões fixas em `instalar/versoes.env`, sem expressão regular.

## Licença

MIT, © 2026 Autonom.ia. Veja [`LICENSE`](LICENSE) e as peças de terceiros em [`CREDITOS.md`](CREDITOS.md).

A casca deste estúdio (instalador, despachante de comandos, contrato de saída, mensagens e testes de máquina limpa) veio do [Estúdio de Reels](https://github.com/autonom-ia/video-edit-autonomia), também MIT, da Autonom.ia.
