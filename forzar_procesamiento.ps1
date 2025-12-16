# Script para forzar procesamiento de emails
$ErrorActionPreference = "Continue"

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host "`n=== FORZANDO PROCESAMIENTO DE EMAILS ===" -ForegroundColor Cyan

# Obtener URL del servicio
Write-Host "`n1. Obteniendo URL del servicio..." -ForegroundColor Yellow
try {
    $url = gcloud run services describe $service --region=$region --project=$project --format="value(status.url)" 2>&1 | Out-String
    $url = $url.Trim()
    
    if ($url -match "ERROR" -or $url -eq "") {
        Write-Host "✗ Error obteniendo URL del servicio" -ForegroundColor Red
        Write-Host $url -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  ✓ URL: $url" -ForegroundColor Green
} catch {
    Write-Host "✗ Error obteniendo URL:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Ejecutar force-process
Write-Host "`n2. Ejecutando procesamiento forzado..." -ForegroundColor Yellow
try {
    $result = Invoke-RestMethod -Uri "$url/force-process" -Method POST -ContentType "application/json" -ErrorAction Stop
    
    Write-Host "`n✓ Procesamiento completado:" -ForegroundColor Green
    Write-Host "  - Mensajes encontrados: $($result.totalEncontrados)" -ForegroundColor White
    Write-Host "  - Procesados exitosamente: $($result.procesados)" -ForegroundColor Green
    Write-Host "  - Fallidos: $($result.fallidos)" -ForegroundColor $(if ($result.fallidos -gt 0) { "Red" } else { "Green" })
    
    if ($result.resultados -and $result.resultados.Count -gt 0) {
        Write-Host "`nPrimeros resultados:" -ForegroundColor Cyan
        $result.resultados | ForEach-Object {
            $status = if ($_.success) { "✓" } else { "✗" }
            Write-Host "  $status $($_.id) - $($_.reason)" -ForegroundColor $(if ($_.success) { "Green" } else { "Red" })
        }
    }
} catch {
    Write-Host "`n✗ Error ejecutando procesamiento:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor White
    }
}

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

