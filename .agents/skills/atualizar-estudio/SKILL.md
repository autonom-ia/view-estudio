---
name: atualizar-estudio
description: Atualiza o View Estúdio para a versão mais nova publicada pela Autonom.ia no GitHub, só quando a versão subiu, conferida por SHA256, sem tocar nas pastas da pessoa (minha-marca, apresentacoes, referencias) nem nas skills próprias que ela pôs em .claude/skills ou .agents/skills, e com volta automática se algo falhar; depois confere os programas e refaz o que mudou. Use quando a pessoa pedir "atualizar o estúdio", "tem versão nova?", ou quando a skill instalar-estudio achar um estúdio mais antigo.
---

# Atualizar o estúdio

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`). Leia só a última linha (JSON) e traduza o `codigo` por `kit/mensagens.json`. No Codex, o `atualizar` precisa de internet (texto `CODEX-INTERNET` de `instalar/mensagens.json`).

## Passo a passo

1. `./estudio versao`: guarde a versão atual (em `dados`).
2. Diga: "Vou procurar uma versão nova do estúdio. As suas apresentações, a sua marca e as referências ficam como estão. Posso?" com "Pode ★" e "Agora não". Em "Agora não", diga que é só pedir "atualizar o estúdio" quando quiser.
3. Com o OK, rode `./estudio atualizar`, sem endereço. Ele baixa a versão mais nova do endereço oficial (`github.com/autonom-ia/view-estudio`), confere o SHA256, só troca se a versão subiu, guarda a anterior e volta tudo se a troca falhar no meio. As permissões locais (`.claude/settings.local.json`) e as skills próprias da pessoa em `.claude/skills/` e `.agents/skills/` (as que ela pôs ou que outro programa, como o hyperframes, instalou) ficam: só as skills do estúdio são trocadas pelas novas.
4. Leia a última linha e o `codigo` em `kit/mensagens.json`:
   - `JA_ATUALIZADO`: já está na versão mais nova. Diga isso em uma frase e pare.
   - `ESTUDIO_ATUALIZADO`: `dados.de` e `dados.para` dizem as versões; a anterior ficou guardada em `dados.copia_anterior` (com ela, os arquivos que a versão nova não tem mais, listados em `dados.guardados_na_copia`). `dados.skills_mantidas` lista as skills próprias que voltaram para o lugar. Leia de novo o `AGENTS.md` inteiro, porque as regras podem ter mudado. Com o aviso `DEPENDENCIAS_MUDARAM`, rode o instalador de novo (skill `instalar-estudio`) nos passos que a verificação do passo 5 apontar. Siga para o passo 5.
   - `ATUALIZACAO_FALHOU`: a troca falhou e tudo voltou como estava. Diga que nada mudou e ofereça tentar de novo mais tarde.
   - `ATUALIZACAO_INCOMPLETA`: alguns arquivos não voltaram sozinhos; a cópia está em `dados.copia_anterior`. Chame a skill `consertar`.
   - Outro `ok:false` (download, arquivo diferente, endereço estranho): diga o texto do código. Nunca tente consertar arquivos do estúdio à mão.
5. Confira os programas com a verificação do instalador:
   - Mac: `bash instalar/verificar.sh`
   - Windows: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/verificar.ps1`
   Item com `ok:false` (por exemplo, `pacotes` quando a versão nova trouxe peças novas, ou `navegador` quando mudou a versão dele): rode `passo <passo>` do instalador para cada um, como na skill `instalar-estudio`, e verifique de novo.
6. `./estudio espelhar --conferir`: precisa de `ok:true`. Se reprovar, rode `./estudio espelhar` e confira de novo.
7. Diga em uma frase de qual versão para qual foi, e o que muda para a pessoa, se a versão nova trouxer novidade visível.

## Apresentações antigas depois de atualizar

O molde novo vale para apresentações novas. As que já existem continuam com os arquivos delas (`deck/assets/vendor/`) e funcionam como antes. Se a pessoa quiser uma apresentação antiga com o motor novo, isso é uma mudança: copie `kit/molde/deck/assets/vendor/` por cima do `deck/assets/vendor/` dela, rode `checar` e `prints`, e leia as fotos antes de dizer que está pronto.

## Regras

- Só atualiza do endereço oficial. Nunca baixe o estúdio de outro lugar.
- Nunca apague `minha-marca/`, `apresentacoes/` nem `referencias/`, nem as skills próprias da pessoa em `.claude/skills/` e `.agents/skills/`.
- Nunca edite o `kit/`, o `instalar/` ou as instruções para "fazer funcionar" depois de atualizar: use a skill `consertar`.
