# Script simple para forzar el push - FUNCIONA
# Este script se ejecuta automáticamente desde Cursor AI para hacer push
# Uso: .\forzar-push.ps1 [mensaje-commit]

param(
    [Parameter(Mandatory=$false)]
    [string]$CommitMessage = "Update: Cambios automáticos desde Cursor AI - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PUSH A GITHUB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Configurar remoto con token
Write-Host "[1/3] Configurando remoto..." -ForegroundColor Yellow
$token = "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"
$remoteUrl = "https://jongarnicaizco:$token@github.com/jongarnicaizco/mfs-lead-generation-ai.git"
git remote set-url origin $remoteUrl
Write-Host "  ✓ Remoto configurado" -ForegroundColor Green

# Añadir todos los cambios
Write-Host "`n[2/3] Añadiendo todos los cambios..." -ForegroundColor Yellow
git add -A
Write-Host "  ✓ Cambios añadidos" -ForegroundColor Green

# Commit y push (método que funciona)
Write-Host "`n[3/3] Haciendo commit y push..." -ForegroundColor Yellow
Write-Host "  Mensaje: $CommitMessage" -ForegroundColor Gray

git commit -m $CommitMessage
$commitStatus = $LASTEXITCODE

if ($commitStatus -eq 0) {
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
    Write-Host "  Haciendo push..." -ForegroundColor Gray
    git push origin main
    $pushStatus = $LASTEXITCODE
    
    if ($pushStatus -eq 0) {
        Write-Host "  ✓ PUSH EXITOSO!" -ForegroundColor Green
    } else {
        Write-Host "  ✗ ERROR EN PUSH" -ForegroundColor Red
        Write-Host "  Exit code: $pushStatus" -ForegroundColor Red
    }
} else {
    Write-Host "  ⚠ No se pudo hacer commit (puede que no haya cambios)" -ForegroundColor Yellow
    Write-Host "  Intentando push de commits existentes..." -ForegroundColor Gray
    git push origin main
    $pushStatus = $LASTEXITCODE
    
    if ($pushStatus -eq 0) {
        Write-Host "  ✓ PUSH EXITOSO!" -ForegroundColor Green
    } else {
        Write-Host "  ✗ ERROR EN PUSH" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FIN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
