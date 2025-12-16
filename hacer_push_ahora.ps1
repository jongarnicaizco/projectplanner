# Script para hacer push a GitHub de forma explícita
$ErrorActionPreference = "Stop"

Write-Host "`n=== Haciendo push a GitHub ===" -ForegroundColor Cyan

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

Write-Host "`n1. Verificando estado del repositorio..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "  Cambios pendientes encontrados:" -ForegroundColor Yellow
    Write-Host $status
} else {
    Write-Host "  No hay cambios pendientes" -ForegroundColor Gray
}

Write-Host "`n2. Añadiendo todos los cambios..." -ForegroundColor Yellow
git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Error al añadir cambios" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Cambios añadidos" -ForegroundColor Green

Write-Host "`n3. Haciendo commit..." -ForegroundColor Yellow
git commit -m "Fix: Añadir logs para debug de extractFromEmail y corregir cloudbuild.yaml"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ No hay cambios para commitear (puede ser normal)" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
}

Write-Host "`n4. Haciendo push a GitHub..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1 | Out-String
Write-Host $pushOutput

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Push exitoso a GitHub" -ForegroundColor Green
    Write-Host "  Repositorio: https://github.com/jongarnicaizco/mfs-lead-generation-ai" -ForegroundColor Gray
} else {
    Write-Host "`n✗ Error en push" -ForegroundColor Red
    Write-Host $pushOutput
    exit 1
}

Write-Host "`n=== Push completado ===" -ForegroundColor Cyan

