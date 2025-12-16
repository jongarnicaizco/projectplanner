# Script para verificar logs de envío de emails TEST
$ErrorActionPreference = "Continue"

Write-Host "`n=== VERIFICACIÓN DE LOGS DE EMAIL TEST ===" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"

Write-Host "[1] Buscando logs de 'REGISTRO NUEVO DETECTADO'..." -ForegroundColor Yellow
$filter1 = 'resource.type=cloud_run_revision AND resource.labels.service_name=' + $service + ' AND textPayload=~"REGISTRO NUEVO"'
$logs1 = gcloud logging read $filter1 --project=$project --limit=5 --format="table(timestamp,textPayload)" --freshness=1h 2>&1
if ($logs1 -match "REGISTRO NUEVO") {
    Write-Host "  ✓ Se encontraron logs de registros nuevos" -ForegroundColor Green
    $logs1 | Select-Object -First 3 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ✗ No se encontraron logs de registros nuevos" -ForegroundColor Red
}

Write-Host "`n[2] Buscando logs de 'INICIANDO ENVIO DE EMAIL TEST'..." -ForegroundColor Yellow
$filter2 = 'resource.type=cloud_run_revision AND resource.labels.service_name=' + $service + ' AND textPayload=~"INICIANDO ENVIO"'
$logs2 = gcloud logging read $filter2 --project=$project --limit=5 --format="table(timestamp,textPayload)" --freshness=1h 2>&1
if ($logs2 -match "INICIANDO ENVIO") {
    Write-Host "  ✓ Se encontraron logs de inicio de envío" -ForegroundColor Green
    $logs2 | Select-Object -First 3 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ✗ No se encontraron logs de inicio de envío" -ForegroundColor Red
}

Write-Host "`n[3] Buscando logs de 'EMAIL TEST ENVIADO EXITOSAMENTE'..." -ForegroundColor Yellow
$filter3 = 'resource.type=cloud_run_revision AND resource.labels.service_name=' + $service + ' AND textPayload=~"EMAIL TEST ENVIADO EXITOSAMENTE"'
$logs3 = gcloud logging read $filter3 --project=$project --limit=5 --format="table(timestamp,textPayload)" --freshness=1h 2>&1
if ($logs3 -match "ENVIADO EXITOSAMENTE") {
    Write-Host "  ✓ Se encontraron logs de emails enviados exitosamente" -ForegroundColor Green
    $logs3 | Select-Object -First 3 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ✗ No se encontraron logs de emails enviados exitosamente" -ForegroundColor Red
}

Write-Host "`n[4] Buscando logs de 'ERROR ENVIANDO EMAIL TEST'..." -ForegroundColor Yellow
$filter4 = 'resource.type=cloud_run_revision AND resource.labels.service_name=' + $service + ' AND textPayload=~"ERROR ENVIANDO EMAIL TEST"'
$logs4 = gcloud logging read $filter4 --project=$project --limit=5 --format="table(timestamp,textPayload)" --freshness=1h 2>&1
if ($logs4 -match "ERROR ENVIANDO") {
    Write-Host "  ✗ Se encontraron errores al enviar emails:" -ForegroundColor Red
    $logs4 | Select-Object -First 5 | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
} else {
    Write-Host "  ✓ No se encontraron errores al enviar emails" -ForegroundColor Green
}

Write-Host "`n[5] Buscando logs de 'Error verificando token OAuth'..." -ForegroundColor Yellow
$filter5 = 'resource.type=cloud_run_revision AND resource.labels.service_name=' + $service + ' AND textPayload=~"Error verificando token OAuth"'
$logs5 = gcloud logging read $filter5 --project=$project --limit=5 --format="table(timestamp,textPayload)" --freshness=1h 2>&1
if ($logs5 -match "Error verificando") {
    Write-Host "  ✗ Se encontraron errores de OAuth:" -ForegroundColor Red
    $logs5 | Select-Object -First 5 | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
} else {
    Write-Host "  ✓ No se encontraron errores de OAuth" -ForegroundColor Green
}

Write-Host "`n=== FIN DE VERIFICACIÓN ===" -ForegroundColor Cyan

