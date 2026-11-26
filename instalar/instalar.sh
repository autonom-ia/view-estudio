#!/bin/bash
# View Estudio: instalador para Mac (Apple Silicon e Intel). Compativel com bash 3.2.
# Adaptado do instalador do Estudio de Reels (MIT, Autonom.ia): mesma casca, sem Python, sem modelos.
#
# Uso:
#   bash instalar/instalar.sh <acao> [id] [--agente claude|codex] [--modo tudo|um_por_um]
#
# Acoes:
#   tudo          A entrada unica: checar, os cinco passos e verificar, em sequencia. Para na primeira
#                 etapa obrigatoria que nao der certo e devolve o JSON dela em "resultado". O ffmpeg
#                 e opcional: se falhar, segue e a verificacao diz o que faltou.
#   checar        So olha o computador (sistema, espaco, memoria, internet, pasta). Nao instala nada.
#   plano         Diz o estado de cada passo (falta, pronto).
#   passo <id>    Instala ou executa um passo. Rodar de novo nao baixa de novo.
#   verificar     Confere cada programa, chama "./estudio verificar", grava instalacao.json e diz o que falta.
#   mudar-pasta   Muda o estudio para ~/view-estudio (quando ele caiu em Downloads ou dentro do iCloud).
#   desinstalar   Sem --confirmar: so diz o que seria apagado. Com --confirmar: apaga a pasta de
#                 ferramentas e as pecas do Node (node_modules). As apresentacoes e a marca ficam.
#
# Passos, na ordem: pasta node pacotes navegador ffmpeg
#   pasta      cria <view-estudio>/.ferramentas e as pastas do usuario
#   node       Node portatil (versao fixa, conferido por SHA256)
#   pacotes    npm ci (versoes fixas do package-lock.json)
#   navegador  chrome-headless-shell em versao fixa (@puppeteer/browsers travado no package-lock)
#   ffmpeg     so para transformar cena em video (comando "cena"); opcional
#
# Regras: tudo fica em <view-estudio>/.ferramentas; nada pede senha; versoes fixas em versoes.env;
# antes de cada coisa o script diz em portugues o que vai fazer; a ULTIMA linha e sempre um JSON numa linha so.
# Sem expressao regular: so comparacao de texto, case e corte de texto.
# So para Mac. No Windows (PowerShell ou Git Bash) use instalar/instalar.ps1.

set -u
umask 022

case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*)
    printf '%s\n' '{"acao":"","ok":false,"codigo":"USE_O_INSTALADOR_DO_WINDOWS","dados":{"comando":"powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/instalar.ps1"}}'
    exit 1 ;;
  Linux*)
    printf '%s\n' '{"acao":"","ok":false,"codigo":"SISTEMA_NAO_SUPORTADO","dados":{"sistema":"Linux"}}'
    exit 1 ;;
esac

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${ESTUDIO_REPO:-}" ]; then
  ESTUDIO_REPO="$(cd "$AQUI/.." && pwd)"
fi
export ESTUDIO_REPO
# shellcheck source=instalar/ambiente.sh
. "$ESTUDIO_REPO/instalar/ambiente.sh"

REPO="$ESTUDIO_REPO"
FERR="$ESTUDIO_FERRAMENTAS"
ESTADO="$FERR/estado"
LOGS="$FERR/logs"
LOG=/dev/null
TMPD=""
NODE_BIN="$FERR/node/bin/node"
NPM_BIN="$FERR/node/bin/npm"
# O Node anterior fica guardado aqui ate o novo passar na conferencia. Fica dentro de
# .ferramentas (mesmo disco: mover e so renomear), nunca no temporario, que e apagado no fim.
NODE_ANTERIOR="$FERR/node-anterior"
PASSOS="pasta node pacotes navegador ffmpeg"
PASTAS_DO_USUARIO="minha-marca apresentacoes referencias"
NOME_PASTA="view-estudio"

# ---------------------------------------------------------------- versoes

ler_versoes() {
  local linha chave valor
  [ -f "$REPO/instalar/versoes.env" ] || return 0
  while IFS= read -r linha || [ -n "$linha" ]; do
    linha="${linha%$'\r'}"
    case "$linha" in
      ''|'#'*) continue ;;
      *=*) ;;
      *) continue ;;
    esac
    chave="${linha%%=*}"
    valor="${linha#*=}"
    printf -v "V_$chave" '%s' "$valor"
  done < "$REPO/instalar/versoes.env"
}
ler_versoes

VERSAO_ESTUDIO="1.3.0"
if [ -f "$REPO/VERSAO" ]; then
  IFS= read -r VERSAO_ESTUDIO < "$REPO/VERSAO" || true
  VERSAO_ESTUDIO="${VERSAO_ESTUDIO%$'\r'}"
fi

# ---------------------------------------------------------------- argumentos

ACAO="${1:-}"
[ $# -gt 0 ] && shift
ID=""
AGENTE=""
MODO=""
CONFIRMAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --confirmar)
      CONFIRMAR=1; shift ;;
    --agente)
      if [ $# -ge 2 ]; then AGENTE="$2"; shift 2; else shift; fi ;;
    --modo)
      if [ $# -ge 2 ]; then MODO="$2"; shift 2; else shift; fi ;;
    *)
      [ -z "$ID" ] && ID="$1"
      shift ;;
  esac
done
case "$AGENTE" in claude|codex) ;; *) AGENTE="" ;; esac
case "$MODO" in tudo|um_por_um) ;; *) MODO="" ;; esac

# ---------------------------------------------------------------- computador

ARQ="x64"
case "$(uname -m 2>/dev/null)" in
  arm64|aarch64) ARQ="arm64" ;;
esac
if [ "$ARQ" = "x64" ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ]; then
  ARQ="arm64"
fi
VERSAO_SO="$(sw_vers -productVersion 2>/dev/null)"
MAC_MAIOR="${VERSAO_SO%%.*}"
MAC_RESTO="${VERSAO_SO#*.}"
MAC_MENOR="${MAC_RESTO%%.*}"
[ "$MAC_RESTO" = "$VERSAO_SO" ] && MAC_MENOR=0

# ---------------------------------------------------------------- utilidades

# Texto para JSON (aspas, barra, quebra de linha), caractere por caractere.
# shellcheck disable=SC1003 # a barra entre aspas simples e o caractere barra, de proposito
js() {
  local s="$1" out="" c i n
  n=${#s}
  for ((i = 0; i < n; i++)); do
    c="${s:i:1}"
    case "$c" in
      '"') out="$out\\\"" ;;
      '\') out="$out\\\\" ;;
      $'\n') out="$out\\n" ;;
      $'\r') ;;
      $'\t') out="$out " ;;
      *) out="$out$c" ;;
    esac
  done
  printf '"%s"' "$out"
}

jbool() { if [ "$1" = "1" ] || [ "$1" = "true" ]; then printf 'true'; else printf 'false'; fi; }

agora() { date -u +%Y-%m-%dT%H:%M:%SZ; }

