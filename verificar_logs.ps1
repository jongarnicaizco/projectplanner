# Script para verificar logs del servicio
$ErrorActionPreference = "Continue"

$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"

Write-Host ""
Write-Host "=== Verificando logs del servicio ===" -ForegroundColor Cyan
Write-Host ""

# 1. Logs recientes de procesamiento
Write-Host "1. Logs de procesamiento (última hora)..." -ForegroundColor Yellow
$logs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$serviceName" --project=$projectId --limit=20 --format="value(textPayload,timestamp)" --freshness=1h 2>&1
if ($logs) {
    $processingLogs = $logs | Select-String -Pattern "Airtable|procesando|processing|Registro creado" -CaseSensitive:$false
    if ($processingLogs) {
        Write-Host "   Logs encontrados:" -ForegroundColor Green
        $processingLogs | Select-Object -First 10 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    } else {
        Write-Host "   No se encontraron logs de procesamiento" -ForegroundColor Yellow
    }
} else {
    Write-Host "   No hay logs recientes" -ForegroundColor Yellow
}

# 2. Errores recientes
Write-Host "`n2. Errores recientes (última hora)..." -ForegroundColor Yellow
$errorLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$serviceName AND severity>=ERROR" --project=$projectId --limit=10 --format="value(textPayload,timestamp)" --freshness=1h 2>&1
if ($errorLogs) {
    Write-Host "   Errores encontrados:" -ForegroundColor Red
    $errorLogs | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
} else {
    Write-Host "   No se encontraron errores" -ForegroundColor Green
}

# 3. Logs de Airtable específicamente
Write-Host "`n3. Logs de Airtable (última hora)..." -ForegroundColor Yellow
$airtableLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$serviceName" --project=$projectId --limit=50 --format="value(textPayload,timestamp)" --freshness=1h 2>&1 | Select-String -Pattern "Airtable" -CaseSensitive:$false
if ($airtableLogs) {
    Write-Host "   Logs de Airtable encontrados:" -ForegroundColor Green
    $airtableLogs | Select-Object -First 10 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} else {
    Write-Host "   No se encontraron logs de Airtable" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Verificación completada ===" -ForegroundColor Cyan
Write-Host ""

