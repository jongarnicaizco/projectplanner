# Script para hacer commit, push y despliegue automático
$ErrorActionPreference = "Stop"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AUTO DEPLOY: COMMIT + PUSH + DEPLOY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar estado
Write-Host "[1/5] Verificando estado del repositorio..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "   ✓ Cambios detectados:" -ForegroundColor Green
    $status | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
} else {
    Write-Host "   ⚠ No hay cambios pendientes" -ForegroundColor Yellow
    Write-Host "   Continuando de todas formas..." -ForegroundColor Yellow
}

# 2. Añadir todos los cambios
Write-Host "`n[2/5] Añadiendo cambios al staging..." -ForegroundColor Yellow
try {
    git add -A 2>&1 | Out-Null
    Write-Host "   ✓ Cambios añadidos" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Error añadiendo cambios: $_" -ForegroundColor Red
    exit 1
}

# 3. Hacer commit
Write-Host "`n[3/5] Haciendo commit..." -ForegroundColor Yellow
$commitMessage = "Auto-deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
try {
    $commitOutput = git commit -m $commitMessage 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Commit realizado" -ForegroundColor Green
        $commitHash = git log --oneline -1
        Write-Host "     $commitHash" -ForegroundColor Gray
    } else {
        # Si no hay cambios, el commit falla pero eso está bien
        if ($commitOutput -match "nothing to commit") {
            Write-Host "   ⚠ No hay cambios para commit" -ForegroundColor Yellow
        } else {
            Write-Host "   ✗ Error haciendo commit: $commitOutput" -ForegroundColor Red
            exit 1
        }
    }
} catch {
    Write-Host "   ✗ Error: $_" -ForegroundColor Red
    exit 1
}

# 4. Hacer push
Write-Host "`n[4/5] Haciendo push a GitHub..." -ForegroundColor Yellow
try {
    $pushOutput = git push origin main 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Push completado exitosamente" -ForegroundColor Green
        if ($pushOutput) {
            Write-Host "     $pushOutput" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ✗ Error haciendo push:" -ForegroundColor Red
        Write-Host "     $pushOutput" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ✗ Error: $_" -ForegroundColor Red
    exit 1
}

# 5. Desplegar a Cloud Run
Write-Host "`n[5/5] Desplegando a Cloud Run..." -ForegroundColor Yellow
$imageTag = "auto-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$substitutions = "_IMAGE_TAG=$imageTag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"

Write-Host "   Iniciando build en Cloud Build..." -ForegroundColor Gray
Write-Host "   Image tag: $imageTag" -ForegroundColor Gray

try {
    $buildOutput = gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$substitutions 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Despliegue completado exitosamente" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Error en el despliegue:" -ForegroundColor Red
        $buildOutput | Select-Object -Last 20 | ForEach-Object { Write-Host "     $_" -ForegroundColor Red }
        exit 1
    }
} catch {
    Write-Host "   ✗ Error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ PROCESO COMPLETADO EXITOSAMENTE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Cambios pusheados a GitHub y desplegados a Cloud Run" -ForegroundColor Cyan
Write-Host ""

