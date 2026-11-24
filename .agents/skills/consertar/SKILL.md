---
name: consertar
description: Descobre e conserta o que deu errado no View Estúdio - programa faltando, navegador escondido que não abre, comando que falhou duas vezes, tela reprovada que não sai do vermelho, arquivo sumido - sem pedir à pessoa para ler log ou digitar comando. Use quando a pessoa disser "deu erro", "travou", "não funciona", "sumiu", ou quando um comando do estúdio devolver ok falso duas vezes seguidas.
---

# Consertar

A pessoa não sabe o que é log ou terminal. Ela sabe que "não funcionou". Você descobre o motivo, conserta e explica em 1 ou 2 frases.

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`), sempre de dentro da pasta do estúdio. Leia só a última linha (JSON).

## 1. Acalmar e olhar
Diga uma frase só: "Vou olhar o que aconteceu. Não precisa fazer nada." E rode:
1. `./estudio verificar`: confere Node, navegador e o que os comandos precisam.
2. A verificação do instalador:
   - Mac: `bash instalar/verificar.sh`
   - Windows (PowerShell ou Git Bash): `powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/verificar.ps1`

No Codex, a verificação do instalador roda pedindo para sair da área protegida.

Se nem o `./estudio` rodar e a última linha disser `ESTUDIO_NAO_INSTALADO`, rode a skill `instalar-estudio` (ela pula o que já está pronto). Se a pasta do estúdio sumiu ou mudou de lugar, diga: "Não achei o estúdio no lugar de sempre. Você mudou o view-estudio de lugar ou trocou o nome dele?" e ajude a achar, sem apagar nada.

## 2. Entender o código
- Item da verificação do instalador com `ok:false`: é de instalação. O texto está em `instalar/mensagens.json` (`itens` e `erros`), e o item traz `passo`.
- Código vindo de um comando `./estudio`: o texto e a `acao` estão em `kit/mensagens.json`. Avisos em `avisos` também têm `codigo`.
- Código que não está em nenhum dos dois: use `DESCONHECIDO` de `instalar/mensagens.json`.

## 3. Consertar instalação
Para cada item que falhou:
1. Avise com o I-04 do item.
2. Rode o passo:
   - Mac: `bash instalar/instalar.sh passo <passo> --agente <claude|codex>`
   - Windows: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/instalar.ps1 passo <passo> --agente <claude|codex>`
3. Siga o código do resultado como na skill `instalar-estudio` (tente de novo uma vez sozinho quando `acao_automatica` for `tentar_de_novo`).
4. Rode a verificação de novo.

Casos que pedem cuidado:
- `USE_O_INSTALADOR_DO_WINDOWS`: o instalador do Mac foi chamado no Windows. Sem falar nada, use o do Windows.
- `INTERNET_BLOQUEADA_PELA_CAIXA`: a internet funciona; a área protegida do programa barrou. Rode de novo pedindo internet. Nunca culpe o Wi-Fi.
- `SISTEMA_ANTIGO`: o computador não roda o estúdio. Diga o texto e não tente de novo.
- Navegador escondido que não abre depois de instalado: rode `passo navegador` de novo. Se a pessoa tiver o Google Chrome ou o Edge instalado, os comandos também conseguem usar esse.

## 4. Consertar os comandos
Siga a `acao` do código em `kit/mensagens.json`. Em geral:
- **Saída 2 (reprovado)** não é defeito do estúdio: é a apresentação que precisa de ajuste. Leia `dados` (no `checar`, a lista `dados.vermelhos`, cada um com `tela`, `beat`, `tipo` e `detalhe`), corrija a tela pela causa e rode de novo. Volte à skill que estava rodando.
- `APRESENTACAO_NAO_ACHADA`, `NOME_INVALIDO`: confira o nome em `apresentacoes/` (letras minúsculas, números e hífen) e rode de novo com o nome certo.
- `NODE_ANTIGO` ou `ESTUDIO_NAO_INSTALADO`: rode `passo node` do instalador.
- `CHROME_NAO_ACHADO` ou `CHROME_NAO_ABRIU`: rode `passo navegador` do instalador. No Codex, rode o comando de novo fora da área protegida antes.
- `HYPERFRAMES_FALTANDO`, `HYPERFRAMES_SO_PELA_INTERNET` ou aviso `DEPENDENCIAS_MUDARAM`: rode `passo pacotes` do instalador.
- `FFMPEG_FALTANDO`: rode `passo ffmpeg` do instalador. As outras telas não dependem dele.
- `AXE_AUSENTE` (no `acessibilidade`) ou `axe` em `dados.faltando` do `verificar`: a peça de acessibilidade vem com o estúdio; rode `./estudio atualizar`.
- `FONTE_DOWNLOAD_FALHOU` (no `fonte`): sem internet agora, ou no Codex dentro da área protegida. Rode de novo fora dela; sem internet, siga com a letra que a marca já tem e tente depois.
- `SERVIDOR_NAO_SUBIU` (no `abrir`): feche outras janelas do estúdio e rode de novo.
- `ESPELHO_DIFERENTE` (o `espelhar --conferir` reprovou): algum arquivo de instruções do estúdio foi mexido. Não edite à mão: rode `./estudio espelhar` para refazer as cópias a partir das fontes e `./estudio espelhar --conferir` para confirmar.

## 5. Tela que não sai do vermelho
Depois de duas correções sem sair do vermelho na mesma tela:
1. Abra a foto dessa tela em `prints/` e o `detalhe` do vermelho.
2. Pergunte se é remendo ou se a tela precisa ser repensada: texto demais para o espaço pede menos texto ou outra tela, não letra menor (o mínimo é 18 px).
3. Mude a tela e rode `checar` de novo.

## 6. Arquivo em uso ou pouco espaço
- `ARQUIVO_EM_USO`: diga o texto do código e espere o "pronto".
- Pouco espaço: as fotos de `prints/` e os vídeos de `deck/assets/` de apresentações antigas são o que mais ocupa. Nunca apague nada sem pedir: mostre o que ocupa e deixe a pessoa decidir.

## 7. Explicar
Em 1 ou 2 frases simples: o que houve e o que você fez. Exemplo: "O navegador escondido tinha ficado pela metade. Instalei de novo e as fotos já saem." Depois volte ao que a pessoa estava fazendo, de onde parou.

## 8. Se nada resolver
Depois de duas tentativas sem sucesso no mesmo problema:
> Não consegui resolver sozinho. O problema é: {{explicação em uma frase}}. Quer que eu tente mais uma vez ou prefere pedir ajuda?
> 1. Tentar mais uma vez ★
> 2. Vou pedir ajuda

Se ela for pedir ajuda, diga que pode abrir um aviso em <https://github.com/autonom-ia/view-estudio/issues> com a frase: "{{código}} ao rodar {{nome}}" e a versão de `./estudio versao`. Nunca inclua arquivos da apresentação nem dados pessoais nesse aviso.

## Proibido

- Pedir para a pessoa ler log, abrir o terminal ou digitar comando.
- Mostrar log ou caminho técnico, a não ser na frase para pedir ajuda.
- Apagar `minha-marca/`, `apresentacoes/` ou `referencias/`.
- Instalar qualquer coisa fora do instalador.
- Editar `AGENTS.md`, `CLAUDE.md`, as skills ou o `kit/`.
