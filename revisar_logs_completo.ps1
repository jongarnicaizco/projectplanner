# Script para revisar logs completos del servicio
Write-Host "`n=== Revisando logs del servicio mfs-lead-generation-ai ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"

# 1. Logs de errores recientes
Write-Host "`n1. Errores recientes (última hora):" -ForegroundColor Yellow
$errors = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND severity>=ERROR" --project=$project --limit=20 --format="json" --freshness=1h --order=desc 2>&1 | ConvertFrom-Json

if ($errors -and $errors.Count -gt 0) {
    Write-Host "  Errores encontrados: $($errors.Count)" -ForegroundColor Red
    $errors | Select-Object -First 10 | ForEach-Object {
        Write-Host "`n  [$($_.timestamp)] $($_.severity)" -ForegroundColor Red
        if ($_.textPayload) {
            $payload = $_.textPayload
            if ($payload.Length -gt 500) { $payload = $payload.Substring(0, 500) + "..." }
            Write-Host "  $payload" -ForegroundColor Gray
        }
        if ($_.jsonPayload -and $_.jsonPayload.message) {
            Write-Host "  $($_.jsonPayload.message)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  No se encontraron errores recientes" -ForegroundColor Green
}

# 2. Logs de procesamiento
Write-Host "`n2. Logs de procesamiento (última hora):" -ForegroundColor Yellow
$processing = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND (textPayload=~'INICIO' OR textPayload=~'FIN' OR textPayload=~'procesar' OR textPayload=~'mensaje' OR textPayload=~'Empiezo')" --project=$project --limit=30 --format="json" --freshness=1h --order=desc 2>&1 | ConvertFrom-Json

if ($processing -and $processing.Count -gt 0) {
    Write-Host "  Logs encontrados: $($processing.Count)" -ForegroundColor Green
    $processing | Select-Object -First 15 | ForEach-Object {
        $severity = $_.severity
        $color = if ($severity -eq "ERROR") { "Red" } elseif ($severity -eq "WARNING") { "Yellow" } else { "Cyan" }
        Write-Host "`n  [$($_.timestamp)] $severity" -ForegroundColor $color
        if ($_.textPayload) {
            $payload = $_.textPayload
            if ($payload.Length -gt 300) { $payload = $payload.Substring(0, 300) + "..." }
            Write-Host "  $payload" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  No se encontraron logs de procesamiento" -ForegroundColor Yellow
    Write-Host "  Esto puede indicar que:" -ForegroundColor Gray
    Write-Host "    - No hay correos nuevos para procesar" -ForegroundColor Gray
    Write-Host "    - El Cloud Scheduler no está ejecutándose" -ForegroundColor Gray
    Write-Host "    - Pub/Sub no está invocando el servicio" -ForegroundColor Gray
}

# 3. Logs de Airtable
Write-Host "`n3. Logs relacionados con Airtable (última hora):" -ForegroundColor Yellow
$airtable = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND (textPayload=~'Airtable' OR textPayload=~'airtable')" --project=$project --limit=20 --format="json" --freshness=1h --order=desc 2>&1 | ConvertFrom-Json

if ($airtable -and $airtable.Count -gt 0) {
    Write-Host "  Logs encontrados: $($airtable.Count)" -ForegroundColor Green
    $airtable | Select-Object -First 10 | ForEach-Object {
        $severity = $_.severity
        $color = if ($severity -eq "ERROR") { "Red" } elseif ($severity -eq "WARNING") { "Yellow" } else { "Green" }
        Write-Host "`n  [$($_.timestamp)] $severity" -ForegroundColor $color
        if ($_.textPayload) {
            $payload = $_.textPayload
            if ($payload.Length -gt 400) { $payload = $payload.Substring(0, 400) + "..." }
            Write-Host "  $payload" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  No se encontraron logs relacionados con Airtable" -ForegroundColor Yellow
}

# 4. Logs de Pub/Sub
Write-Host "`n4. Logs relacionados con Pub/Sub (última hora):" -ForegroundColor Yellow
$pubsub = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND (textPayload=~'_pubsub' OR textPayload=~'pubsub' OR textPayload=~'notificación')" --project=$project --limit=15 --format="json" --freshness=1h --order=desc 2>&1 | ConvertFrom-Json

if ($pubsub -and $pubsub.Count -gt 0) {
    Write-Host "  Logs encontrados: $($pubsub.Count)" -ForegroundColor Green
    $pubsub | Select-Object -First 10 | ForEach-Object {
        Write-Host "`n  [$($_.timestamp)]" -ForegroundColor Cyan
        if ($_.textPayload) {
            $payload = $_.textPayload
            if ($payload.Length -gt 300) { $payload = $payload.Substring(0, 300) + "..." }
            Write-Host "  $payload" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  No se encontraron logs relacionados con Pub/Sub" -ForegroundColor Yellow
    Write-Host "  Esto puede indicar que Pub/Sub no está invocando el servicio" -ForegroundColor Gray
}

# 5. Logs de requests 403
Write-Host "`n5. Requests con error 403 (última hora):" -ForegroundColor Yellow
$requests403 = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND httpRequest.status=403" --project=$project --limit=10 --format="json" --freshness=1h --order=desc 2>&1 | ConvertFrom-Json

if ($requests403 -and $requests403.Count -gt 0) {
    Write-Host "  Requests 403 encontrados: $($requests403.Count)" -ForegroundColor Red
    Write-Host "  Esto indica que el servicio aún no permite invocaciones no autenticadas" -ForegroundColor Red
    $requests403 | Select-Object -First 5 | ForEach-Object {
        Write-Host "  [$($_.timestamp)] $($_.httpRequest.requestUrl)" -ForegroundColor Gray
    }
} else {
    Write-Host "  No se encontraron requests 403 recientes" -ForegroundColor Green
    Write-Host "  ✓ El servicio permite invocaciones no autenticadas" -ForegroundColor Green
}

# 6. Verificar Cloud Scheduler
Write-Host "`n6. Verificando Cloud Scheduler..." -ForegroundColor Yellow
$schedulers = gcloud scheduler jobs list --project=$project --location=us-central1 --format="json" 2>&1 | ConvertFrom-Json

if ($schedulers) {
    $mfsScheduler = $schedulers | Where-Object { $_.name -like "*mfs*" }
    if ($mfsScheduler) {
        Write-Host "  Scheduler encontrado: $($mfsScheduler.name)" -ForegroundColor Green
        Write-Host "  Estado: $($mfsScheduler.state)" -ForegroundColor Gray
        Write-Host "  Schedule: $($mfsScheduler.schedule)" -ForegroundColor Gray
    } else {
        Write-Host "  No se encontró scheduler para mfs-lead-generation-ai" -ForegroundColor Yellow
    }
} else {
    Write-Host "  No se encontraron schedulers" -ForegroundColor Yellow
}

Write-Host "`n=== Fin de revisión ===" -ForegroundColor Cyan
Write-Host "`nPara ver más logs en tiempo real:" -ForegroundColor Yellow
Write-Host "  https://console.cloud.google.com/logs/query?project=$project" -ForegroundColor Cyan

