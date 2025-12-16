# Script para hacer push después de configurar el token
# Ejecuta este script después de configurar tu token con configurar-token-github.ps1

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PUSH A GITHUB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Verificar que hay cambios para commitear
Write-Host "[1/4] Verificando cambios..." -ForegroundColor Yellow
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "  ⚠ No hay cambios para commitear" -ForegroundColor Yellow
    Write-Host "  Verificando si hay commits sin push..." -ForegroundColor Gray
    git fetch origin 2>&1 | Out-Null
    $localCommits = git log origin/main..HEAD --oneline
    if ([string]::IsNullOrWhiteSpace($localCommits)) {
        Write-Host "  ⚠ No hay nada para subir" -ForegroundColor Yellow
        exit 0
    } else {
        Write-Host "  ✓ Hay commits locales sin push" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ Hay cambios para commitear" -ForegroundColor Green
    Write-Host "  Añadiendo cambios..." -ForegroundColor Gray
    git add -A
}

# Commit si hay cambios
if (-not [string]::IsNullOrWhiteSpace($status)) {
    Write-Host "`n[2/4] Haciendo commit..." -ForegroundColor Yellow
    $commitMsg = Read-Host "Mensaje del commit (o presiona Enter para usar mensaje por defecto)"
    if ([string]::IsNullOrWhiteSpace($commitMsg)) {
        $commitMsg = "Update: Cambios desde Cursor AI - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    }
    git commit -m $commitMsg
    if ($LASTEXITCODE -eq 0) {
        $lastCommit = git log --oneline -1
        Write-Host "  ✓ Commit realizado: $lastCommit" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ No se pudo hacer commit" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n[2/4] Saltando commit (no hay cambios nuevos)" -ForegroundColor Yellow
}

# Verificar autenticación
Write-Host "`n[3/4] Verificando autenticación..." -ForegroundColor Yellow
$testConnection = git ls-remote origin main 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Error de autenticación" -ForegroundColor Red
    Write-Host "  Ejecuta primero: .\configurar-token-github.ps1" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "  ✓ Autenticación OK" -ForegroundColor Green
}

# Push
Write-Host "`n[4/4] Haciendo push a GitHub..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1
$pushStatus = $LASTEXITCODE

Write-Host ""
if ($pushStatus -eq 0) {
    Write-Host "  ✓ PUSH EXITOSO!" -ForegroundColor Green
    Write-Host "  El código está en GitHub ahora" -ForegroundColor Green
} else {
    Write-Host "  ✗ ERROR EN PUSH" -ForegroundColor Red
    Write-Host "  Salida:" -ForegroundColor Red
    $pushOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Si el error es de autenticación, ejecuta:" -ForegroundColor Yellow
    Write-Host "  .\configurar-token-github.ps1" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FIN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

