# Script para hacer push con el nuevo token
$ErrorActionPreference = "Continue"

$token = "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"
$user = "jongarnicaizco"
$repo = "mfs-lead-generation-ai"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  PUSH CON NUEVO TOKEN" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

Write-Host "[1] Configurando remoto con nuevo token..." -ForegroundColor Yellow
git remote set-url origin "https://${user}:${token}@github.com/${user}/${repo}.git"
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Remoto configurado" -ForegroundColor Green
} else {
    Write-Host "✗ Error configurando remoto" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2] Verificando commits sin push..." -ForegroundColor Yellow
$unpushed = git log origin/main..HEAD --oneline 2>&1
if ($unpushed -and $unpushed.Count -gt 0) {
    Write-Host "Hay commits sin push:" -ForegroundColor Yellow
    Write-Host $unpushed -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "[3] Haciendo push..." -ForegroundColor Yellow
    $pushOutput = git push origin main 2>&1 | Out-String
    
    Write-Host $pushOutput -ForegroundColor Gray
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓✓✓ PUSH EXITOSO ✓✓✓" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "✗ PUSH FALLÓ" -ForegroundColor Red
        Write-Host "Código de error: $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✓ Todos los commits están pusheados" -ForegroundColor Green
}

Write-Host ""
Write-Host "[4] Verificando estado final..." -ForegroundColor Yellow
git fetch origin 2>&1 | Out-Null

$localCommit = git log --oneline -1 2>&1
$remoteCommit = git log origin/main --oneline -1 2>&1

Write-Host "Commit local:  $localCommit" -ForegroundColor Cyan
Write-Host "Commit remoto: $remoteCommit" -ForegroundColor Cyan

if ($localCommit -eq $remoteCommit) {
    Write-Host ""
    Write-Host "✓✓✓ VERIFICACIÓN EXITOSA - Los commits coinciden ✓✓✓" -ForegroundColor Green
    Write-Host ""
    Write-Host "Los cambios están en GitHub:" -ForegroundColor Cyan
    Write-Host "https://github.com/jongarnicaizco/mfs-lead-generation-ai" -ForegroundColor White
    Write-Host ""
    Write-Host "Cloud Build debería detectar el push y desplegar automáticamente" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "⚠ Los commits no coinciden" -ForegroundColor Yellow
}

