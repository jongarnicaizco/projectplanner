# Script para configurar Cloud Scheduler que ejecute el fallback cada 15 minutos
# Este script configura un job que procesa correos sin etiqueta "processed"

$PROJECT_ID = "check-in-sf"
$JOB_NAME = "mfs-process-unprocessed-15min"
$SERVICE_URL = "https://mfs-lead-generation-ai-vtlrnibdxq-uc.a.run.app"
$SCHEDULE = "*/15 * * * *"  # Cada 15 minutos
$TIMEZONE = "Europe/Madrid"

Write-Host "Configurando Cloud Scheduler para procesar correos sin 'processed' cada 15 minutos..." -ForegroundColor Cyan

# Verificar si el job ya existe
$existingJob = gcloud scheduler jobs describe $JOB_NAME --project=$PROJECT_ID --location=us-central1 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "El job ya existe. Eliminándolo para recrearlo..." -ForegroundColor Yellow
    gcloud scheduler jobs delete $JOB_NAME --project=$PROJECT_ID --location=us-central1 --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error eliminando job existente" -ForegroundColor Red
        exit 1
    }
}

# Crear el job
Write-Host "Creando nuevo job de Cloud Scheduler..." -ForegroundColor Green

gcloud scheduler jobs create http $JOB_NAME `
    --project=$PROJECT_ID `
    --location=us-central1 `
    --schedule="$SCHEDULE" `
    --time-zone="$TIMEZONE" `
    --uri="$SERVICE_URL/control/process-unprocessed" `
    --http-method=POST `
    --headers="Content-Type=application/json" `
    --message-body="{}" `
    --description="Procesa correos sin etiqueta 'processed' cada 15 minutos (fallback automático)"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Job de Cloud Scheduler creado exitosamente" -ForegroundColor Green
    Write-Host "  - Nombre: $JOB_NAME" -ForegroundColor Cyan
    Write-Host "  - Frecuencia: Cada 15 minutos" -ForegroundColor Cyan
    Write-Host "  - Endpoint: $SERVICE_URL/control/process-unprocessed" -ForegroundColor Cyan
    Write-Host "  - Zona horaria: $TIMEZONE" -ForegroundColor Cyan
} else {
    Write-Host "✗ Error creando job de Cloud Scheduler" -ForegroundColor Red
    exit 1
}

Write-Host "`nPara verificar el job:" -ForegroundColor Yellow
Write-Host "  gcloud scheduler jobs describe $JOB_NAME --project=$PROJECT_ID --location=us-central1" -ForegroundColor Gray

Write-Host "`nPara ejecutar el job manualmente:" -ForegroundColor Yellow
Write-Host "  gcloud scheduler jobs run $JOB_NAME --project=$PROJECT_ID --location=us-central1" -ForegroundColor Gray

Write-Host "`nPara eliminar el job:" -ForegroundColor Yellow
Write-Host "  gcloud scheduler jobs delete $JOB_NAME --project=$PROJECT_ID --location=us-central1" -ForegroundColor Gray

