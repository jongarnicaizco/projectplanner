# Script automático para push y deploy con autenticación
# Este script configura git y hace push/deploy automáticamente

$ErrorActionPreference = "Stop"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AUTO PUSH & DEPLOY CON AUTENTICACIÓN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuración
$GITHUB_USER = "jongarnicaizco"
$GITHUB_TOKEN = "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"
$REPO_URL = "https://github.com/jongarnicaizco/mfs-lead-generation-ai.git"

# 1. Configurar git
Write-Host "[1/6] Configurando Git..." -ForegroundColor Yellow

# Configurar remoto con token en URL (para push automático)
$remoteWithToken = "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/jongarnicaizco/mfs-lead-generation-ai.git"
git remote set-url origin $remoteWithToken 2>&1 | Out-Null

# Configurar usuario si no está configurado
$currentUser = git config user.name 2>&1
if (-not $currentUser -or $currentUser -match "error") {
    git config user.name "jongarnicaizco" 2>&1 | Out-Null
    Write-Host "  ✓ Usuario configurado" -ForegroundColor Green
}

$currentEmail = git config user.email 2>&1
if (-not $currentEmail -or $currentEmail -match "error") {
    git config user.email "jongarnicaizco@gmail.com" 2>&1 | Out-Null
    Write-Host "  ✓ Email configurado" -ForegroundColor Green
}

Write-Host "  ✓ Git configurado" -ForegroundColor Green

# 2. Verificar archivos
Write-Host "`n[2/6] Verificando archivos..." -ForegroundColor Yellow
if (-not (Test-Path "services\email-sender.js")) {
    Write-Host "  ✗ ERROR: email-sender.js NO EXISTE" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ email-sender.js existe" -ForegroundColor Green

$procContent = Get-Content "services\processor.js" -Raw
if ($procContent -notmatch "sendTestEmail") {
    Write-Host "  ✗ ERROR: processor.js NO tiene sendTestEmail" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ processor.js tiene sendTestEmail" -ForegroundColor Green

# 3. Añadir cambios
Write-Host "`n[3/6] Añadiendo cambios..." -ForegroundColor Yellow
git add services/email-sender.js services/processor.js 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Error en git add" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Archivos añadidos" -ForegroundColor Green

# 4. Commit
Write-Host "`n[4/6] Haciendo commit..." -ForegroundColor Yellow
$commitMsg = "Add: Enviar email de prueba antes de crear registro en Airtable"
$commitOutput = git commit -m $commitMsg 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
    git log --oneline -1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} elseif ($commitOutput -match "nothing to commit") {
    Write-Host "  ⚠ No hay cambios para commit (ya están commiteados)" -ForegroundColor Yellow
} else {
    Write-Host "  ✗ Error en commit: $commitOutput" -ForegroundColor Red
    exit 1
}

# 5. Push
Write-Host "`n[5/6] Haciendo push a GitHub..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Push completado exitosamente" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error en push:" -ForegroundColor Red
    Write-Host "    $pushOutput" -ForegroundColor Red
    
    # Intentar con fetch primero
    Write-Host "  Intentando fetch y push de nuevo..." -ForegroundColor Yellow
    git fetch origin 2>&1 | Out-Null
    git push origin main 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Push completado en segundo intento" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Push falló después de 2 intentos" -ForegroundColor Red
        exit 1
    }
}

# 6. Deploy
Write-Host "`n[6/6] Desplegando a Cloud Run..." -ForegroundColor Yellow
$tag = "email-test-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$subs = "_IMAGE_TAG=$tag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"

Write-Host "  Tag: $tag" -ForegroundColor Gray
Write-Host "  Iniciando build (puede tardar varios minutos)..." -ForegroundColor Gray

$buildOutput = gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$subs 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Despliegue completado exitosamente" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error en despliegue" -ForegroundColor Red
    $buildOutput | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
    Write-Host "  ⚠ El código está en GitHub, pero el deploy falló" -ForegroundColor Yellow
    Write-Host "  Puedes hacer el deploy manualmente más tarde" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ PROCESO COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Código pusheado a GitHub y desplegado a Cloud Run" -ForegroundColor Cyan
Write-Host "El servicio ahora enviará 'test' a jongarnicaizco@gmail.com" -ForegroundColor Cyan
Write-Host "antes de cada registro en Airtable." -ForegroundColor Cyan
Write-Host ""

