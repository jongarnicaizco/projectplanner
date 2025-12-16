# Script para hacer push a GitHub
$ErrorActionPreference = "Continue"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "HACIENDO PUSH A GITHUB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar estado
Write-Host "1. Verificando estado del repositorio..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "   Cambios detectados:" -ForegroundColor Green
    Write-Host $status
} else {
    Write-Host "   No hay cambios pendientes" -ForegroundColor Yellow
}

# 2. Añadir todos los cambios
Write-Host "`n2. Añadiendo cambios..." -ForegroundColor Yellow
git add -A
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Cambios añadidos" -ForegroundColor Green
} else {
    Write-Host "   ✗ Error añadiendo cambios" -ForegroundColor Red
    exit 1
}

# 3. Hacer commit
Write-Host "`n3. Haciendo commit..." -ForegroundColor Yellow
git commit -m "Add: Enviar email de prueba antes de crear registro en Airtable"
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Commit realizado" -ForegroundColor Green
    git log --oneline -1
} else {
    Write-Host "   ✗ Error haciendo commit (puede que no haya cambios)" -ForegroundColor Yellow
}

# 4. Hacer push
Write-Host "`n4. Haciendo push a GitHub..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Push completado exitosamente" -ForegroundColor Green
} else {
    Write-Host "   ✗ Error haciendo push" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "PUSH COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
