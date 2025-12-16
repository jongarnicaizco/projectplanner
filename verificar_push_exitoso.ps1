# Script para verificar si el push fue exitoso
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  VERIFICACIÓN DE PUSH A GITHUB" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# 1. Verificar último commit local
Write-Host "[1] Último commit local:" -ForegroundColor Yellow
$localCommit = git log --oneline -1 2>&1
Write-Host $localCommit -ForegroundColor Gray
Write-Host ""

# 2. Fetch del remoto
Write-Host "[2] Obteniendo información del remoto..." -ForegroundColor Yellow
git fetch origin 2>&1 | Out-Null

# 3. Verificar commits sin push
Write-Host "[3] Commits sin push:" -ForegroundColor Yellow
$unpushed = git log origin/main..HEAD --oneline 2>&1
if ($unpushed -and $unpushed.Count -gt 0) {
    Write-Host "⚠ Hay commits sin push:" -ForegroundColor Yellow
    Write-Host $unpushed -ForegroundColor Gray
    Write-Host ""
    Write-Host "Intentando push..." -ForegroundColor Yellow
    $pushResult = git push origin main 2>&1 | Out-String
    Write-Host $pushResult -ForegroundColor Gray
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓✓✓ PUSH EXITOSO ✓✓✓" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "✗ PUSH FALLÓ" -ForegroundColor Red
        Write-Host "Error: $pushResult" -ForegroundColor Red
    }
} else {
    Write-Host "✓ Todos los commits están pusheados" -ForegroundColor Green
}

Write-Host ""

# 4. Verificar último commit en remoto
Write-Host "[4] Último commit en remoto (origin/main):" -ForegroundColor Yellow
$remoteCommit = git log origin/main --oneline -1 2>&1
Write-Host $remoteCommit -ForegroundColor Gray

Write-Host ""

# 5. Comparar
if ($localCommit -eq $remoteCommit) {
    Write-Host "✓✓✓ PUSH COMPLETADO - Los commits coinciden ✓✓✓" -ForegroundColor Green
    Write-Host ""
    Write-Host "Los cambios están en GitHub:" -ForegroundColor Cyan
    Write-Host "https://github.com/jongarnicaizco/mfs-lead-generation-ai" -ForegroundColor White
    Write-Host ""
    Write-Host "Cloud Build debería detectar el push y desplegar automáticamente" -ForegroundColor Cyan
} else {
    Write-Host "⚠ Los commits no coinciden - puede que el push no se haya completado" -ForegroundColor Yellow
}

