# Script para verificar logs específicos de envío de emails
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  VERIFICACIÓN DE LOGS DE EMAIL" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

Write-Host "[1] Buscando logs de envío exitoso..." -ForegroundColor Yellow
$exitosos = gcloud logging read `
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"Email.*enviado exitosamente"' `
  --limit=10 `
  --format="table(timestamp,textPayload)" `
  --project=check-in-sf `
  2>&1

if ($LASTEXITCODE -eq 0 -and $exitosos) {
    Write-Host $exitosos -ForegroundColor Green
} else {
    Write-Host "⚠ No se encontraron logs de envío exitoso" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[2] Buscando errores de envío..." -ForegroundColor Yellow
$errores = gcloud logging read `
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND (textPayload=~"ERROR enviando email" OR textPayload=~"Error.*email")' `
  --limit=10 `
  --format="table(timestamp,textPayload)" `
  --project=check-in-sf `
  2>&1

if ($LASTEXITCODE -eq 0 -and $errores) {
    Write-Host $errores -ForegroundColor Red
} else {
    Write-Host "✓ No se encontraron errores de envío" -ForegroundColor Green
}

Write-Host ""
Write-Host "[3] Buscando logs recientes de procesamiento..." -ForegroundColor Yellow
$recientes = gcloud logging read `
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"DATOS PARA ENVIAR POR EMAIL"' `
  --limit=5 `
  --format="table(timestamp,textPayload)" `
  --project=check-in-sf `
  2>&1

if ($LASTEXITCODE -eq 0 -and $recientes) {
    Write-Host $recientes -ForegroundColor Cyan
} else {
    Write-Host "⚠ No se encontraron logs recientes de procesamiento" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[4] Verificando variables de entorno del servicio..." -ForegroundColor Yellow
$service = gcloud run services describe mfs-lead-generation-ai `
  --region=us-central1 `
  --project=check-in-sf `
  --format="json" `
  2>&1 | ConvertFrom-Json

if ($service) {
    $envVars = $service.spec.template.spec.containers[0].env
    $emailFrom = $envVars | Where-Object { $_.name -eq "EMAIL_FROM" }
    $emailTo = $envVars | Where-Object { $_.name -eq "EMAIL_TO" }
    
    if ($emailFrom -and $emailTo) {
        Write-Host "✓ Variables de email configuradas:" -ForegroundColor Green
        Write-Host "  EMAIL_FROM: $($emailFrom.value)" -ForegroundColor Gray
        Write-Host "  EMAIL_TO: $($emailTo.value)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Variables de email NO configuradas" -ForegroundColor Red
    }
} else {
    Write-Host "⚠ No se pudo obtener información del servicio" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  RESUMEN" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "Si no ves logs de 'Email enviado exitosamente', puede que:" -ForegroundColor Yellow
Write-Host "1. El email aún se está procesando" -ForegroundColor White
Write-Host "2. Hay un error en el envío (revisa los errores arriba)" -ForegroundColor White
Write-Host "3. El servicio necesita ser redesplegado con el código actualizado" -ForegroundColor White
Write-Host ""
Write-Host "Para ver todos los logs en tiempo real:" -ForegroundColor Cyan
Write-Host "gcloud logging tail 'resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mfs-lead-generation-ai\"' --project=check-in-sf" -ForegroundColor White

