# Script para desplegar el fix de errores 404 de Airtable
Write-Host "`n=== Desplegando fix de errores 404 de Airtable ===" -ForegroundColor Cyan

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Set-Location $repoPath

# 1. Verificar estado del repositorio
Write-Host "`n1. Verificando estado del repositorio..." -ForegroundColor Yellow
$status = git status --short
if ($status) {
    Write-Host "  Cambios pendientes:" -ForegroundColor Yellow
    $status | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ✓ No hay cambios pendientes" -ForegroundColor Green
}

# 2. Añadir cambios
Write-Host "`n2. Añadiendo cambios..." -ForegroundColor Yellow
git add -A
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Cambios añadidos" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error añadiendo cambios" -ForegroundColor Red
    exit 1
}

# 3. Commit
Write-Host "`n3. Haciendo commit..." -ForegroundColor Yellow
$commitMessage = "Fix: Añadir try-catch adicional para errores 404 de Airtable"
git commit -m $commitMessage
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No se pudo hacer commit (puede que no haya cambios)" -ForegroundColor Yellow
}

# 4. Push
Write-Host "`n4. Haciendo push a GitHub..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Push realizado exitosamente" -ForegroundColor Green
    Write-Host "  $pushOutput" -ForegroundColor Gray
} else {
    Write-Host "  ✗ Error en push:" -ForegroundColor Red
    Write-Host "  $pushOutput" -ForegroundColor Red
    exit 1
}

# 5. Verificar último commit
Write-Host "`n5. Verificando último commit..." -ForegroundColor Yellow
$lastCommit = git log --oneline -1
Write-Host "  $lastCommit" -ForegroundColor Gray

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "✓ Cambios desplegados a GitHub" -ForegroundColor Green
Write-Host "✓ Cloud Build debería desplegar automáticamente" -ForegroundColor Green
Write-Host "`nEspera 2-3 minutos y verifica los logs. Los errores 404 deberían manejarse correctamente." -ForegroundColor Yellow

Write-Host "`n=== Fin ===" -ForegroundColor Cyan

