# Script para resetear y redesplegar el servicio
$ErrorActionPreference = "Stop"

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host "`n=== RESETEAR Y REDESPLEGAR SERVICIO ===" -ForegroundColor Cyan

# 1. Obtener URL del servicio
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

# 2. Resetear historyId
Write-Host "`n2. Reseteando historyId..." -ForegroundColor Yellow
try {
    $resetResult = Invoke-RestMethod -Uri "$url/reset" -Method POST -ContentType "application/json" -ErrorAction Stop
    Write-Host "  ✓ HistoryId reseteado:" -ForegroundColor Green
    Write-Host "    - Nuevo historyId: $($resetResult.historyId)" -ForegroundColor White
} catch {
    Write-Host "  ⚠ No se pudo resetear (puede ser normal si el servicio está iniciando):" -ForegroundColor Yellow
    Write-Host "    $($_.Exception.Message)" -ForegroundColor Gray
}

# 3. Forzar procesamiento inicial
Write-Host "`n3. Forzando procesamiento inicial de emails..." -ForegroundColor Yellow
try {
    $processResult = Invoke-RestMethod -Uri "$url/force-process" -Method POST -ContentType "application/json" -ErrorAction Stop
    
    Write-Host "  ✓ Procesamiento completado:" -ForegroundColor Green
    Write-Host "    - Mensajes encontrados: $($processResult.totalEncontrados)" -ForegroundColor White
    Write-Host "    - Procesados exitosamente: $($processResult.procesados)" -ForegroundColor Green
    Write-Host "    - Fallidos: $($processResult.fallidos)" -ForegroundColor $(if ($processResult.fallidos -gt 0) { "Red" } else { "Green" })
} catch {
    Write-Host "  ⚠ No se pudo procesar (puede ser normal si no hay emails nuevos):" -ForegroundColor Yellow
    Write-Host "    $($_.Exception.Message)" -ForegroundColor Gray
}

# 4. Verificar estado del servicio
Write-Host "`n4. Verificando estado del servicio..." -ForegroundColor Yellow
try {
    $serviceInfo = gcloud run services describe $service --region=$region --project=$project --format=json 2>&1 | ConvertFrom-Json
    $latestRevision = $serviceInfo.status.latestReadyRevisionName
    $serviceUrl = $serviceInfo.status.url
    
    Write-Host "  ✓ Servicio activo:" -ForegroundColor Green
    Write-Host "    - URL: $serviceUrl" -ForegroundColor White
    Write-Host "    - Última revisión: $latestRevision" -ForegroundColor White
    Write-Host "    - Estado: $($serviceInfo.status.conditions[0].status)" -ForegroundColor White
} catch {
    Write-Host "  ⚠ No se pudo verificar estado del servicio" -ForegroundColor Yellow
}

Write-Host "`n=== RESET Y DESPLIEGUE COMPLETADO ===" -ForegroundColor Green
Write-Host "`nEl servicio debería estar procesando emails automáticamente ahora." -ForegroundColor Cyan
Write-Host "Si no procesa emails, espera 2-3 minutos y ejecuta:" -ForegroundColor Yellow
Write-Host "  .\forzar_procesamiento.ps1" -ForegroundColor White

