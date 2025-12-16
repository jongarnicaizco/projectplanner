# Script de despliegue automático para Cursor AI
# Este script se ejecuta automáticamente cuando se solicitan despliegues
# Uso: .\deploy-automatico.ps1 -CommitMessage "Descripción del cambio"

param(
    [Parameter(Mandatory=$false)]
    [string]$CommitMessage = "Update: Cambios automáticos desde Cursor AI - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipDeploy = $false
)

$ErrorActionPreference = "Stop"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DESPLIEGUE AUTOMÁTICO - MFS LEAD AI" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuración
$GITHUB_USER = "jongarnicaizco"
$GITHUB_TOKEN = "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"
$REPO_URL = "https://github.com/jongarnicaizco/mfs-lead-generation-ai.git"
$PROJECT_ID = "check-in-sf"
$SERVICE_NAME = "mfs-lead-generation-ai"
$REGION = "us-central1"
$REPOSITORY = "cloud-run-source-deploy"

# 1. Configurar Git
Write-Host "[1/5] Configurando Git..." -ForegroundColor Yellow

# Configurar remoto con token en URL (para push automático)
$remoteWithToken = "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/jongarnicaizco/mfs-lead-generation-ai.git"
git remote set-url origin $remoteWithToken 2>&1 | Out-Null

# Configurar usuario si no está configurado
$currentUser = git config user.name 2>&1
if (-not $currentUser -or $currentUser -match "error") {
    git config user.name "jongarnicaizco" 2>&1 | Out-Null
}

$currentEmail = git config user.email 2>&1
if (-not $currentEmail -or $currentEmail -match "error") {
    git config user.email "jongarnicaizco@gmail.com" 2>&1 | Out-Null
}

Write-Host "  ✓ Git configurado" -ForegroundColor Green

# 2. Verificar estado
Write-Host "`n[2/5] Verificando estado del repositorio..." -ForegroundColor Yellow
$status = git status --porcelain 2>&1
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "  ⚠ No hay cambios para commitear" -ForegroundColor Yellow
    Write-Host "  Verificando si hay commits sin push..." -ForegroundColor Gray
    
    # Verificar si hay commits locales sin push
    git fetch origin 2>&1 | Out-Null
    $localCommits = git log origin/main..HEAD --oneline 2>&1
    if ([string]::IsNullOrWhiteSpace($localCommits)) {
        Write-Host "  ⚠ No hay cambios para desplegar" -ForegroundColor Yellow
        if (-not $SkipDeploy) {
            Write-Host "  Forzando despliegue del código actual..." -ForegroundColor Gray
        }
    } else {
        Write-Host "  ✓ Hay commits locales sin push" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ Hay cambios para commitear" -ForegroundColor Green
}

# 3. Añadir cambios
Write-Host "`n[3/5] Añadiendo cambios..." -ForegroundColor Yellow
git add -A 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Error en git add" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Archivos añadidos" -ForegroundColor Green

# 4. Commit
Write-Host "`n[4/5] Haciendo commit..." -ForegroundColor Yellow
$commitOutput = git commit -m $CommitMessage 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
    git log --oneline -1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} elseif ($commitOutput -match "nothing to commit") {
    Write-Host "  ⚠ No hay cambios para commit (ya están commiteados)" -ForegroundColor Yellow
} else {
    Write-Host "  ✗ Error en commit: $commitOutput" -ForegroundColor Red
    exit 1
}

# 5. Push
Write-Host "`n[5/5] Haciendo push a GitHub..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Push completado exitosamente" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error en push:" -ForegroundColor Red
    Write-Host "    $pushOutput" -ForegroundColor Red
    
    # Intentar con fetch primero
    Write-Host "  Intentando fetch y push de nuevo..." -ForegroundColor Yellow
    git fetch origin 2>&1 | Out-Null
    git push origin main 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Push completado en segundo intento" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Push falló después de 2 intentos" -ForegroundColor Red
        Write-Host "  El código puede no estar en GitHub" -ForegroundColor Yellow
        exit 1
    }
}

# 6. Deploy (si no se omite)
if (-not $SkipDeploy) {
    Write-Host "`n[6/6] Desplegando a Cloud Run..." -ForegroundColor Yellow
    $tag = "auto-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    $subs = "_IMAGE_TAG=$tag,_SERVICE_NAME=$SERVICE_NAME,_REGION=$REGION,_REPOSITORY=$REPOSITORY,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"
    
    Write-Host "  Tag: $tag" -ForegroundColor Gray
    Write-Host "  Proyecto: $PROJECT_ID" -ForegroundColor Gray
    Write-Host "  Iniciando build (puede tardar varios minutos)..." -ForegroundColor Gray
    Write-Host ""
    
    $buildOutput = gcloud builds submit --config=cloudbuild.yaml --project=$PROJECT_ID --substitutions=$subs 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "  ✓ Despliegue completado exitosamente" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  ✗ Error en despliegue" -ForegroundColor Red
        $buildOutput | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
        Write-Host ""
        Write-Host "  ⚠ El código está en GitHub, pero el deploy falló" -ForegroundColor Yellow
        Write-Host "  Puedes hacer el deploy manualmente más tarde con:" -ForegroundColor Yellow
        Write-Host "  gcloud builds submit --config=cloudbuild.yaml --project=$PROJECT_ID --substitutions=$subs" -ForegroundColor Gray
    }
} else {
    Write-Host "`n[6/6] Despliegue omitido (--SkipDeploy)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ PROCESO COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
if (-not $SkipDeploy) {
    Write-Host "Código pusheado a GitHub y desplegado a Cloud Run" -ForegroundColor Cyan
} else {
    Write-Host "Código pusheado a GitHub (despliegue omitido)" -ForegroundColor Cyan
}
Write-Host ""

