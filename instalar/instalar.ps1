# View Estudio: instalador para Windows (x64 e ARM64). Compativel com PowerShell 5.1 e 7.
# Adaptado do instalador do Estudio de Reels (MIT, Autonom.ia): mesma casca, sem Python, sem modelos.
#
# Uso (PowerShell ou Git Bash; use barra normal no caminho, o PowerShell aceita):
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/instalar.ps1 <acao> [id] [--agente claude|codex] [--modo tudo|um_por_um]
#
# Acoes:
#   checar        So olha o computador (sistema, espaco, memoria, internet, pasta, nome do usuario). Nao instala nada.
#   plano         Diz o estado de cada passo (falta, pronto).
#   passo <id>    Instala ou executa um passo. Rodar de novo nao baixa de novo.
#   verificar     Confere cada programa, chama ".\estudio.cmd verificar", grava instalacao.json e diz o que falta.
#   mudar-pasta   Muda o estudio para %USERPROFILE%\view-estudio, ou para C:\ViewEstudio\view-estudio
#                 quando o nome do usuario tem acento ou espaco.
#   desinstalar   Sem --confirmar: so diz o que seria apagado. Com --confirmar: apaga a pasta de
#                 ferramentas e node_modules. As apresentacoes e a marca ficam.
#
# Passos, na ordem: pasta node pacotes navegador ffmpeg
#
# Regras: tudo fica em <view-estudio>\.ferramentas (igual no Mac); nada pede senha; versoes fixas em
# versoes.env; sempre curl.exe; nunca setx; antes de cada coisa o script diz o que vai fazer;
# a ULTIMA linha e sempre um JSON numa linha so. Sem expressao regular.
# Arquivo so com caracteres ASCII de proposito: o PowerShell 5.1 le arquivo sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

$script:Aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $env:ESTUDIO_REPO) {
    $env:ESTUDIO_REPO = (Resolve-Path -LiteralPath (Join-Path $script:Aqui '..')).Path
}
. (Join-Path $env:ESTUDIO_REPO 'instalar\ambiente.ps1')

$script:Repo = $env:ESTUDIO_REPO
$script:Arq = Get-EstudioArquitetura
$script:Log = $null
$script:Tmp = $null
$script:Passos = @('pasta', 'node', 'pacotes', 'navegador', 'ffmpeg')
$script:PastasDoUsuario = @('minha-marca', 'apresentacoes', 'referencias')
# Numero de cada programa na lista do I-03 ("{{i}} de {{n}}"). A pasta nao tem numero.
$script:Numeros = @{ node = 1; pacotes = 2; navegador = 3; ffmpeg = 4 }
$script:NomePasta = 'view-estudio'
$script:Utf8 = New-Object System.Text.UTF8Encoding $false
$script:Curl = Join-Path $env:SystemRoot 'System32\curl.exe'
$script:Tar = Join-Path $env:SystemRoot 'System32\tar.exe'
$script:Cmd = $env:ComSpec
if (-not $script:Cmd) { $script:Cmd = Join-Path $env:SystemRoot 'System32\cmd.exe' }

function Set-Caminhos {
    $script:Ferr = $env:ESTUDIO_FERRAMENTAS
    $script:Estado = Join-Path $script:Ferr 'estado'
    $script:Logs = Join-Path $script:Ferr 'logs'
    $script:Bin = Join-Path $script:Ferr 'bin'
    $script:NodeExe = Join-Path $script:Ferr 'node\node.exe'
    $script:NpmCmd = Join-Path $script:Ferr 'node\npm.cmd'
    $script:NpxCmd = Join-Path $script:Ferr 'node\npx.cmd'
    # Node anterior guardado durante a troca: dentro de .ferramentas (mesmo disco), nunca no temporario.
    $script:NodeAnterior = Join-Path $script:Ferr 'node-anterior'
}
Set-Caminhos

# ---------------------------------------------------------------- versoes

$script:V = @{}
$arquivoVersoes = Join-Path $script:Repo 'instalar\versoes.env'
if (Test-Path -LiteralPath $arquivoVersoes) {
    foreach ($linha in [System.IO.File]::ReadAllLines($arquivoVersoes)) {
        $l = $linha.Trim()
        if ($l.Length -eq 0 -or $l.StartsWith('#')) { continue }
        $p = $l.Split([char[]]@('='), 2)
        if ($p.Length -eq 2) { $script:V[$p[0]] = $p[1] }
    }
}
function Vv([string]$Chave) {
    if ($script:V.ContainsKey($Chave)) { return [string]$script:V[$Chave] }
    return ''
}

$script:VersaoEstudio = '1.0.0'
$arquivoVersao = Join-Path $script:Repo 'VERSAO'
if (Test-Path -LiteralPath $arquivoVersao) { $script:VersaoEstudio = ([System.IO.File]::ReadAllText($arquivoVersao)).Trim() }

# ---------------------------------------------------------------- argumentos

$script:Acao = ''
$script:Id = ''
$script:Agente = ''
$script:Modo = ''
$script:Confirmar = $false
$i = 0
while ($i -lt $args.Count) {
    $a = [string]$args[$i]
    # Aceita --agente, -agente ou -Agente: o PowerShell pode entregar o nome com um traco so.
    $nomeOpcao = ''
    if ($a.StartsWith('-')) { $nomeOpcao = $a.TrimStart('-').TrimEnd(':').ToLowerInvariant() }
    if ($nomeOpcao -eq 'confirmar') { $script:Confirmar = $true; $i++; continue }
    if ($nomeOpcao -eq 'agente' -and ($i + 1) -lt $args.Count) { $script:Agente = [string]$args[$i + 1]; $i += 2; continue }
    if ($nomeOpcao -eq 'modo' -and ($i + 1) -lt $args.Count) { $script:Modo = [string]$args[$i + 1]; $i += 2; continue }
    if (-not $script:Acao) { $script:Acao = $a } elseif (-not $script:Id) { $script:Id = $a }
    $i++
}
if ($script:Agente -ne 'claude' -and $script:Agente -ne 'codex') { $script:Agente = '' }
if ($script:Modo -ne 'tudo' -and $script:Modo -ne 'um_por_um') { $script:Modo = '' }

# ---------------------------------------------------------------- utilidades

