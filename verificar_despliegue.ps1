# Script para verificar que el despliegue está configurado correctamente desde GitHub
Write-Host "`n=== Verificando configuración de despliegue ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"

# 1. Verificar repositorio Git
Write-Host "`n1. Verificando repositorio Git..." -ForegroundColor Yellow
$remoteUrl = git remote get-url origin 2>&1
if ($remoteUrl -match "github") {
    Write-Host "  ✓ Repositorio remoto: $remoteUrl" -ForegroundColor Green
} else {
    Write-Host "  ✗ Repositorio remoto no es GitHub: $remoteUrl" -ForegroundColor Red
}

# 2. Verificar últimos commits
Write-Host "`n2. Últimos commits:" -ForegroundColor Yellow
$commits = git log --oneline -5 2>&1
$commits | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

# 3. Verificar si hay cambios sin commitear
Write-Host "`n3. Verificando cambios pendientes..." -ForegroundColor Yellow
$status = git status --short 2>&1
if ($status) {
    Write-Host "  ⚠ Hay cambios sin commitear:" -ForegroundColor Yellow
    $status | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ✓ No hay cambios pendientes" -ForegroundColor Green
}

# 4. Verificar Cloud Build Triggers
Write-Host "`n4. Verificando Cloud Build Triggers..." -ForegroundColor Yellow
$triggers = gcloud builds triggers list --project=$project --format=json 2>&1 | ConvertFrom-Json

if ($triggers) {
    $mfsTriggers = $triggers | Where-Object { 
        $_.name -like "*mfs*" -or 
        ($_.github -and ($_.github.name -like "*mfs*" -or $_.github.name -like "*lead*"))
    }
    
    if ($mfsTriggers) {
        Write-Host "  ✓ Triggers encontrados:" -ForegroundColor Green
        $mfsTriggers | ForEach-Object {
            Write-Host "    - $($_.name)" -ForegroundColor Gray
            if ($_.github) {
                Write-Host "      Repo: $($_.github.owner)/$($_.github.name)" -ForegroundColor Gray
                Write-Host "      Branch: $($_.github.push.branch)" -ForegroundColor Gray
                Write-Host "      Config: $($_.filename)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  ⚠ No se encontraron triggers para mfs-lead-generation-ai" -ForegroundColor Yellow
        Write-Host "  Todos los triggers:" -ForegroundColor Gray
        $triggers | ForEach-Object { Write-Host "    - $($_.name)" -ForegroundColor Gray }
    }
} else {
    Write-Host "  ⚠ No se pudieron obtener los triggers" -ForegroundColor Yellow
}

# 5. Verificar Cloud Run service
Write-Host "`n5. Verificando servicio Cloud Run..." -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=us-central1 --project=$project --format=json 2>&1 | ConvertFrom-Json

if ($serviceInfo) {
    Write-Host "  ✓ Servicio encontrado: $service" -ForegroundColor Green
    Write-Host "    URL: $($serviceInfo.status.url)" -ForegroundColor Gray
    Write-Host "    Última revisión: $($serviceInfo.status.latestReadyRevisionName)" -ForegroundColor Gray
    Write-Host "    Imagen: $($serviceInfo.spec.template.spec.containers[0].image)" -ForegroundColor Gray
} else {
    Write-Host "  ✗ Servicio no encontrado" -ForegroundColor Red
}

# 6. Verificar últimos builds
Write-Host "`n6. Últimos builds de Cloud Build..." -ForegroundColor Yellow
$builds = gcloud builds list --project=$project --limit=5 --format=json 2>&1 | ConvertFrom-Json

if ($builds) {
    $mfsBuilds = $builds | Where-Object { $_.source.repoSource.repoName -like "*mfs*" -or $_.substitutions._SERVICE_NAME -eq "mfs-lead-generation-ai" }
    if ($mfsBuilds) {
        $mfsBuilds | ForEach-Object {
            Write-Host "  [$($_.createTime)] $($_.status) - $($_.id)" -ForegroundColor Gray
            if ($_.source.repoSource) {
                Write-Host "    Repo: $($_.source.repoSource.repoName)" -ForegroundColor Gray
                Write-Host "    Branch: $($_.source.repoSource.branchName)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  ⚠ No se encontraron builds recientes para mfs-lead-generation-ai" -ForegroundColor Yellow
    }
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "Para desplegar desde GitHub:" -ForegroundColor Yellow
Write-Host "1. Asegúrate de que los cambios están en GitHub (git push origin main)" -ForegroundColor White
Write-Host "2. Verifica que hay un Cloud Build Trigger configurado para el repositorio" -ForegroundColor White
Write-Host "3. El trigger debe apuntar a cloudbuild.yaml en la rama main" -ForegroundColor White
Write-Host "`n=== Fin ===" -ForegroundColor Cyan

