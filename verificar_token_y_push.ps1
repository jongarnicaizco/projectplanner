# Verificar token y hacer push
$ErrorActionPreference = "Continue"

$token = "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"
$user = "jongarnicaizco"
$repo = "mfs-lead-generation-ai"

Write-Host "VERIFICANDO TOKEN Y HACIENDO PUSH" -ForegroundColor Cyan
Write-Host ""

# Verificar token
Write-Host "Verificando token..." -ForegroundColor Yellow
$headers = @{Authorization = "token $token"}

try {
    $userInfo = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers
    Write-Host "Token válido - Usuario: $($userInfo.login)" -ForegroundColor Green
} catch {
    Write-Host "Token inválido: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Verificar permisos del repositorio
Write-Host "Verificando permisos del repositorio..." -ForegroundColor Yellow
try {
    $repoInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/${user}/${repo}" -Headers $headers
    $perms = $repoInfo.permissions
    Write-Host "Permisos:" -ForegroundColor Cyan
    Write-Host "  admin: $($perms.admin)" -ForegroundColor Gray
    Write-Host "  push:  $($perms.push)" -ForegroundColor Gray
    Write-Host "  pull:  $($perms.pull)" -ForegroundColor Gray
    
    if (-not $perms.push) {
        Write-Host ""
        Write-Host "ERROR: El token NO tiene permisos de push" -ForegroundColor Red
        Write-Host "Necesitas regenerar el token con scope 'repo' completo" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Haciendo push..." -ForegroundColor Yellow

# Configurar remoto
git remote set-url origin "https://${user}:${token}@github.com/${user}/${repo}.git"

# Hacer push
$output = git push origin main 2>&1 | Out-String
Write-Host $output

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "PUSH EXITOSO" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "PUSH FALLÓ" -ForegroundColor Red
    Write-Host "Intenta regenerar el token con permisos 'repo' completos" -ForegroundColor Yellow
}

