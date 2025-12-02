# Script para verificar si el email se envió correctamente
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  VERIFICACIÓN DE ENVÍO DE EMAIL (últimos 5 minutos)" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# Obtener logs desde las 22:08:00
$timestamp = "2025-12-02T22:08:00Z"

Write-Host "[1] Buscando logs de envío exitoso desde $timestamp..." -ForegroundColor Yellow
$exitosos = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"mfs-lead-generation-ai`" AND textPayload=~`"Email.*enviado exitosamente`" AND timestamp>=`"$timestamp`"" `
  --limit=10 `
  --format="table(timestamp,textPayload)" `
  --project=check-in-sf `
  2>&1

if ($LASTEXITCODE -eq 0 -and $exitosos -and $exitosos.Count -gt 0) {
    Write-Host $exitosos -ForegroundColor Green
    Write-Host ""
    Write-Host "✓✓✓ EMAIL ENVIADO EXITOSAMENTE ✓✓✓" -ForegroundColor Green
} else {
    Write-Host "⚠ No se encontraron logs de envío exitoso" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[2] Buscando errores de envío desde $timestamp..." -ForegroundColor Yellow
$errores = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"mfs-lead-generation-ai`" AND textPayload=~`"ERROR enviando email`" AND timestamp>=`"$timestamp`"" `
  --limit=10 `
  --format="table(timestamp,textPayload)" `
  --project=check-in-sf `
  2>&1

if ($LASTEXITCODE -eq 0 -and $errores -and $errores.Count -gt 0) {
    Write-Host $errores -ForegroundColor Red
    Write-Host ""
    Write-Host "✗✗✗ ERROR AL ENVIAR EMAIL ✗✗✗" -ForegroundColor Red
} else {
    Write-Host "✓ No se encontraron errores de envío" -ForegroundColor Green
}

Write-Host ""
Write-Host "[3] Buscando logs relacionados con email desde $timestamp..." -ForegroundColor Yellow
$relacionados = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"mfs-lead-generation-ai`" AND (textPayload=~`"Email`" OR textPayload=~`"sendLeadEmail`" OR textPayload=~`"DATOS PARA ENVIAR`") AND timestamp>=`"$timestamp`"" `
  --limit=20 `
  --format="table(timestamp,textPayload)" `
  --project=check-in-sf `
  2>&1

if ($LASTEXITCODE -eq 0 -and $relacionados) {
    Write-Host $relacionados -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  RESUMEN" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "Si ves 'Email enviado exitosamente' → El refresh token funciona correctamente" -ForegroundColor Green
Write-Host "Si ves 'ERROR enviando email' → El refresh token aún no tiene el scope gmail.send" -ForegroundColor Red
Write-Host ""
Write-Host "Si sigue fallando, verifica que el refresh token tenga el scope gmail.send:" -ForegroundColor Yellow
Write-Host "1. Ve a: https://myaccount.google.com/permissions" -ForegroundColor White
Write-Host "2. Busca la aplicación autorizada" -ForegroundColor White
Write-Host "3. Verifica que tenga 'Enviar email en tu nombre'" -ForegroundColor White

