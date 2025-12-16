# Script para hacer push a GitHub y desplegar
Set-Location $PSScriptRoot

Write-Host "=== Desplegando cambios a GitHub ===" -ForegroundColor Cyan

# Verificar si existe .git
if (-not (Test-Path .git)) {
    Write-Host "Inicializando repositorio git..." -ForegroundColor Yellow
    git init
    git branch -M main
}

# Configurar remote si no existe
$remoteExists = git remote get-url origin 2>$null
if (-not $remoteExists) {
    Write-Host "Configurando remote origin..." -ForegroundColor Yellow
    git remote add origin https://github.com/jongarnicaizco/mfs-lead-generation-ai.git
} else {
    Write-Host "Remote ya configurado: $remoteExists" -ForegroundColor Green
}

# Agregar archivos modificados
Write-Host "Agregando archivos..." -ForegroundColor Yellow
git add utils/helpers.js services/processor.js services/airtable.js

# Verificar si hay cambios para commitear
$status = git status --porcelain
if ($status) {
    Write-Host "Haciendo commit..." -ForegroundColor Yellow
    git commit -m "feat: Add email parsing, language detection, and location mapping"
    
    Write-Host "Haciendo push a GitHub..." -ForegroundColor Yellow
    git push -u origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n=== Push exitoso! ===" -ForegroundColor Green
        Write-Host "Cloud Build debería desplegar automáticamente desde GitHub" -ForegroundColor Green
    } else {
        Write-Host "`n=== Error en el push ===" -ForegroundColor Red
        Write-Host "Verifica tus credenciales de GitHub" -ForegroundColor Red
    }
} else {
    Write-Host "No hay cambios para commitear" -ForegroundColor Yellow
}

Write-Host "`nEstado del repositorio:" -ForegroundColor Cyan
git status --short

