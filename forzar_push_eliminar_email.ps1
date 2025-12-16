# Script para forzar push y eliminar email.js de GitHub
$ErrorActionPreference = "Stop"

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

Write-Host "`n=== FORZANDO PUSH Y ELIMINACIÓN DE email.js ===" -ForegroundColor Cyan

# 1. Verificar que email.js no existe localmente
Write-Host "`n1. Verificando archivo email.js..." -ForegroundColor Yellow
if (Test-Path "services\email.js") {
    Write-Host "  ✗ email.js todavía existe localmente - eliminando..." -ForegroundColor Red
    Remove-Item "services\email.js" -Force
    Write-Host "  ✓ Eliminado" -ForegroundColor Green
} else {
    Write-Host "  ✓ email.js no existe localmente" -ForegroundColor Green
}

# 2. Verificar estado de git
Write-Host "`n2. Estado de git:" -ForegroundColor Yellow
git status --short

# 3. Añadir todos los cambios
Write-Host "`n3. Añadiendo cambios..." -ForegroundColor Yellow
git add -A
Write-Host "  ✓ Cambios añadidos" -ForegroundColor Green

# 4. Hacer commit
Write-Host "`n4. Haciendo commit..." -ForegroundColor Yellow
git commit -m "Fix: Eliminar email.js completamente - solo usar Airtable" 2>&1 | Write-Output
Write-Host "  ✓ Commit realizado" -ForegroundColor Green

# 5. Verificar remoto
Write-Host "`n5. Verificando remoto..." -ForegroundColor Yellow
$remote = git remote -v
Write-Host $remote -ForegroundColor White

# 6. Hacer push
Write-Host "`n6. Haciendo push a GitHub..." -ForegroundColor Yellow
$pushResult = git push origin main 2>&1
Write-Host $pushResult -ForegroundColor White

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n  ✓ Push exitoso a GitHub" -ForegroundColor Green
} else {
    Write-Host "`n  ✗ Error en push" -ForegroundColor Red
    Write-Host "  Intenta ejecutar manualmente: git push origin main" -ForegroundColor Yellow
}

# 7. Verificar últimos commits
Write-Host "`n7. Últimos 3 commits:" -ForegroundColor Yellow
git log --oneline -3

Write-Host "`n=== FIN ===" -ForegroundColor Cyan
Write-Host "`nSi el push fue exitoso, el archivo email.js debería desaparecer de GitHub en unos segundos." -ForegroundColor Green
Write-Host "Cloud Build debería detectar el cambio y desplegar automáticamente." -ForegroundColor Green

