# Script para desplegar el fix de BCC
$ErrorActionPreference = "Continue"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DESPLEGANDO FIX: BCC PRIORITY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar cambios
Write-Host "1. Verificando cambios..." -ForegroundColor Yellow
git status 2>&1 | Write-Host

# 2. Commit y push
Write-Host "`n2. Haciendo commit y push..." -ForegroundColor Yellow
git add -A 2>&1 | Out-Null
$status = git status --short 2>&1
if ($status) {
    git commit -m "Fix: Priorizar BCC cuando To está vacío" 2>&1 | Write-Host
    git push origin main 2>&1 | Write-Host
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Push completado" -ForegroundColor Green
    }
} else {
    Write-Host "   No hay cambios para commit" -ForegroundColor Yellow
}

# 3. Desplegar
Write-Host "`n3. Desplegando..." -ForegroundColor Yellow
$imageTag = "fix-bcc-priority-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$substitutions = "_IMAGE_TAG=$imageTag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"

gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$substitutions 2>&1 | Write-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "DESPLIEGUE EXITOSO" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "El servicio ahora priorizará BCC cuando To está vacío." -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR EN EL DESPLIEGUE" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}

Write-Host ""

