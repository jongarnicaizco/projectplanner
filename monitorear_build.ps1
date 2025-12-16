# Script para monitorear el build en tiempo real
$ErrorActionPreference = "Continue"

$project = "check-in-sf"

Write-Host "`n=== MONITOREO DE BUILD ===" -ForegroundColor Cyan

Write-Host "`nBuscando el build más reciente..." -ForegroundColor Yellow
$builds = gcloud builds list --project=$project --limit=1 --format=json 2>&1 | ConvertFrom-Json

if ($builds -and $builds.Count -gt 0) {
    $latestBuild = $builds[0]
    
    Write-Host "`n✓ Build encontrado:" -ForegroundColor Green
    Write-Host "  ID: $($latestBuild.id)" -ForegroundColor White
    Write-Host "  Estado: $($latestBuild.status)" -ForegroundColor $(if ($latestBuild.status -eq "SUCCESS") { "Green" } elseif ($latestBuild.status -eq "FAILURE") { "Red" } elseif ($latestBuild.status -eq "WORKING") { "Yellow" } else { "White" })
    Write-Host "  Creado: $($latestBuild.createTime)" -ForegroundColor White
    
    if ($latestBuild.logUrl) {
        Write-Host "`n  URL del log: $($latestBuild.logUrl)" -ForegroundColor Cyan
    }
    
    if ($latestBuild.status -eq "WORKING" -or $latestBuild.status -eq "QUEUED") {
        Write-Host "`n⏳ Build en progreso..." -ForegroundColor Yellow
        Write-Host "  Puedes ver el progreso en: $($latestBuild.logUrl)" -ForegroundColor Gray
        Write-Host "`n  Para monitorear en tiempo real, ejecuta:" -ForegroundColor Yellow
        Write-Host "    gcloud builds log $($latestBuild.id) --project=$project --stream" -ForegroundColor Gray
    } elseif ($latestBuild.status -eq "SUCCESS") {
        Write-Host "`n✓ Build completado exitosamente!" -ForegroundColor Green
        Write-Host "  El código nuevo debería estar desplegado en Cloud Run" -ForegroundColor Gray
    } elseif ($latestBuild.status -eq "FAILURE") {
        Write-Host "`n✗ Build falló!" -ForegroundColor Red
        Write-Host "  Revisa los logs en: $($latestBuild.logUrl)" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n✗ No se encontraron builds" -ForegroundColor Red
}

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

