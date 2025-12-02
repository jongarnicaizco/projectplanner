# Script para ver logs en tiempo real (últimos 10 minutos)
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  LOGS EN TIEMPO REAL (últimos 10 minutos)" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

Write-Host "Obteniendo logs recientes..." -ForegroundColor Yellow
Write-Host ""

$logs = gcloud logging read `
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai"' `
  --limit=50 `
  --format="json" `
  --project=check-in-sf `
  --freshness=10m `
  2>&1 | ConvertFrom-Json

if ($logs -and $logs.Count -gt 0) {
    Write-Host "✓ Se encontraron $($logs.Count) logs recientes" -ForegroundColor Green
    Write-Host ""
    
    # Ordenar por timestamp (más recientes primero)
    $logs = $logs | Sort-Object -Property timestamp -Descending
    
    # Mostrar logs relevantes
    foreach ($log in $logs) {
        $timestamp = $log.timestamp
        $text = $log.textPayload
        
        if (-not $text) {
            # Intentar obtener de jsonPayload
            $jsonPayload = $log.jsonPayload
            if ($jsonPayload) {
                $text = $jsonPayload.message -or ($jsonPayload | ConvertTo-Json -Compress)
            }
        }
        
        if ($text) {
            # Filtrar solo logs relevantes
            if ($text -match "Email|email|sendLeadEmail|ERROR|Error|valeriafranchiprensa|Jorge Troyano|DATOS PARA ENVIAR|Creando cliente de Gmail") {
                Write-Host "[$timestamp]" -ForegroundColor Gray
                
                # Colorear según el tipo de log
                if ($text -match "ERROR|Error|error") {
                    Write-Host $text -ForegroundColor Red
                } elseif ($text -match "Email.*enviado exitosamente|✓") {
                    Write-Host $text -ForegroundColor Green
                } elseif ($text -match "DATOS PARA ENVIAR|Creando cliente") {
                    Write-Host $text -ForegroundColor Cyan
                } else {
                    Write-Host $text -ForegroundColor White
                }
                Write-Host ""
            }
        }
    }
    
    Write-Host ""
    Write-Host "=" * 70 -ForegroundColor Cyan
    Write-Host "  RESUMEN" -ForegroundColor Cyan
    Write-Host "=" * 70 -ForegroundColor Cyan
    Write-Host ""
    
    # Contar envíos exitosos
    $exitosos = $logs | Where-Object {
        $text = $_.textPayload -or ($_.jsonPayload | ConvertTo-Json -Compress)
        $text -match "Email.*enviado exitosamente"
    }
    
    # Contar errores
    $errores = $logs | Where-Object {
        $text = $_.textPayload -or ($_.jsonPayload | ConvertTo-Json -Compress)
        $text -match "ERROR enviando email|Error.*email"
    }
    
    Write-Host "Envíos exitosos: $($exitosos.Count)" -ForegroundColor $(if ($exitosos.Count -gt 0) { "Green" } else { "Yellow" })
    Write-Host "Errores de envío: $($errores.Count)" -ForegroundColor $(if ($errores.Count -eq 0) { "Green" } else { "Red" })
    
} else {
    Write-Host "⚠ No se encontraron logs recientes" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Esto puede significar:" -ForegroundColor Cyan
    Write-Host "1. El servicio no ha procesado emails en los últimos 10 minutos" -ForegroundColor White
    Write-Host "2. Hay un problema con la consulta de logs" -ForegroundColor White
}

Write-Host ""
Write-Host "Para actualizar los logs, ejecuta este script de nuevo" -ForegroundColor Cyan
Write-Host "O usa el comando:" -ForegroundColor Cyan
Write-Host 'gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mfs-lead-generation-ai\"" --limit=50 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=10m' -ForegroundColor White

