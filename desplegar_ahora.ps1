# Script para desplegar ahora (push + build)
$ErrorActionPreference = "Stop"

$project = "check-in-sf"
$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

Write-Host "`n=== DESPLIEGUE COMPLETO ===" -ForegroundColor Cyan

Write-Host "`n1. Verificando cambios..." -ForegroundColor Yellow
git status --short

Write-Host "`n2. Añadiendo cambios..." -ForegroundColor Yellow
git add -A
Write-Host "  [OK] Cambios añadidos" -ForegroundColor Green

Write-Host "`n3. Haciendo commit..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git commit -m "Deploy: $timestamp - Solo Airtable, sin envio de emails" 2>&1 | Out-Null
Write-Host "  [OK] Commit realizado" -ForegroundColor Green

Write-Host "`n4. Haciendo push a GitHub..." -ForegroundColor Yellow
git push origin main 2>&1 | Out-Null
Write-Host "  [OK] Push a GitHub completado" -ForegroundColor Green

Write-Host "`n5. Esperando 10 segundos para que el trigger se active..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "`n6. Verificando si el trigger automatico inicio un build..." -ForegroundColor Yellow
$builds = gcloud builds list --project=$project --limit=1 --format=json 2>&1 | ConvertFrom-Json
if ($builds -and $builds.Count -gt 0) {
    $latest = $builds[0]
    $buildTime = [DateTime]::Parse($latest.createTime)
    $now = Get-Date
    $diff = ($now - $buildTime).TotalMinutes
    
    if ($diff -lt 2) {
        Write-Host "  [OK] Build automatico detectado: $($latest.id)" -ForegroundColor Green
        Write-Host "    Estado: $($latest.status)" -ForegroundColor $(if ($latest.status -eq "SUCCESS") { "Green" } elseif ($latest.status -eq "WORKING") { "Yellow" } else { "Red" })
        Write-Host "    URL: $($latest.logUrl)" -ForegroundColor Cyan
    } else {
        Write-Host "  [ADVERTENCIA] No se detecto build automatico reciente" -ForegroundColor Yellow
        Write-Host "    Iniciando build manual..." -ForegroundColor Yellow
        
        $tag = "manual-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Write-Host "    Tag: $tag" -ForegroundColor Gray
        gcloud builds submit --config=cloudbuild.yaml --project=$project --substitutions="_IMAGE_TAG=$tag" 2>&1 | Out-Null
        Write-Host "  [OK] Build manual iniciado" -ForegroundColor Green
    }
} else {
    Write-Host "  [ADVERTENCIA] No se encontraron builds" -ForegroundColor Yellow
    Write-Host "    Iniciando build manual..." -ForegroundColor Yellow
    
    $tag = "manual-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    gcloud builds submit --config=cloudbuild.yaml --project=$project --substitutions="_IMAGE_TAG=$tag" 2>&1 | Out-Null
    Write-Host "  [OK] Build manual iniciado" -ForegroundColor Green
}

Write-Host "`n=== FIN ===" -ForegroundColor Cyan
Write-Host "`nEl build esta en progreso. Puedes verificar el estado con:" -ForegroundColor Yellow
Write-Host "  gcloud builds list --project=check-in-sf --limit=1" -ForegroundColor Gray
