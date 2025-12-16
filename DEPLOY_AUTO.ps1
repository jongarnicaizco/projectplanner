# Script automático para commit, push y deploy
param(
    [string]$CommitMessage = "Auto-deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$ErrorActionPreference = "Continue"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Forzar salida
$Host.UI.RawUI.BufferSize = New-Object Management.Automation.Host.Size(200, 3000)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AUTO DEPLOY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Status
Write-Host "[1/4] Verificando cambios..." -ForegroundColor Yellow
$changes = git status --porcelain
if ($changes) {
    Write-Host "Cambios encontrados:" -ForegroundColor Green
    $changes | ForEach-Object { Write-Host "  $_" }
} else {
    Write-Host "No hay cambios pendientes" -ForegroundColor Yellow
}

# 2. Add
Write-Host "`n[2/4] Añadiendo cambios..." -ForegroundColor Yellow
git add -A
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Cambios añadidos" -ForegroundColor Green
} else {
    Write-Host "✗ Error añadiendo cambios" -ForegroundColor Red
    exit 1
}

# 3. Commit
Write-Host "`n[3/4] Haciendo commit..." -ForegroundColor Yellow
$commitResult = git commit -m $CommitMessage 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Commit realizado" -ForegroundColor Green
    git log --oneline -1 | ForEach-Object { Write-Host "  $_" }
} elseif ($commitResult -match "nothing to commit") {
    Write-Host "⚠ No hay cambios para commit" -ForegroundColor Yellow
} else {
    Write-Host "✗ Error en commit: $commitResult" -ForegroundColor Red
    exit 1
}

# 4. Push
Write-Host "`n[4/4] Haciendo push a GitHub..." -ForegroundColor Yellow
$pushResult = git push origin main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Push completado" -ForegroundColor Green
} else {
    Write-Host "✗ Error en push: $pushResult" -ForegroundColor Red
    exit 1
}

# 5. Deploy
Write-Host "`n[5/5] Desplegando a Cloud Run..." -ForegroundColor Yellow
$imageTag = "auto-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$subs = "_IMAGE_TAG=$imageTag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"

Write-Host "Iniciando build..." -ForegroundColor Gray
$buildResult = gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$subs 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Despliegue completado" -ForegroundColor Green
} else {
    Write-Host "✗ Error en despliegue" -ForegroundColor Red
    $buildResult | Select-Object -Last 10 | ForEach-Object { Write-Host "  $_" }
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

