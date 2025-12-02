# Script para hacer push a GitHub
Set-Location $PSScriptRoot

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Push a GitHub - mfs-lead-generation-ai" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Verificar si git está instalado
try {
    $gitVersion = git --version 2>&1
    Write-Host "Git encontrado: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Git no está instalado o no está en el PATH" -ForegroundColor Red
    exit 1
}

# Verificar si existe .git
if (-not (Test-Path .git)) {
    Write-Host "Inicializando repositorio git..." -ForegroundColor Yellow
    git init
    git branch -M main
    Write-Host "Repositorio inicializado" -ForegroundColor Green
}

# Verificar/configurar remote
$remoteUrl = git remote get-url origin 2>$null
if (-not $remoteUrl) {
    Write-Host "Configurando remote origin..." -ForegroundColor Yellow
    git remote add origin https://github.com/jongarnicaizco/mfs-lead-generation-ai.git
    Write-Host "Remote configurado: https://github.com/jongarnicaizco/mfs-lead-generation-ai.git" -ForegroundColor Green
} else {
    Write-Host "Remote ya configurado: $remoteUrl" -ForegroundColor Green
}

# Agregar archivos
Write-Host "`nAgregando archivos modificados..." -ForegroundColor Yellow
git add utils/helpers.js services/processor.js services/airtable.js
$status = git status --porcelain

if ($status) {
    Write-Host "Archivos a commitear:" -ForegroundColor Cyan
    Write-Host $status
    
    Write-Host "`nHaciendo commit..." -ForegroundColor Yellow
    git commit -m "feat: Add email parsing, language detection, and location mapping"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Commit exitoso!" -ForegroundColor Green
        
        Write-Host "`nHaciendo push a GitHub..." -ForegroundColor Yellow
        git push -u origin main
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n========================================" -ForegroundColor Green
            Write-Host "  ✓ Push exitoso a GitHub!" -ForegroundColor Green
            Write-Host "========================================" -ForegroundColor Green
            Write-Host "`nCloud Build debería desplegar automáticamente" -ForegroundColor Cyan
            Write-Host "Ver builds: https://console.cloud.google.com/cloud-build/builds?project=check-in-sf" -ForegroundColor Cyan
        } else {
            Write-Host "`n========================================" -ForegroundColor Red
            Write-Host "  ✗ Error en el push" -ForegroundColor Red
            Write-Host "========================================" -ForegroundColor Red
            Write-Host "Verifica tus credenciales de GitHub" -ForegroundColor Yellow
            Write-Host "Puedes necesitar:" -ForegroundColor Yellow
            Write-Host "  1. Personal Access Token" -ForegroundColor Yellow
            Write-Host "  2. Configurar credenciales: git config --global credential.helper manager" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Error en el commit" -ForegroundColor Red
    }
} else {
    Write-Host "No hay cambios para commitear" -ForegroundColor Yellow
    Write-Host "Los archivos ya están commiteados o no hay cambios" -ForegroundColor Yellow
}

Write-Host "`nEstado final del repositorio:" -ForegroundColor Cyan
git status --short

