---
name: instalar-estudio
description: Instala o View Estúdio no Mac ou no Windows, um programa por vez (Node, peças do estúdio, navegador escondido e FFmpeg), pedindo licença com textos prontos e simples, e depois chama a skill minha-marca. Também desinstala, quando a pessoa pede. Use no primeiro uso, quando faltar o arquivo .ferramentas/instalacao.json na pasta do estúdio, quando a pessoa pedir para instalar, reinstalar ou desinstalar, ou quando a verificação apontar algo faltando.
---

# Instalar o estúdio

A pessoa pode não saber nada de tecnologia. Ela não lê o que aparece na tela técnica e não digita nada. Você explica, pede licença e faz.

## Antes de tudo

- **Textos.** Todos os textos desta skill (I-01 a I-15, os itens e os erros) estão em `instalar/mensagens.json`. Use-os como estão, trocando só o que está entre `{{ }}`. `{{agente}}` é "Claude" ou "Codex", conforme quem você é.
- **Pasta.** Rode tudo de dentro da pasta do estúdio (`~/view-estudio` no Mac; `%USERPROFILE%\view-estudio` ou `C:\ViewEstudio\view-estudio` no Windows). Os programas ficam em `.ferramentas`, dentro dela.
- **Sistema.** Descubra se é Mac, Windows com PowerShell ou Windows com Git Bash antes do primeiro comando.
- **Lugar da pasta.** Se a pessoa colou o link do zip e você descompactou o estúdio fora do lugar de sempre (em Downloads, dentro de outra pasta), rode `mudar-pasta` de dentro da pasta descompactada, antes do `checar`. Não pergunte: é a cópia que você acabou de baixar, e nada é apagado. No Codex, peça para sair da área protegida com o texto `CODEX-FORA-DA-AREA-MUDAR-PASTA`. Continue da pasta do campo `para`. Se vier `PASTA_DESTINO_EXISTE` e a pasta do campo `para` tem `AGENTS.md` e `instalar/instalar.sh`, é o estúdio baixado antes: siga nela, sem perguntar, e diga em uma frase que a cópia nova ficou na pasta do campo `de` e pode ir para a Lixeira. Nunca apague nenhuma das duas.
- **Saída.** Todo comando termina com uma linha JSON. Leia só ela. Nunca mostre nada técnico à pessoa.
- **Retomada.** Se a pessoa fechou a janela e voltou, siga daqui mesmo. O `plano` mostra o que já está `pronto`. Nunca recomece do zero.

### Como chamar o instalador

| Onde você roda | Instalador | Verificação |
|---|---|---|
| Mac | `bash instalar/instalar.sh <acao> [id] --agente <claude\|codex>` | `bash instalar/verificar.sh` |
| Windows, PowerShell | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/instalar.ps1 <acao> [id] --agente <claude\|codex>` | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/verificar.ps1` |
| Windows, Git Bash | o mesmo do PowerShell, com barra normal | o mesmo do PowerShell |

- No Windows, escreva sempre `instalar/instalar.ps1` com barra normal.
- `USE_O_INSTALADOR_DO_WINDOWS`: você rodou o `instalar.sh` no Windows. Sem falar nada, rode o mesmo pedido com a linha do Windows.

Ações: `checar`, `mudar-pasta`, `plano`, `passo <id>`, `verificar`, `desinstalar`.

### As caixinhas de permissão

Todo passo da instalação faz o Claude Code ou o Codex mostrar uma caixinha pedindo licença. Antes de cada passo, diga em uma frase o que ele faz (é o I-04 ou o I-05). Logo depois do I-01, diga a linha da caixinha do seu programa (`linha_caixinha_claude` ou `linha_caixinha_codex`).

No Codex, todo o instalador roda pedindo para sair da área protegida, o que também libera a internet (texto `CODEX-INTERNET`). Se a pessoa recusar a caixinha, diga o texto de `COMANDO_RECUSADO` com a consequência do item.

## Passo a passo