diga() {
  printf '%s\n' "$*"
  if [ "$LOG" != "/dev/null" ]; then
    printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >>"$LOG" 2>/dev/null
  fi
}

preparar_log() {
  if mkdir -p "$LOGS" 2>/dev/null; then
    LOG="$LOGS/$1.log"
    printf '\n===== %s %s =====\n' "$1" "$(agora)" >>"$LOG" 2>/dev/null || LOG=/dev/null
  fi
}

preparar_tmp() {
  [ -n "$TMPD" ] && return 0
  if mkdir -p "$FERR/tmp/$$" 2>/dev/null; then
    TMPD="$FERR/tmp/$$"
  else
    TMPD="$(mktemp -d "${TMPDIR:-/tmp}/view-estudio.XXXXXX")"
  fi
}

# shellcheck disable=SC2329 # chamada pelo trap logo abaixo
limpar_tmp() {
  if [ -n "$TMPD" ] && [ -d "$TMPD" ]; then
    rm -rf "$TMPD"
  fi
}
trap limpar_tmp EXIT

ler_config() {
  CFG_AGENTE=""
  CFG_MODO=""
  [ -f "$FERR/config.txt" ] || return 0
  local l
  while IFS= read -r l || [ -n "$l" ]; do
    case "$l" in
      agente=*) CFG_AGENTE="${l#agente=}" ;;
      modo=*) CFG_MODO="${l#modo=}" ;;
    esac
  done < "$FERR/config.txt"
}

gravar_config() {
  [ -d "$FERR" ] || return 0
  ler_config
  [ -n "$AGENTE" ] && CFG_AGENTE="$AGENTE"
  [ -n "$MODO" ] && CFG_MODO="$MODO"
  printf 'agente=%s\nmodo=%s\n' "$CFG_AGENTE" "$CFG_MODO" > "$FERR/config.txt" 2>/dev/null || true
}

# estado/<id>.json (para o assistente) e estado/<id>.txt (duas linhas: estado e versao, para este script).
gravar_estado() {
  local id="$1" est="$2" cod="${3:-}" prog="${4:-}" ver="${5:-}"
  [ -d "$ESTADO" ] || return 0
  local t="$ESTADO/.$id.$$"
  printf '{"passo":%s,"estado":%s,"codigo":%s,"progresso":%s,"versao":%s,"atualizado_em":%s}\n' \
    "$(js "$id")" "$(js "$est")" "$(js "$cod")" "$(js "$prog")" "$(js "$ver")" "$(js "$(agora)")" > "$t" 2>/dev/null \
    && mv -f "$t" "$ESTADO/$id.json"
  printf '%s\n%s\n' "$est" "$ver" > "$ESTADO/$id.txt" 2>/dev/null || true
}

ler_estado() {
  EST_ESTADO=""
  EST_VERSAO=""
  [ -f "$ESTADO/$1.txt" ] || return 0
  { IFS= read -r EST_ESTADO; IFS= read -r EST_VERSAO; } < "$ESTADO/$1.txt"
}

# Le um campo de um JSON (texto) usando o proprio Node do estudio. Sem Node, devolve vazio.
jcampo() {
  [ -x "$NODE_BIN" ] || { printf ''; return 0; }
  "$NODE_BIN" -e 'try{const j=JSON.parse(process.argv[1]);const v=j[process.argv[2]];if(v===undefined||v===null){console.log("")}else if(typeof v==="object"){console.log(JSON.stringify(v))}else{console.log(String(v))}}catch(e){console.log("")}' "$1" "$2" 2>/dev/null
}

ultima_linha() { printf '%s\n' "$1" | tail -n 1; }

# Baixa com 2 tentativas. Retorno: 0 ok, 2 nao baixou, 3 chegou diferente do esperado.
baixar() {
  local url="$1" dest="$2" sha="${3:-}" tent tem
  for tent in 1 2; do
    rm -f "$dest.part"
    if ! curl -fL --retry 3 --retry-delay 3 --connect-timeout 20 -sS -A "view-estudio/1.0" -o "$dest.part" "$url" >>"$LOG" 2>&1; then
      echo "download falhou: $url" >>"$LOG"
      [ "$tent" = "2" ] && return 2
      sleep 3
      continue
    fi
    if [ -n "$sha" ]; then
      tem="$(shasum -a 256 "$dest.part" | cut -d' ' -f1)"
      if [ "$tem" != "$sha" ]; then
        echo "arquivo diferente: $url ($tem, esperado $sha)" >>"$LOG"
        rm -f "$dest.part"
        if [ "$tent" = "2" ]; then return 3; fi
        diga "O arquivo chegou diferente do esperado. Por seguranca, vou baixar de novo."
        continue
      fi
    fi
    mv -f "$dest.part" "$dest"
    return 0
  done
  return 2
}

codigo_do_download() {
  case "$1" in
    3) printf 'ARQUIVO_DIFERENTE' ;;
    *) printf 'DOWNLOAD_FALHOU' ;;
  esac
}

# Roda um programa nosso. Se o Mac bloquear (126 ou morto), tira a trava e tenta de novo.
RB_SAIDA=""
RB_BLOQUEADO=0
rodar_bin() {
  local b="$1" st
  shift
  RB_BLOQUEADO=0
  RB_SAIDA="$("$b" "$@" 2>>"$LOG")"
  st=$?
  if [ "$st" -eq 126 ] || [ "$st" -ge 128 ]; then
    diga "O Mac nao deixou abrir um programa. Vou tirar a trava de baixado da internet e tentar de novo."
    xattr -dr com.apple.quarantine "$b" >>"$LOG" 2>&1
    codesign --force -s - "$b" >>"$LOG" 2>&1
    RB_SAIDA="$("$b" "$@" 2>>"$LOG")"
    st=$?
    if [ "$st" -eq 126 ] || [ "$st" -ge 128 ]; then RB_BLOQUEADO=1; fi
  fi
  return "$st"
}

copiar_bin() {
  local origem f
  origem="$1"
  f="$(find "$origem" -type f -name "$2" 2>/dev/null | head -n 1)"
  [ -n "$f" ] || return 1
  cp -f "$f" "$FERR/bin/$2" || return 1
  chmod 755 "$FERR/bin/$2"
  xattr -d com.apple.quarantine "$FERR/bin/$2" >/dev/null 2>&1
  return 0
}

tamanho_mb() {
  case "$1" in
    node) echo 190 ;;
    pacotes) echo 250 ;;
    navegador) echo 250 ;;
    ffmpeg) echo 150 ;;
    *) echo 0 ;;
  esac
}

obrigatorio() {
  case "$1" in
    pasta|node|pacotes|navegador) echo true ;;
    *) echo false ;;
  esac
}

# Numero de cada programa na lista do I-03 ("{{i}} de {{n}}"). A pasta nao tem numero.
numero_do_programa() {
  case "$1" in
    node) echo 1 ;; pacotes) echo 2 ;; navegador) echo 3 ;; ffmpeg) echo 4 ;;
    *) echo 0 ;;
  esac
}

