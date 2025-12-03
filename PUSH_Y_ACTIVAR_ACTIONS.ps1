# Script para hacer push y activar GitHub Actions
$ErrorActionPreference = "Continue"

cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PUSH Y ACTIVAR GITHUB ACTIONS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar archivos
Write-Host "[1/5] Verificando archivos..." -ForegroundColor Yellow
if (Test-Path "services\email-sender.js") {
    Write-Host "  ✓ email-sender.js existe" -ForegroundColor Green
} else {
    Write-Host "  ✗ email-sender.js NO existe" -ForegroundColor Red
    exit 1
}

if (Test-Path ".github\workflows\deploy.yml") {
    Write-Host "  ✓ GitHub Actions workflow existe" -ForegroundColor Green
} else {
    Write-Host "  ✗ GitHub Actions workflow NO existe" -ForegroundColor Red
    exit 1
}

# 2. Configurar git
Write-Host "`n[2/5] Configurando Git..." -ForegroundColor Yellow
git remote set-url origin https://jongarnicaizco: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@github.com/jongarnicaizco/mfs-lead-generation-ai.git
Write-Host "  ✓ Remoto configurado" -ForegroundColor Green

# 3. Añadir cambios
Write-Host "`n[3/5] Añadiendo cambios..." -ForegroundColor Yellow
git add services/email-sender.js services/processor.js .github/workflows/deploy.yml
$status = git status --porcelain
if ($status) {
    Write-Host "  Archivos añadidos:" -ForegroundColor Gray
    $status | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ⚠ No hay cambios para añadir" -ForegroundColor Yellow
}
Write-Host "  ✓ Cambios añadidos" -ForegroundColor Green

# 4. Commit
Write-Host "`n[4/5] Haciendo commit..." -ForegroundColor Yellow
$commitMsg = "Add: Email de prueba antes de Airtable + GitHub Actions deploy"
$commitOutput = git commit -m $commitMsg 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
    git log --oneline -1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} elseif ($commitOutput -match "nothing to commit") {
    Write-Host "  ⚠ No hay cambios para commit" -ForegroundColor Yellow
} else {
    Write-Host "  ✗ Error en commit: $commitOutput" -ForegroundColor Red
}

# 5. Push
Write-Host "`n[5/5] Haciendo push a GitHub..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Push completado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "  GitHub Actions debería activarse automáticamente" -ForegroundColor Cyan
    Write-Host "  Verifica en: https://github.com/jongarnicaizco/mfs-lead-generation-ai/actions" -ForegroundColor Cyan
} else {
    Write-Host "  ✗ Error en push:" -ForegroundColor Red
    Write-Host "    $pushOutput" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ PUSH COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANTE: Para que GitHub Actions funcione, necesitas:" -ForegroundColor Yellow
Write-Host "1. Ir a: https://github.com/jongarnicaizco/mfs-lead-generation-ai/settings/secrets/actions" -ForegroundColor White
Write-Host "2. Añadir un secret llamado 'GCP_SA_KEY' con el JSON de la service account" -ForegroundColor White
Write-Host "3. El workflow se ejecutará automáticamente en cada push" -ForegroundColor White
Write-Host ""
Write-Host "Si no tienes el secret configurado, el workflow fallará pero el código está en GitHub." -ForegroundColor Yellow
Write-Host ""

