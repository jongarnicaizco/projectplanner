# Push usando autenticación del sistema (sin token en URL)
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  PUSH CON AUTENTICACIÓN DEL SISTEMA" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

Write-Host "[1] Configurando remoto sin token..." -ForegroundColor Yellow
git remote set-url origin https://github.com/jongarnicaizco/mfs-lead-generation-ai.git
Write-Host "✓ Remoto configurado" -ForegroundColor Green

Write-Host ""
Write-Host "[2] Configurando credential helper..." -ForegroundColor Yellow
git config --global credential.helper manager-core
Write-Host "✓ Credential helper configurado" -ForegroundColor Green

Write-Host ""
Write-Host "[3] Verificando commits sin push..." -ForegroundColor Yellow
git fetch origin 2>&1 | Out-Null
$unpushed = git log origin/main..HEAD --oneline 2>&1

if ($unpushed -and $unpushed.Count -gt 0) {
    Write-Host "Hay $($unpushed.Count) commit(s) sin push:" -ForegroundColor Yellow
    $unpushed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    Write-Host ""
    
    Write-Host "[4] Haciendo push (puede pedir credenciales)..." -ForegroundColor Yellow
    Write-Host "Si te pide credenciales, usa tu usuario de GitHub y el token como contraseña" -ForegroundColor Cyan
    Write-Host ""
    
    $pushOutput = git push origin main 2>&1 | Out-String
    
    Write-Host $pushOutput
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓✓✓ PUSH EXITOSO ✓✓✓" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "✗ PUSH FALLÓ" -ForegroundColor Red
        Write-Host ""
        Write-Host "Opciones:" -ForegroundColor Yellow
        Write-Host "1. Si te pidió credenciales, asegúrate de usar el token como contraseña" -ForegroundColor White
        Write-Host "2. Usa GitHub CLI: gh auth login" -ForegroundColor White
        Write-Host "3. O usa el token directamente en la URL" -ForegroundColor White
    }
} else {
    Write-Host "✓ Todos los commits están pusheados" -ForegroundColor Green
}

Write-Host ""
Write-Host "[5] Verificación final..." -ForegroundColor Yellow
git fetch origin 2>&1 | Out-Null

$localCommit = git log --oneline -1 2>&1
$remoteCommit = git log origin/main --oneline -1 2>&1

Write-Host "Commit local:  $localCommit" -ForegroundColor Cyan
Write-Host "Commit remoto: $remoteCommit" -ForegroundColor Cyan

if ($localCommit -eq $remoteCommit) {
    Write-Host ""
    Write-Host "✓✓✓ VERIFICACIÓN EXITOSA ✓✓✓" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠ Los commits no coinciden" -ForegroundColor Yellow
}