espaco_livre_gb() {
  df -Pk "$HOME" 2>/dev/null | awk 'NR==2 { printf "%.1f", $4 / 1048576 }'
}

memoria_gb() {
  local b
  b="$(sysctl -n hw.memsize 2>/dev/null)"
  [ -n "$b" ] || b=0
  awk -v b="$b" 'BEGIN { printf "%.0f", b / 1073741824 }'
}

menor_que() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a + 0 < b + 0) }'; }

nuvem_do_caminho() {
  local p="$1"
  case "$p" in
    *"/Library/Mobile Documents/"*) printf 'iCloud'; return ;;
    *"/Library/CloudStorage/OneDrive"*) printf 'OneDrive'; return ;;
    *"/Library/CloudStorage/Dropbox"*) printf 'Dropbox'; return ;;
    *"/Library/CloudStorage/GoogleDrive"*) printf 'Google Drive'; return ;;
    *"/Library/CloudStorage/"*) printf 'nuvem'; return ;;
  esac
  case "$p" in
    "$HOME/Desktop"|"$HOME/Desktop/"*|"$HOME/Documents"|"$HOME/Documents/"*)
      if [ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Desktop" ] || [ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Documents" ]; then
        printf 'iCloud'
      fi ;;
  esac
}

# ---------------------------------------------------------------- conferencias

# 0 ok, 1 falta, 2 sem o codificador de video.
ffmpeg_completo() {
  local e
  [ -x "$FERR/bin/ffmpeg" ] || return 1
  rodar_bin "$FERR/bin/ffmpeg" -hide_banner -encoders || return 1
  e="$RB_SAIDA"
  case "$e" in
    *" libx264 "*) ;;
    *) echo "falta o codificador libx264" >>"$LOG"; return 2 ;;
  esac
  [ -x "$FERR/bin/ffprobe" ] || return 1
  rodar_bin "$FERR/bin/ffprobe" -version || return 1
  return 0
}

versao_ffmpeg() {
  local l c
  l="$("$FERR/bin/ffmpeg" -version 2>/dev/null | head -n 1)"
  read -r _ _ c _ <<EOF
$l
EOF
  printf '%s' "${c%%-*}"
}

# Versao do hyperframes instalada e a pedida no package.json. "ok <versao>" quando batem.
JS_PACOTES='const fs=require("fs"),path=require("path");const r=process.argv[1];try{const p=JSON.parse(fs.readFileSync(path.join(r,"package.json"),"utf8"));const deps=Object.assign({},p.dependencies||{});const nomes=Object.keys(deps);for(const n of nomes){const f=path.join(r,"node_modules",n,"package.json");if(!fs.existsSync(f)){console.log("falta "+n);process.exit(0)}const v=JSON.parse(fs.readFileSync(f,"utf8")).version;const fixo="0123456789".includes(String(deps[n]).charAt(0));if(fixo&&v!==deps[n]){console.log("diferente "+n);process.exit(0)}}const h=nomes.includes("hyperframes")?deps.hyperframes:"";console.log("ok "+h)}catch(e){console.log("falta package.json")}'

pacotes_ok() {
  local res
  PACOTES_VERSAO=""
  [ -x "$NODE_BIN" ] || return 1
  res="$("$NODE_BIN" -e "$JS_PACOTES" "$REPO" 2>>"$LOG")"
  case "$res" in
    "ok "*|"ok") PACOTES_VERSAO="${res#ok}"; PACOTES_VERSAO="${PACOTES_VERSAO# }"; return 0 ;;
  esac
  echo "pacotes: $res" >>"$LOG"
  return 1
}

navegador_caminho() {
  local c=""
  [ -f "$FERR/navegador.txt" ] || return 1
  IFS= read -r c < "$FERR/navegador.txt" || true
  c="${c%$'\r'}"
  [ -n "$c" ] && [ -x "$c" ] || return 1
  case "$c" in
    *"${V_CHROME_HEADLESS_SHELL_VERSAO:-sem-versao}"*) ;;
    *) return 1 ;;
  esac
  printf '%s' "$c"
}

# Conferencia rapida (sem baixar nada), usada pelo plano e para pular passos prontos.
rapido_ok() {
  ler_estado "$1"
  case "$1" in
    pasta) [ -d "$FERR/bin" ] && [ -w "$FERR" ] ;;
    node) [ -x "$NODE_BIN" ] && [ "$("$NODE_BIN" -v 2>/dev/null)" = "v${V_NODE_VERSAO:-}" ] ;;
    pacotes) pacotes_ok ;;
    navegador) navegador_caminho >/dev/null ;;
    ffmpeg) [ -x "$FERR/bin/ffmpeg" ] && [ -x "$FERR/bin/ffprobe" ] && [ "$EST_ESTADO" = "pronto" ] ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------- resultado dos passos

