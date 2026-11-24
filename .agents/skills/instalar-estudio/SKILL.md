---
name: instalar-estudio
description: Instala o View Estúdio no Mac ou no Windows numa entrada só (a ação tudo, uma caixinha de licença), com textos prontos e simples, sem pergunta técnica; um programa por vez só se a pessoa pedir. Também desinstala, quando a pessoa pede. Use no primeiro uso, quando faltar o arquivo .ferramentas/instalacao.json na pasta do estúdio, quando a pessoa pedir para instalar, reinstalar ou desinstalar, ou quando a verificação apontar algo faltando.
---

# Instalar o estúdio

A pessoa pode não saber nada de tecnologia. Ela não lê o que aparece na tela técnica e não digita nada. Você explica, pede licença e faz.

## Antes de tudo

- **Textos.** Todos os textos desta skill (I-01 a I-15, os itens e os erros) estão em `instalar/mensagens.json`. Use-os como estão, trocando só o que está entre `{{ }}`. `{{agente}}` é "Claude" ou "Codex", conforme quem você é.
- **Lugar.** Rode tudo de dentro da pasta do estúdio (`~/view-estudio` no Mac; `%USERPROFILE%\view-estudio` ou `C:\ViewEstudio\view-estudio` no Windows). Os programas ficam em `.ferramentas`, dentro dela.
- **Sistema.** Descubra se é Mac, Windows com PowerShell ou Windows com Git Bash antes do primeiro comando.
- **Lugar errado.** Se a pessoa colou o link do zip e você descompactou o estúdio fora do lugar de sempre (em Downloads, dentro de outra pasta), rode `mudar-pasta` de dentro da pasta descompactada, antes do `tudo`. Não pergunte: é a cópia que você acabou de baixar, e nada é apagado. No Codex, peça para sair da área protegida com o texto `CODEX-FORA-DA-AREA-MUDAR-PASTA`. Continue da pasta do campo `para`. Se vier `PASTA_DESTINO_EXISTE` e a pasta do campo `para` tem `AGENTS.md` e `instalar/instalar.sh`, é o estúdio baixado antes: siga nela, sem perguntar, e diga em uma frase onde ficou a cópia nova (o lugar do campo `de`, dito do jeito que a pessoa vê, como "em Downloads") e que ela pode ir para a Lixeira. Nunca apague nenhuma das duas.
- **Saída.** Todo comando termina com uma linha JSON. Leia só ela. Nunca mostre nada técnico à pessoa.
- **Retomada.** Se a pessoa fechou a janela e voltou, rode `tudo` de novo: o que já está pronto é pulado em segundos. Nunca apague o que já foi instalado.

### Como chamar o instalador

| Onde você roda | Instalador | Verificação |
|---|---|---|
| Mac | `bash instalar/instalar.sh <acao> [id] --agente <claude\|codex>` | `bash instalar/verificar.sh` |
| Windows, PowerShell | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/instalar.ps1 <acao> [id] --agente <claude\|codex>` | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/verificar.ps1` |
| Windows, Git Bash | o mesmo do PowerShell, com barra normal | o mesmo do PowerShell |

- No Windows, escreva sempre `instalar/instalar.ps1` com barra normal.
- `USE_O_INSTALADOR_DO_WINDOWS`: você rodou o `instalar.sh` no Windows. Sem falar nada, rode o mesmo pedido com a linha do Windows.

Ações: `tudo` (a entrada única), `checar`, `mudar-pasta`, `plano`, `passo <id>`, `verificar`, `desinstalar`.

### As caixinhas de permissão

O Claude Code e o Codex mostram uma caixinha pedindo licença antes de mexer no computador. A instalação foi feita para caber em poucas, e cada uma já vem explicada no texto que você diz antes dela:

