# SOLUCIÓN COMPLETA - Verificar y corregir todo
$ErrorActionPreference = "Continue"

$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SOLUCIÓN COMPLETA - MFS LEAD GENERATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar código
Write-Host "1. Verificando código..." -ForegroundColor Yellow
$processorContent = Get-Content "services/processor.js" -Raw -ErrorAction SilentlyContinue
if ($processorContent -match "createAirtableRecord") {
    Write-Host "   ✓ createAirtableRecord encontrado" -ForegroundColor Green
} else {
    Write-Host "   ✗ ERROR: createAirtableRecord NO encontrado" -ForegroundColor Red
    exit 1
}

# 2. Verificar configuración
Write-Host "`n2. Verificando configuración..." -ForegroundColor Yellow
$cloudbuildContent = Get-Content "cloudbuild.yaml" -Raw -ErrorAction SilentlyContinue
if ($cloudbuildContent -match "AIRTABLE_BASE_ID.*appT0vQS4arJ3dQ6w") {
    Write-Host "   ✓ AIRTABLE_BASE_ID configurado" -ForegroundColor Green
} else {
    Write-Host "   ✗ ERROR: AIRTABLE_BASE_ID no configurado correctamente" -ForegroundColor Red
    exit 1
}

# 3. Commit y push
Write-Host "`n3. Haciendo commit y push..." -ForegroundColor Yellow
git add -A 2>&1 | Out-Null
$status = git status --short 2>&1
if ($status) {
    git commit -m "Fix: Asegurar procesamiento en Airtable - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>&1 | Out-Host
    git push origin main 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Cambios pusheados" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Error en push" -ForegroundColor Yellow
    }
} else {
    Write-Host "   No hay cambios para commit" -ForegroundColor Yellow
}

# 4. Desplegar
Write-Host "`n4. Desplegando servicio..." -ForegroundColor Yellow
$imageTag = "fix-airtable-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "   Tag: $imageTag" -ForegroundColor Gray

$buildOutput = gcloud builds submit --config=cloudbuild.yaml --project=$projectId --substitutions="_IMAGE_TAG=$imageTag" 2>&1
$buildOutput | Out-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Build completado" -ForegroundColor Green
} else {
    Write-Host "   ✗ ERROR en build" -ForegroundColor Red
    Write-Host "   Revisa los logs arriba" -ForegroundColor Yellow
    exit 1
}

# 5. Verificar servicio
Write-Host "`n5. Verificando servicio..." -ForegroundColor Yellow
Start-Sleep -Seconds 15
$serviceUrl = gcloud run services describe $serviceName --region=$region --project=$projectId --format="value(status.url)" 2>&1
if ($serviceUrl) {
    Write-Host "   ✓ Servicio activo: $serviceUrl" -ForegroundColor Green
} else {
    Write-Host "   ⚠ No se pudo obtener URL del servicio" -ForegroundColor Yellow
}

# 6. Verificar logs recientes
Write-Host "`n6. Verificando logs recientes..." -ForegroundColor Yellow
$recentLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$serviceName" --project=$projectId --limit=5 --format="value(textPayload)" --freshness=5m 2>&1
if ($recentLogs) {
    Write-Host "   Logs encontrados:" -ForegroundColor Green
    $recentLogs | Select-Object -First 3 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} else {
    Write-Host "   No hay logs recientes (puede ser normal si no hay emails nuevos)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "PROCESO COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "El servicio está desplegado y debería procesar emails en Airtable." -ForegroundColor Cyan
Write-Host "Para verificar, revisa los logs o envía un email de prueba." -ForegroundColor Cyan
Write-Host ""

