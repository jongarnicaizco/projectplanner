# Script para hacer push con un token nuevo
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  PUSH A GITHUB CON TOKEN" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

Write-Host "El commit ya está hecho (3f611f1)" -ForegroundColor Green
Write-Host "Solo necesitamos hacer push con un token válido" -ForegroundColor Yellow
Write-Host ""

# Solicitar token nuevo
Write-Host "Para obtener un token nuevo:" -ForegroundColor Cyan
Write-Host "1. Ve a: https://github.com/settings/tokens/new" -ForegroundColor White
Write-Host "2. Nombre: mfs-lead-generation-ai" -ForegroundColor White
Write-Host "3. Selecciona scope: repo (todo)" -ForegroundColor White
Write-Host "4. Genera y copia el token" -ForegroundColor White
Write-Host ""

$token = Read-Host "Pega el nuevo token aquí (o presiona Enter para usar el actual)"

if ([string]::IsNullOrWhiteSpace($token)) {
    $token = "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"
    Write-Host "Usando token actual (puede que no funcione si está expirado)" -ForegroundColor Yellow
} else {
    Write-Host "Usando token nuevo" -ForegroundColor Green
}

Write-Host ""
Write-Host "Configurando remoto..." -ForegroundColor Yellow
git remote set-url origin "https://jongarnicaizco:${token}@github.com/jongarnicaizco/mfs-lead-generation-ai.git"

Write-Host "Haciendo push..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1 | Out-String

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓✓✓ PUSH EXITOSO ✓✓✓" -ForegroundColor Green
    Write-Host ""
    Write-Host "Los cambios están en GitHub:" -ForegroundColor Cyan
    Write-Host "https://github.com/jongarnicaizco/mfs-lead-generation-ai" -ForegroundColor White
    Write-Host ""
    Write-Host "Cloud Build debería detectar el push y desplegar automáticamente" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "✗ PUSH FALLÓ" -ForegroundColor Red
    Write-Host ""
    Write-Host "Salida:" -ForegroundColor Yellow
    Write-Host $pushOutput -ForegroundColor Gray
    Write-Host ""
    Write-Host "Posibles causas:" -ForegroundColor Yellow
    Write-Host "1. Token expirado o sin permisos 'repo'" -ForegroundColor White
    Write-Host "2. Token revocado" -ForegroundColor White
    Write-Host "3. Repositorio no existe o no tienes acceso" -ForegroundColor White
    Write-Host ""
    Write-Host "Solución: Genera un nuevo token con permisos 'repo' en:" -ForegroundColor Cyan
    Write-Host "https://github.com/settings/tokens/new" -ForegroundColor White
}

