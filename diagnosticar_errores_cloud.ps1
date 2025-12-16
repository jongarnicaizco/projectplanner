# Script para diagnosticar errores en Cloud Run
$ErrorActionPreference = "Continue"

Write-Host "=== Diagnóstico de Errores en Cloud Run ===" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Estado del servicio
Write-Host "[1] Estado del servicio..." -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($serviceInfo) {
    Write-Host "  URL: $($serviceInfo.status.url)" -ForegroundColor Green
    Write-Host "  Latest Revision: $($serviceInfo.status.latestReadyRevisionName)" -ForegroundColor Green
    Write-Host "  Status: $($serviceInfo.status.conditions[0].status)" -ForegroundColor Green
} else {
    Write-Host "  ✗ No se pudo obtener información del servicio" -ForegroundColor Red
}

Write-Host ""

# 2. Errores recientes
Write-Host "[2] Errores recientes (última hora)..." -ForegroundColor Yellow
$errors = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND severity>=ERROR" `
  --limit=20 `
  --format="json" `
  --project=$project `
  --freshness=1h `
  2>&1 | ConvertFrom-Json

if ($errors -and $errors.Count -gt 0) {
    Write-Host "  Se encontraron $($errors.Count) errores:" -ForegroundColor Red
    foreach ($error in $errors | Select-Object -First 10) {
        $ts = $error.timestamp
        $text = $error.textPayload
        if (-not $text -and $error.jsonPayload) {
            $text = ($error.jsonPayload | ConvertTo-Json -Compress)
        }
        Write-Host "  [$ts] $($text.Substring(0, [Math]::Min(200, $text.Length)))" -ForegroundColor Red
    }
} else {
    Write-Host "  ✓ No se encontraron errores recientes" -ForegroundColor Green
}

Write-Host ""

# 3. Logs de Pub/Sub
Write-Host "[3] Logs de Pub/Sub (última hora)..." -ForegroundColor Yellow
$pubsubLogs = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND textPayload=~`"_pubsub`"" `
  --limit=10 `
  --format="json" `
  --project=$project `
  --freshness=1h `
  2>&1 | ConvertFrom-Json

if ($pubsubLogs -and $pubsubLogs.Count -gt 0) {
    Write-Host "  Se encontraron $($pubsubLogs.Count) logs de Pub/Sub:" -ForegroundColor Cyan
    foreach ($log in $pubsubLogs | Select-Object -First 5) {
        $ts = $log.timestamp
        $text = $log.textPayload
        if (-not $text -and $log.jsonPayload) {
            $text = ($log.jsonPayload | ConvertTo-Json -Compress)
        }
        Write-Host "  [$ts] $($text.Substring(0, [Math]::Min(150, $text.Length)))" -ForegroundColor Gray
    }
} else {
    Write-Host "  ⚠️ No se encontraron logs de Pub/Sub" -ForegroundColor Yellow
    Write-Host "  Esto puede indicar que Pub/Sub no está invocando el servicio" -ForegroundColor Gray
}

Write-Host ""

# 4. Logs de Airtable
Write-Host "[4] Logs de Airtable (última hora)..." -ForegroundColor Yellow
$airtableLogs = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND textPayload=~`"Airtable`"" `
  --limit=20 `
  --format="json" `
  --project=$project `
  --freshness=1h `
  2>&1 | ConvertFrom-Json

if ($airtableLogs -and $airtableLogs.Count -gt 0) {
    $success = $airtableLogs | Where-Object { $_.textPayload -match "Airtable.*creado|Airtable.*exitoso|Airtable.*guardado" }
    $failed = $airtableLogs | Where-Object { $_.textPayload -match "Airtable.*ERROR|Airtable.*error|Airtable.*fallo" }
    
    Write-Host "  Logs encontrados: $($airtableLogs.Count)" -ForegroundColor Cyan
    Write-Host "    Exitosos: $($success.Count)" -ForegroundColor Green
    Write-Host "    Fallidos: $($failed.Count)" -ForegroundColor $(if ($failed.Count -gt 0) { "Red" } else { "Green" })
    
    if ($failed.Count -gt 0) {
        Write-Host "  Errores de Airtable:" -ForegroundColor Red
        foreach ($log in $failed | Select-Object -First 5) {
            $ts = $log.timestamp
            $text = $log.textPayload
            Write-Host "    [$ts] $($text.Substring(0, [Math]::Min(200, $text.Length)))" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  ⚠️ No se encontraron logs de Airtable" -ForegroundColor Yellow
    Write-Host "  Esto puede indicar que no se están procesando emails" -ForegroundColor Gray
}

Write-Host ""

# 5. Logs de procesamiento de mensajes
Write-Host "[5] Logs de procesamiento de mensajes (última hora)..." -ForegroundColor Yellow
$processLogs = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND (textPayload=~`"procesando mensaje`" OR textPayload=~`"IDs que voy a procesar`" OR textPayload=~`"Delta INBOX`")" `
  --limit=10 `
  --format="json" `
  --project=$project `
  --freshness=1h `
  2>&1 | ConvertFrom-Json

if ($processLogs -and $processLogs.Count -gt 0) {
    Write-Host "  Se encontraron $($processLogs.Count) logs de procesamiento:" -ForegroundColor Cyan
    foreach ($log in $processLogs | Select-Object -First 5) {
        $ts = $log.timestamp
        $text = $log.textPayload
        if (-not $text -and $log.jsonPayload) {
            $text = ($log.jsonPayload | ConvertTo-Json -Compress)
        }
        Write-Host "  [$ts] $($text.Substring(0, [Math]::Min(150, $text.Length)))" -ForegroundColor Gray
    }
} else {
    Write-Host "  ⚠️ No se encontraron logs de procesamiento" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Resumen ===" -ForegroundColor Cyan
Write-Host "Errores encontrados: $($errors.Count)" -ForegroundColor $(if ($errors.Count -gt 0) { "Red" } else { "Green" })
Write-Host "Logs de Pub/Sub: $($pubsubLogs.Count)" -ForegroundColor $(if ($pubsubLogs.Count -gt 0) { "Green" } else { "Yellow" })
Write-Host "Logs de Airtable: $($airtableLogs.Count)" -ForegroundColor $(if ($airtableLogs.Count -gt 0) { "Green" } else { "Yellow" })
Write-Host "Logs de procesamiento: $($processLogs.Count)" -ForegroundColor $(if ($processLogs.Count -gt 0) { "Green" } else { "Yellow" })

