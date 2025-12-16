# Script para desplegar mfs-lead-generation-ai
$ErrorActionPreference = "Continue"

# Cambiar al directorio correcto
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DESPLEGANDO MFS-LEAD-GENERATION-AI" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Directorio: $scriptPath" -ForegroundColor Gray
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "cloudbuild.yaml")) {
    Write-Host "ERROR: No se encontró cloudbuild.yaml" -ForegroundColor Red
    Write-Host "Directorio actual: $(Get-Location)" -ForegroundColor Yellow
    exit 1
}

# 1. Estado de Git
Write-Host "1. Estado de Git:" -ForegroundColor Yellow
git status 2>&1 | Write-Host

# 2. Añadir y commitear cambios
Write-Host "`n2. Añadiendo cambios..." -ForegroundColor Yellow
git add -A 2>&1 | Out-Null
$status = git status --short 2>&1
if ($status) {
    Write-Host "   Cambios detectados:" -ForegroundColor Green
    $status | Write-Host
    git commit -m "Fix: Asegurar procesamiento en Airtable - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>&1 | Write-Host
    Write-Host "`n3. Haciendo push a GitHub..." -ForegroundColor Yellow
    git push origin main 2>&1 | Write-Host
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Push completado" -ForegroundColor Green
    }
} else {
    Write-Host "   No hay cambios para commit" -ForegroundColor Yellow
}

# 3. Desplegar
Write-Host "`n4. Desplegando con Cloud Build..." -ForegroundColor Yellow
$imageTag = "fix-airtable-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "   Tag: $imageTag" -ForegroundColor Gray
Write-Host "   Proyecto: check-in-sf" -ForegroundColor Gray
Write-Host ""

$substitutions = "_IMAGE_TAG=$imageTag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"

gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$substitutions 2>&1 | Write-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "DESPLIEGUE EXITOSO" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "El servicio está desplegado y debería procesar emails en Airtable." -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR EN EL DESPLIEGUE" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Revisa los mensajes de error arriba." -ForegroundColor Yellow
}

Write-Host ""

