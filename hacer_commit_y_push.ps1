# Script simple para hacer commit y push
$ErrorActionPreference = "Stop"

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

Write-Host "`n=== COMMIT Y PUSH ===" -ForegroundColor Cyan

Write-Host "`n1. Añadiendo cambios..." -ForegroundColor Yellow
git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Error al añadir cambios" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Cambios añadidos" -ForegroundColor Green

Write-Host "`n2. Estado:" -ForegroundColor Yellow
git status --short

Write-Host "`n3. Haciendo commit..." -ForegroundColor Yellow
git commit -m "Fix: Eliminar envio de emails - solo Airtable, corregir cloudbuild.yaml"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Error al hacer commit" -ForegroundColor Red
    Write-Host "  (Puede ser que no haya cambios para commitear)" -ForegroundColor Yellow
    exit 1
}
Write-Host "  [OK] Commit realizado" -ForegroundColor Green

Write-Host "`n4. Haciendo push a GitHub..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Error al hacer push" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Push exitoso" -ForegroundColor Green

Write-Host "`n5. Ultimo commit:" -ForegroundColor Yellow
git log --oneline -1

Write-Host "`n=== FIN ===" -ForegroundColor Cyan
Write-Host "`nEl trigger automatico deberia iniciar un build en 10-30 segundos." -ForegroundColor Green

