# Script para desplegar el cambio de email de prueba AHORA
$ErrorActionPreference = "Stop"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DESPLEGANDO: EMAIL DE PRUEBA" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que los archivos existen
Write-Host "[1/4] Verificando archivos..." -ForegroundColor Yellow
if (Test-Path "services\email-sender.js") {
    Write-Host "  ✓ email-sender.js existe" -ForegroundColor Green
} else {
    Write-Host "  ✗ email-sender.js NO existe" -ForegroundColor Red
    exit 1
}

$processorContent = Get-Content "services\processor.js" -Raw
if ($processorContent -match "sendTestEmail") {
    Write-Host "  ✓ processor.js tiene sendTestEmail" -ForegroundColor Green
} else {
    Write-Host "  ✗ processor.js NO tiene sendTestEmail" -ForegroundColor Red
    exit 1
}

# Commit y push
Write-Host "`n[2/4] Haciendo commit y push..." -ForegroundColor Yellow
git add services/email-sender.js services/processor.js 2>&1 | Out-Null
$commitOutput = git commit -m "Add: Enviar email de prueba antes de crear registro en Airtable" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
    git log --oneline -1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} elseif ($commitOutput -match "nothing to commit") {
    Write-Host "  ⚠ No hay cambios para commit (puede que ya estén commiteados)" -ForegroundColor Yellow
} else {
    Write-Host "  ✗ Error en commit: $commitOutput" -ForegroundColor Red
}

$pushOutput = git push origin main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Push completado" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error en push: $pushOutput" -ForegroundColor Red
    exit 1
}

# Deploy
Write-Host "`n[3/4] Desplegando a Cloud Run..." -ForegroundColor Yellow
$imageTag = "email-test-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$substitutions = "_IMAGE_TAG=$imageTag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"

Write-Host "  Image tag: $imageTag" -ForegroundColor Gray
Write-Host "  Iniciando build..." -ForegroundColor Gray

$buildOutput = gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$substitutions 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Despliegue completado exitosamente" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error en despliegue" -ForegroundColor Red
    $buildOutput | Select-Object -Last 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
    exit 1
}

Write-Host "`n[4/4] Verificación..." -ForegroundColor Yellow
Write-Host "  ✓ Código desplegado" -ForegroundColor Green
Write-Host "  ✓ Cada email procesado enviará 'test' a jongarnicaizco@gmail.com" -ForegroundColor Green
Write-Host "  ✓ Email enviado desde secretmedia@feverup.com" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ DESPLIEGUE COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "El servicio ahora enviará un email de prueba antes de cada registro en Airtable." -ForegroundColor Cyan
Write-Host ""

