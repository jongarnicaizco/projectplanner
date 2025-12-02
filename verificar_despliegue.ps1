# Script para verificar el despliegue en Google Cloud
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  VERIFICACIÓN DE DESPLIEGUE" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# 1. Verificar push a GitHub
Write-Host "[1] Verificando push a GitHub..." -ForegroundColor Yellow
git fetch origin 2>&1 | Out-Null
$localCommit = git log --oneline -1 2>&1
$remoteCommit = git log origin/main --oneline -1 2>&1

Write-Host "Commit local:  $localCommit" -ForegroundColor Cyan
Write-Host "Commit remoto: $remoteCommit" -ForegroundColor Cyan

if ($localCommit -eq $remoteCommit) {
    Write-Host "✓ Push completado" -ForegroundColor Green
} else {
    Write-Host "⚠ Push pendiente - Los commits no coinciden" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Ejecuta primero: git push origin main" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 2. Verificar Cloud Build
Write-Host "[2] Verificando builds de Cloud Build..." -ForegroundColor Yellow
$builds = gcloud builds list --limit=5 --format="table(id,status,createTime,source.repoSource.commitSha)" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host $builds
    Write-Host ""
    Write-Host "Buscando build más reciente..." -ForegroundColor Cyan
    
    $latestBuild = gcloud builds list --limit=1 --format="json" 2>&1 | ConvertFrom-Json
    if ($latestBuild) {
        Write-Host "Estado del build más reciente: $($latestBuild[0].status)" -ForegroundColor Cyan
        Write-Host "Commit: $($latestBuild[0].source.repoSource.commitSha)" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠ Error obteniendo builds: $builds" -ForegroundColor Yellow
}

Write-Host ""

# 3. Verificar estado del servicio Cloud Run
Write-Host "[3] Verificando estado del servicio Cloud Run..." -ForegroundColor Yellow
$service = gcloud run services describe mfs-lead-generation-ai --region=europe-west1 --format="json" 2>&1 | ConvertFrom-Json

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Servicio encontrado" -ForegroundColor Green
    Write-Host "  URL: $($service.status.url)" -ForegroundColor Cyan
    Write-Host "  Estado: $($service.status.conditions[0].status)" -ForegroundColor Cyan
    Write-Host "  Revisión: $($service.status.latestReadyRevisionName)" -ForegroundColor Gray
    Write-Host "  Imagen: $($service.spec.template.spec.containers[0].image)" -ForegroundColor Gray
} else {
    Write-Host "⚠ Error obteniendo información del servicio" -ForegroundColor Yellow
}

Write-Host ""

# 4. Verificar variables de entorno
Write-Host "[4] Verificando variables de entorno..." -ForegroundColor Yellow
$envVars = gcloud run services describe mfs-lead-generation-ai --region=europe-west1 --format="value(spec.template.spec.containers[0].env)" 2>&1

if ($envVars) {
    Write-Host "Variables de entorno configuradas:" -ForegroundColor Cyan
    $envVars | ForEach-Object {
        if ($_ -match "EMAIL_FROM|EMAIL_TO") {
            Write-Host "  ✓ $_" -ForegroundColor Green
        } elseif ($_ -match "AIRTABLE") {
            Write-Host "  ✗ $_ (debe ser eliminada)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "⚠ No se pudieron obtener las variables de entorno" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  RESUMEN" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "Si Cloud Build detectó el push, debería estar desplegando automáticamente." -ForegroundColor Cyan
Write-Host "Puedes ver el progreso en:" -ForegroundColor Cyan
Write-Host "https://console.cloud.google.com/cloud-build/builds?project=$(gcloud config get-value project)" -ForegroundColor White
Write-Host ""
