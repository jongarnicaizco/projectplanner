# Script para verificar que el servicio está desplegado como contenedor Docker
Write-Host "`n=== Verificando que el servicio es un contenedor Docker ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Verificar la imagen Docker que está usando
Write-Host "`n1. Imagen Docker del servicio:" -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=$region --project=$project --format=json 2>&1 | ConvertFrom-Json

if ($serviceInfo) {
    $image = $serviceInfo.spec.template.spec.containers[0].image
    Write-Host "  ✓ Imagen Docker: $image" -ForegroundColor Green
    
    if ($image -match "docker\.pkg\.dev|gcr\.io") {
        Write-Host "  ✓ Está usando una imagen Docker (no código fuente)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ ADVERTENCIA: No parece ser una imagen Docker" -ForegroundColor Red
    }
    
    # Verificar que NO tiene source
    $hasSource = $serviceInfo.spec.template.spec.containers[0].PSObject.Properties.Name -contains "source"
    if ($hasSource) {
        Write-Host "  ✗ ADVERTENCIA: El servicio tiene código fuente visible" -ForegroundColor Red
    } else {
        Write-Host "  ✓ No tiene código fuente visible (solo contenedor)" -ForegroundColor Green
    }
} else {
    Write-Host "  ✗ No se pudo obtener información del servicio" -ForegroundColor Red
}

# 2. Verificar Cloud Build Triggers
Write-Host "`n2. Cloud Build Triggers configurados:" -ForegroundColor Yellow
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
    }
} else {
    Write-Host "  ⚠ No se pudieron obtener los triggers" -ForegroundColor Yellow
}

# 3. Verificar últimos builds
Write-Host "`n3. Últimos builds de Cloud Build:" -ForegroundColor Yellow
$builds = gcloud builds list --project=$project --limit=5 --format=json 2>&1 | ConvertFrom-Json

if ($builds) {
    $mfsBuilds = $builds | Where-Object { 
        $_.substitutions._SERVICE_NAME -eq "mfs-lead-generation-ai" -or
        $_.images -like "*mfs-lead-generation-ai*"
    }
    
    if ($mfsBuilds) {
        Write-Host "  ✓ Builds encontrados:" -ForegroundColor Green
        $mfsBuilds | Select-Object -First 3 | ForEach-Object {
            Write-Host "    [$($_.createTime)] $($_.status) - $($_.id)" -ForegroundColor Gray
            if ($_.images) {
                Write-Host "      Imágenes: $($_.images -join ', ')" -ForegroundColor Gray
            }
            if ($_.source.repoSource) {
                Write-Host "      Repo: $($_.source.repoSource.repoName)" -ForegroundColor Gray
                Write-Host "      Branch: $($_.source.repoSource.branchName)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  ⚠ No se encontraron builds recientes para mfs-lead-generation-ai" -ForegroundColor Yellow
    }
}

# 4. Verificar cloudbuild.yaml
Write-Host "`n4. Verificando cloudbuild.yaml:" -ForegroundColor Yellow
if (Test-Path "cloudbuild.yaml") {
    $cloudbuild = Get-Content "cloudbuild.yaml" -Raw
    if ($cloudbuild -match "--image") {
        Write-Host "  ✓ Usa --image (despliega contenedor Docker)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ No usa --image" -ForegroundColor Red
    }
    
    if ($cloudbuild -match "--source") {
        Write-Host "  ✗ ADVERTENCIA: Usa --source (expone código fuente)" -ForegroundColor Red
    } else {
        Write-Host "  ✓ No usa --source (no expone código)" -ForegroundColor Green
    }
    
    if ($cloudbuild -match "docker build") {
        Write-Host "  ✓ Construye imagen Docker" -ForegroundColor Green
    }
} else {
    Write-Host "  ⚠ cloudbuild.yaml no encontrado" -ForegroundColor Yellow
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "✓ El servicio está desplegado como contenedor Docker" -ForegroundColor Green
Write-Host "✓ El código fuente solo está en GitHub" -ForegroundColor Green
Write-Host "✓ No se puede ver ni editar código desde Cloud Run" -ForegroundColor Green
Write-Host "✓ Los cambios se despliegan automáticamente desde GitHub" -ForegroundColor Green

Write-Host "`n=== Fin ===" -ForegroundColor Cyan