1. **Baixar e abrir o estúdio** (só quando a pessoa colou o link): baixe e descompacte num comando só, uma caixinha.
2. **Instalar tudo**: a ação `tudo`, uma caixinha. Ela olha o computador, instala os programas e confere, sem parar no meio.
3. **Confiar no estúdio**, quando a pessoa abre o programa direto nele (I-14). Daí em diante, os comandos do estúdio, as ações `tudo`, `checar`, `plano`, `passo` e `verificar` do instalador e a escrita em `apresentacoes/`, `minha-marca/` e `referencias/` já estão liberados em `.claude/settings.json`.

Se aparecer uma caixinha fora dessa lista, avise em uma frase o que é (texto `CAIXINHA`) e anote no `andamento.md` da apresentação, se houver, para a próxima versão do estúdio cortar.

No Codex, todo o instalador roda pedindo para sair da área protegida, o que também libera a internet (texto `CODEX-INTERNET`). Se a pessoa recusar a caixinha, diga o texto de `COMANDO_RECUSADO` com a consequência do item.

## Passo a passo

### 1. Instalar tudo de uma vez
1. Diga o I-01, com a linha da caixinha do seu programa (`linha_caixinha_claude` ou `linha_caixinha_codex`). Não espere resposta: o I-01 não é pergunta, a caixinha é o sim da pessoa.
2. Na mesma mensagem, rode `tudo`. É a entrada única: olha o computador, instala os cinco passos (`pasta`, `node`, `pacotes`, `navegador`, `ffmpeg`) e confere. Leva uns 20 segundos quando já está tudo baixado e vários minutos com internet lenta (baixa o Node, as peças do estúdio, o navegador escondido e o FFmpeg).
   - **Tempo da chamada.** Nunca rode o `tudo` com o tempo padrão da sua ferramenta: no Claude Code ele corta em 2 minutos e a instalação para no meio do download. Dê o tempo máximo (na ferramenta Bash, `timeout: 600000`) ou rode em segundo plano (`run_in_background: true`) e leia a última linha quando terminar. No Codex, dê o maior tempo que a ferramenta aceitar.
   - Se mesmo assim a chamada for cortada antes da última linha, não diga que deu erro: rode `tudo` de novo, com o mesmo tempo máximo. O que já ficou pronto é pulado.
3. Leia a última linha: `ok`, `etapa` (onde parou), `checar` (o que o computador tem) e `resultado` (a última linha da etapa, igual à que ela daria rodando sozinha).

### 2. Deu certo (`ok:true`)
1. Se `checar.problemas` tiver `POUCA_MEMORIA`, diga o texto dele numa frase.
2. Diga o I-14, trocando `{{linha_voltar}}` pela linha do seu programa. Não pergunte nada sobre marca, cores ou letras agora: a marca nasce junto com a primeira apresentação.

### 3. Parou no meio (`ok:false`)
Leia `resultado` como se a etapa tivesse rodado sozinha, e siga pelo `etapa`:
- `checar`: para cada item de `resultado.problemas[]`, mostre o texto do código em `erros` (com `dados`) e siga as opções:
  - `INTERNET_BLOQUEADA_PELA_CAIXA`: não fale de Wi-Fi. Diga o texto e rode `tudo` de novo pedindo internet.
  - `SEM_INTERNET`: no Codex, primeiro rode `tudo` de novo pedindo internet, sem falar nada. Só se falhar de novo, mostre o texto.
  - `POUCO_ESPACO`: espere a pessoa liberar e rode `tudo` de novo.
  - `PASTA_NA_NUVEM` e `NOME_COM_ACENTO`: com o OK da pessoa, rode `mudar-pasta` e rode `tudo` da pasta do campo `para`.
  - `SISTEMA_ANTIGO`: pare a instalação com o texto.
