# shellcheck shell=bash
# View Estudio: prepara o ambiente (Mac, Linux e Git Bash no Windows).
# Use com ". instalar/ambiente.sh". Pode rodar varias vezes. Nao imprime nada.
# Tudo aponta para a pasta de ferramentas do estudio, sem mexer no resto do computador.
# A pasta de ferramentas fica DENTRO do estudio: <view-estudio>/.ferramentas (Mac e Windows).
# Adaptado do Estudio de Reels (MIT, Autonom.ia). Sem expressao regular.

_estudio_win=0
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*) _estudio_win=1 ;;
esac

# Converte caminho do Git Bash (/c/...) para o formato que os programas do Windows entendem (C:/...).
_estudio_caminho() {
  if [ "$_estudio_win" = "1" ] && command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$1"
  else
    printf '%s' "$1"
  fi
}

_estudio_posix() {
  if [ "$_estudio_win" = "1" ] && command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$1"
  else
    printf '%s' "$1"
  fi
}

if [ -z "${ESTUDIO_REPO:-}" ]; then
  ESTUDIO_REPO="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
fi
_estudio_r="$(_estudio_posix "$ESTUDIO_REPO")"

if [ -n "${ESTUDIO_FERRAMENTAS:-}" ]; then
  _estudio_f="$(_estudio_posix "$ESTUDIO_FERRAMENTAS")"
else
  _estudio_f="$_estudio_r/.ferramentas"
fi

if [ "$_estudio_win" = "1" ]; then
  _estudio_node_dir="$_estudio_f/node"
  _estudio_ext=".exe"
else
  _estudio_node_dir="$_estudio_f/node/bin"
  _estudio_ext=""
fi

case ":$PATH:" in
  *":$_estudio_node_dir:"*) ;;
  *) PATH="$_estudio_node_dir:$PATH" ;;
esac
case ":$PATH:" in
  *":$_estudio_f/bin:"*) ;;
  *) PATH="$_estudio_f/bin:$PATH" ;;
esac
export PATH

ESTUDIO_FERRAMENTAS="$(_estudio_caminho "$_estudio_f")"
ESTUDIO_REPO="$(_estudio_caminho "$_estudio_r")"
ESTUDIO_NODE="$(_estudio_caminho "$_estudio_node_dir/node$_estudio_ext")"
export ESTUDIO_FERRAMENTAS ESTUDIO_REPO ESTUDIO_NODE

# Navegador escondido: o instalador grava o caminho exato em .ferramentas/navegador.txt.
# Quem ja escolheu um navegador (ESTUDIO_CHROME) manda; senao vale o do estudio.
if [ -z "${ESTUDIO_CHROME:-}" ] && [ -f "$_estudio_f/navegador.txt" ]; then
  IFS= read -r _estudio_nav < "$_estudio_f/navegador.txt" || true
  _estudio_nav="${_estudio_nav%$'\r'}"
  if [ -n "$_estudio_nav" ] && [ -f "$(_estudio_posix "$_estudio_nav")" ]; then
    ESTUDIO_CHROME="$_estudio_nav"
  fi
  unset _estudio_nav
fi
if [ -n "${ESTUDIO_CHROME:-}" ]; then
  export ESTUDIO_CHROME
  # O hyperframes (comando "cena") usa o mesmo navegador.
  [ -n "${HYPERFRAMES_BROWSER_PATH:-}" ] || HYPERFRAMES_BROWSER_PATH="$ESTUDIO_CHROME"
  export HYPERFRAMES_BROWSER_PATH
fi

HYPERFRAMES_NO_TELEMETRY=1
HYPERFRAMES_NO_UPDATE_CHECK=1
HYPERFRAMES_SKIP_SKILLS=1
HYPERFRAMES_FFMPEG_PATH="$(_estudio_caminho "$_estudio_f/bin/ffmpeg$_estudio_ext")"
HYPERFRAMES_FFPROBE_PATH="$(_estudio_caminho "$_estudio_f/bin/ffprobe$_estudio_ext")"
export HYPERFRAMES_NO_TELEMETRY HYPERFRAMES_NO_UPDATE_CHECK HYPERFRAMES_SKIP_SKILLS
export HYPERFRAMES_FFMPEG_PATH HYPERFRAMES_FFPROBE_PATH

npm_config_cache="$(_estudio_caminho "$_estudio_f/cache/npm")"
npm_config_update_notifier=false
npm_config_fund=false
npm_config_audit=false
export npm_config_cache npm_config_update_notifier npm_config_fund npm_config_audit

unset _estudio_r _estudio_node_dir _estudio_ext
