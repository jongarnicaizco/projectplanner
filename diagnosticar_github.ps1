# Script para diagnosticar conexion con GitHub
$ErrorActionPreference = "Continue"

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

Write-Host "`n=== DIAGNOSTICO DE GITHUB ===" -ForegroundColor Cyan

Write-Host "`n1. Remoto configurado:" -ForegroundColor Yellow
$remote = git remote -v 2>&1
Write-Host $remote -ForegroundColor White

Write-Host "`n2. Estado del repositorio:" -ForegroundColor Yellow
$status = git status 2>&1
Write-Host $status -ForegroundColor White

Write-Host "`n3. Ultimos 3 commits:" -ForegroundColor Yellow
$log = git log --oneline -3 2>&1
Write-Host $log -ForegroundColor White

Write-Host "`n4. Verificando conexion con GitHub:" -ForegroundColor Yellow
$connection = git ls-remote origin HEAD 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Conexion con GitHub funciona" -ForegroundColor Green
    Write-Host $connection -ForegroundColor White
} else {
    Write-Host "  [ERROR] No se puede conectar con GitHub" -ForegroundColor Red
    Write-Host $connection -ForegroundColor Red
    Write-Host "`n  Posibles causas:" -ForegroundColor Yellow
    Write-Host "    - Problema de autenticacion" -ForegroundColor White
    Write-Host "    - Token de GitHub expirado" -ForegroundColor White
    Write-Host "    - Problema de red" -ForegroundColor White
    Write-Host "`n  Solucion:" -ForegroundColor Yellow
    Write-Host "    - Reautenticarse con GitHub" -ForegroundColor White
    Write-Host "    - Verificar credenciales en GitHub" -ForegroundColor White
}

Write-Host "`n5. Intentando push (para ver el error real):" -ForegroundColor Yellow
$pushResult = git push origin main 2>&1
Write-Host $pushResult -ForegroundColor White

if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Push exitoso" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Push fallo" -ForegroundColor Red
    Write-Host "    Codigo de salida: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