- `pasta`, `node`, `pacotes` ou `navegador`: o `tudo` já tentou de novo uma vez quando valia a pena. Mostre o texto do `resultado.codigo` em `erros` e siga as opções. Na hora de tentar de novo, rode `tudo` outra vez: o que já está pronto é pulado em segundos.
- `verificar`: se o único item de `resultado.itens` com `ok:false` for o `ffmpeg` (ele é opcional, e o `tudo` não para por ele), diga o `I-15-so-ffmpeg`: o resto funciona. Com outro item, diga o I-15, listando em palavras simples os itens com `ok:false`. "Tentar de novo": rode `tudo` de novo. Item `kit` com `origem:"kit"`: o código está em `kit/mensagens.json`; chame a skill `consertar`.

### 4. Um por um (só se a pessoa pedir)
Se a pessoa quiser aprovar cada programa, ou se o `tudo` parar duas vezes no mesmo passo, faça à mão: `checar` (diga o I-02), `plano` (I-03, com `{{n}}` = `total_programas`), e para cada passo com estado `falta`, na ordem `pasta`, `node`, `pacotes`, `navegador`, `ffmpeg`: o I-05, `passo <id>` e o `pronto` do item (`{{i}}` = `numero` do passo, `{{n}}` = `total_programas`). Recusa: I-06 com a `consequencia`; nos obrigatórios (`pasta`, `node`, `pacotes`, `navegador`), a opção 2 é "Parar a instalação por agora". `FALTA_PASSO_ANTERIOR`: rode o passo de `dados.falta` e volte. Se `acao_automatica` for `tentar_de_novo`, rode o passo de novo uma vez sem perguntar. No fim, a verificação (`verificar.sh` ou `verificar.ps1`) e o I-14, o I-15 ou o `I-15-so-ffmpeg`. Passe `--modo um_por_um` em todos esses comandos.

### 5. Skills de design (sugestão, uma vez)
O estúdio desenha melhor com duas skills de design instaladas no seu programa: `frontend-design` e `ui-ux-pro-max`. Veja se elas aparecem na sua lista de skills. Se faltar alguma, diga em uma frase: "Para as telas ficarem mais bonitas, recomendo instalar duas ajudas de design no {{agente}}. Quer que eu mostre como?" Se sim, mostre o caminho em passos simples, sem palavra técnica. Para você: no Claude Code, é pelo gerenciador de plugins; no Codex, pela pasta de skills do usuário. Nunca instale nada sozinho e nunca trave a instalação por isso.

### 6. Marca
Não rode a skill `minha-marca` agora. A marca nasce junto com a primeira apresentação, das mesmas respostas da coleta (skill `nova-apresentacao`). Se a pessoa pedir para ajustar a marca antes, aí sim, skill `minha-marca`.

## Desinstalar

Quando a pessoa pedir "desinstalar o estúdio":
1. Rode `desinstalar` (sem `--confirmar`). Ele só diz o que seria apagado (`apagaria`, `tamanho_mb`).
2. Diga o `DESINSTALAR-PERGUNTA`.
3. Só com "Pode apagar": rode `desinstalar --confirmar`. `ARQUIVO_EM_USO`: diga o texto do código e espere o "pronto".
4. Diga o `DESINSTALAR-PRONTO`.

Nunca apague a pasta do estúdio nem `minha-marca/`, `apresentacoes/` ou `referencias/`, nem quando desinstalar.

## Regras

- Nunca instale nada fora do instalador: nada de Homebrew, winget, pip, npm ou download avulso.
- Nunca peça senha. Nenhum passo precisa.
- Nunca mostre comando, caminho técnico ou registro de erro à pessoa, a não ser que ela peça.
- Um passo por mensagem. A pessoa nunca fica sem saber o que está acontecendo.
- Se algo der errado duas vezes e você não entender, use o texto de `DESCONHECIDO` e chame a skill `consertar`.

## Saídas

- `.ferramentas/instalacao.json` dentro da pasta do estúdio (o instalador escreve).
- `.ferramentas/navegador.txt` com o caminho do navegador escondido (o instalador escreve; o `./estudio` lê).
