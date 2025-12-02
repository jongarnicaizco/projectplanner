# Script definitivo para hacer push
$ErrorActionPreference = "Continue"

$token = "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"
$user = "jongarnicaizco"
$repo = "mfs-lead-generation-ai"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  PUSH DEFINITIVO A GITHUB" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# 1. Verificar token con API
Write-Host "[1] Verificando token con API de GitHub..." -ForegroundColor Yellow
$headers = @{
    Authorization = "token $token"
    Accept = "application/vnd.github.v3+json"
}

try {
    $userInfo = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers
    Write-Host "✓ Token válido - Usuario: $($userInfo.login)" -ForegroundColor Green
} catch {
    Write-Host "✗ Token inválido o sin permisos: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Verificar acceso al repositorio
Write-Host "[2] Verificando acceso al repositorio..." -ForegroundColor Yellow
try {
    $repoInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/${user}/${repo}" -Headers $headers
    Write-Host "✓ Repositorio accesible: $($repoInfo.full_name)" -ForegroundColor Green
    Write-Host "  Permisos: admin=$($repoInfo.permissions.admin), push=$($repoInfo.permissions.push), pull=$($repoInfo.permissions.pull)" -ForegroundColor Gray
    
    if (-not $repoInfo.permissions.push) {
        Write-Host "✗ ERROR: El token NO tiene permisos de escritura (push)" -ForegroundColor Red
        Write-Host "  Necesitas regenerar el token con permisos 'repo' completos" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "✗ Error accediendo al repositorio: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 3. Configurar remoto
Write-Host "[3] Configurando remoto..." -ForegroundColor Yellow
git remote remove origin 2>&1 | Out-Null
git remote add origin "https://${user}:${token}@github.com/${user}/${repo}.git"
Write-Host "✓ Remoto configurado" -ForegroundColor Green

Write-Host ""

# 4. Verificar commits sin push
Write-Host "[4] Verificando commits sin push..." -ForegroundColor Yellow
git fetch origin 2>&1 | Out-Null
$unpushed = git log origin/main..HEAD --oneline 2>&1

if ($unpushed -and $unpushed.Count -gt 0) {
    Write-Host "Hay $($unpushed.Count) commit(s) sin push:" -ForegroundColor Yellow
    $unpushed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    Write-Host ""
    
    # 5. Hacer push
    Write-Host "[5] Haciendo push..." -ForegroundColor Yellow
    $pushOutput = git push origin main 2>&1 | Out-String
    
    Write-Host $pushOutput -ForegroundColor Gray
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓✓✓ PUSH EXITOSO ✓✓✓" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "✗ PUSH FALLÓ - Código: $LASTEXITCODE" -ForegroundColor Red
        
        # Intentar método alternativo
        Write-Host ""
        Write-Host "[6] Intentando método alternativo (push directo)..." -ForegroundColor Yellow
        $directPush = git push "https://${user}:${token}@github.com/${user}/${repo}.git" main 2>&1 | Out-String
        Write-Host $directPush -ForegroundColor Gray
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✓✓✓ PUSH EXITOSO (método alternativo) ✓✓✓" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "✗ Push falló con ambos métodos" -ForegroundColor Red
            Write-Host ""
            Write-Host "Posibles causas:" -ForegroundColor Yellow
            Write-Host "1. El token no tiene permisos 'repo' completos" -ForegroundColor White
            Write-Host "2. El token está expirado o revocado" -ForegroundColor White
            Write-Host "3. El repositorio no existe o no tienes acceso" -ForegroundColor White
            Write-Host ""
            Write-Host "Solución:" -ForegroundColor Cyan
            Write-Host "1. Ve a: https://github.com/settings/tokens" -ForegroundColor White
            Write-Host "2. Verifica que el token 'cloudgithub' tenga scope 'repo' (todo)" -ForegroundColor White
            Write-Host "3. Si no, crea uno nuevo con permisos 'repo' completos" -ForegroundColor White
            exit 1
        }
    }
} else {
    Write-Host "✓ Todos los commits están pusheados" -ForegroundColor Green
}

Write-Host ""

# 7. Verificación final
Write-Host "[7] Verificación final..." -ForegroundColor Yellow
git fetch origin 2>&1 | Out-Null

$localCommit = git log --oneline -1 2>&1
$remoteCommit = git log origin/main --oneline -1 2>&1

Write-Host "Commit local:  $localCommit" -ForegroundColor Cyan
Write-Host "Commit remoto: $remoteCommit" -ForegroundColor Cyan

if ($localCommit -eq $remoteCommit) {
    Write-Host ""
    Write-Host "✓✓✓ VERIFICACIÓN EXITOSA ✓✓✓" -ForegroundColor Green
    Write-Host ""
    Write-Host "Los cambios están en GitHub:" -ForegroundColor Cyan
    Write-Host "https://github.com/jongarnicaizco/mfs-lead-generation-ai" -ForegroundColor White
    Write-Host ""
    Write-Host "Cloud Build debería detectar el push y desplegar automáticamente" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "⚠ Los commits no coinciden - verifica manualmente en GitHub" -ForegroundColor Yellow
}

