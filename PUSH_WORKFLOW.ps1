# Script para hacer push del workflow de GitHub Actions
$ErrorActionPreference = "Continue"

cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PUSH WORKFLOW DE GITHUB ACTIONS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que el workflow existe
Write-Host "[1/4] Verificando workflow..." -ForegroundColor Yellow
if (Test-Path ".github\workflows\deploy.yml") {
    Write-Host "  ✓ Workflow existe localmente" -ForegroundColor Green
    Get-Content ".github\workflows\deploy.yml" | Select-Object -First 5 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ✗ Workflow NO existe" -ForegroundColor Red
    exit 1
}

# Configurar git
Write-Host "`n[2/4] Configurando Git..." -ForegroundColor Yellow
git remote set-url origin https://jongarnicaizco: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@github.com/jongarnicaizco/mfs-lead-generation-ai.git
Write-Host "  ✓ Remoto configurado" -ForegroundColor Green

# Añadir workflow
Write-Host "`n[3/4] Añadiendo workflow a git..." -ForegroundColor Yellow
git add .github/workflows/deploy.yml
$status = git status --porcelain
if ($status -match "deploy.yml") {
    Write-Host "  ✓ Workflow añadido" -ForegroundColor Green
    Write-Host "    Archivos en staging:" -ForegroundColor Gray
    git status --short | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
} else {
    Write-Host "  ⚠ Workflow ya está en staging o no hay cambios" -ForegroundColor Yellow
}

# Commit y push
Write-Host "`n[4/4] Haciendo commit y push..." -ForegroundColor Yellow
git commit -m "Add: GitHub Actions workflow for auto-deploy"
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
    git log --oneline -1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ⚠ No hay cambios para commit (puede que ya esté commiteado)" -ForegroundColor Yellow
}

git push origin main
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Push completado" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error en push" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ WORKFLOW PUSHEADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Ahora deberías ver el workflow en:" -ForegroundColor Cyan
Write-Host "https://github.com/jongarnicaizco/mfs-lead-generation-ai/actions" -ForegroundColor White
Write-Host ""
Write-Host "Si ya configuraste el secret GCP_SA_KEY, el workflow se ejecutará automáticamente." -ForegroundColor Yellow
Write-Host ""

