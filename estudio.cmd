@echo off
rem View Estudio: ponto de entrada do kit no Windows (PowerShell ou Prompt de Comando).
rem Uso: .\estudio.cmd <comando> [argumentos]
rem Usa o Node da pasta .ferramentas (posto pelo instalador); sem ele, o Node do sistema.
rem A ultima linha da saida e sempre um JSON numa linha so.
setlocal EnableExtensions DisableDelayedExpansion

set "ESTUDIO_REPO=%~dp0"
if "%ESTUDIO_REPO:~-1%"=="\" set "ESTUDIO_REPO=%ESTUDIO_REPO:~0,-1%"
if not defined ESTUDIO_FERRAMENTAS set "ESTUDIO_FERRAMENTAS=%ESTUDIO_REPO%\.ferramentas"

set "PATH=%ESTUDIO_FERRAMENTAS%\bin;%ESTUDIO_FERRAMENTAS%\node;%PATH%"
set "ESTUDIO_NODE=%ESTUDIO_FERRAMENTAS%\node\node.exe"
set "HYPERFRAMES_CACHE_DIR=%ESTUDIO_FERRAMENTAS%\cache\hyperframes"
set "HYPERFRAMES_NO_TELEMETRY=1"
set "HYPERFRAMES_NO_UPDATE_CHECK=1"
set "HYPERFRAMES_SKIP_SKILLS=1"
set "npm_config_cache=%ESTUDIO_FERRAMENTAS%\cache\npm"
set "npm_config_update_notifier=false"
set "npm_config_fund=false"
set "npm_config_audit=false"

rem Navegador escondido de versao fixa: o instalador grava o caminho exato em navegador.txt.
rem Quem ja escolheu um navegador (ESTUDIO_CHROME) manda; senao vale o do estudio.
if not defined ESTUDIO_CHROME if exist "%ESTUDIO_FERRAMENTAS%\navegador.txt" set /p ESTUDIO_CHROME=<"%ESTUDIO_FERRAMENTAS%\navegador.txt"
if defined ESTUDIO_CHROME if not exist "%ESTUDIO_CHROME%" set "ESTUDIO_CHROME="
if defined ESTUDIO_CHROME if not defined HYPERFRAMES_BROWSER_PATH set "HYPERFRAMES_BROWSER_PATH=%ESTUDIO_CHROME%"

if exist "%ESTUDIO_NODE%" goto rodar
where node >nul 2>nul
if errorlevel 1 goto semnode
set "ESTUDIO_NODE=node"
goto rodar

:semnode
echo {"ok":false,"comando":"","codigo":"ESTUDIO_NAO_INSTALADO","resumo":"O estudio ainda nao terminou de instalar: falta o Node.","arquivos":{},"avisos":[],"dados":{}}
exit /b 1

:rodar
rem Uma linha so, terminando em exit /b na mesma linha: o "atualizar" reescreve este arquivo enquanto ele roda,
rem e o cmd.exe le o .cmd linha a linha do disco. Assim ele nao volta a ler nada depois do Node.
rem "exit /b" sem numero devolve o ERRORLEVEL do Node.
"%ESTUDIO_NODE%" "%ESTUDIO_REPO%\kit\scripts\estudio.mjs" %* & exit /b
