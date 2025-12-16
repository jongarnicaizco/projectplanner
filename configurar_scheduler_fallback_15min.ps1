# Script para configurar Cloud Scheduler que ejecuta el fallback cada 15 minutos
# Este script configura un job que llama al endpoint /control/process-unprocessed cada 15 minutos

$PROJECT_ID = "mfs-lead-generation-ai"
$JOB_NAME = "mfs-fallback-process-unprocessed-15min"
$REGION = "us-central1"
$SERVICE_URL = "https://mfs-lead-generation-ai-vtlrnibdxq-uc.a.run.app"
$SCHEDULE = "*/15 * * * *"  # Cada 15 minutos
$TIMEZONE = "UTC"

Write-Host "Configurando Cloud Scheduler para fallback cada 15 minutos..." -ForegroundColor Cyan
Write-Host "Project ID: $PROJECT_ID" -ForegroundColor Yellow
Write-Host "Job Name: $JOB_NAME" -ForegroundColor Yellow
Write-Host "Schedule: $SCHEDULE (cada 15 minutos)" -ForegroundColor Yellow
Write-Host "Endpoint: $SERVICE_URL/control/process-unprocessed" -ForegroundColor Yellow
Write-Host ""

# Verificar si el job ya existe
Write-Host "Verificando si el job ya existe..." -ForegroundColor Cyan
$existingJob = gcloud scheduler jobs describe $JOB_NAME --project=$PROJECT_ID --location=$REGION 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "El job ya existe. Eliminándolo para recrearlo..." -ForegroundColor Yellow
    gcloud scheduler jobs delete $JOB_NAME --project=$PROJECT_ID --location=$REGION --quiet
    Write-Host "Job eliminado." -ForegroundColor Green
}

# Crear el job
Write-Host "Creando nuevo job de Cloud Scheduler..." -ForegroundColor Cyan
gcloud scheduler jobs create http $JOB_NAME `
    --project=$PROJECT_ID `
    --location=$REGION `
    --schedule="$SCHEDULE" `
    --uri="$SERVICE_URL/control/process-unprocessed" `
    --http-method=POST `
    --time-zone="$TIMEZONE" `
    --description="Fallback automático cada 15 minutos para procesar correos sin etiqueta 'processed' de los últimos 20 minutos" `
    --headers="Content-Type=application/json"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Job de Cloud Scheduler creado exitosamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Detalles del job:" -ForegroundColor Cyan
    Write-Host "  - Nombre: $JOB_NAME" -ForegroundColor White
    Write-Host "  - Frecuencia: Cada 15 minutos" -ForegroundColor White
    Write-Host "  - Endpoint: $SERVICE_URL/control/process-unprocessed" -ForegroundColor White
    Write-Host "  - Método: POST" -ForegroundColor White
    Write-Host "  - Zona horaria: $TIMEZONE" -ForegroundColor White
    Write-Host ""
    Write-Host "El job procesará automáticamente correos sin etiqueta 'processed' de los últimos 20 minutos." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Para verificar el estado del job:" -ForegroundColor Cyan
    Write-Host "  gcloud scheduler jobs describe $JOB_NAME --project=$PROJECT_ID --location=$REGION" -ForegroundColor White
    Write-Host ""
    Write-Host "Para ejecutar el job manualmente:" -ForegroundColor Cyan
    Write-Host "  gcloud scheduler jobs run $JOB_NAME --project=$PROJECT_ID --location=$REGION" -ForegroundColor White
    Write-Host ""
    Write-Host "Para ver los logs del job:" -ForegroundColor Cyan
    Write-Host "  gcloud scheduler jobs describe $JOB_NAME --project=$PROJECT_ID --location=$REGION" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "✗ Error al crear el job de Cloud Scheduler" -ForegroundColor Red
    Write-Host "Verifica que tengas los permisos necesarios y que el proyecto sea correcto." -ForegroundColor Yellow
    exit 1
}

