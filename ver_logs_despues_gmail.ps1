# Ver logs después de "Creando cliente de Gmail"
$ErrorActionPreference = "Continue"

Write-Host "Buscando logs después de 'Creando cliente de Gmail'..." -ForegroundColor Cyan
Write-Host ""

# Buscar logs recientes que mencionen el email que se está procesando
$logs = gcloud logging read `
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND timestamp>="2025-12-02T21:50:00Z"' `
  --limit=50 `
  --format="json" `
  --project=check-in-sf `
  2>&1 | ConvertFrom-Json

if ($logs) {
    Write-Host "Logs encontrados desde 21:50:00" -ForegroundColor Green
    Write-Host ""
    
    # Filtrar logs relevantes
    $relevantLogs = $logs | Where-Object {
        $text = $_.textPayload -or ($_.jsonPayload | ConvertTo-Json -Compress)
        $text -match "Email|email|sendLeadEmail|valeriafranchiprensa|Jorge Troyano"
    }
    
    foreach ($log in $relevantLogs) {
        $timestamp = $log.timestamp
        $text = $log.textPayload
        if (-not $text) {
            $text = ($log.jsonPayload | ConvertTo-Json -Compress)
        }
        
        Write-Host "[$timestamp]" -ForegroundColor Gray
        Write-Host $text -ForegroundColor White
        Write-Host ""
    }
} else {
    Write-Host "No se encontraron logs recientes" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Para ver logs en tiempo real, ejecuta:" -ForegroundColor Cyan
Write-Host "gcloud logging tail 'resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mfs-lead-generation-ai\"' --project=check-in-sf" -ForegroundColor White