### 1. Olhar o computador
1. Diga o I-01 e, na mesma mensagem, a linha da caixinha. Espere a resposta. Se for "Agora não", diga que tudo bem e que é só escrever "instalar o estúdio" quando quiser. Pare.
2. Rode `checar`.
3. Para cada item de `problemas[]`, mostre o texto do código em `erros` (com `dados`) e siga as opções:
   - `INTERNET_BLOQUEADA_PELA_CAIXA`: não fale de Wi-Fi. Diga o texto e rode `checar` de novo pedindo internet.
   - `SEM_INTERNET`: no Codex, primeiro rode `checar` de novo pedindo internet, sem falar nada. Só se falhar de novo, mostre o texto.
   - `POUCO_ESPACO`: espere a pessoa liberar e rode `checar` de novo.
   - `PASTA_NA_NUVEM` e `NOME_COM_ACENTO`: com o OK da pessoa, rode `mudar-pasta` e continue da pasta do campo `para`.
   - `SISTEMA_ANTIGO`: pare a instalação com o texto.
   - `POUCA_MEMORIA`: só avise e siga.
4. Sem problema que trave, diga o I-02.

### 2. Mostrar o plano
1. Rode `plano`. Monte o I-03 com `{{n}}` = `total_programas`.
2. Espere a escolha: "Pode instalar tudo" (`--modo tudo`) ou "Um por um" (`--modo um_por_um`). Passe o modo em todos os comandos daqui em diante.

### 3. Pasta e programas, um de cada vez
Na ordem: `pasta`, `node`, `pacotes`, `navegador`, `ffmpeg`.

Para cada passo com estado `falta`:
1. Modo tudo: diga o I-04 com o `nome` e a `frase` do item. Modo um por um: diga o I-05 e espere. A `pasta` não tem contador: diga só o `pronto` dela.
2. Se a pessoa recusar: diga o I-06 com a `consequencia` do item. Nos obrigatórios (`pasta`, `node`, `pacotes`, `navegador`), a opção 2 é "Parar a instalação por agora".
3. Rode `passo <id>`.
4. `ok:true` (inclusive `JA_PRONTO`): diga o `pronto` do item, com `{{i}}` = `numero` do passo e `{{n}}` = `total_programas`.
5. `ok:false`: veja o `codigo` em `erros`. Se `acao_automatica` for `tentar_de_novo`, rode o passo de novo uma vez sem perguntar. Se falhar de novo, mostre o texto e as opções. `FALTA_PASSO_ANTERIOR`: rode o passo de `dados.falta` e volte.

Passos com estado `pronto`: pule sem falar nada.

### 4. Verificação final
1. Rode a verificação (`verificar.sh` ou `verificar.ps1`).
2. `ok:true`: diga o I-14, trocando `{{linha_voltar}}` pela linha do seu programa.
3. `ok:false` e só o item `ffmpeg` falhou: diga o `I-15-so-ffmpeg`. O resto funciona; siga.
4. `ok:false` com outro item: diga o I-15, listando em palavras simples os itens com `ok:false`. "Tentar de novo": rode `passo <passo>` de cada item que falhou e verifique de novo. Item `kit` com `origem:"kit"`: o código está em `kit/mensagens.json`; chame a skill `consertar`.

### 5. Skills de design (sugestão, uma vez)
O estúdio desenha melhor com duas skills de design instaladas no seu programa: `frontend-design` e `ui-ux-pro-max`. Veja se elas aparecem na sua lista de skills. Se faltar alguma, diga em uma frase: "Para as telas ficarem mais bonitas, recomendo instalar duas ajudas de design no {{agente}}. Quer que eu mostre como?" Se sim, explique como adicionar uma skill no seu programa (no Claude Code, pelo gerenciador de plugins; no Codex, pela pasta de skills do usuário). Nunca instale nada sozinho e nunca trave a instalação por isso.

### 6. Marca
Rode a skill `minha-marca`. Se a pessoa preferir deixar para depois, tudo bem: o estúdio usa a marca de exemplo até lá.

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
- Nunca mostre comando, caminho técnico ou log à pessoa, a não ser que ela peça.
- Um passo por mensagem. A pessoa nunca fica sem saber o que está acontecendo.
- Se algo der errado duas vezes e você não entender, use o texto de `DESCONHECIDO` e chame a skill `consertar`.

## Saídas

- `.ferramentas/instalacao.json` dentro da pasta do estúdio (o instalador escreve).
- `.ferramentas/navegador.txt` com o caminho do navegador escondido (o instalador escreve; o `./estudio` lê).
