# Script para verificar el estado del build más reciente
$ErrorActionPreference = "Continue"

$project = "check-in-sf"

Write-Host "`n=== Verificando estado del build ===" -ForegroundColor Cyan

# Obtener el build más reciente
Write-Host "`nBuscando el build más reciente..." -ForegroundColor Yellow
$builds = gcloud builds list --project=$project --limit=1 --format=json 2>&1 | ConvertFrom-Json

if ($builds -and $builds.Count -gt 0) {
    $latestBuild = $builds[0]
    
    Write-Host "`n✓ Build encontrado:" -ForegroundColor Green
    Write-Host "  ID: $($latestBuild.id)" -ForegroundColor White
    Write-Host "  Estado: $($latestBuild.status)" -ForegroundColor $(if ($latestBuild.status -eq "SUCCESS") { "Green" } elseif ($latestBuild.status -eq "FAILURE") { "Red" } else { "Yellow" })
    Write-Host "  Creado: $($latestBuild.createTime)" -ForegroundColor White
    Write-Host "  Duración: $($latestBuild.duration)" -ForegroundColor White
    
    if ($latestBuild.logUrl) {
        Write-Host "`n  URL del log: $($latestBuild.logUrl)" -ForegroundColor Cyan
    }
    
    # Mostrar detalles según el estado
    if ($latestBuild.status -eq "WORKING" -or $latestBuild.status -eq "QUEUED") {
        Write-Host "`n⏳ Build en progreso..." -ForegroundColor Yellow
        Write-Host "  Puedes ver el progreso en: $($latestBuild.logUrl)" -ForegroundColor Gray
    } elseif ($latestBuild.status -eq "SUCCESS") {
        Write-Host "`n✓ Build completado exitosamente!" -ForegroundColor Green
        Write-Host "  El código nuevo debería estar desplegado en Cloud Run" -ForegroundColor Gray
        
        # Verificar la revisión más reciente de Cloud Run
        Write-Host "`nVerificando revisión de Cloud Run..." -ForegroundColor Yellow
        $service = gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=$project --format=json 2>&1 | ConvertFrom-Json
        if ($service) {
            $latestRevision = $service.status.latestReadyRevisionName
            Write-Host "  Última revisión lista: $latestRevision" -ForegroundColor White
            Write-Host "  URL: $($service.status.url)" -ForegroundColor Cyan
        }
    } elseif ($latestBuild.status -eq "FAILURE") {
        Write-Host "`n✗ Build falló!" -ForegroundColor Red
        Write-Host "  Revisa los logs en: $($latestBuild.logUrl)" -ForegroundColor Yellow
        if ($latestBuild.failureInfo) {
            Write-Host "  Error: $($latestBuild.failureInfo.message)" -ForegroundColor Red
        }
    } else {
        Write-Host "`nEstado: $($latestBuild.status)" -ForegroundColor Yellow
    }
    
    # Mostrar pasos del build
    if ($latestBuild.steps) {
        Write-Host "`nPasos del build:" -ForegroundColor Yellow
        foreach ($step in $latestBuild.steps) {
            $status = $step.status
            $color = if ($status -eq "SUCCESS") { "Green" } elseif ($status -eq "FAILURE") { "Red" } else { "Yellow" }
            Write-Host "  - $($step.id): $status" -ForegroundColor $color
        }
    }
    
} else {
    Write-Host "`n✗ No se encontraron builds recientes" -ForegroundColor Red
}

Write-Host "`n=== Fin de verificación ===" -ForegroundColor Cyan

