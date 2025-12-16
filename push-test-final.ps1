$ErrorActionPreference = "Continue"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

$logFile = Join-Path $scriptPath "push-output.txt"
Remove-Item $logFile -ErrorAction SilentlyContinue

function Log-Output {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Add-Content -Path $logFile -Value $logMessage
    Write-Host $logMessage
}

Log-Output "=== INICIANDO PUSH TEST ==="

# Verificar archivo
Log-Output "1. Verificando archivo test.txt..."
if (Test-Path "test.txt") {
    Log-Output "   ✓ Archivo existe"
    $content = Get-Content test.txt -Raw
    Log-Output "   Contenido: $content"
} else {
    Log-Output "   ✗ Archivo NO existe"
    exit 1
}

# Configurar remoto
Log-Output "`n2. Configurando remoto..."
git remote set-url origin https://jongarnicaizco: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@github.com/jongarnicaizco/mfs-lead-generation-ai.git
$remoteUrl = git remote get-url origin
Log-Output "   Remoto configurado: $remoteUrl"

# Estado inicial
Log-Output "`n3. Estado inicial de Git:"
$status = git status --porcelain
Log-Output "   $status"

# Añadir archivo
Log-Output "`n4. Añadiendo archivo..."
$addOutput = git add test.txt 2>&1 | Out-String
Log-Output "   Add output: $addOutput"
Log-Output "   Exit code: $LASTEXITCODE"

# Estado después de add
Log-Output "`n5. Estado después de add:"
$status = git status --porcelain
Log-Output "   $status"

# Commit
Log-Output "`n6. Haciendo commit..."
$commitOutput = git commit -m "Test: Subir archivo test.txt a GitHub" 2>&1 | Out-String
Log-Output "   Commit output: $commitOutput"
Log-Output "   Exit code: $LASTEXITCODE"

# Verificar commit
Log-Output "`n7. Verificando commit..."
$lastCommit = git log --oneline -1
Log-Output "   Último commit: $lastCommit"

# Push
Log-Output "`n8. Haciendo push..."
$pushOutput = git push origin main 2>&1 | Out-String
Log-Output "   Push output: $pushOutput"
Log-Output "   Exit code: $LASTEXITCODE"

# Verificar después del push
Log-Output "`n9. Verificando después del push..."
git fetch origin 2>&1 | Out-Null
$localCommits = git log origin/main..HEAD --oneline
if ($localCommits) {
    Log-Output "   ⚠ Hay commits locales sin push:"
    Log-Output "   $localCommits"
} else {
    Log-Output "   ✓ No hay commits locales sin push (push exitoso)"
}

Log-Output "`n=== FIN ==="
Log-Output "Revisa el archivo push-output.txt para más detalles"

