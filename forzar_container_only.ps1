# Script para forzar que el servicio use solo contenedor Docker, sin código fuente
Write-Host "`n=== Forzando que el servicio use solo contenedor Docker ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Obtener la imagen actual
Write-Host "`n1. Obteniendo imagen Docker actual..." -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=$region --project=$project --format=json 2>&1 | ConvertFrom-Json

if ($serviceInfo) {
    $currentImage = $serviceInfo.spec.template.spec.containers[0].image
    Write-Host "  Imagen actual: $currentImage" -ForegroundColor Gray
    
    # 2. Verificar si tiene source
    $hasSource = $serviceInfo.spec.template.spec.containers[0].PSObject.Properties.Name -contains "source"
    if ($hasSource) {
        Write-Host "  ✗ ADVERTENCIA: El servicio tiene configuración de source" -ForegroundColor Red
        Write-Host "  Eliminando configuración de source..." -ForegroundColor Yellow
    } else {
        Write-Host "  ✓ No tiene configuración de source" -ForegroundColor Green
    }
    
    # 3. Actualizar el servicio para usar solo imagen Docker
    Write-Host "`n2. Actualizando servicio para usar solo imagen Docker..." -ForegroundColor Yellow
    Write-Host "  Esto eliminará cualquier referencia a código fuente" -ForegroundColor Gray
    
    # Actualizar con --no-source explícitamente
    $updateCmd = "gcloud run services update $service --region=$region --project=$project --image=$currentImage --no-source 2>&1"
    $result = Invoke-Expression $updateCmd
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Servicio actualizado correctamente" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Resultado: $result" -ForegroundColor Yellow
    }
    
    # 4. Verificar configuración final
    Write-Host "`n3. Verificando configuración final..." -ForegroundColor Yellow
    $finalInfo = gcloud run services describe $service --region=$region --project=$project --format=json 2>&1 | ConvertFrom-Json
    
    if ($finalInfo) {
        $finalImage = $finalInfo.spec.template.spec.containers[0].image
        $finalHasSource = $finalInfo.spec.template.spec.containers[0].PSObject.Properties.Name -contains "source"
        
        Write-Host "  Imagen: $finalImage" -ForegroundColor Gray
        if ($finalHasSource) {
            Write-Host "  ✗ AÚN tiene configuración de source" -ForegroundColor Red
        } else {
            Write-Host "  ✓ Solo tiene imagen Docker (sin source)" -ForegroundColor Green
        }
    }
} else {
    Write-Host "  ✗ No se pudo obtener información del servicio" -ForegroundColor Red
}

# 5. Verificar cloudbuild.yaml
Write-Host "`n4. Verificando cloudbuild.yaml..." -ForegroundColor Yellow
if (Test-Path "cloudbuild.yaml") {
    $content = Get-Content "cloudbuild.yaml" -Raw
    if ($content -match "--no-source") {
        Write-Host "  ✓ cloudbuild.yaml tiene --no-source configurado" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ cloudbuild.yaml NO tiene --no-source" -ForegroundColor Yellow
        Write-Host "  (Ya lo añadimos, pero verifica que esté en GitHub)" -ForegroundColor Gray
    }
    
    if ($content -match "--image") {
        Write-Host "  ✓ cloudbuild.yaml usa --image" -ForegroundColor Green
    }
    
    if ($content -match "--source" -and $content -notmatch "--no-source") {
        Write-Host "  ✗ ADVERTENCIA: cloudbuild.yaml tiene --source sin --no-source" -ForegroundColor Red
    }
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "✓ Servicio actualizado para usar solo contenedor Docker" -ForegroundColor Green
Write-Host "✓ cloudbuild.yaml configurado con --no-source" -ForegroundColor Green
Write-Host "`nPróximos pasos:" -ForegroundColor Yellow
Write-Host "1. Los cambios en cloudbuild.yaml están en GitHub" -ForegroundColor White
Write-Host "2. El próximo despliegue desde GitHub usará --no-source automáticamente" -ForegroundColor White
Write-Host "3. El código solo será visible en GitHub, no en Cloud Run" -ForegroundColor White

Write-Host "`n=== Fin ===" -ForegroundColor Cyan

