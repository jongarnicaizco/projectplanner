# Script para desplegar mfs-lead-generation-ai manualmente
$ErrorActionPreference = "Stop"

Write-Host "`n=== Desplegando mfs-lead-generation-ai ===" -ForegroundColor Cyan

$project = "check-in-sf"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$imageTag = "manual-$timestamp"

Write-Host "`n1. Generando tag de imagen: $imageTag" -ForegroundColor Yellow

Write-Host "`n2. Ejecutando Cloud Build..." -ForegroundColor Yellow
gcloud builds submit `
  --config=cloudbuild.yaml `
  --project=$project `
  --substitutions="_IMAGE_TAG=$imageTag" `
  2>&1 | Tee-Object -Variable buildOutput

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n✗ Error en el build" -ForegroundColor Red
    Write-Host $buildOutput
    exit 1
}

Write-Host "`n✓ Build completado exitosamente" -ForegroundColor Green
Write-Host "`n3. Verificando despliegue..." -ForegroundColor Yellow

# Esperar un momento para que el despliegue se complete
Start-Sleep -Seconds 5

$serviceInfo = gcloud run services describe mfs-lead-generation-ai `
  --region=us-central1 `
  --project=$project `
  --format="value(status.latestReadyRevisionName)" `
  2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Servicio desplegado correctamente" -ForegroundColor Green
    Write-Host "  Última revisión: $serviceInfo" -ForegroundColor Gray
} else {
    Write-Host "⚠ No se pudo verificar el despliegue" -ForegroundColor Yellow
}

Write-Host "`n=== Despliegue completado ===" -ForegroundColor Cyan

