# Script para ver logs de email (funciona en PowerShell)
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  LOGS DE EMAIL" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

Write-Host "[1] Buscando logs de envío exitoso..." -ForegroundColor Yellow
$exitosos = gcloud logging read `
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"Email.*enviado exitosamente"' `
  --limit=10 `
  --format="table(timestamp,textPayload)" `
  --project=check-in-sf `
  --freshness=30m `
  2>&1

if ($LASTEXITCODE -eq 0 -and $exitosos) {
    Write-Host $exitosos -ForegroundColor Green
} else {
    Write-Host "⚠ No se encontraron logs de envío exitoso" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[2] Buscando errores de envío..." -ForegroundColor Yellow
$errores = gcloud logging read `
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"ERROR enviando email"' `
  --limit=10 `
  --format="table(timestamp,textPayload)" `
  --project=check-in-sf `
  --freshness=30m `
  2>&1

if ($LASTEXITCODE -eq 0 -and $errores) {
    Write-Host $errores -ForegroundColor Red
} else {
    Write-Host "✓ No se encontraron errores de envío" -ForegroundColor Green
}

Write-Host ""
Write-Host "[3] Buscando logs recientes de procesamiento..." -ForegroundColor Yellow
$recientes = gcloud logging read `
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND (textPayload=~"Email" OR textPayload=~"sendLeadEmail" OR textPayload=~"DATOS PARA ENVIAR")' `
  --limit=20 `
  --format="table(timestamp,textPayload)" `
  --project=check-in-sf `
  --freshness=30m `
  2>&1

if ($LASTEXITCODE -eq 0 -and $recientes) {
    Write-Host $recientes -ForegroundColor Cyan
} else {
    Write-Host "⚠ No se encontraron logs recientes" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  RESUMEN" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "Si no ves logs de 'Email enviado exitosamente', verifica:" -ForegroundColor Yellow
Write-Host "1. Que el servicio tenga el código actualizado desplegado" -ForegroundColor White
Write-Host "2. Que las variables EMAIL_FROM y EMAIL_TO estén configuradas" -ForegroundColor White
Write-Host "3. Que el servicio tenga permisos para enviar emails" -ForegroundColor White

