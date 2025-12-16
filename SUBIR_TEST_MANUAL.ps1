# Script para subir test.txt manualmente
# Ejecuta este script en PowerShell para ver la salida completa

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SUBIR ARCHIVO TEST.TXT A GITHUB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Cambiar al directorio del script
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# 1. Verificar archivo
Write-Host "[1/6] Verificando archivo..." -ForegroundColor Yellow
if (Test-Path "test.txt") {
    Write-Host "  ✓ test.txt existe" -ForegroundColor Green
    Write-Host "  Contenido:" -ForegroundColor Gray
    Get-Content test.txt | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ✗ test.txt NO existe" -ForegroundColor Red
    exit 1
}

# 2. Configurar Git
Write-Host "`n[2/6] Configurando Git..." -ForegroundColor Yellow
git config user.name "jongarnicaizco"
git config user.email "jongarnicaizco@gmail.com"
Write-Host "  ✓ Git configurado" -ForegroundColor Green

# 3. Configurar remoto con token
Write-Host "`n[3/6] Configurando remoto..." -ForegroundColor Yellow
$token = "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"
$remoteUrl = "https://jongarnicaizco:$token@github.com/jongarnicaizco/mfs-lead-generation-ai.git"
git remote set-url origin $remoteUrl
$currentRemote = git remote get-url origin
Write-Host "  Remoto: $currentRemote" -ForegroundColor Gray
Write-Host "  ✓ Remoto configurado" -ForegroundColor Green

# 4. Estado actual
Write-Host "`n[4/6] Estado actual de Git:" -ForegroundColor Yellow
git status
Write-Host ""

# 5. Añadir y commit
Write-Host "[5/6] Añadiendo y haciendo commit..." -ForegroundColor Yellow
git add test.txt
$addStatus = $LASTEXITCODE
Write-Host "  git add exit code: $addStatus" -ForegroundColor Gray

git commit -m "Test: Subir archivo test.txt a GitHub"
$commitStatus = $LASTEXITCODE
Write-Host "  git commit exit code: $commitStatus" -ForegroundColor Gray

if ($commitStatus -eq 0) {
    $lastCommit = git log --oneline -1
    Write-Host "  ✓ Commit realizado: $lastCommit" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No se pudo hacer commit (puede que no haya cambios)" -ForegroundColor Yellow
}

# 6. Push
Write-Host "`n[6/6] Haciendo push a GitHub..." -ForegroundColor Yellow
Write-Host "  Esto puede tardar unos segundos..." -ForegroundColor Gray
$pushOutput = git push origin main 2>&1
$pushStatus = $LASTEXITCODE

Write-Host ""
if ($pushStatus -eq 0) {
    Write-Host "  ✓ PUSH EXITOSO!" -ForegroundColor Green
    Write-Host "  El archivo debería estar en GitHub ahora" -ForegroundColor Green
} else {
    Write-Host "  ✗ ERROR EN PUSH" -ForegroundColor Red
    Write-Host "  Salida del error:" -ForegroundColor Red
    $pushOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Posibles causas:" -ForegroundColor Yellow
    Write-Host "  - El token de GitHub ha expirado" -ForegroundColor Yellow
    Write-Host "  - El token no tiene permisos de escritura" -ForegroundColor Yellow
    Write-Host "  - Problema de conexión" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FIN DEL SCRIPT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verifica en GitHub:" -ForegroundColor Cyan
Write-Host "https://github.com/jongarnicaizco/mfs-lead-generation-ai/blob/main/test.txt" -ForegroundColor Cyan
Write-Host ""