function ConvertTo-JsonLinha($Objeto) {
    $j = ConvertTo-Json -InputObject $Objeto -Compress -Depth 10
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $j.ToCharArray()) {
        $n = [int]$ch
        if ($n -gt 126) { [void]$sb.Append('\u'); [void]$sb.Append($n.ToString('x4')) } else { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}

function Sair($Objeto, [int]$Codigo) {
    [Console]::Out.WriteLine((ConvertTo-JsonLinha $Objeto))
    exit $Codigo
}

function Get-Agora { return (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }

function Write-Log([string]$Texto) {
    if (-not $script:Log -or [string]::IsNullOrEmpty($Texto)) { return }
    try { [System.IO.File]::AppendAllText($script:Log, $Texto + "`r`n", $script:Utf8) } catch { }
}

function Diga([string]$Texto) {
    Write-Host $Texto
    Write-Log ('[' + (Get-Date -Format 'HH:mm:ss') + '] ' + $Texto)
}

function Initialize-Log([string]$Nome) {
    try {
        if (-not (Test-Path -LiteralPath $script:Logs)) { New-Item -ItemType Directory -Force -Path $script:Logs | Out-Null }
        $script:Log = Join-Path $script:Logs ($Nome + '.log')
        Write-Log ("`r`n===== " + $Nome + ' ' + (Get-Agora) + ' =====')
    } catch { $script:Log = $null }
}

function Initialize-Tmp {
    if ($script:Tmp) { return }
    $alvo = Join-Path $script:Ferr ('tmp\' + $PID)
    try { New-Item -ItemType Directory -Force -Path $alvo | Out-Null; $script:Tmp = $alvo }
    catch {
        $alvo = Join-Path $env:TEMP ('view-estudio-' + $PID)
        New-Item -ItemType Directory -Force -Path $alvo | Out-Null
        $script:Tmp = $alvo
    }
}

function Remove-Tmp {
    if ($script:Tmp -and (Test-Path -LiteralPath $script:Tmp)) {
        try { Remove-Item -LiteralPath $script:Tmp -Recurse -Force } catch { }
    }
}

function Get-PastaDeTrabalho {
    if ($script:Ferr -and (Test-Path -LiteralPath $script:Ferr)) { return $script:Ferr }
    return $env:TEMP
}

function Join-Argumentos([string[]]$Lista) {
    $partes = New-Object System.Collections.ArrayList
    foreach ($a in $Lista) {
        if ($null -eq $a) { continue }
        $s = [string]$a
        if ($s.Length -eq 0) { [void]$partes.Add('""'); continue }
        $precisa = $false
        foreach ($c in @(' ', '"', "`t", '&', '<', '>', '|', '^')) { if ($s.IndexOf($c) -ge 0) { $precisa = $true } }
        if ($precisa) {
            $t = $s.Replace('"', '\"')
            if ($t.EndsWith('\')) { $t = $t + '\' }
            [void]$partes.Add('"' + $t + '"')
        } else {
            [void]$partes.Add($s)
        }
    }
    return ($partes.ToArray() -join ' ')
}

function Get-CodigoNativo([int]$Nativo) {
    if ($Nativo -eq 225) { return 'ANTIVIRUS_BLOQUEOU' }
    if ($Nativo -eq 32) { return 'ARQUIVO_EM_USO' }
    if ($Nativo -eq 5) { return 'PERMISSAO_NEGADA' }
    return 'DESCONHECIDO'
}

function Get-CodigoExcecao($Registro) {
    $e = $Registro.Exception
    if ($e -is [System.UnauthorizedAccessException]) { return 'PERMISSAO_NEGADA' }
    $h = 0
    try { $h = $e.HResult } catch { }
    if ($h -eq -2147024864) { return 'ARQUIVO_EM_USO' }
    if ($h -eq -2147024891) { return 'PERMISSAO_NEGADA' }
    if ($h -eq -2147024671) { return 'ANTIVIRUS_BLOQUEOU' }
    return 'DESCONHECIDO'
}

# Roda um programa, guarda toda a saida no log e devolve @{codigo; so; saida; erro}.
function Invoke-Nativo {
    param([string]$Exe, [string[]]$Argumentos = @(), [string]$Pasta = '', [string]$Bruto = '', [int]$TimeoutSeg = 5400)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    if ($Bruto) { $psi.Arguments = $Bruto } else { $psi.Arguments = Join-Argumentos $Argumentos }
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = $script:Utf8
    $psi.StandardErrorEncoding = $script:Utf8
    if (-not $Pasta) { $Pasta = Get-PastaDeTrabalho }
    $psi.WorkingDirectory = $Pasta
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $psi
    Write-Log ('> ' + $Exe + ' ' + $psi.Arguments)
    try {
        [void]$p.Start()
    } catch {
        $nativo = 0
        $ex = $_.Exception
        while ($ex -and -not ($ex -is [System.ComponentModel.Win32Exception])) { $ex = $ex.InnerException }
        if ($ex) { $nativo = $ex.NativeErrorCode }
        Write-Log ('nao abriu: ' + $_.Exception.Message)
        return @{ codigo = -1; so = ''; saida = $_.Exception.Message; erro = (Get-CodigoNativo $nativo) }
    }
    $o = $p.StandardOutput.ReadToEndAsync()
    $e = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit($TimeoutSeg * 1000)) {
        try { $p.Kill() } catch { }
        Write-Log 'tempo esgotado'
        return @{ codigo = -2; so = ''; saida = 'tempo esgotado'; erro = 'DESCONHECIDO' }
    }
    $p.WaitForExit()
    $so = [string]$o.Result
    $se = [string]$e.Result
    Write-Log $so
    Write-Log $se
    return @{ codigo = $p.ExitCode; so = $so; saida = ($so + $se); erro = '' }
}

# Arquivos .cmd (npm.cmd, npx.cmd, estudio.cmd) rodam pelo cmd.exe.
function Invoke-Bat {
    param([string]$Bat, [string[]]$Argumentos = @(), [string]$Pasta = '', [int]$TimeoutSeg = 5400)
    $linha = '"' + $Bat + '" ' + (Join-Argumentos $Argumentos)
    return (Invoke-Nativo -Exe $script:Cmd -Bruto ('/d /s /c "' + $linha + '"') -Pasta $Pasta -TimeoutSeg $TimeoutSeg)
}

function Get-UltimaLinha([string]$Texto) {
    if (-not $Texto) { return '' }
    $linhas = $Texto.Replace("`r", '').Split([char[]]@("`n"), [System.StringSplitOptions]::RemoveEmptyEntries)
    if ($linhas.Length -eq 0) { return '' }
    return $linhas[$linhas.Length - 1].Trim()
}

function ConvertFrom-JsonSeguro([string]$Texto) {
    if (-not $Texto) { return $null }
    $ini = $Texto.IndexOf('{')
    if ($ini -lt 0) { return $null }
    try { return ($Texto.Substring($ini) | ConvertFrom-Json) } catch { return $null }
}

function Get-Sha256([string]$Arquivo) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Arquivo).Hash.ToLowerInvariant()
}

# Baixa com 2 tentativas. Devolve '' (ok) ou o codigo do problema.
function Get-Arquivo([string]$Url, [string]$Destino, [string]$Sha = '') {
    $parte = $Destino + '.part'
    for ($t = 1; $t -le 2; $t++) {
        if (Test-Path -LiteralPath $parte) { Remove-Item -LiteralPath $parte -Force }
        $r = Invoke-Nativo -Exe $script:Curl -Argumentos @('-fL', '--retry', '3', '--retry-delay', '3', '--connect-timeout', '20', '-sS', '-A', 'view-estudio/1.0', '-o', $parte, $Url)
        if ($r.codigo -ne 0) {
            if ($r.erro -and $r.erro -ne 'DESCONHECIDO') { return $r.erro }
            if ($t -eq 2) { return 'DOWNLOAD_FALHOU' }
            Start-Sleep -Seconds 3
            continue
        }
        if (-not (Test-Path -LiteralPath $parte)) { return 'ANTIVIRUS_BLOQUEOU' }
        if ($Sha) {
            $tem = Get-Sha256 $parte
            if ($tem -ne $Sha.ToLowerInvariant()) {
                Write-Log ('arquivo diferente: ' + $Url + ' ' + $tem + ' esperado ' + $Sha)
                Remove-Item -LiteralPath $parte -Force
                if ($t -eq 2) { return 'ARQUIVO_DIFERENTE' }
                Diga 'O arquivo chegou diferente do esperado. Por seguranca, vou baixar de novo.'
                continue
            }
        }
        if (Test-Path -LiteralPath $Destino) { Remove-Item -LiteralPath $Destino -Force }
        Move-Item -LiteralPath $parte -Destination $Destino
        return ''
    }
    return 'DOWNLOAD_FALHOU'
}

function Expand-Zip([string]$Zip, [string]$Destino) {
    if (Test-Path -LiteralPath $Destino) { Remove-Item -LiteralPath $Destino -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $Destino | Out-Null
    if (Test-Path -LiteralPath $script:Tar) {
        $r = Invoke-Nativo -Exe $script:Tar -Argumentos @('-xf', $Zip, '-C', $Destino)
        if ($r.codigo -eq 0) { return $true }
    }
    try { Expand-Archive -LiteralPath $Zip -DestinationPath $Destino -Force; return $true } catch { Write-Log $_.Exception.Message; return $false }
}

# Copia um programa achado dentro de uma pasta para FERR\bin. Devolve '' ou o codigo do problema.
function Copy-Programa([string]$Origem, [string]$Nome) {
    $achado = Get-ChildItem -LiteralPath $Origem -Recurse -File -Filter $Nome -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $achado) { return 'ANTIVIRUS_BLOQUEOU' }
    $destino = Join-Path $script:Bin $Nome
    try {
        Copy-Item -LiteralPath $achado.FullName -Destination $destino -Force
        Unblock-File -LiteralPath $destino -ErrorAction SilentlyContinue
    } catch {
        return (Get-CodigoExcecao $_)
    }
    if (-not (Test-Path -LiteralPath $destino)) { return 'ANTIVIRUS_BLOQUEOU' }
    return ''
}

function Read-Config {
    $script:CfgAgente = ''
    $script:CfgModo = ''
    $f = Join-Path $script:Ferr 'config.txt'
    if (-not (Test-Path -LiteralPath $f)) { return }
    foreach ($l in [System.IO.File]::ReadAllLines($f)) {
        if ($l.StartsWith('agente=')) { $script:CfgAgente = $l.Substring(7) }
        if ($l.StartsWith('modo=')) { $script:CfgModo = $l.Substring(5) }
    }
}

function Save-Config {
    if (-not (Test-Path -LiteralPath $script:Ferr)) { return }
    Read-Config
    if ($script:Agente) { $script:CfgAgente = $script:Agente }
    if ($script:Modo) { $script:CfgModo = $script:Modo }
    try { [System.IO.File]::WriteAllText((Join-Path $script:Ferr 'config.txt'), ('agente=' + $script:CfgAgente + "`r`nmodo=" + $script:CfgModo + "`r`n"), $script:Utf8) } catch { }
}

function Save-Estado([string]$Id, [string]$Est, [string]$Cod = '', [string]$Prog = '', [string]$Ver = '') {
    if (-not (Test-Path -LiteralPath $script:Estado)) { return }
    $o = [ordered]@{ passo = $Id; estado = $Est; codigo = $Cod; progresso = $Prog; versao = $Ver; atualizado_em = (Get-Agora) }
    $f = Join-Path $script:Estado ($Id + '.json')
    try {
        [System.IO.File]::WriteAllText($f + '.tmp', (ConvertTo-JsonLinha $o) + "`n", $script:Utf8)
        if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force }
        Move-Item -LiteralPath ($f + '.tmp') -Destination $f
    } catch { }
}

function Read-Estado([string]$Id) {
    $f = Join-Path $script:Estado ($Id + '.json')
    if (-not (Test-Path -LiteralPath $f)) { return $null }
    try { return ([System.IO.File]::ReadAllText($f) | ConvertFrom-Json) } catch { return $null }
}

function Get-TamanhoMb([string]$Id) {
    $tamanhos = @{ node = 190; pacotes = 250; navegador = 250; ffmpeg = 150 }
    if ($tamanhos.ContainsKey($Id)) { return $tamanhos[$Id] }
    return 0
}

function Test-Obrigatorio([string]$Id) { return (@('pasta', 'node', 'pacotes', 'navegador') -contains $Id) }

function Get-EspacoLivreGb {
    try {
        $raiz = [System.IO.Path]::GetPathRoot($script:Ferr)
        $d = New-Object System.IO.DriveInfo($raiz)
        return [math]::Round($d.AvailableFreeSpace / 1GB, 1)
    } catch { return 0 }
}

function Get-MemoriaGb {
    try { return [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 0) }
    catch {
        try { return [math]::Round((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 0) } catch { return 0 }
    }
}

function Get-Build { return [System.Environment]::OSVersion.Version.Build }

function Get-NomeSistema {
    $n = 'Windows 10'
    if ((Get-Build) -ge 22000) { $n = 'Windows 11' }
    if ($script:Arq -eq 'arm64') { $n = $n + ' ARM' }
    return $n
}

function Get-NuvemDoCaminho([string]$Caminho) {
    foreach ($nomeVar in @('OneDrive', 'OneDriveConsumer', 'OneDriveCommercial')) {
        $valor = [Environment]::GetEnvironmentVariable($nomeVar)
        if ($valor -and $Caminho.StartsWith($valor.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) { return 'OneDrive' }
    }
    if ($Caminho.IndexOf('\OneDrive', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { return 'OneDrive' }
    if ($Caminho.IndexOf('\Dropbox', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { return 'Dropbox' }
    if ($Caminho.IndexOf('\iCloudDrive', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { return 'iCloud' }
    return ''
}

function Get-DestinoDoRepo {
    if (-not (Test-EstudioNomeSeguro (Get-EstudioNomeDoUsuario))) { return ('C:\ViewEstudio\' + $script:NomePasta) }
    return (Join-Path $env:USERPROFILE $script:NomePasta)
}

# ---------------------------------------------------------------- conferencias

# 0 ok, 1 falta, 2 sem o codificador de video, 3 antivirus.
function Test-FfmpegCompleto {
    $ff = Join-Path $script:Bin 'ffmpeg.exe'
    $fp = Join-Path $script:Bin 'ffprobe.exe'
    if (-not (Test-Path -LiteralPath $ff) -or -not (Test-Path -LiteralPath $fp)) { return 1 }
    $r = Invoke-Nativo -Exe $ff -Argumentos @('-hide_banner', '-encoders')
    if ($r.codigo -ne 0) { if ($r.erro -eq 'ANTIVIRUS_BLOQUEOU') { return 3 }; return 1 }
    if (-not $r.so.Contains(' libx264 ')) { Write-Log 'falta o codificador libx264'; return 2 }
    $r = Invoke-Nativo -Exe $fp -Argumentos @('-version')
    if ($r.codigo -ne 0) { return 1 }
    return 0
}

function Get-VersaoFfmpeg {
    $r = Invoke-Nativo -Exe (Join-Path $script:Bin 'ffmpeg.exe') -Argumentos @('-version')
    $primeira = (Get-UltimaLinha ($r.so.Split([char[]]@("`n"))[0]))
    $partes = $primeira.Split([char[]]@(' '), [System.StringSplitOptions]::RemoveEmptyEntries)
    if ($partes.Length -ge 3) { return $partes[2].Split([char[]]@('-'))[0] }
    return ''
}

function Get-VersaoNode {
    if (-not (Test-Path -LiteralPath $script:NodeExe)) { return '' }
    $r = Invoke-Nativo -Exe $script:NodeExe -Argumentos @('-v')
    if ($r.codigo -ne 0) { return '' }
    return $r.so.Trim()
}

# Confere se cada dependencia do package.json esta em node_modules (e na versao fixa, quando fixa).
# Devolve a versao do hyperframes, ou $null se faltar algo.
function Get-PacotesVersao {
    $pkg = Join-Path $script:Repo 'package.json'
    if (-not (Test-Path -LiteralPath $pkg)) { return $null }
    try { $j = [System.IO.File]::ReadAllText($pkg, $script:Utf8) | ConvertFrom-Json } catch { return $null }
    $hv = ''
    if ($null -ne $j.dependencies) {
        foreach ($prop in $j.dependencies.PSObject.Properties) {
            $f = Join-Path $script:Repo ('node_modules\' + $prop.Name.Replace('/', '\') + '\package.json')
            if (-not (Test-Path -LiteralPath $f)) { Write-Log ('pacotes: falta ' + $prop.Name); return $null }
            $v = ''
            try { $v = [string](([System.IO.File]::ReadAllText($f, $script:Utf8)) | ConvertFrom-Json).version } catch { return $null }
            $pedido = [string]$prop.Value
            $fixo = ($pedido.Length -gt 0 -and '0123456789'.IndexOf($pedido.Substring(0, 1)) -ge 0)
            if ($fixo -and $v -ne $pedido) { Write-Log ('pacotes: diferente ' + $prop.Name); return $null }
            if ($prop.Name -eq 'hyperframes') { $hv = $v }
        }
    }
    return $hv
}

function Get-CaminhoNavegador {
    $f = Join-Path $script:Ferr 'navegador.txt'
    if (-not (Test-Path -LiteralPath $f)) { return '' }
    try { $c = ([System.IO.File]::ReadAllText($f)).Trim() } catch { return '' }
    if (-not $c -or -not (Test-Path -LiteralPath $c)) { return '' }
    $ver = Vv 'CHROME_HEADLESS_SHELL_VERSAO'
    if (-not $ver -or $c.IndexOf($ver) -lt 0) { return '' }
    return $c
}

function Test-Rapido([string]$Id) {
    $e = Read-Estado $Id
    $pronto = ($null -ne $e -and $e.estado -eq 'pronto')
    switch ($Id) {
        'pasta' { return (Test-Path -LiteralPath $script:Bin) }
        'node' { return ((Get-VersaoNode) -eq ('v' + (Vv 'NODE_VERSAO'))) }
        'pacotes' { return ($null -ne (Get-PacotesVersao)) }
        'navegador' { return ((Get-CaminhoNavegador) -ne '') }
        'ffmpeg' { return ((Test-Path -LiteralPath (Join-Path $script:Bin 'ffmpeg.exe')) -and $pronto) }
    }
    return $false
}

# ---------------------------------------------------------------- resultado

function Reset-Resultado { $script:R = @{ ok = $false; codigo = 'DESCONHECIDO'; versao = ''; detalhe = ''; dados = @{} } }
function Set-Falha([string]$Codigo, $Dados = $null, [string]$Detalhe = '') {
    $script:R.ok = $false
    $script:R.codigo = $Codigo
    if ($null -ne $Dados) { $script:R.dados = $Dados }
    if ($Detalhe) { $script:R.detalhe = $Detalhe }
}
function Set-Sucesso([string]$Codigo = 'INSTALADO', [string]$Versao = '') {
    $script:R.ok = $true
    $script:R.codigo = $Codigo
    $script:R.versao = $Versao
}
function Test-Precisa([string]$Id, [bool]$Tem) {
    if ($Tem) { return $true }
    Diga ('Antes deste passo falta instalar: ' + $Id + '.')
    Set-Falha 'FALTA_PASSO_ANTERIOR' @{ falta = $Id }
    return $false
}

# ---------------------------------------------------------------- passos

function Invoke-PassoPasta {
    Diga 'Vou criar a pasta de programas do estudio. Os programas ficam todos nela. Nada fora dela e mexido.'
    try {
        foreach ($sub in @('bin', 'node', 'navegador', 'cache\npm', 'logs', 'estado', 'tmp')) {
            New-Item -ItemType Directory -Force -Path (Join-Path $script:Ferr $sub) | Out-Null
        }
        $teste = Join-Path $script:Ferr 'tmp\teste-escrita.txt'
        [System.IO.File]::WriteAllText($teste, 'ok')
        Remove-Item -LiteralPath $teste -Force
        foreach ($p in $script:PastasDoUsuario) { New-Item -ItemType Directory -Force -Path (Join-Path $script:Repo $p) | Out-Null }
    } catch {
        Set-Falha 'PERMISSAO_NEGADA' @{ pasta = $script:Ferr }
        return
    }
    # No Windows, pasta com ponto na frente nao fica escondida sozinha: esconde para nao confundir.
    try {
        $item = Get-Item -LiteralPath $script:Ferr -Force
        $item.Attributes = $item.Attributes -bor [System.IO.FileAttributes]::Hidden
    } catch { }
    Initialize-Log 'pasta'
    Save-Config
    Diga ('Pronto: pasta criada em ' + $script:Ferr + '.')
    Set-Sucesso 'INSTALADO' ''
    $script:R.dados = @{ pasta = $script:Ferr }
}

# O Node que esta no lugar responde na versao pedida e tem npm.
function Test-NodeNaVersaoCerta {
    return (((Get-VersaoNode) -eq ('v' + (Vv 'NODE_VERSAO'))) -and (Test-Path -LiteralPath $script:NpmCmd))
}

# Devolve o Node anterior (guardado em $script:NodeAnterior) se o novo nao passou na conferencia.
# So tira o node do lugar se o guardado existe. Se nao der para devolver, o guardado fica
# onde esta (nunca e apagado) e o log diz o caminho.
function Restore-NodeAntigo {
    $guardado = $script:NodeAnterior
    if (-not (Test-Path -LiteralPath $guardado)) { return }
    $destino = Join-Path $script:Ferr 'node'
    try {
        if (Test-Path -LiteralPath $destino) { Remove-Item -LiteralPath $destino -Recurse -Force }
    } catch {
        Write-Log ('nao consegui tirar o Node novo do lugar: ' + $_.Exception.Message)
    }
    if (Test-Path -LiteralPath $destino) {
        Write-Log ('o Node anterior continua guardado em: ' + $guardado)
        return
    }
    try {
        Move-Item -LiteralPath $guardado -Destination $destino
        Write-Log 'Node anterior devolvido.'
    } catch {
        Write-Log ('nao consegui devolver o Node anterior; ele continua guardado em: ' + $guardado + ' ' + $_.Exception.Message)
    }
}

# Sobra de uma execucao que caiu no meio da troca do Node: arruma antes de comecar.
function Repair-NodeAnterior {
    $guardado = $script:NodeAnterior
    if (-not (Test-Path -LiteralPath $guardado)) { return }
    if (-not (Test-Path -LiteralPath (Join-Path $script:Ferr 'node'))) {
        Write-Log 'node: achei o Node anterior guardado e nenhum no lugar; devolvendo'
        Restore-NodeAntigo
        return
    }
    if (Test-NodeNaVersaoCerta) {
        Write-Log 'node: o Node no lugar confere; apagando o anterior guardado'
        try { Remove-Item -LiteralPath $guardado -Recurse -Force } catch { Write-Log ('node: nao consegui apagar ' + $guardado + ': ' + $_.Exception.Message) }
        return
    }
    Write-Log 'node: o Node no lugar nao confere; devolvendo o anterior guardado'
    Restore-NodeAntigo
}

function Invoke-PassoNode {
    Diga 'Vou instalar o Node. E o motor dos comandos do estudio. Fica so na pasta do estudio.'
    $ver = Vv 'NODE_VERSAO'
    $plat = 'win-x64'
    if ($script:Arq -eq 'arm64') { $plat = 'win-arm64' }
    $nome = 'node-v' + $ver + '-' + $plat
    $base = 'https://nodejs.org/dist/v' + $ver
    # SHA256 fixo em versoes.env (copiado do SHASUMS256.txt oficial): confere origem, nao so integridade.
    $sha = (Vv ('NODE_SHA256_' + $plat.Replace('-', '_').ToUpperInvariant())).ToLowerInvariant()
    Repair-NodeAnterior
    # O Node anterior fica guardado ate o novo passar na conferencia; qualquer falha devolve ele.
    if (-not (Test-NodeNaVersaoCerta)) {
        Diga 'Baixando o Node (uns 30 MB)...'
        if (-not $sha) { Set-Falha 'ARQUIVO_DIFERENTE' @{ nome = 'Node' } 'sem SHA256 em versoes.env'; return }
        $zip = Join-Path $script:Tmp 'node.zip'
        $c = Get-Arquivo ($base + '/' + $nome + '.zip') $zip $sha
        if ($c) { Set-Falha $c @{ nome = 'Node'; arquivo = ($nome + '.zip') }; return }
        Diga 'Conferi: o arquivo chegou certinho. Abrindo...'
        $pasta = Join-Path $script:Tmp 'node'
        if (-not (Expand-Zip $zip $pasta)) { Set-Falha 'DOWNLOAD_FALHOU' @{ nome = 'Node' }; return }
        $dentro = Join-Path $pasta $nome
        if (-not (Test-Path -LiteralPath (Join-Path $dentro 'node.exe'))) { Set-Falha 'ANTIVIRUS_BLOQUEOU' @{ nome = 'Node'; arquivo = 'node.exe' }; return }
        $destino = Join-Path $script:Ferr 'node'
        if (Test-Path -LiteralPath $destino) {
            # Ja ha um anterior guardado que nao deu para devolver: nao guarda outro por cima.
            if (Test-Path -LiteralPath $script:NodeAnterior) { Set-Falha 'ARQUIVO_EM_USO' @{ nome = 'Node'; arquivo = $script:NodeAnterior }; return }
            try {
                Move-Item -LiteralPath $destino -Destination $script:NodeAnterior
            } catch {
                Set-Falha (Get-CodigoExcecao $_) @{ nome = 'Node'; arquivo = $destino; pasta = $script:Ferr }
                return
            }
        }
        try {
            Move-Item -LiteralPath $dentro -Destination $destino
        } catch {
            $codigo = Get-CodigoExcecao $_
            Restore-NodeAntigo
            Set-Falha $codigo @{ nome = 'Node'; arquivo = $destino; pasta = $script:Ferr }
            return
        }
    }
    $v = Get-VersaoNode
    if (-not $v.StartsWith('v24.')) { Restore-NodeAntigo; Set-Falha 'DESCONHECIDO' @{ nome = 'Node' } ('versao ' + $v); return }
    if (-not (Test-Path -LiteralPath $script:NpmCmd)) { Restore-NodeAntigo; Set-Falha 'DESCONHECIDO' @{ nome = 'Node' } 'sem npm'; return }
    # So agora, com o novo conferido, o anterior pode sair.
    if (Test-Path -LiteralPath $script:NodeAnterior) {
        try { Remove-Item -LiteralPath $script:NodeAnterior -Recurse -Force } catch { Write-Log ('node: nao consegui apagar ' + $script:NodeAnterior + ': ' + $_.Exception.Message) }
    }
    Diga ('Pronto: Node ' + $v + ' instalado.')
    Set-Sucesso 'INSTALADO' $v
}

function Invoke-PassoPacotes {
    Diga 'Vou instalar as pecas do estudio (o motor de cena e o que ele usa). Ficam so na pasta do estudio.'
    if (-not (Test-Precisa 'node' ((Test-Path -LiteralPath $script:NodeExe) -and (Test-Path -LiteralPath $script:NpmCmd)))) { return }
    # Versoes fixas de toda a arvore: "npm ci" com o package-lock.json que vem no estudio.
    $lista = @('ci', '--no-audit', '--no-fund')
    if (-not (Test-Path -LiteralPath (Join-Path $script:Repo 'package-lock.json'))) {
        Write-Log 'sem package-lock.json: usando npm install sem gravar lock'
        $lista = @('install', '--no-package-lock', '--no-audit', '--no-fund')
    }
    $ok = $false
    for ($t = 1; $t -le 2; $t++) {
        Diga 'Baixando as pecas (uns 150 MB). Pode levar alguns minutos...'
        $r = Invoke-Bat -Bat $script:NpmCmd -Argumentos $lista -Pasta $script:Repo
        if ($r.codigo -eq 0) { $ok = $true; break }
        if ($t -eq 1) { Diga 'As pecas nao ficaram prontas. Vou instalar de novo.' }
    }
    $v = Get-PacotesVersao
    if (-not $ok -or $null -eq $v) { Set-Falha 'PACOTES_FALHOU'; return }
    Diga 'Pronto: pecas do estudio instaladas.'
    Set-Sucesso 'INSTALADO' $v
}

function Invoke-PassoNavegador {
    Diga 'Vou instalar o navegador escondido. Ele tira as fotos e o PDF das apresentacoes. Nao mexe no seu Chrome.'
    if (-not (Test-Precisa 'node' (Test-Path -LiteralPath $script:NodeExe))) { return }
    $ver = Vv 'CHROME_HEADLESS_SHELL_VERSAO'
    $pb = Vv 'PUPPETEER_BROWSERS_VERSAO'
    if (-not $ver -or -not $pb) { Set-Falha 'NAVEGADOR_FALHOU' $null 'sem versao em versoes.env'; return }
    # O baixador vem travado no package-lock (passo "pacotes"); nada e resolvido na hora pelo npx.
    $pbDir = Join-Path $script:Repo 'node_modules\@puppeteer\browsers'
    $pbCli = Join-Path $pbDir 'lib\main-cli.js'
    if (-not (Test-Precisa 'pacotes' (Test-Path -LiteralPath $pbCli))) { return }
    $pbv = ''
    try { $pbv = [string]((Get-Content -Raw -LiteralPath (Join-Path $pbDir 'package.json') | ConvertFrom-Json).version) } catch { $pbv = '' }
    if ($pbv -ne $pb) { Set-Falha 'NAVEGADOR_FALHOU' $null ('baixador ' + $pbv + ', versoes.env pede ' + $pb); return }
    $destino = Join-Path $script:Ferr 'navegador'
    $ok = $false
    for ($t = 1; $t -le 2; $t++) {
        Diga 'Baixando o navegador escondido (uns 100 MB)...'
        $r = Invoke-Nativo -Exe $script:NodeExe -Argumentos @($pbCli, 'install', ('chrome-headless-shell@' + $ver), '--path', $destino) -Pasta $script:Ferr
        if ($r.codigo -eq 0) { $ok = $true; break }
        if ($t -eq 1) { Diga 'O navegador escondido nao baixou. Vou tentar de novo.' }
    }
    if (-not $ok) { Set-Falha 'NAVEGADOR_FALHOU' @{ nome = 'navegador escondido' }; return }
    $exe = ''
    foreach ($f in @(Get-ChildItem -LiteralPath $destino -Recurse -File -Filter 'chrome-headless-shell.exe' -ErrorAction SilentlyContinue)) {
        if ($f.FullName.IndexOf($ver) -ge 0) { $exe = $f.FullName }
    }
    if (-not $exe) { Set-Falha 'ANTIVIRUS_BLOQUEOU' @{ nome = 'navegador escondido'; arquivo = 'chrome-headless-shell.exe' }; return }
    Diga 'Conferindo o navegador escondido...'
    # No Windows o chrome-headless-shell nao responde --version; abrir sem pagina e sair ja confere que roda.
    $r = Invoke-Nativo -Exe $exe -Argumentos @('--headless', '--disable-gpu', '--dump-dom', 'about:blank') -TimeoutSeg 60
    if ($r.codigo -ne 0) {
        if ($r.erro -eq 'ANTIVIRUS_BLOQUEOU') { Set-Falha 'ANTIVIRUS_BLOQUEOU' @{ nome = 'navegador escondido'; arquivo = 'chrome-headless-shell.exe' }; return }
        Set-Falha 'NAVEGADOR_FALHOU' $null 'nao abriu'
        return
    }
    try { [System.IO.File]::WriteAllText((Join-Path $script:Ferr 'navegador.txt'), $exe + "`r`n", $script:Utf8) }
    catch { Set-Falha 'PERMISSAO_NEGADA' @{ pasta = $script:Ferr }; return }
    Diga ('Pronto: navegador escondido ' + $ver + ' instalado.')
    Set-Sucesso 'INSTALADO' $ver
}

# Linha "<sha256>  <nome>" de uma lista de somas (SHASUMS256, checksums.sha256). Devolve '' se nao achar.
# Copiada do Estudio de Reels (MIT, Autonom.ia).
function Find-HashNaLista([string]$Arquivo, [string]$Nome) {
    foreach ($linha in [System.IO.File]::ReadAllLines($Arquivo)) {
        $t = $linha.Trim()
        if (-not $t) { continue }
        $partes = $t.Split([char[]]@(' ', "`t"), [System.StringSplitOptions]::RemoveEmptyEntries)
        if ($partes.Length -ge 2) {
            $n = $partes[1]
            if ($n.StartsWith('*')) { $n = $n.Substring(1) }
            if ($n -eq $Nome) { return $partes[0].ToLowerInvariant() }
        }
    }
    return ''
}

# SHA256 de um zip pelo checksums.sha256 que o BtbN publica na mesma release. Devolve '' se nao achar.
function Get-ShaDaRelease([string]$Url) {
    $corte = $Url.LastIndexOf('/')
    if ($corte -lt 0) { return '' }
    $somas = Join-Path $script:Tmp 'ffmpeg-checksums.sha256'
    $c = Get-Arquivo ($Url.Substring(0, $corte + 1) + 'checksums.sha256') $somas
    if ($c) { return '' }
    return (Find-HashNaLista $somas $Url.Substring($corte + 1))
}

function Install-FfmpegWindows([string]$Url, [string]$Sha) {
    # Programa executavel nunca entra sem conferencia de SHA256.
    if (-not $Sha) { $Sha = Get-ShaDaRelease $Url }
    if (-not $Sha -or $Sha.Length -ne 64) { return 'ARQUIVO_DIFERENTE' }
    Diga 'Baixando o FFmpeg (uns 110 MB)...'
    $zip = Join-Path $script:Tmp 'ffmpeg.zip'
    $c = Get-Arquivo $Url $zip $Sha.ToLowerInvariant()
    if ($c) { return $c }
    $pasta = Join-Path $script:Tmp 'ff'
    if (Test-Path -LiteralPath $pasta) { Remove-Item -LiteralPath $pasta -Recurse -Force }
    if (-not (Expand-Zip $zip $pasta)) { return 'DOWNLOAD_FALHOU' }
    foreach ($n in @('ffmpeg.exe', 'ffprobe.exe')) {
        $c = Copy-Programa $pasta $n
        if ($c) { return $c }
    }
    return ''
}

# Principal e reserva (adaptado do Estudio de Reels): a principal tem SHA256 fixo em versoes.env;
# a reserva do Windows ARM64 e o "latest" do BtbN, conferido pelo checksums.sha256 da mesma release.
function Invoke-PassoFfmpeg {
    Diga 'Vou instalar o FFmpeg. Ele transforma uma cena animada em video. So o comando de cena precisa dele.'
    if ((Test-FfmpegCompleto) -eq 0) {
        Diga 'O FFmpeg ja estava instalado e completo.'
        Set-Sucesso 'INSTALADO' (Get-VersaoFfmpeg)
        return
    }
    $sufixo = 'X64'
    if ($script:Arq -eq 'arm64') { $sufixo = 'ARM64' }
    $tentativas = @(
        @{ url = (Vv ('FFMPEG_WIN_URL_' + $sufixo)); sha = (Vv ('FFMPEG_WIN_SHA256_' + $sufixo)) },
        @{ url = (Vv ('FFMPEG_WIN_RESERVA_' + $sufixo)); sha = (Vv ('FFMPEG_WIN_RESERVA_SHA256_' + $sufixo)) }
    )
    $ultimo = 'DOWNLOAD_FALHOU'
    $primeira = $true
    foreach ($t in $tentativas) {
        if (-not $t.url) { continue }
        if (-not $primeira) { Diga 'Vou baixar outra versao do FFmpeg.' }
        $primeira = $false
        $c = Install-FfmpegWindows $t.url $t.sha
        if ($c) { $ultimo = $c; Write-Log ('FFmpeg de ' + $t.url + ': ' + $c); continue }
        Diga 'Conferindo o FFmpeg...'
        $rc = Test-FfmpegCompleto
        if ($rc -eq 0) {
            $v = Get-VersaoFfmpeg
            Diga ('Pronto: FFmpeg ' + $v + ' instalado.')
            Set-Sucesso 'INSTALADO' $v
            return
        }
        if ($rc -eq 2) { $ultimo = 'FFMPEG_INCOMPLETO' }
        elseif ($rc -eq 3) { $ultimo = 'ANTIVIRUS_BLOQUEOU' }
        else { $ultimo = 'DESCONHECIDO' }
    }
    Set-Falha $ultimo @{ nome = 'FFmpeg'; arquivo = 'ffmpeg.exe' }
}

# ---------------------------------------------------------------- acoes

function Exit-Passo([string]$Id) {
    $o = [ordered]@{ passo = $Id; ok = [bool]$script:R.ok; codigo = $script:R.codigo; versao = $script:R.versao; detalhe = $script:R.detalhe; dados = $script:R.dados }
    Remove-Tmp
    if ($script:R.ok) { Sair $o 0 } else { Sair $o 1 }
}

function Invoke-AcaoPasso([string]$Id) {
    Reset-Resultado
    if ($script:Passos -notcontains $Id) { $script:R.codigo = 'PASSO_DESCONHECIDO'; $script:R.detalhe = $Id; Exit-Passo $Id }
    if ($Id -ne 'pasta' -and -not (Test-Path -LiteralPath $script:Estado)) {
        $script:R.codigo = 'FALTA_PASSO_ANTERIOR'; $script:R.dados = @{ falta = 'pasta' }
        Exit-Passo $Id
    }
    if ($Id -ne 'pasta') { Initialize-Log $Id; Save-Config }
    $anterior = Read-Estado $Id
    if ($null -ne $anterior -and $anterior.estado -eq 'pronto' -and (Test-Rapido $Id)) {
        Diga 'Ja estava pronto. Nao precisa baixar de novo.'
        Set-Sucesso 'JA_PRONTO' ([string]$anterior.versao)
        Exit-Passo $Id
    }
    if (Test-Path -LiteralPath $script:Estado) { Save-Estado $Id 'rodando' '' 'comecando' '' }
    Initialize-Tmp
    try {
        switch ($Id) {
            'pasta' { $null = Invoke-PassoPasta }
            'node' { $null = Invoke-PassoNode }
            'pacotes' { $null = Invoke-PassoPacotes }
            'navegador' { $null = Invoke-PassoNavegador }
            'ffmpeg' { $null = Invoke-PassoFfmpeg }
        }
    } catch {
        Write-Log ('erro: ' + $_.Exception.Message)
        Set-Falha (Get-CodigoExcecao $_) $null $_.Exception.Message
    }
    if ($script:R.ok) {
        Save-Estado $Id 'pronto' $script:R.codigo 'pronto' $script:R.versao
    } else {
        Save-Estado $Id 'erro' $script:R.codigo 'parou' $script:R.versao
        if ($script:Log) { Diga ('Nao deu certo (' + $script:R.codigo + '). Detalhes guardados em ' + $script:Log + '.') }
    }
    Exit-Passo $Id
}

function Invoke-AcaoChecar {
    Diga 'Olhando o computador, sem instalar nada...'
    $probs = New-Object System.Collections.ArrayList
    $ok = $true
    $build = Get-Build
    $minimo = 19045
    if (Vv 'WINDOWS_BUILD_MINIMO') { $minimo = [int](Vv 'WINDOWS_BUILD_MINIMO') }
    $versaoSo = [System.Environment]::OSVersion.Version.ToString()
    if ($build -lt $minimo -or -not (Test-Path -LiteralPath $script:Curl) -or -not (Test-Path -LiteralPath $script:Tar)) {
        [void]$probs.Add([ordered]@{ codigo = 'SISTEMA_ANTIGO'; tipo = 'bloqueia'; dados = @{ versao = ((Get-NomeSistema) + ' (' + $versaoSo + ')'); minimo = 'Windows 10 22H2' } })
        $ok = $false
    } elseif ($script:Arq -eq 'arm64' -and $build -lt 22000) {
        # Windows 10 ARM nao emula programas x64 (o navegador escondido precisa disso).
        [void]$probs.Add([ordered]@{ codigo = 'SISTEMA_ANTIGO'; tipo = 'bloqueia'; dados = @{ versao = ((Get-NomeSistema) + ' (' + $versaoSo + ')'); minimo = 'Windows 11' } })
        $ok = $false
    }

    $prontosMb = 0
    foreach ($id in $script:Passos) { if (Test-Rapido $id) { $prontosMb += (Get-TamanhoMb $id) } }
    $precisa = [double](Vv 'ESPACO_MINIMO_GB') - ($prontosMb / 1024)
    $minVer = [double](Vv 'ESPACO_MINIMO_VERIFICAR_GB')
    if ($precisa -lt $minVer) { $precisa = $minVer }
    $precisa = [math]::Round($precisa, 1)
    $livre = Get-EspacoLivreGb
    if ($livre -lt $precisa) {
        [void]$probs.Add([ordered]@{ codigo = 'POUCO_ESPACO'; tipo = 'bloqueia'; dados = @{ livre_gb = $livre; precisa_gb = $precisa } })
        $ok = $false
    }

    $mem = Get-MemoriaGb
    if ($mem -lt [double](Vv 'MEMORIA_MINIMA_GB')) {
        [void]$probs.Add([ordered]@{ codigo = 'POUCA_MEMORIA'; tipo = 'aviso'; dados = @{ memoria_gb = $mem } })
    }

    # Internet. Caixa = o endereco foi achado (o curl chegou a tentar conectar, codigo 7) mas o sistema negou
    # a conexao. E o que a area protegida do Codex faz; ai o certo e pedir internet ao Codex, nao culpar o Wi-Fi.
    $internet = $false
    $codNet = 'SEM_INTERNET'
    if (Test-Path -LiteralPath $script:Curl) {
        $r = Invoke-Nativo -Exe $script:Curl -Argumentos @('-fsSI', '--max-time', '10', 'https://nodejs.org/dist/') -Pasta $env:TEMP
        $internet = ($r.codigo -eq 0)
        if (-not $internet) {
            $saidaNet = [string]$r.saida
            if ($env:CODEX_SANDBOX_NETWORK_DISABLED -eq '1') { $codNet = 'INTERNET_BLOQUEADA_PELA_CAIXA' }
            elseif ($r.codigo -eq 7 -and ($saidaNet.Contains('Permission denied') -or $saidaNet.Contains('not permitted'))) { $codNet = 'INTERNET_BLOQUEADA_PELA_CAIXA' }
        }
    }
    if (-not $internet) {
        [void]$probs.Add([ordered]@{ codigo = $codNet; tipo = 'bloqueia'; dados = @{} })
        $ok = $false
    }

    $destino = Get-DestinoDoRepo
    $nuvem = Get-NuvemDoCaminho $script:Repo
    if ($nuvem) {
        [void]$probs.Add([ordered]@{ codigo = 'PASTA_NA_NUVEM'; tipo = 'acao'; dados = @{ nuvem = $nuvem; caminho = $destino; acao = 'mudar-pasta' } })
        $ok = $false
    } elseif (-not (Test-EstudioNomeSeguro (Get-EstudioNomeDoUsuario))) {
        if (-not $script:Repo.StartsWith('C:\ViewEstudio\', [System.StringComparison]::OrdinalIgnoreCase)) {
            [void]$probs.Add([ordered]@{ codigo = 'NOME_COM_ACENTO'; tipo = 'acao'; dados = @{ caminho = 'C:\ViewEstudio'; acao = 'mudar-pasta' } })
            $ok = $false
        }
    }

    $o = [ordered]@{
        acao = 'checar'; ok = $ok; sistema = 'windows'; arquitetura = $script:Arq; versao_sistema = $versaoSo
        nome_sistema = (Get-NomeSistema); espaco_gb = $livre; memoria_gb = $mem; internet = $internet
        repo_dir = $script:Repo; ferramentas_dir = $script:Ferr; problemas = $probs.ToArray()
    }
    if ($ok) { Sair $o 0 } else { Sair $o 1 }
}

function Invoke-AcaoPlano {
    $itens = New-Object System.Collections.ArrayList
    foreach ($id in $script:Passos) {
        $est = 'falta'
        $e = Read-Estado $id
        $estAnt = ''
        if ($null -ne $e) { $estAnt = [string]$e.estado }
        if (@('pasta', 'node', 'pacotes', 'navegador') -contains $id) { if (Test-Rapido $id) { $est = 'pronto' } }
        elseif ($estAnt -eq 'pronto' -and (Test-Rapido $id)) { $est = 'pronto' }
        if ($estAnt -eq 'rodando' -and $est -ne 'pronto') { $est = 'rodando' }
        $numero = 0
        if ($script:Numeros.ContainsKey($id)) { $numero = $script:Numeros[$id] }
        [void]$itens.Add([ordered]@{ id = $id; estado = $est; obrigatorio = (Test-Obrigatorio $id); tamanho_mb = (Get-TamanhoMb $id); numero = $numero })
    }
    Sair ([ordered]@{ acao = 'plano'; sistema = 'windows'; arquitetura = $script:Arq; total_programas = 4; passos = $itens.ToArray() }) 0
}

function Invoke-AcaoVerificar {
    Initialize-Log 'verificar'
    Diga 'Conferindo cada programa do estudio...'
    $itens = New-Object System.Collections.ArrayList
    $obrig = $true
    $script:Prontos = 0
    function Add-Item([string]$Id, [bool]$Ok, [string]$Texto, [string]$Codigo = '', [string]$Passo = '', $Dados = $null, [string]$Origem = '') {
        $o = [ordered]@{ id = $Id; ok = $Ok; texto = $Texto }
        if ($Passo) { $o.passo = $Passo }
        if ($Codigo) { $o.codigo = $Codigo }
        if ($null -ne $Dados) { $o.dados = $Dados }
        if ($Origem) { $o.origem = $Origem }
        [void]$itens.Add($o)
        if ($Ok) { $script:Prontos++ }
    }

    $v = Get-VersaoNode
    if ($v.StartsWith('v24.')) { Add-Item 'node' $true ('Motor dos comandos (Node ' + $v + ')') '' 'node' } else { Add-Item 'node' $false 'Motor dos comandos (Node)' 'FALTA_INSTALAR' 'node'; $obrig = $false }

    $npmOk = $false
    if (Test-Path -LiteralPath $script:NpmCmd) {
        $r = Invoke-Bat -Bat $script:NpmCmd -Argumentos @('-v')
        if ($r.codigo -eq 0) { $npmOk = $true; Add-Item 'npm' $true ('Ajudante do motor (npm ' + $r.so.Trim() + ')') '' 'node' }
    }
    if (-not $npmOk) { Add-Item 'npm' $false 'Ajudante do motor (npm)' 'FALTA_INSTALAR' 'node'; $obrig = $false }

    $pv = Get-PacotesVersao
    if ($null -ne $pv) { Add-Item 'pacotes' $true ('Pecas do estudio (motor de cena ' + $pv + ')') '' 'pacotes' }
    else { Add-Item 'pacotes' $false 'Pecas do estudio' 'FALTA_INSTALAR' 'pacotes'; $obrig = $false }

    if ((Get-CaminhoNavegador) -ne '') { Add-Item 'navegador' $true ('Navegador escondido (' + (Vv 'CHROME_HEADLESS_SHELL_VERSAO') + ')') '' 'navegador' }
    else { Add-Item 'navegador' $false 'Navegador escondido' 'FALTA_INSTALAR' 'navegador'; $obrig = $false }

    $rc = Test-FfmpegCompleto
    if ($rc -eq 0) { Add-Item 'ffmpeg' $true ('FFmpeg ' + (Get-VersaoFfmpeg) + ' (para cena em video)') '' 'ffmpeg' }
    elseif ($rc -eq 2) { Add-Item 'ffmpeg' $false 'FFmpeg sem uma peca (para cena em video)' 'FFMPEG_INCOMPLETO' 'ffmpeg' }
    elseif ($rc -eq 3) { Add-Item 'ffmpeg' $false 'FFmpeg (para cena em video)' 'ANTIVIRUS_BLOQUEOU' 'ffmpeg' @{ nome = 'FFmpeg'; arquivo = 'ffmpeg.exe' } }
    else { Add-Item 'ffmpeg' $false 'FFmpeg (para cena em video)' 'FALTA_INSTALAR' 'ffmpeg' }

    $livre = Get-EspacoLivreGb
    $minVer = [double](Vv 'ESPACO_MINIMO_VERIFICAR_GB')
    if ($livre -lt $minVer) { Add-Item 'espaco' $false ('Espaco livre: ' + $livre + ' GB') 'POUCO_ESPACO' '' @{ livre_gb = $livre; precisa_gb = $minVer } }
    else { Add-Item 'espaco' $true ('Espaco livre: ' + $livre + ' GB') }

    if ((Test-Path -LiteralPath $script:NodeExe) -and (Test-Path -LiteralPath (Join-Path $script:Repo 'kit\scripts\estudio.mjs'))) {
        $r = Invoke-Nativo -Exe $script:NodeExe -Argumentos @((Join-Path $script:Repo 'kit\scripts\estudio.mjs'), 'verificar') -Pasta $script:Repo
        $j = ConvertFrom-JsonSeguro (Get-UltimaLinha $r.so)
        if ($null -ne $j -and $j.ok -eq $true) { Add-Item 'kit' $true 'Comandos do estudio conferidos' '' '' $null 'kit' }
        else {
            $cod = 'DESCONHECIDO'
            if ($null -ne $j -and $j.codigo) { $cod = [string]$j.codigo }
            Add-Item 'kit' $false 'Comandos do estudio' $cod '' $null 'kit'
        }
    } else {
        Add-Item 'kit' $false 'Comandos do estudio' 'ESTUDIO_NAO_INSTALADO'
    }

    $total = $itens.Count
    $ok = ($script:Prontos -eq $total)
    $gravou = $false
    if ($obrig) { $gravou = Save-Instalacao }
    if ($ok) { Diga ('Tudo pronto: ' + $script:Prontos + ' de ' + $total + '.') } else { Diga ('Ficou quase tudo pronto: ' + $script:Prontos + ' de ' + $total + '.') }
    $o = [ordered]@{ ok = $ok; total = $total; prontos = $script:Prontos; instalacao_gravada = $gravou; itens = $itens.ToArray() }
    if ($ok) { Sair $o 0 } else { Sair $o 1 }
}

function Save-Instalacao {
    Read-Config
    $passos = [ordered]@{}
    foreach ($id in $script:Passos) {
        $e = Read-Estado $id
        if ($null -eq $e) { continue }
        $passos[$id] = [ordered]@{ ok = ($e.estado -eq 'pronto'); versao = [string]$e.versao; quando = [string]$e.atualizado_em }
    }
    $agente = $script:CfgAgente
    if (-not $agente) { $agente = 'claude' }
    $modo = $script:CfgModo
    if (-not $modo) { $modo = 'tudo' }
    $o = [ordered]@{
        versao_estudio = $script:VersaoEstudio; sistema = 'windows'; arquitetura = $script:Arq
        versao_sistema = [System.Environment]::OSVersion.Version.ToString(); agente = $agente
        ferramentas_dir = $script:Ferr; repo_dir = $script:Repo; passos = $passos; modo_permissao = $modo
    }
    $f = Join-Path $script:Ferr 'instalacao.json'
    try {
        [System.IO.File]::WriteAllText($f + '.tmp', (ConvertTo-Json -InputObject $o -Depth 6), $script:Utf8)
        if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force }
        Move-Item -LiteralPath ($f + '.tmp') -Destination $f
        return $true
    } catch { return $false }
}

# Tira este processo de dentro de uma pasta: o Windows trava a pasta que e a pasta de trabalho de um processo.
function Exit-PastaAtual {
    $fora = $env:TEMP
    if (-not $fora) { $fora = $env:SystemRoot }
    try { Set-Location -LiteralPath $fora } catch { }
    try { [System.Environment]::CurrentDirectory = $fora } catch { }
}

function Invoke-AcaoMudarPasta {
    $destino = Get-DestinoDoRepo
    $velha = $script:Repo
    if ($velha.TrimEnd('\') -eq $destino) { Sair ([ordered]@{ acao = 'mudar-pasta'; ok = $true; codigo = 'JA_PRONTO'; de = $velha; para = $destino }) 0 }
    if (Test-Path -LiteralPath $destino) { Sair ([ordered]@{ acao = 'mudar-pasta'; ok = $false; codigo = 'PASTA_DESTINO_EXISTE'; de = $velha; para = $destino; dados = @{ pasta = $destino } }) 1 }
    Diga ('Vou mudar o estudio para ' + $destino + '. Nada e apagado.')
    # Antes de mover, sai de dentro do estudio; senao o Windows trava a pasta e o Move falha.
    Exit-PastaAtual
    try {
        $pai = Split-Path -Parent $destino
        if (-not (Test-Path -LiteralPath $pai)) { New-Item -ItemType Directory -Force -Path $pai | Out-Null }
        Move-Item -LiteralPath $velha -Destination $destino
        Sair ([ordered]@{ acao = 'mudar-pasta'; ok = $true; codigo = 'INSTALADO'; copiado = $false; de = $velha; para = $destino }) 0
    } catch {
        $cod = Get-CodigoExcecao $_
        try {
            Copy-Item -LiteralPath $velha -Destination $destino -Recurse -Force
            # Ficou uma copia antiga; a pessoa pode apagar depois (texto MUDAR-PASTA-COPIADO).
            Sair ([ordered]@{ acao = 'mudar-pasta'; ok = $true; codigo = 'INSTALADO'; copiado = $true; de = $velha; para = $destino; dados = @{ antiga = $velha } }) 0
        } catch {
            Sair ([ordered]@{ acao = 'mudar-pasta'; ok = $false; codigo = $cod; de = $velha; para = $destino; dados = @{ pasta = $destino } }) 1
        }
    }
}

# Tamanho de uma pasta em MB (0 se nao der para medir).
function Get-TamanhoPastaMb([string]$Pasta) {
    try {
        $soma = (Get-ChildItem -LiteralPath $Pasta -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        if ($null -eq $soma) { return 0 }
        return [int][math]::Round($soma / 1MB, 0)
    } catch { return 0 }
}

# Desinstalar: apaga so o que o instalador pos (a pasta .ferramentas e node_modules).
# Sem --confirmar so diz o que seria apagado. As apresentacoes, a marca e as referencias ficam.
function Invoke-AcaoDesinstalar {
    $alvo = Join-Path $script:Repo '.ferramentas'
    $modulos = Join-Path $script:Repo 'node_modules'
    $lista = New-Object System.Collections.ArrayList
    $mb = 0
    foreach ($p in @($alvo, $modulos)) {
        if (Test-Path -LiteralPath $p) { [void]$lista.Add($p); $mb += (Get-TamanhoPastaMb $p) }
    }
    if (-not $script:Confirmar) {
        Sair ([ordered]@{ acao = 'desinstalar'; ok = $true; confirmado = $false; apagaria = $lista.ToArray(); tamanho_mb = $mb; fica = $script:PastasDoUsuario }) 0
    }
    Diga 'Vou apagar os programas do estudio. As suas apresentacoes, a sua marca e as referencias ficam.'
    Exit-PastaAtual
    foreach ($p in @($alvo, $modulos)) {
        if (-not (Test-Path -LiteralPath $p)) { continue }
        # rd do cmd lida melhor com caminho longo do node_modules do que o Remove-Item do PowerShell 5.1.
        $null = Invoke-Nativo -Exe $script:Cmd -Bruto ('/d /c rd /s /q "' + $p + '"') -Pasta $env:TEMP
        if (Test-Path -LiteralPath $p) { try { Remove-Item -LiteralPath $p -Recurse -Force } catch { } }
    }
    if ((Test-Path -LiteralPath $alvo) -or (Test-Path -LiteralPath $modulos)) {
        Sair ([ordered]@{ acao = 'desinstalar'; ok = $false; codigo = 'ARQUIVO_EM_USO'; dados = @{} }) 1
    }
    Diga 'Pronto: programas do estudio apagados.'
    Sair ([ordered]@{ acao = 'desinstalar'; ok = $true; confirmado = $true; apagou = $lista.ToArray(); pasta_do_estudio = $script:Repo }) 0
}

# ---------------------------------------------------------------- despacho

switch ($script:Acao) {
    'checar' { Invoke-AcaoChecar }
    'plano' { Invoke-AcaoPlano }
    'passo' { Invoke-AcaoPasso $script:Id }
    'verificar' { Invoke-AcaoVerificar }
    'mudar-pasta' { Invoke-AcaoMudarPasta }
    'desinstalar' { Invoke-AcaoDesinstalar }
    default {
        Sair ([ordered]@{ acao = $script:Acao; ok = $false; codigo = 'ACAO_DESCONHECIDA'; dados = @{ acoes = @('checar', 'plano', 'passo', 'verificar', 'mudar-pasta', 'desinstalar') } }) 1
    }
}