R_OK=0; R_COD=""; R_VER=""; R_DET=""; R_DADOS="{}"
falhou() { R_OK=0; R_COD="$1"; R_DET="${2:-}"; return 1; }
deu_certo() { R_OK=1; R_COD="${1:-INSTALADO}"; R_VER="${2:-}"; return 0; }
precisa() {
  # precisa <id> <condicao ja testada: 0/1>
  if [ "$2" != "0" ]; then
    R_OK=0; R_COD="FALTA_PASSO_ANTERIOR"; R_DADOS="{\"falta\":$(js "$1")}"
    diga "Antes deste passo falta instalar: $1."
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------- passos

passo_pasta() {
  local p
  diga "Vou criar a pasta de programas do estudio. Os programas ficam todos nela. Nada fora dela e mexido."
  if ! mkdir -p "$FERR/bin" "$FERR/node" "$FERR/navegador" "$FERR/cache/npm" "$LOGS" "$ESTADO" "$FERR/tmp" 2>/dev/null \
     || [ ! -w "$FERR" ]; then
    R_DADOS="{\"pasta\":$(js "$FERR")}"
    falhou PERMISSAO_NEGADA "$FERR"
    return 1
  fi
  preparar_log pasta
  for p in $PASTAS_DO_USUARIO; do
    mkdir -p "$REPO/$p" 2>>"$LOG" || { R_DADOS="{\"pasta\":$(js "$REPO/$p")}"; falhou PERMISSAO_NEGADA; return 1; }
  done
  # Um zip pode perder o bit de execucao: devolve aqui.
  chmod 755 "$REPO/estudio" "$REPO"/instalar/*.sh 2>/dev/null
  gravar_config
  diga "Pronto: pasta criada em $FERR."
  deu_certo INSTALADO ""
}

# O Node que esta no lugar responde na versao pedida e tem npm.
node_na_versao_certa() {
  [ -x "$NODE_BIN" ] && [ -f "$NPM_BIN" ] && [ "$("$NODE_BIN" -v 2>/dev/null)" = "v${V_NODE_VERSAO:-}" ]
}

# Devolve o Node anterior (guardado em $NODE_ANTERIOR) se o novo nao passou na conferencia.
# So tira o node do lugar se o guardado existe. Se nao der para devolver, o guardado fica
# onde esta (nunca e apagado) e o log diz o caminho.
voltar_node_antigo() {
  [ -e "$NODE_ANTERIOR" ] || return 0
  rm -rf "$FERR/node" 2>>"$LOG"
  if [ -e "$FERR/node" ]; then
    echo "nao consegui tirar o Node novo do lugar; o anterior continua guardado em: $NODE_ANTERIOR" >>"$LOG"
    return 1
  fi
  if mv "$NODE_ANTERIOR" "$FERR/node" 2>>"$LOG"; then
    echo "Node anterior devolvido." >>"$LOG"
    return 0
  fi
  echo "nao consegui devolver o Node anterior; ele continua guardado em: $NODE_ANTERIOR" >>"$LOG"
  return 1
}

# Sobra de uma execucao que caiu no meio da troca do Node: arruma antes de comecar.
arrumar_node_anterior() {
  [ -e "$NODE_ANTERIOR" ] || return 0
  if [ ! -e "$FERR/node" ]; then
    echo "node: achei o Node anterior guardado e nenhum no lugar; devolvendo" >>"$LOG"
    voltar_node_antigo
    return
  fi
  if node_na_versao_certa; then
    echo "node: o Node no lugar confere; apagando o anterior guardado" >>"$LOG"
    rm -rf "$NODE_ANTERIOR" 2>>"$LOG"
    return 0
  fi
  echo "node: o Node no lugar nao confere; devolvendo o anterior guardado" >>"$LOG"
  voltar_node_antigo
}

passo_node() {
  diga "Vou instalar o Node. E o motor dos comandos do estudio. Fica so na pasta do estudio."
  local plat="darwin-x64" nome base sha="${V_NODE_SHA256_DARWIN_X64:-}" rc v
  [ "$ARQ" = "arm64" ] && { plat="darwin-arm64"; sha="${V_NODE_SHA256_DARWIN_ARM64:-}"; }
  nome="node-v${V_NODE_VERSAO:-}-$plat"
  base="https://nodejs.org/dist/v${V_NODE_VERSAO:-}"
  arrumar_node_anterior
  # O Node anterior fica guardado ate o novo passar na conferencia; qualquer falha devolve ele.
  if node_na_versao_certa; then
    :
  else
    diga "Baixando o Node (uns 50 MB)..."
    # SHA256 fixo em versoes.env (copiado do SHASUMS256.txt oficial): confere origem, nao so integridade.
    [ -n "$sha" ] || { R_DADOS='{"nome":"Node"}'; falhou ARQUIVO_DIFERENTE "sem SHA256 em versoes.env"; return 1; }
    baixar "$base/$nome.tar.xz" "$TMPD/node.tar.xz" "$sha"
    rc=$?
    if [ "$rc" != "0" ]; then R_DADOS='{"nome":"Node"}'; falhou "$(codigo_do_download "$rc")"; return 1; fi
    diga "Conferi: o arquivo chegou certinho. Abrindo..."
    mkdir -p "$TMPD/node"
    tar -xJf "$TMPD/node.tar.xz" -C "$TMPD/node" >>"$LOG" 2>&1 || { R_DADOS='{"nome":"Node"}'; falhou DOWNLOAD_FALHOU; return 1; }
    [ -d "$TMPD/node/$nome" ] || { R_DADOS='{"nome":"Node"}'; falhou DESCONHECIDO; return 1; }
    if [ -e "$FERR/node" ]; then
      # Ja ha um anterior guardado que nao deu para devolver: nao guarda outro por cima.
      [ -e "$NODE_ANTERIOR" ] && { R_DADOS="{\"arquivo\":$(js "$NODE_ANTERIOR")}"; falhou ARQUIVO_EM_USO; return 1; }
      mv "$FERR/node" "$NODE_ANTERIOR" 2>>"$LOG" || { R_DADOS="{\"arquivo\":$(js "$FERR/node")}"; falhou ARQUIVO_EM_USO; return 1; }
    fi
    mv "$TMPD/node/$nome" "$FERR/node" || { voltar_node_antigo; R_DADOS="{\"pasta\":$(js "$FERR")}"; falhou PERMISSAO_NEGADA; return 1; }
  fi
  if ! rodar_bin "$NODE_BIN" -v; then
    voltar_node_antigo
    [ "$RB_BLOQUEADO" = "1" ] && { R_DADOS='{"nome":"Node"}'; falhou MAC_BLOQUEOU; return 1; }
    R_DADOS='{"nome":"Node"}'; falhou DESCONHECIDO; return 1
  fi
  v="$RB_SAIDA"
  case "$v" in
    v24.*) ;;
    *) voltar_node_antigo; R_DADOS='{"nome":"Node"}'; falhou DESCONHECIDO "versao $v"; return 1 ;;
  esac
  [ -f "$NPM_BIN" ] || { voltar_node_antigo; R_DADOS='{"nome":"Node"}'; falhou DESCONHECIDO "sem npm"; return 1; }
  # So agora, com o novo conferido, o anterior pode sair.
  rm -rf "$NODE_ANTERIOR" 2>>"$LOG"
  diga "Pronto: Node $v instalado."
  deu_certo INSTALADO "$v"
}

passo_pacotes() {
  diga "Vou instalar as pecas do estudio (o motor de cena e o que ele usa). Ficam so na pasta do estudio."
  local tent ok=0 args
  [ -x "$NODE_BIN" ] && [ -f "$NPM_BIN" ]
  precisa node $? || return 1
  # Versoes fixas de toda a arvore: "npm ci" com o package-lock.json que vem no estudio.
  args="ci"
  if [ ! -f "$REPO/package-lock.json" ]; then
    echo "sem package-lock.json: usando npm install sem gravar lock" >>"$LOG"
    args="install --no-package-lock"
  fi
  for tent in 1 2; do
    diga "Baixando as pecas (uns 150 MB). Pode levar alguns minutos..."
    # shellcheck disable=SC2086 # args tem mais de uma palavra de proposito
    if (cd "$REPO" && "$NODE_BIN" "$NPM_BIN" $args --no-audit --no-fund >>"$LOG" 2>&1); then ok=1; break; fi
    [ "$tent" = "1" ] && diga "As pecas nao ficaram prontas. Vou instalar de novo."
  done
  if [ "$ok" != "1" ] || ! pacotes_ok; then falhou PACOTES_FALHOU; return 1; fi
  diga "Pronto: pecas do estudio instaladas."
  deu_certo INSTALADO "$PACOTES_VERSAO"
}

passo_navegador() {
  diga "Vou instalar o navegador escondido. Ele tira as fotos e o PDF das apresentacoes. Nao mexe no seu Chrome."
  local ver="${V_CHROME_HEADLESS_SHELL_VERSAO:-}" pb="${V_PUPPETEER_BROWSERS_VERSAO:-}" tent ok=0 exe v pbdir pbv
  [ -x "$NODE_BIN" ]
  precisa node $? || return 1
  if [ -z "$ver" ] || [ -z "$pb" ]; then falhou NAVEGADOR_FALHOU "sem versao em versoes.env"; return 1; fi
  # O baixador vem travado no package-lock (passo "pacotes"); nada e resolvido na hora pelo npx.
  pbdir="$REPO/node_modules/@puppeteer/browsers"
  [ -f "$pbdir/lib/main-cli.js" ]
  precisa pacotes $? || return 1
  pbv="$("$NODE_BIN" -p "require(process.argv[1]).version" "$pbdir/package.json" 2>>"$LOG")"
  [ "$pbv" = "$pb" ] || { falhou NAVEGADOR_FALHOU "baixador $pbv, versoes.env pede $pb"; return 1; }
  for tent in 1 2; do
    diga "Baixando o navegador escondido (uns 100 MB)..."
    if (cd "$FERR" && "$NODE_BIN" "$pbdir/lib/main-cli.js" install "chrome-headless-shell@$ver" --path "$FERR/navegador" >>"$LOG" 2>&1); then ok=1; break; fi
    [ "$tent" = "1" ] && diga "O navegador escondido nao baixou. Vou tentar de novo."
  done
  [ "$ok" = "1" ] || { R_DADOS='{"nome":"navegador escondido"}'; falhou NAVEGADOR_FALHOU; return 1; }
  exe=""
  while IFS= read -r v; do
    case "$v" in
      *"$ver"*) exe="$v" ;;
    esac
  done <<EOF
$(find "$FERR/navegador" -type f -name chrome-headless-shell 2>/dev/null)
EOF
  [ -n "$exe" ] || { falhou NAVEGADOR_FALHOU "executavel nao achado"; return 1; }
  diga "Conferindo o navegador escondido..."
  if ! rodar_bin "$exe" --version; then
    [ "$RB_BLOQUEADO" = "1" ] && { R_DADOS='{"nome":"navegador escondido"}'; falhou MAC_BLOQUEOU; return 1; }
    falhou NAVEGADOR_FALHOU "nao abriu"; return 1
  fi
  case "$RB_SAIDA" in
    *"$ver"*) ;;
    *) falhou NAVEGADOR_FALHOU "versao $RB_SAIDA"; return 1 ;;
  esac
  printf '%s\n' "$exe" > "$FERR/navegador.txt" || { R_DADOS="{\"pasta\":$(js "$FERR")}"; falhou PERMISSAO_NEGADA; return 1; }
  diga "Pronto: navegador escondido $ver instalado."
  deu_certo INSTALADO "$ver"
}

instalar_ffmpeg_mac() {
  # instalar_ffmpeg_mac <url do ffmpeg.zip> <sha do ffmpeg> <sha do ffprobe>
  local url="$1" urlp rc
  urlp="${url%ffmpeg.zip}ffprobe.zip"
  # Programa executavel nunca entra sem conferencia de SHA256.
  if [ -z "$2" ] || [ -z "$3" ]; then IF_COD=ARQUIVO_DIFERENTE; return 1; fi
  diga "Baixando o FFmpeg (uns 40 MB)..."
  baixar "$url" "$TMPD/ffmpeg.zip" "$2"
  rc=$?
  [ "$rc" = "0" ] || { IF_COD="$(codigo_do_download "$rc")"; return 1; }
  baixar "$urlp" "$TMPD/ffprobe.zip" "$3"
  rc=$?
  [ "$rc" = "0" ] || { IF_COD="$(codigo_do_download "$rc")"; return 1; }
  rm -rf "$TMPD/ff"
  mkdir -p "$TMPD/ff"
  unzip -q -o "$TMPD/ffmpeg.zip" -d "$TMPD/ff" >>"$LOG" 2>&1 || { IF_COD=DOWNLOAD_FALHOU; return 1; }
  unzip -q -o "$TMPD/ffprobe.zip" -d "$TMPD/ff" >>"$LOG" 2>&1 || { IF_COD=DOWNLOAD_FALHOU; return 1; }
  if ! copiar_bin "$TMPD/ff" ffmpeg || ! copiar_bin "$TMPD/ff" ffprobe; then IF_COD=DESCONHECIDO; return 1; fi
  return 0
}

passo_ffmpeg() {
  diga "Vou instalar o FFmpeg. Ele transforma uma cena animada em video. So o comando de cena precisa dele."
  local rc url s1 s2
  ffmpeg_completo
  rc=$?
  if [ "$rc" = "0" ]; then
    diga "O FFmpeg ja estava instalado e completo."
    deu_certo INSTALADO "$(versao_ffmpeg)"
    return 0
  fi
  if [ "$ARQ" = "arm64" ]; then
    url="${V_FFMPEG_MAC_URL_ARM64:-}"; s1="${V_FFMPEG_MAC_SHA256_ARM64:-}"; s2="${V_FFPROBE_MAC_SHA256_ARM64:-}"
  else
    url="${V_FFMPEG_MAC_URL_X64:-}"; s1="${V_FFMPEG_MAC_SHA256_X64:-}"; s2="${V_FFPROBE_MAC_SHA256_X64:-}"
  fi
  IF_COD=""
  if ! instalar_ffmpeg_mac "$url" "$s1" "$s2"; then
    R_DADOS='{"nome":"FFmpeg"}'; falhou "${IF_COD:-DOWNLOAD_FALHOU}"; return 1
  fi
  diga "Conferindo o FFmpeg..."
  ffmpeg_completo
  rc=$?
  if [ "$rc" = "0" ]; then
    diga "Pronto: FFmpeg $(versao_ffmpeg) instalado."
    deu_certo INSTALADO "$(versao_ffmpeg)"
    return 0
  fi
  R_DADOS='{"nome":"FFmpeg"}'
  if [ "$RB_BLOQUEADO" = "1" ]; then falhou MAC_BLOQUEOU
  elif [ "$rc" = "2" ]; then falhou FFMPEG_INCOMPLETO
  else falhou DESCONHECIDO; fi
}

# ---------------------------------------------------------------- acoes

saida_passo() {
  local saida_codigo=1
  [ "$R_OK" = "1" ] && saida_codigo=0
  printf '{"passo":%s,"ok":%s,"codigo":%s,"versao":%s,"detalhe":%s,"dados":%s}\n' \
    "$(js "$1")" "$(jbool "$R_OK")" "$(js "$R_COD")" "$(js "$R_VER")" "$(js "$R_DET")" "$R_DADOS"
  exit "$saida_codigo"
}

acao_passo() {
  local id="$1" anterior
  R_OK=0; R_COD="DESCONHECIDO"; R_VER=""; R_DET=""; R_DADOS="{}"
  case " $PASSOS " in
    *" $id "*) ;;
    *) R_COD="PASSO_DESCONHECIDO"; R_DET="$id"; saida_passo "$id" ;;
  esac
  if [ "$id" != "pasta" ] && [ ! -d "$ESTADO" ]; then
    R_COD="FALTA_PASSO_ANTERIOR"; R_DADOS='{"falta":"pasta"}'
    saida_passo "$id"
  fi
  [ "$id" != "pasta" ] && { preparar_log "$id"; gravar_config; }
  ler_estado "$id"
  anterior="$EST_ESTADO"
  if [ "$anterior" = "pronto" ] && rapido_ok "$id"; then
    diga "Ja estava pronto. Nao precisa baixar de novo."
    R_OK=1; R_COD="JA_PRONTO"; R_VER="$EST_VERSAO"
    saida_passo "$id"
  fi
  [ -d "$ESTADO" ] && gravar_estado "$id" rodando "" "comecando" ""
  preparar_tmp
  case "$id" in
    pasta) passo_pasta ;;
    node) passo_node ;;
    pacotes) passo_pacotes ;;
    navegador) passo_navegador ;;
    ffmpeg) passo_ffmpeg ;;
  esac
  if [ "$R_OK" = "1" ]; then
    gravar_estado "$id" pronto "$R_COD" "pronto" "$R_VER"
  else
    gravar_estado "$id" erro "$R_COD" "parou" "$R_VER"
    [ "$LOG" != "/dev/null" ] && diga "Nao deu certo ($R_COD). Detalhes guardados em $LOG."
  fi
  saida_passo "$id"
}

# Internet: NET_COD vazio (ok), SEM_INTERNET ou INTERNET_BLOQUEADA_PELA_CAIXA.
# Caixa = o endereco foi achado (o curl chegou a tentar conectar, codigo 7) mas o sistema negou a conexao.
# E o que a area protegida do Codex faz; ai o certo e pedir internet ao Codex, nao culpar o Wi-Fi.
NET_COD=""
testar_internet() {
  local erro rc
  NET_COD=""
  erro="$(curl -fsSI --max-time 10 https://nodejs.org/dist/ 2>&1 >/dev/null)"
  rc=$?
  [ "$rc" = "0" ] && return 0
  printf 'internet: curl %s %s\n' "$rc" "$erro" >>"$LOG" 2>/dev/null
  if [ "${CODEX_SANDBOX_NETWORK_DISABLED:-}" = "1" ]; then NET_COD="INTERNET_BLOQUEADA_PELA_CAIXA"; return 1; fi
  if [ "$rc" = "7" ]; then
    case "$erro" in
      *"not permitted"*|*"Permission denied"*) NET_COD="INTERNET_BLOQUEADA_PELA_CAIXA"; return 1 ;;
    esac
  fi
  NET_COD="SEM_INTERNET"
  return 1
}

minimo_mac_decimal() {
  local m="${V_MAC_MINIMO:-13.5}" maior menor
  maior="${m%%.*}"
  menor="${m#*.}"
  [ "$menor" = "$m" ] && menor=0
  printf '%s.%02d' "$maior" "$menor"
}

nome_sistema() {
  if [ "$ARQ" = "arm64" ]; then printf 'Mac com chip Apple'; else printf 'Mac Intel'; fi
}

acao_checar() {
  local probs="" ok=1 livre mem net=1 nuvem prontos_mb=0 id necessario
  add_prob() { [ -n "$probs" ] && probs="$probs,"; probs="$probs{\"codigo\":\"$1\",\"tipo\":\"$2\",\"dados\":$3}"; }
  diga "Olhando o computador, sem instalar nada..."
  chmod 755 "$REPO/estudio" "$REPO"/instalar/*.sh 2>/dev/null

  if [ -z "$MAC_MAIOR" ] || menor_que "$MAC_MAIOR.$(printf '%02d' "${MAC_MENOR:-0}" 2>/dev/null)" "$(minimo_mac_decimal)"; then
    add_prob SISTEMA_ANTIGO bloqueia "{\"versao\":$(js "macOS ${VERSAO_SO:-desconhecido}"),\"minimo\":$(js "macOS ${V_MAC_MINIMO:-13.5}")}"
    ok=0
  fi

  for id in $PASSOS; do
    if rapido_ok "$id"; then prontos_mb=$((prontos_mb + $(tamanho_mb "$id"))); fi
  done
  necessario="$(awk -v m="${V_ESPACO_MINIMO_GB:-3}" -v p="$prontos_mb" -v v="${V_ESPACO_MINIMO_VERIFICAR_GB:-1}" 'BEGIN { n = m - p / 1024; if (n < v) n = v; printf "%.1f", n }')"
  livre="$(espaco_livre_gb)"
  [ -n "$livre" ] || livre=0
  if menor_que "$livre" "$necessario"; then
    add_prob POUCO_ESPACO bloqueia "{\"livre_gb\":$livre,\"precisa_gb\":$necessario}"
    ok=0
  fi

  mem="$(memoria_gb)"
  if menor_que "$mem" "${V_MEMORIA_MINIMA_GB:-8}"; then
    add_prob POUCA_MEMORIA aviso "{\"memoria_gb\":$mem}"
  fi

  testar_internet
  if [ "$NET_COD" != "" ]; then
    net=0
    add_prob "$NET_COD" bloqueia "{}"
    ok=0
  fi

  nuvem="$(nuvem_do_caminho "$REPO")"
  if [ -n "$nuvem" ]; then
    add_prob PASTA_NA_NUVEM acao "{\"nuvem\":$(js "$nuvem"),\"caminho\":$(js "$HOME/$NOME_PASTA"),\"acao\":\"mudar-pasta\"}"
    ok=0
  fi

  printf '{"acao":"checar","ok":%s,"sistema":"mac","arquitetura":%s,"versao_sistema":%s,"nome_sistema":%s,"espaco_gb":%s,"memoria_gb":%s,"internet":%s,"repo_dir":%s,"ferramentas_dir":%s,"problemas":[%s]}\n' \
    "$(jbool "$ok")" "$(js "$ARQ")" "$(js "$VERSAO_SO")" "$(js "$(nome_sistema)")" "$livre" "$mem" "$(jbool "$net")" "$(js "$REPO")" "$(js "$FERR")" "$probs"
  [ "$ok" = "1" ] && exit 0
  exit 1
}

acao_plano() {
  local id est itens=""
  for id in $PASSOS; do
    est="falta"
    ler_estado "$id"
    case "$id" in
      pasta|node|pacotes|navegador) rapido_ok "$id" && est="pronto" ;;
      *) [ "$EST_ESTADO" = "pronto" ] && rapido_ok "$id" && est="pronto" ;;
    esac
    [ "$EST_ESTADO" = "rodando" ] && [ "$est" != "pronto" ] && est="rodando"
    [ -n "$itens" ] && itens="$itens,"
    itens="$itens{\"id\":$(js "$id"),\"estado\":$(js "$est"),\"obrigatorio\":$(obrigatorio "$id"),\"tamanho_mb\":$(tamanho_mb "$id"),\"numero\":$(numero_do_programa "$id")}"
  done
  printf '{"acao":"plano","sistema":"mac","arquitetura":%s,"total_programas":4,"passos":[%s]}\n' "$(js "$ARQ")" "$itens"
  exit 0
}

# O ffmpeg e opcional (so para cena em video): faltando, o item sai com "opcional":true e
# ok:false, mas a verificacao fica ok. Qualquer outro item que falha deixa a verificacao em ok:false.
acao_verificar() {
  local itens="" total=0 prontos=0 v res livre obrig=1 kit_saida kit_ult kit_ok t nav falhas=0 opcionais=""
  add_item() {
    # add_item <id> <ok 1/0> <texto> [codigo] [extra json]
    total=$((total + 1))
    [ "$2" = "1" ] && prontos=$((prontos + 1))
    [ -n "$itens" ] && itens="$itens,"
    itens="$itens{\"id\":$(js "$1"),\"ok\":$(jbool "$2"),\"texto\":$(js "$3")"
    case "$1" in
      node|npm) itens="$itens,\"passo\":\"node\"" ;;
      ffmpeg|ffprobe) itens="$itens,\"passo\":\"ffmpeg\",\"opcional\":true" ;;
      pacotes|navegador) itens="$itens,\"passo\":\"$1\"" ;;
    esac
    if [ "$2" != "1" ]; then
      case "$1" in
        ffmpeg|ffprobe) [ -n "$opcionais" ] && opcionais="$opcionais,"; opcionais="$opcionais$(js "$1")" ;;
        *) falhas=$((falhas + 1)) ;;
      esac
    fi
    [ -n "${4:-}" ] && itens="$itens,\"codigo\":$(js "$4")"
    [ -n "${5:-}" ] && itens="$itens,$5"
    itens="$itens}"
  }
  preparar_log verificar
  preparar_tmp
  diga "Conferindo cada programa do estudio..."

  v="$("$NODE_BIN" -v 2>/dev/null)"
  case "$v" in v24.*) add_item node 1 "Motor dos comandos (Node $v)" ;; *) add_item node 0 "Motor dos comandos (Node)" FALTA_INSTALAR; obrig=0 ;; esac

  v="$("$NODE_BIN" "$NPM_BIN" -v 2>/dev/null)"
  if [ -n "$v" ]; then add_item npm 1 "Ajudante do motor (npm $v)"; else add_item npm 0 "Ajudante do motor (npm)" FALTA_INSTALAR; obrig=0; fi

  if pacotes_ok; then add_item pacotes 1 "Pecas do estudio (motor de cena $PACOTES_VERSAO)"; else add_item pacotes 0 "Pecas do estudio" FALTA_INSTALAR; obrig=0; fi

  nav="$(navegador_caminho)"
  if [ -n "$nav" ] && rodar_bin "$nav" --version; then
    add_item navegador 1 "Navegador escondido (${V_CHROME_HEADLESS_SHELL_VERSAO:-})"
  else
    add_item navegador 0 "Navegador escondido" FALTA_INSTALAR
    obrig=0
  fi

  ffmpeg_completo
  res=$?
  if [ "$res" = "0" ]; then add_item ffmpeg 1 "FFmpeg $(versao_ffmpeg) (para cena em video)"
  elif [ "$res" = "2" ]; then add_item ffmpeg 0 "FFmpeg sem uma peca (para cena em video)" FFMPEG_INCOMPLETO
  else add_item ffmpeg 0 "FFmpeg (para cena em video)" FALTA_INSTALAR; fi

  livre="$(espaco_livre_gb)"
  [ -n "$livre" ] || livre=0
  if menor_que "$livre" "${V_ESPACO_MINIMO_VERIFICAR_GB:-1}"; then
    add_item espaco 0 "Espaco livre: $livre GB" POUCO_ESPACO "\"dados\":{\"livre_gb\":$livre,\"precisa_gb\":${V_ESPACO_MINIMO_VERIFICAR_GB:-1}}"
  else
    add_item espaco 1 "Espaco livre: $livre GB"
  fi

  if [ -x "$NODE_BIN" ] && [ -f "$REPO/kit/scripts/estudio.mjs" ]; then
    kit_saida="$(cd "$REPO" && "$NODE_BIN" "$REPO/kit/scripts/estudio.mjs" verificar 2>>"$LOG")"
    printf '%s\n' "$kit_saida" >>"$LOG"
    kit_ult="$(ultima_linha "$kit_saida")"
    kit_ok="$(jcampo "$kit_ult" ok)"
    if [ "$kit_ok" = "true" ]; then
      add_item kit 1 "Comandos do estudio conferidos" "" "\"origem\":\"kit\""
    else
      t="$(jcampo "$kit_ult" codigo)"
      add_item kit 0 "Comandos do estudio" "${t:-DESCONHECIDO}" "\"origem\":\"kit\""
    fi
  else
    add_item kit 0 "Comandos do estudio" ESTUDIO_NAO_INSTALADO
  fi

  local gravou=0 ok=0
  [ "$falhas" = "0" ] && ok=1
  if [ "$obrig" = "1" ] && [ -x "$NODE_BIN" ]; then
    gravar_instalacao && gravou=1
  fi
  if [ "$ok" = "1" ] && [ -n "$opcionais" ]; then diga "Pronto para as apresentacoes: $prontos de $total. Faltou so o FFmpeg, que e opcional."
  elif [ "$ok" = "1" ]; then diga "Tudo pronto: $prontos de $total."
  else diga "Ficou quase tudo pronto: $prontos de $total."; fi
  printf '{"ok":%s,"total":%s,"prontos":%s,"instalacao_gravada":%s,"opcionais_faltando":[%s],"itens":[%s]}\n' "$(jbool "$ok")" "$total" "$prontos" "$(jbool "$gravou")" "$opcionais" "$itens"
  [ "$ok" = "1" ] && exit 0
  exit 1
}

gravar_instalacao() {
  ler_config
  "$NODE_BIN" -e '
const fs = require("fs"), path = require("path");
const [estadoDir, destino, versao, arq, versaoSo, agente, ferr, repo, modo] = process.argv.slice(1);
const passos = {};
for (const f of fs.readdirSync(estadoDir)) {
  if (!f.endsWith(".json")) continue;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(estadoDir, f), "utf8"));
    if (!j.passo) continue;
    passos[j.passo] = { ok: j.estado === "pronto", versao: j.versao || "", quando: j.atualizado_em || "" };
  } catch (e) {}
}
const o = {
  versao_estudio: versao, sistema: "mac", arquitetura: arq, versao_sistema: versaoSo,
  agente: agente || "claude", ferramentas_dir: ferr, repo_dir: repo, passos, modo_permissao: modo || "tudo"
};
fs.writeFileSync(destino + ".tmp", JSON.stringify(o, null, 2) + "\n");
fs.renameSync(destino + ".tmp", destino);
' "$ESTADO" "$FERR/instalacao.json" "$VERSAO_ESTUDIO" "$ARQ" "$VERSAO_SO" "$CFG_AGENTE" "$FERR" "$REPO" "$CFG_MODO" >>"$LOG" 2>&1
}

acao_mudar_pasta() {
  local destino="$HOME/$NOME_PASTA"
  if [ "$REPO" = "$destino" ]; then
    printf '{"acao":"mudar-pasta","ok":true,"codigo":"JA_PRONTO","de":%s,"para":%s}\n' "$(js "$REPO")" "$(js "$destino")"
    exit 0
  fi
  if [ -e "$destino" ]; then
    printf '{"acao":"mudar-pasta","ok":false,"codigo":"PASTA_DESTINO_EXISTE","de":%s,"para":%s,"dados":{"pasta":%s}}\n' "$(js "$REPO")" "$(js "$destino")" "$(js "$destino")"
    exit 1
  fi
  diga "Vou mudar o estudio para $destino, o lugar de sempre. Nada e apagado."
  if mv "$REPO" "$destino" 2>/dev/null; then
    chmod 755 "$destino/estudio" "$destino"/instalar/*.sh 2>/dev/null
    printf '{"acao":"mudar-pasta","ok":true,"codigo":"INSTALADO","de":%s,"para":%s}\n' "$(js "$REPO")" "$(js "$destino")"
    exit 0
  fi
  printf '{"acao":"mudar-pasta","ok":false,"codigo":"ARQUIVO_EM_USO","de":%s,"para":%s,"dados":{}}\n' "$(js "$REPO")" "$(js "$destino")"
  exit 1
}

# Desinstalar: apaga so o que o instalador pos (a pasta .ferramentas e node_modules).
# Sem --confirmar so diz o que seria apagado. As apresentacoes, a marca e as referencias ficam.
acao_desinstalar() {
  local alvo="$REPO/.ferramentas" apagar="" kb=0 k
  add() { [ -n "$apagar" ] && apagar="$apagar,"; apagar="$apagar$(js "$1")"; }
  if [ -d "$alvo" ]; then add "$alvo"; k="$(du -sk "$alvo" 2>/dev/null | cut -f1)"; kb=$((kb + ${k:-0})); fi
  if [ -d "$REPO/node_modules" ]; then add "$REPO/node_modules"; k="$(du -sk "$REPO/node_modules" 2>/dev/null | cut -f1)"; kb=$((kb + ${k:-0})); fi
  if [ "$CONFIRMAR" != "1" ]; then
    printf '{"acao":"desinstalar","ok":true,"confirmado":false,"apagaria":[%s],"tamanho_mb":%s,"fica":["minha-marca","apresentacoes","referencias"]}\n' "$apagar" "$((kb / 1024))"
    exit 0
  fi
  diga "Vou apagar os programas do estudio. As suas apresentacoes, a sua marca e as referencias ficam."
  cd "$HOME" || cd /
  rm -rf "$alvo" "$REPO/node_modules"
  if [ -e "$alvo" ] || [ -e "$REPO/node_modules" ]; then
    printf '{"acao":"desinstalar","ok":false,"codigo":"ARQUIVO_EM_USO","dados":{}}\n'
    exit 1
  fi
  diga "Pronto: programas do estudio apagados."
  printf '{"acao":"desinstalar","ok":true,"confirmado":true,"apagou":[%s],"pasta_do_estudio":%s}\n' "$apagar" "$(js "$REPO")"
  exit 0
}

# Uma entrada so (uma caixinha de licenca): checar, os cinco passos e verificar, cada um num
# processo filho deste mesmo script. Passo que falha por motivo passageiro ganha uma segunda chance.
# Passo opcional (ffmpeg) que falha nao para o resto: a verificacao diz o que faltou.
# Ultima linha: {"acao":"tudo","ok":...,"etapa":"<checar|id do passo|verificar>","checar":{...},"resultado":{...}}.
rodar_etapa() {
  local extra=""
  [ -n "$AGENTE" ] && extra="--agente $AGENTE"
  # shellcheck disable=SC2086 # extra vazio ou "--agente <nome>", sem espaco no nome
  ETAPA_SAIDA="$(bash "$AQUI/instalar.sh" "$@" $extra --modo tudo)"
  ETAPA_RC=$?
  printf '%s\n' "$ETAPA_SAIDA" | sed '$d'
  ETAPA_ULTIMA="$(ultima_linha "$ETAPA_SAIDA")"
  [ -n "$ETAPA_ULTIMA" ] || ETAPA_ULTIMA='{"ok":false,"codigo":"DESCONHECIDO","dados":{}}'
}

vale_tentar_de_novo() {
  case "$1" in
    *'"codigo":"DOWNLOAD_FALHOU"'*|*'"codigo":"ARQUIVO_DIFERENTE"'*|*'"codigo":"MAC_BLOQUEOU"'*) return 0 ;;
    *'"codigo":"PACOTES_FALHOU"'*|*'"codigo":"NAVEGADOR_FALHOU"'*|*'"codigo":"DESCONHECIDO"'*) return 0 ;;
  esac
  return 1
}

saida_tudo() {
  printf '{"acao":"tudo","ok":%s,"etapa":%s,"checar":%s,"resultado":%s}\n' "$(jbool "$1")" "$(js "$2")" "$3" "$4"
  [ "$1" = "1" ] && exit 0
  exit 1
}

acao_tudo() {
  local id checar
  diga "Etapa 1 de 3: olhando o computador."
  rodar_etapa checar
  checar="$ETAPA_ULTIMA"
  [ "$ETAPA_RC" = "0" ] || saida_tudo 0 checar "$checar" "$checar"
  diga "Etapa 2 de 3: instalando os programas do estudio."
  for id in $PASSOS; do
    rodar_etapa passo "$id"
    if [ "$ETAPA_RC" != "0" ] && vale_tentar_de_novo "$ETAPA_ULTIMA"; then
      diga "Nao deu na primeira vez. Tentando de novo."
      rodar_etapa passo "$id"
    fi
    if [ "$ETAPA_RC" != "0" ] && [ "$(obrigatorio "$id")" = "true" ]; then
      saida_tudo 0 "$id" "$checar" "$ETAPA_ULTIMA"
    fi
  done
  diga "Etapa 3 de 3: conferindo tudo."
  rodar_etapa verificar
  [ "$ETAPA_RC" = "0" ] || saida_tudo 0 verificar "$checar" "$ETAPA_ULTIMA"
  saida_tudo 1 verificar "$checar" "$ETAPA_ULTIMA"
}

# ---------------------------------------------------------------- despacho

case "$ACAO" in
  tudo) acao_tudo ;;
  checar) acao_checar ;;
  plano) acao_plano ;;
  passo) acao_passo "$ID" ;;
  verificar) acao_verificar ;;
  mudar-pasta) acao_mudar_pasta ;;
  desinstalar) acao_desinstalar ;;
  *)
    printf '{"acao":%s,"ok":false,"codigo":"ACAO_DESCONHECIDA","dados":{"acoes":["tudo","checar","plano","passo","verificar","mudar-pasta","desinstalar"]}}\n' "$(js "$ACAO")"
    exit 1 ;;
esac
