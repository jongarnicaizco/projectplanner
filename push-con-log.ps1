# Script que guarda la salida en un archivo para diagnóstico
param(
    [Parameter(Mandatory=$false)]
    [string]$CommitMessage = "Update: Cambios automáticos desde Cursor AI - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$ErrorActionPreference = "Continue"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

$logFile = Join-Path $scriptPath "push-log-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"

function Log-Output {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Add-Content -Path $logFile -Value $logMessage
    Write-Host $Message -ForegroundColor $Color
}

Log-Output "=== INICIANDO PUSH CON LOG ===" "Cyan"
Log-Output ""

# Configurar remoto
Log-Output "[1/5] Configurando remoto..." "Yellow"
$token = "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"
$remoteUrl = "https://jongarnicaizco:$token@github.com/jongarnicaizco/mfs-lead-generation-ai.git"
git remote set-url origin $remoteUrl 2>&1 | Out-Null
$currentRemote = git remote get-url origin
Log-Output "  Remoto: $($currentRemote -replace $token, '***TOKEN***')" "Gray"
Log-Output "  ✓ Remoto configurado" "Green"

# Verificar estado
Log-Output "`n[2/5] Verificando estado..." "Yellow"
git fetch origin 2>&1 | Out-Null
$localCommit = git rev-parse HEAD
$remoteCommit = git rev-parse origin/main 2>&1
Log-Output "  Local:  $localCommit" "Gray"
Log-Output "  Remoto: $remoteCommit" "Gray"

# Añadir cambios
Log-Output "`n[3/5] Añadiendo cambios..." "Yellow"
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Log-Output "  ⚠ No hay cambios para commitear" "Yellow"
    $hasChanges = $false
} else {
    Log-Output "  ✓ Hay cambios:" "Green"
    $status | ForEach-Object { Log-Output "    $_" "Gray" }
    git add -A 2>&1 | Out-Null
    $hasChanges = $true
}

# Commit
if ($hasChanges) {
    Log-Output "`n[4/5] Haciendo commit..." "Yellow"
    $commitOutput = git commit -m $CommitMessage 2>&1 | Out-String
    $commitStatus = $LASTEXITCODE
    Log-Output "  Salida: $commitOutput" "Gray"
    Log-Output "  Exit code: $commitStatus" "Gray"
    if ($commitStatus -eq 0) {
        $lastCommit = git log --oneline -1
        Log-Output "  ✓ Commit: $lastCommit" "Green"
    } else {
        Log-Output "  ✗ Error en commit" "Red"
    }
} else {
    Log-Output "`n[4/5] Saltando commit" "Yellow"
}

# Push
Log-Output "`n[5/5] Haciendo push..." "Yellow"
$pushOutput = git push origin main 2>&1 | Out-String
$pushStatus = $LASTEXITCODE

Log-Output "  Salida completa:" "Cyan"
$pushOutput -split "`n" | ForEach-Object {
    if ($_ -match "error|fatal|denied|invalid|failed|Authentication") {
        Log-Output "    $_" "Red"
    } else {
        Log-Output "    $_" "White"
    }
}
Log-Output "  Exit code: $pushStatus" "Gray"

if ($pushStatus -eq 0) {
    Log-Output "  ✓ PUSH EXITOSO!" "Green"
} else {
    Log-Output "  ✗ PUSH FALLÓ" "Red"
}

Log-Output "`nLog guardado en: $logFile" "Cyan"
Log-Output "=== FIN ===" "Cyan"
