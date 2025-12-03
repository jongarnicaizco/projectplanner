# Script para ver logs de Airtable
$ErrorActionPreference = "Continue"

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"

Write-Host "`n=== LOGS DE AIRTABLE ===" -ForegroundColor Cyan

Write-Host "`nBuscando logs de creación de registros en Airtable..." -ForegroundColor Yellow

# Usar comillas dobles escapadas correctamente para PowerShell
$filter = "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND textPayload=~`"Registro creado en Airtable`""

$logs = gcloud logging read $filter --project=$project --limit=10 --format=json --freshness=30m 2>&1

if ($logs -match "ERROR") {
    Write-Host "  ✗ Error ejecutando comando:" -ForegroundColor Red
    Write-Host $logs -ForegroundColor Red
} else {
    try {
        $logsJson = $logs | ConvertFrom-Json
        if ($logsJson -and $logsJson.Count -gt 0) {
            Write-Host "  ✓ Se encontraron $($logsJson.Count) logs de Airtable:" -ForegroundColor Green
            Write-Host ""
            foreach ($log in $logsJson) {
                $timestamp = $log.timestamp
                $text = $log.textPayload
                Write-Host "  [$timestamp]" -ForegroundColor Gray
                Write-Host "  $text" -ForegroundColor White
                Write-Host ""
            }
        } else {
            Write-Host "  ⚠ No se encontraron logs de Airtable en los últimos 30 minutos" -ForegroundColor Yellow
            Write-Host "  Esto puede significar:" -ForegroundColor Yellow
            Write-Host "    - No se han procesado emails nuevos" -ForegroundColor White
            Write-Host "    - El código aún no está desplegado" -ForegroundColor White
            Write-Host "    - Hay un error en la creación de registros" -ForegroundColor White
        }
    } catch {
        Write-Host "  ⚠ No se pudieron parsear los logs" -ForegroundColor Yellow
        Write-Host $logs -ForegroundColor White
    }
}

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

