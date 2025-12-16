# Script para corregir y desplegar el servicio
$ErrorActionPreference = "Stop"

$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CORRECCIÓN Y DESPLIEGUE COMPLETO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar que estamos en el directorio correcto
Write-Host "1. Verificando directorio..." -ForegroundColor Yellow
if (-not (Test-Path "cloudbuild.yaml")) {
    Write-Host "   ERROR: No se encontró cloudbuild.yaml" -ForegroundColor Red
    exit 1
}
Write-Host "   ✓ Directorio correcto" -ForegroundColor Green

# 2. Verificar configuración de Airtable en cloudbuild.yaml
Write-Host "`n2. Verificando configuración de Airtable..." -ForegroundColor Yellow
$cloudbuildContent = Get-Content "cloudbuild.yaml" -Raw
if ($cloudbuildContent -match "AIRTABLE_BASE_ID" -and $cloudbuildContent -match "AIRTABLE_TABLE") {
    Write-Host "   ✓ Configuración de Airtable encontrada en cloudbuild.yaml" -ForegroundColor Green
} else {
    Write-Host "   ⚠ Configuración de Airtable no encontrada en cloudbuild.yaml" -ForegroundColor Yellow
}

# 3. Verificar que el código llama a createAirtableRecord
Write-Host "`n3. Verificando código..." -ForegroundColor Yellow
$processorContent = Get-Content "services/processor.js" -Raw
if ($processorContent -match "createAirtableRecord") {
    Write-Host "   ✓ createAirtableRecord encontrado en processor.js" -ForegroundColor Green
} else {
    Write-Host "   ✗ ERROR: createAirtableRecord NO encontrado en processor.js" -ForegroundColor Red
    exit 1
}

# 4. Hacer commit y push de cambios
Write-Host "`n4. Haciendo commit y push..." -ForegroundColor Yellow
git add -A 2>&1 | Out-Null
$hasChanges = git diff --cached --quiet
if (-not $hasChanges) {
    Write-Host "   No hay cambios para commit" -ForegroundColor Yellow
} else {
    git commit -m "Fix: Asegurar procesamiento en Airtable" 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Cambios commiteados" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Error en commit (puede que no haya cambios)" -ForegroundColor Yellow
    }
}

git push origin main 2>&1 | Out-Host
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Cambios pusheados a GitHub" -ForegroundColor Green
} else {
    Write-Host "   ⚠ Error en push (puede que no haya cambios o problemas de conexión)" -ForegroundColor Yellow
}

# 5. Desplegar usando Cloud Build
Write-Host "`n5. Desplegando con Cloud Build..." -ForegroundColor Yellow
$imageTag = "fix-airtable-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
gcloud builds submit --config=cloudbuild.yaml --project=$projectId --substitutions="_IMAGE_TAG=$imageTag" 2>&1 | Out-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Build completado exitosamente" -ForegroundColor Green
} else {
    Write-Host "   ✗ ERROR en el build" -ForegroundColor Red
    exit 1
}

# 6. Verificar despliegue
Write-Host "`n6. Verificando despliegue..." -ForegroundColor Yellow
Start-Sleep -Seconds 10
$service = gcloud run services describe $serviceName --region=$region --project=$projectId --format="value(status.url)" 2>&1
if ($service) {
    Write-Host "   ✓ Servicio desplegado: $service" -ForegroundColor Green
} else {
    Write-Host "   ⚠ No se pudo verificar el servicio" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "PROCESO COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "El servicio debería estar procesando emails en Airtable ahora." -ForegroundColor Cyan
Write-Host ""

