# Script de diagnóstico para el push
$ErrorActionPreference = "Continue"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

$logFile = "diagnostico-push.txt"
Remove-Item $logFile -ErrorAction SilentlyContinue

function Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Add-Content -Path $logFile -Value $logMessage
    Write-Host $logMessage
}

Log "=== DIAGNÓSTICO DE PUSH ==="
Log ""

# 1. Verificar archivo
Log "1. Verificando archivo test.txt..."
if (Test-Path "test.txt") {
    Log "   ✓ Archivo existe"
    $content = Get-Content test.txt -Raw
    Log "   Contenido: $content"
} else {
    Log "   ✗ Archivo NO existe"
}

# 2. Estado de Git
Log "`n2. Estado de Git:"
$status = git status 2>&1 | Out-String
Log $status

# 3. Últimos commits
Log "`n3. Últimos commits locales:"
$commits = git log --oneline -5 2>&1 | Out-String
Log $commits

# 4. Verificar remoto
Log "`n4. Configuración del remoto:"
$remote = git remote -v 2>&1 | Out-String
Log $remote

# 5. Verificar autenticación
Log "`n5. Verificando autenticación..."
$authTest = git ls-remote origin main 2>&1 | Out-String
Log "   Resultado: $authTest"
if ($LASTEXITCODE -eq 0) {
    Log "   ✓ Autenticación OK"
} else {
    Log "   ✗ Error de autenticación"
}

# 6. Comparar commits local vs remoto
Log "`n6. Comparando commits local vs remoto:"
git fetch origin 2>&1 | Out-Null
$localHash = git rev-parse HEAD
$remoteHash = git rev-parse origin/main
Log "   Local:  $localHash"
Log "   Remoto: $remoteHash"

if ($localHash -eq $remoteHash) {
    Log "   ✓ Los commits están sincronizados"
} else {
    Log "   ⚠ Los commits NO están sincronizados"
    $diffCommits = git log origin/main..HEAD --oneline 2>&1 | Out-String
    Log "   Commits locales sin push:"
    Log "   $diffCommits"
}

# 7. Intentar push
Log "`n7. Intentando push..."
$pushOutput = git push origin main 2>&1 | Out-String
Log "   Salida del push:"
Log $pushOutput
Log "   Exit code: $LASTEXITCODE"

if ($LASTEXITCODE -eq 0) {
    Log "   ✓ Push exitoso"
} else {
    Log "   ✗ Push falló"
}

# 8. Verificar después del push
Log "`n8. Verificando después del push:"
git fetch origin 2>&1 | Out-Null
$newLocalHash = git rev-parse HEAD
$newRemoteHash = git rev-parse origin/main
Log "   Local:  $newLocalHash"
Log "   Remoto: $newRemoteHash"

if ($newLocalHash -eq $newRemoteHash) {
    Log "   ✓ Push completado - commits sincronizados"
} else {
    Log "   ✗ Push NO completado - commits aún diferentes"
}

Log "`n=== FIN DEL DIAGNÓSTICO ==="
Log "Revisa el archivo diagnostico-push.txt para más detalles"

Write-Host "`nDiagnóstico guardado en: $logFile" -ForegroundColor Green
Write-Host "Revisa el archivo para ver los detalles completos" -ForegroundColor Yellow

