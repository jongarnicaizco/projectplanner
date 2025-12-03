# Script para configurar token de GitHub
# Este script te ayudará a configurar un nuevo token de GitHub

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CONFIGURAR TOKEN DE GITHUB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "OPCIÓN 1: Usar GitHub CLI (recomendado)" -ForegroundColor Yellow
Write-Host "Si tienes GitHub CLI instalado, puedes autenticarte con:" -ForegroundColor Gray
Write-Host "  gh auth login" -ForegroundColor Cyan
Write-Host ""

Write-Host "OPCIÓN 2: Usar un token personal (Personal Access Token)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Para crear un nuevo token:" -ForegroundColor Gray
Write-Host "1. Ve a: https://github.com/settings/tokens" -ForegroundColor Cyan
Write-Host "2. Click en 'Generate new token' -> 'Generate new token (classic)'" -ForegroundColor Cyan
Write-Host "3. Dale un nombre (ej: 'cursor-ai-deploy')" -ForegroundColor Cyan
Write-Host "4. Selecciona los scopes: 'repo' (todo)" -ForegroundColor Cyan
Write-Host "5. Click en 'Generate token'" -ForegroundColor Cyan
Write-Host "6. COPIA EL TOKEN (solo se muestra una vez)" -ForegroundColor Yellow
Write-Host ""

$token = Read-Host "Pega tu nuevo token de GitHub aquí (o presiona Enter para usar GitHub CLI)"

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host ""
    Write-Host "Intentando usar GitHub CLI..." -ForegroundColor Yellow
    $ghStatus = gh auth status 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ GitHub CLI está autenticado" -ForegroundColor Green
        Write-Host "  Configurando remoto para usar GitHub CLI..." -ForegroundColor Gray
        git remote set-url origin https://github.com/jongarnicaizco/mfs-lead-generation-ai.git
        Write-Host "  ✓ Remoto configurado para usar GitHub CLI" -ForegroundColor Green
    } else {
        Write-Host "  ✗ GitHub CLI no está autenticado" -ForegroundColor Red
        Write-Host "  Ejecuta: gh auth login" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "Configurando remoto con el nuevo token..." -ForegroundColor Yellow
    $remoteUrl = "https://jongarnicaizco:$token@github.com/jongarnicaizco/mfs-lead-generation-ai.git"
    git remote set-url origin $remoteUrl
    Write-Host "  ✓ Remoto configurado con el nuevo token" -ForegroundColor Green
}

Write-Host ""
Write-Host "Probando conexión..." -ForegroundColor Yellow
$testConnection = git ls-remote origin main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Conexión exitosa!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ahora puedes hacer push:" -ForegroundColor Cyan
    Write-Host "  git push origin main" -ForegroundColor Gray
} else {
    Write-Host "  ✗ Error en la conexión:" -ForegroundColor Red
    $testConnection | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Verifica que el token tenga permisos 'repo' completos" -ForegroundColor Yellow
}

Write-Host ""

