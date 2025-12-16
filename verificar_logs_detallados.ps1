# Script para verificar logs detallados después de la comparación de historyId
$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$timestamp = "2025-12-02T23:13:00Z"

Write-Host "Buscando logs desde $timestamp..." -ForegroundColor Cyan
Write-Host ""

# Obtener logs en formato JSON
$logs = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND timestamp>=`"$timestamp`"" `
  --limit=200 `
  --format="json" `
  --project=$project `
  2>&1

if ($logs) {
    $jsonLogs = $logs | ConvertFrom-Json
    
    Write-Host "Total de logs encontrados: $($jsonLogs.Count)" -ForegroundColor Green
    Write-Host ""
    
    # Filtrar logs relevantes
    $relevantLogs = $jsonLogs | Where-Object {
        $text = $_.textPayload
        if (-not $text -and $_.jsonPayload) {
            $text = ($_.jsonPayload | ConvertTo-Json -Compress)
        }
        if ($text) {
            $text -match "history|Delta|nuevosMensajes|IDs que voy|procesando|Airtable|ERROR|Error|Pidiendo delta|Comparando historyId"
        }
    }
    
    Write-Host "Logs relevantes encontrados: $($relevantLogs.Count)" -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($log in $relevantLogs) {
        $ts = $log.timestamp
        $text = $log.textPayload
        if (-not $text -and $log.jsonPayload) {
            $text = ($log.jsonPayload | ConvertTo-Json -Compress)
        }
        
        if ($text) {
            $color = "White"
            if ($text -match "ERROR|Error") { $color = "Red" }
            elseif ($text -match "Delta|nuevosMensajes|IDs que voy") { $color = "Green" }
            elseif ($text -match "history|Comparando") { $color = "Cyan" }
            
            Write-Host "[$ts]" -ForegroundColor Gray -NoNewline
            Write-Host " $text" -ForegroundColor $color
        }
    }
    
    # Verificar si hay mensajes detectados
    $deltaLogs = $relevantLogs | Where-Object {
        $text = $_.textPayload
        if (-not $text -and $_.jsonPayload) { $text = ($_.jsonPayload | ConvertTo-Json -Compress) }
        $text -match "Delta INBOX|nuevosMensajes"
    }
    
    if ($deltaLogs) {
        Write-Host ""
        Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
        foreach ($log in $deltaLogs) {
            $text = $log.textPayload
            if (-not $text -and $log.jsonPayload) { $text = ($log.jsonPayload | ConvertTo-Json -Compress) }
            Write-Host $text -ForegroundColor Green
        }
    } else {
        Write-Host ""
        Write-Host "=== ADVERTENCIA ===" -ForegroundColor Yellow
        Write-Host "No se encontraron logs de 'Delta INBOX' o 'nuevosMensajes'" -ForegroundColor Yellow
        Write-Host "Esto podría indicar que:" -ForegroundColor Yellow
        Write-Host "  1. No hay mensajes nuevos" -ForegroundColor Gray
        Write-Host "  2. El historyId está desincronizado" -ForegroundColor Gray
        Write-Host "  3. Hay un error silencioso en history.list" -ForegroundColor Gray
    }
} else {
    Write-Host "No se encontraron logs" -ForegroundColor Red
}

