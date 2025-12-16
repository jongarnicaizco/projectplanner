# Script para hacer PUSH y DEPLOY del email de prueba
# Ejecuta este script manualmente si los comandos automáticos no funcionan

$ErrorActionPreference = "Continue"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PUSH Y DEPLOY - EMAIL DE PRUEBA" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar archivos
Write-Host "[1/5] Verificando archivos..." -ForegroundColor Yellow
if (-not (Test-Path "services\email-sender.js")) {
    Write-Host "  ERROR: services\email-sender.js NO EXISTE" -ForegroundColor Red
    exit 1
}
Write-Host "  OK: email-sender.js existe" -ForegroundColor Green

$procContent = Get-Content "services\processor.js" -Raw
if ($procContent -notmatch "sendTestEmail") {
    Write-Host "  ERROR: processor.js NO tiene sendTestEmail" -ForegroundColor Red
    exit 1
}
Write-Host "  OK: processor.js tiene sendTestEmail" -ForegroundColor Green

# 2. Git add
Write-Host "`n[2/5] Añadiendo archivos a git..." -ForegroundColor Yellow
git add services/email-sender.js services/processor.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR en git add" -ForegroundColor Red
    exit 1
}
Write-Host "  OK: Archivos añadidos" -ForegroundColor Green

# 3. Git commit
Write-Host "`n[3/5] Haciendo commit..." -ForegroundColor Yellow
$commitMsg = "Add: Enviar email de prueba antes de crear registro en Airtable"
git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Commit falló (puede que no haya cambios)" -ForegroundColor Yellow
} else {
    Write-Host "  OK: Commit realizado" -ForegroundColor Green
    git log --oneline -1
}

# 4. Git push
Write-Host "`n[4/5] Haciendo push a GitHub..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR en git push" -ForegroundColor Red
    Write-Host "  Por favor ejecuta manualmente: git push origin main" -ForegroundColor Yellow
    exit 1
}
Write-Host "  OK: Push completado" -ForegroundColor Green

# 5. Deploy
Write-Host "`n[5/5] Desplegando a Cloud Run..." -ForegroundColor Yellow
$tag = "email-test-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$subs = "_IMAGE_TAG=$tag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"

Write-Host "  Tag: $tag" -ForegroundColor Gray
Write-Host "  Iniciando build (esto puede tardar varios minutos)..." -ForegroundColor Gray

gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$subs

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK: Despliegue completado" -ForegroundColor Green
} else {
    Write-Host "  ERROR en despliegue" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "El servicio ahora enviará 'test' a jongarnicaizco@gmail.com" -ForegroundColor Cyan
Write-Host "antes de cada registro en Airtable." -ForegroundColor Cyan
Write-Host ""

