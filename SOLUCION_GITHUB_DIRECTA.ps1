# SOLUCIÓN DIRECTA PARA PUSH A GITHUB
# Este script usa múltiples métodos para asegurar que el push funcione

$ErrorActionPreference = "Continue"

cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SOLUCIÓN DIRECTA - PUSH A GITHUB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Método 1: Verificar configuración actual
Write-Host "[MÉTODO 1] Verificando configuración de Git..." -ForegroundColor Yellow
$remote = git remote get-url origin 2>&1
Write-Host "  Remote actual: $remote" -ForegroundColor Gray

$user = git config user.name 2>&1
$email = git config user.email 2>&1
Write-Host "  Usuario: $user" -ForegroundColor Gray
Write-Host "  Email: $email" -ForegroundColor Gray

# Método 2: Configurar con token en URL
Write-Host "`n[MÉTODO 2] Configurando remoto con token..." -ForegroundColor Yellow
$token = "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"
$userName = "jongarnicaizco"
$repoName = "mfs-lead-generation-ai"
$remoteUrl = "https://${userName}:${token}@github.com/${userName}/${repoName}.git"

git remote set-url origin $remoteUrl
Write-Host "  ✓ Remoto configurado" -ForegroundColor Green

# Método 3: Verificar que los archivos existen
Write-Host "`n[MÉTODO 3] Verificando archivos..." -ForegroundColor Yellow
$files = @(
    "services\email-sender.js",
    "services\processor.js",
    ".github\workflows\deploy.yml"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file existe" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file NO existe" -ForegroundColor Red
    }
}

# Método 4: Añadir todos los cambios
Write-Host "`n[MÉTODO 4] Añadiendo cambios..." -ForegroundColor Yellow
git add -A
$status = git status --porcelain
if ($status) {
    Write-Host "  Archivos en staging:" -ForegroundColor Gray
    $status | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ⚠ No hay cambios para añadir" -ForegroundColor Yellow
}

# Método 5: Commit con mensaje claro
Write-Host "`n[MÉTODO 5] Haciendo commit..." -ForegroundColor Yellow
$commitMsg = "Add: Email de prueba antes de Airtable + GitHub Actions workflow"
$commitOutput = git commit -m $commitMsg 2>&1 | Out-String
Write-Host "  Salida del commit:" -ForegroundColor Gray
Write-Host $commitOutput

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
    git log --oneline -1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} elseif ($commitOutput -match "nothing to commit") {
    Write-Host "  ⚠ No hay cambios para commit" -ForegroundColor Yellow
} else {
    Write-Host "  ✗ Error en commit" -ForegroundColor Red
}

# Método 6: Push con salida completa
Write-Host "`n[MÉTODO 6] Haciendo push (esto puede tardar)..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1 | Out-String
Write-Host "  Salida del push:" -ForegroundColor Gray
Write-Host $pushOutput

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ PUSH COMPLETADO EXITOSAMENTE" -ForegroundColor Green
} else {
    Write-Host "  ✗ ERROR EN PUSH" -ForegroundColor Red
    Write-Host "  Intenta ejecutar manualmente: git push origin main" -ForegroundColor Yellow
}

# Método 7: Verificar con git ls-remote
Write-Host "`n[MÉTODO 7] Verificando conexión con GitHub..." -ForegroundColor Yellow
$remoteCheck = git ls-remote origin HEAD 2>&1 | Out-String
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Conexión con GitHub OK" -ForegroundColor Green
    Write-Host "  Último commit en remoto:" -ForegroundColor Gray
    $remoteCheck | Select-Object -First 1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ✗ Error conectando con GitHub" -ForegroundColor Red
    Write-Host "  Salida: $remoteCheck" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "VERIFICACIÓN FINAL" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Por favor verifica en GitHub:" -ForegroundColor Cyan
Write-Host "1. https://github.com/jongarnicaizco/mfs-lead-generation-ai" -ForegroundColor White
Write-Host "2. Debe existir: services/email-sender.js" -ForegroundColor White
Write-Host "3. Debe existir: .github/workflows/deploy.yml" -ForegroundColor White
Write-Host "4. Actions: https://github.com/jongarnicaizco/mfs-lead-generation-ai/actions" -ForegroundColor White
Write-Host ""

