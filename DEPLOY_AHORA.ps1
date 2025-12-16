# Script para desplegar AHORA el email de prueba
# Ejecuta este script para hacer push y deploy inmediatamente

$ErrorActionPreference = "Continue"

cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DEPLOY: EMAIL DE PRUEBA" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Configurar remoto con token
Write-Host "[1/4] Configurando Git..." -ForegroundColor Yellow
git remote set-url origin https://jongarnicaizco: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@github.com/jongarnicaizco/mfs-lead-generation-ai.git
Write-Host "  ✓ Remoto configurado" -ForegroundColor Green

# 2. Añadir y commit
Write-Host "`n[2/4] Haciendo commit..." -ForegroundColor Yellow
git add services/email-sender.js services/processor.js
git commit -m "Deploy: Email de prueba antes de Airtable"
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No hay cambios para commit (puede que ya estén commiteados)" -ForegroundColor Yellow
}

# 3. Push
Write-Host "`n[3/4] Haciendo push a GitHub..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Push completado" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error en push" -ForegroundColor Red
    exit 1
}

# 4. Deploy
Write-Host "`n[4/4] Desplegando a Cloud Run..." -ForegroundColor Yellow
$tag = "email-test-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$subs = "_IMAGE_TAG=$tag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"

Write-Host "  Tag: $tag" -ForegroundColor Gray
Write-Host "  Iniciando build (esto puede tardar 3-5 minutos)..." -ForegroundColor Gray

gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$subs

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Despliegue completado" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error en despliegue" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ DESPLIEGUE COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "El servicio ahora enviará 'test' a jongarnicaizco@gmail.com" -ForegroundColor Cyan
Write-Host "antes de cada registro en Airtable." -ForegroundColor Cyan
Write-Host ""

