# Comandos únicos de instalação

A pessoa cola **um** destes textos no Claude Code ou no Codex (no app ou no Terminal), aberto na pasta pessoal. O texto é o mesmo no Mac e no Windows: o assistente descobre o sistema sozinho (e, no Windows, se está no PowerShell ou no Git Bash), baixa o estúdio e segue o `AGENTS.md`, que manda começar pela instalação.

Endereço do estúdio no GitHub: conta **autonom-ia**, repositório **view-estudio**: <https://github.com/autonom-ia/view-estudio>.

A pasta na máquina da pessoa se chama `view-estudio`, dentro da pasta pessoal. O zip anexado ao release (`view-estudio.zip`) já vem com uma única pasta chamada `view-estudio`.

---

## V1: o link (padrão)

```
instale: https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip
```

O link `releases/latest/download/view-estudio.zip` sempre entrega a versão mais nova. Tudo o que um texto longo diria (aprovar as caixinhas, descobrir o sistema, falar simples, pedir licença) está dentro do estúdio: no aviso do topo do `README.md`, no `AGENTS.md` e na skill `instalar-estudio`. Se o assistente descompactar em outro lugar (Downloads, por exemplo), a skill muda a pasta para o lugar certo antes de instalar.

### V1 longa (reserva)

Use se algum assistente baixar o arquivo e não seguir as instruções de dentro.

```
Quero instalar o View Estúdio no meu computador.

0. Antes de rodar qualquer coisa, me diga em uma frase como aprovar as caixinhas de licença que vão aparecer: no app, o botão de aprovar; no Terminal, a opção 1, que começa com Yes.
1. Descubra se este computador é Mac ou Windows, e se você está rodando no PowerShell ou no Git Bash.
2. Se já existir a pasta "view-estudio" na minha pasta pessoal, não apague nada e pule para o passo 4.
3. Baixe e descompacte o estúdio na minha pasta pessoal:
   - Mac (Terminal):
     cd ~ && curl -fL -o view-estudio.zip "https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip" && ditto -x -k view-estudio.zip . && rm view-estudio.zip
   - Windows (PowerShell):
     $ProgressPreference="SilentlyContinue"; cd $HOME; curl.exe -fL -o view-estudio.zip "https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip"; tar.exe -xf view-estudio.zip; Remove-Item view-estudio.zip
   - Windows (Git Bash):
     cd ~ && curl -fL -o view-estudio.zip "https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip" && /c/Windows/System32/tar.exe -xf view-estudio.zip && rm view-estudio.zip
4. Leia o arquivo view-estudio/AGENTS.md inteiro e siga o que ele manda, começando pela instalação.

Fale comigo em português simples, um passo por vez. Antes de instalar qualquer coisa, me explique o que é e me peça licença.
```

---

## V2: zip baixado pelo navegador

Igual à V1 longa, trocando o passo 3 por este:

```
3. Eu baixei o arquivo view-estudio.zip, que está na minha pasta Downloads. Descompacte esse arquivo na minha pasta pessoal e tire a marca de "baixado da internet":
   - Mac: ditto -x -k ~/Downloads/view-estudio.zip ~ && xattr -dr com.apple.quarantine ~/view-estudio && chmod 755 ~/view-estudio/estudio ~/view-estudio/instalar/*.sh
   - Windows (PowerShell): cd $HOME; tar.exe -xf "$HOME\Downloads\view-estudio.zip"; Get-ChildItem -Recurse view-estudio | Unblock-File
   - Windows (Git Bash): rode a linha do PowerShell assim: powershell.exe -NoProfile -Command '<a linha do PowerShell acima>'
```

---

## Publicar uma versão (para quem mantém o estúdio)

1. Rode `npm test` e leia a linha `ℹ fail 0`. Rode `./estudio espelhar --conferir` e leia `"ok":true`.
2. Troque o número da versão nos **6 lugares** (o teste `a versão é a mesma nos 6 lugares` reprova se um ficar para trás):
   - `VERSAO`;
   - `package.json` (`"version"`);
   - `package-lock.json`, duas vezes: o `"version"` do topo e o de `packages[""]`;
   - `instalar/instalar.sh` (`VERSAO_ESTUDIO="X.Y.Z"`);
   - `instalar/instalar.ps1` (`$script:VersaoEstudio = 'X.Y.Z'`).
3. Rode `npm test` de novo, commite, faça o merge e crie a tag `vX.Y.Z` no commit do merge.
4. Gere o zip **da tag** (não do HEAD da sua pasta, que pode ter coisa solta) e o SHA-256 dele:
   ```
   git archive --format=zip --prefix=view-estudio/ -o view-estudio.zip vX.Y.Z
   shasum -a 256 view-estudio.zip > view-estudio.zip.sha256
   ```
   O zip tem uma única pasta `view-estudio` dentro, com os bits de execução de `estudio` e `instalar/*.sh`.
5. Publique o release `vX.Y.Z` no GitHub `autonom-ia/view-estudio` com os dois anexos: `view-estudio.zip` e `view-estudio.zip.sha256`.
6. O `./estudio atualizar` da pessoa baixa `releases/latest/download/view-estudio.zip` (ver `ESTUDIO_ATUALIZAR_URL` em `instalar/versoes.env`), confere pelo `.sha256` e só aceita endereço `https://github.com/autonom-ia/view-estudio/releases/...`. O zip automático da tag não serve para o `atualizar`: precisa do anexo.

### Anotado para uma versão futura

- HyperFrames: o estúdio está fixado na `0.8.181` (`package.json`, `kit/scripts/lib/hyperframes.mjs`). Subir para a `0.9.x` numa versão futura, conferindo o molde de cena (`kit/molde-cena/`) e o render de rascunho antes.

---

## O que acontece depois do comando

1. O assistente lê o `AGENTS.md` e mostra o I-01 (o que vai fazer, pede para olhar o computador).
2. Roda `checar`. Se o estúdio caiu dentro do OneDrive ou do iCloud, fora da pasta pessoal, ou se o nome do usuário do Windows tem acento, o assistente pede licença e muda a pasta de lugar (`mudar-pasta`).
3. Mostra o plano (I-03) e instala um programa por vez, avisando antes de cada um: Node, peças do estúdio, navegador escondido e FFmpeg.
4. Roda `verificar` e diz "Tudo pronto" ou o que faltou.
5. Chama a skill `minha-marca` para registrar cores, letras e logo.

Os textos de cada momento estão em `instalar/mensagens.json`.
