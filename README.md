# View Estúdio

> **Assistente (Claude Code ou Codex): se você chegou aqui porque alguém pediu para instalar,** leia o `AGENTS.md` inteiro e siga a skill `instalar-estudio` (em `.agents/skills/instalar-estudio/SKILL.md`). A instalação é uma entrada só, numa caixinha de licença: `bash instalar/instalar.sh tudo --agente <claude|codex>` (no Windows, `instalar/instalar.ps1 tudo`), rodada com o tempo máximo da ferramenta (no Claude Code, `timeout: 600000`) ou em segundo plano: com internet lenta ela passa dos 2 minutos padrão. Antes dela, diga o I-01, que já explica a caixinha. Nenhuma pergunta técnica. Fale simples, um passo por vez.

Apresentações que parecem filme, feitas por conversa, no seu computador.

Você conta para o assistente (Claude Code ou Codex) para quem é a apresentação e o que a plateia precisa fazer depois. Ele monta o caminho da história, mostra 3 telas para você aprovar, faz o resto, escreve o que falar em cada clique, confere tudo e entrega a apresentação pronta e o PDF.

- **Grátis e local.** Nada sobe para a internet, nada é pago, não precisa de conta. A apresentação fica numa pasta do seu computador.
- **Telas com movimento.** Cada clique revela uma parte da tela, com transição costurada entre uma tela e outra. Se você quiser, uma cena animada vira vídeo dentro da tela.
- **Teleprompter que acompanha sozinho.** Abra o roteiro numa segunda janela ou monitor: ele segue cada clique.
- **Conferência de verdade.** Antes de entregar, o estúdio mede cada tela no navegador (letra pequena, texto encostado, arquivo faltando) e quatro revisores independentes dão nota: direção de arte, direção geral, fatos e qualidade.
- **Com a sua marca.** Cores, letras e logo ficam guardados uma vez e valem para todas as apresentações.
- **Mac e Windows.** No Mac está testado de ponta a ponta. No Windows está **em validação**: o instalador, o `estudio.cmd` e a atualização ainda não rodaram numa máquina Windows de verdade.

<!-- porta-de-entrada: texto para quem nunca usou o Claude. Sem palavra técnica (o teste confere). -->
## Comece aqui

Você vai conversar com um assistente, do mesmo jeito que conversa no WhatsApp. Ele faz a apresentação. Você só responde e aprova.

1. **Baixe o app do Claude** no site **claude.ai/download** e entre com a sua conta. (Já usa o Codex? Pode ser ele também.)
2. **Abra o app e entre na parte Code.** Quando ele pedir um lugar para trabalhar, escolha o que tem o seu nome (no Mac, ao lado do desenho de uma casinha). Não escolha a Mesa nem Documentos.
3. **Copie o texto do quadro abaixo, cole na conversa e aperte Enter.**
4. **Aprove as caixinhas.** O app pede licença antes de mexer no computador. Costumam ser três: uma para baixar o estúdio, uma para instalar e uma para confiar nele quando você abrir de novo. É só clicar em aprovar.
5. **Espere uns 5 minutos.** Quando aparecer *Tudo pronto*, faça o que ele mostrar para abrir o estúdio e escreva: **quero fazer uma apresentação**.

```
instale: https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip
```

Ocupa menos de 1 GB no computador. Se o app não conseguir baixar pelo link, veja [outros jeitos de instalar](instalar/comandos-unicos.md).
<!-- /porta-de-entrada -->

## Como usar

Escreva do seu jeito. Por exemplo:

- "Quero fazer uma apresentação para apresentar o Café Aurora a um investidor, 10 minutos."
- "Preciso de uma aula de 20 minutos sobre como a Clínica Horizonte agenda pacientes, para a equipe nova."
- "Ajusta a minha marca: as cores estão no logo que coloquei na pasta referencias."
- "Dá uma nota para a minha apresentação."
- "Gera o PDF."

O caminho é sempre o mesmo:

1. **Conversa rápida**: duas perguntas, sobre o que é e para quem, e o que a plateia faz depois. Tempo, material e gosto são opcionais: se preferir, diga "pode decidir por mim".
2. **Brief**: a promessa da apresentação e a lista de telas. Você aprova.
3. **Piloto**: capa, uma tela comum e o momento mais forte. Você aprova o visual.
4. **O resto das telas**, no mesmo visual.
5. **Roteiro** do que falar em cada clique, e o teleprompter.
6. **Conferência** automática (tamanho e contraste das letras em cada clique, todo número com fonte, acessibilidade) e fotos de cada tela, lidas uma a uma.
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
- Regras do código: Node sem dependência em tempo de execução (só o motor de cena, `hyperframes@0.8.181`, fixado), versões fixas em `instalar/versoes.env`, sem expressão regular. Peças de terceiros copiadas sem alteração: GSAP e Lenis no molde, axe-core em `kit/vendor/axe/` (veja `CREDITOS.md`).

## Licença

MIT, © 2026 Autonom.ia. Veja [`LICENSE`](LICENSE) e as peças de terceiros em [`CREDITOS.md`](CREDITOS.md).

A casca deste estúdio (instalador, despachante de comandos, contrato de saída, mensagens e testes de máquina limpa) veio do [Estúdio de Reels](https://github.com/autonom-ia/video-edit-autonomia), também MIT, da Autonom.ia.
