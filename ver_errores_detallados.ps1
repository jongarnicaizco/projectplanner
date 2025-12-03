# Script para ver errores detallados
Write-Host "=== Obteniendo Errores Detallados ===" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"

# Obtener errores en formato JSON para ver todos los detalles
Write-Host "[1] Obteniendo errores recientes (formato JSON)..." -ForegroundColor Yellow
$errors = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND severity>=ERROR" `
  --limit=5 `
  --format="json" `
  --project=$project `
  --freshness=2h `
  2>&1 | ConvertFrom-Json

if ($errors -and $errors.Count -gt 0) {
    Write-Host "  Se encontraron $($errors.Count) errores:" -ForegroundColor Red
    Write-Host ""
    foreach ($error in $errors) {
        Write-Host "  [$($error.timestamp)]" -ForegroundColor Gray
        Write-Host "  Severity: $($error.severity)" -ForegroundColor Red
        
        # Intentar obtener el mensaje de error
        $text = $error.textPayload
        if (-not $text -and $error.jsonPayload) {
            $text = ($error.jsonPayload | ConvertTo-Json -Compress)
        }
        
        if ($text) {
            Write-Host "  Mensaje: $($text.Substring(0, [Math]::Min(300, $text.Length)))" -ForegroundColor White
        } else {
            Write-Host "  (Sin mensaje de texto)" -ForegroundColor Yellow
            if ($error.jsonPayload) {
                Write-Host "  JSON Payload:" -ForegroundColor Cyan
                $error.jsonPayload | ConvertTo-Json -Depth 5 | Write-Host
            }
        }
        Write-Host ""
    }
} else {
    Write-Host "  ✓ No se encontraron errores recientes" -ForegroundColor Green
}

Write-Host ""

# Obtener logs de Pub/Sub (usando sintaxis correcta para PowerShell)
Write-Host "[2] Obteniendo logs de Pub/Sub..." -ForegroundColor Yellow
$pubsubLogs = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND textPayload:`"_pubsub`"" `
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
}

Write-Host ""

# Obtener logs de Airtable
Write-Host "[3] Obteniendo logs de Airtable..." -ForegroundColor Yellow
$airtableLogs = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND textPayload:`"Airtable`"" `
  --limit=20 `
  --format="json" `
  --project=$project `
  --freshness=1h `
  2>&1 | ConvertFrom-Json

if ($airtableLogs -and $airtableLogs.Count -gt 0) {
    Write-Host "  Se encontraron $($airtableLogs.Count) logs de Airtable:" -ForegroundColor Cyan
    $success = $airtableLogs | Where-Object { $_.textPayload -match "creado|exitoso|guardado" }
    $failed = $airtableLogs | Where-Object { $_.textPayload -match "ERROR|error|fallo" }
    Write-Host "    Exitosos: $($success.Count)" -ForegroundColor Green
    Write-Host "    Fallidos: $($failed.Count)" -ForegroundColor $(if ($failed.Count -gt 0) { "Red" } else { "Green" })
    
    if ($failed.Count -gt 0) {
        Write-Host "  Errores:" -ForegroundColor Red
        foreach ($log in $failed | Select-Object -First 3) {
            $ts = $log.timestamp
            $text = $log.textPayload
            Write-Host "    [$ts] $($text.Substring(0, [Math]::Min(200, $text.Length)))" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  ⚠️ No se encontraron logs de Airtable" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Diagnóstico completado ===" -ForegroundColor Cyan

