# Script para verificar estado de GitHub
$ErrorActionPreference = "Continue"

Write-Host "`n=== VERIFICACIÓN DE GITHUB ===" -ForegroundColor Cyan

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

Write-Host "`n1. Estado del repositorio:" -ForegroundColor Yellow
git status

Write-Host "`n2. Últimos 3 commits:" -ForegroundColor Yellow
git log --oneline -3

Write-Host "`n3. Remoto configurado:" -ForegroundColor Yellow
git remote -v

Write-Host "`n4. Verificando conexión con GitHub:" -ForegroundColor Yellow
$connection = git ls-remote origin HEAD 2>&1
if ($connection -match "refs/heads/main") {
    Write-Host "  ✓ Conexión con GitHub OK" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error de conexión con GitHub" -ForegroundColor Red
    Write-Host $connection -ForegroundColor Red
}

Write-Host "`n5. Si hay cambios sin commit, ejecuta:" -ForegroundColor Yellow
Write-Host "   git add -A" -ForegroundColor Gray
Write-Host "   git commit -m 'Tu mensaje'" -ForegroundColor Gray
Write-Host "   git push origin main" -ForegroundColor Gray

Write-Host "`n=== FIN ===" -ForegroundColor Cyan
