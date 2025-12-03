$ErrorActionPreference = "Continue"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "=== DIAGNÓSTICO ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Verificando archivo test.txt..." -ForegroundColor Yellow
if (Test-Path "test.txt") {
    Write-Host "   ✓ test.txt existe" -ForegroundColor Green
    Get-Content test.txt | Write-Host
} else {
    Write-Host "   ✗ test.txt NO existe" -ForegroundColor Red
}

Write-Host "`n2. Estado de Git..." -ForegroundColor Yellow
git status | Write-Host

Write-Host "`n3. Últimos commits..." -ForegroundColor Yellow
git log --oneline -5 | Write-Host

Write-Host "`n4. Remoto configurado..." -ForegroundColor Yellow
git remote -v | Write-Host

Write-Host "`n5. Añadiendo archivo..." -ForegroundColor Yellow
git add test.txt 2>&1 | Write-Host

Write-Host "`n6. Estado después de add..." -ForegroundColor Yellow
git status --short | Write-Host

Write-Host "`n7. Haciendo commit..." -ForegroundColor Yellow
$commitOutput = git commit -m "Test: Subir archivo test.txt a GitHub" 2>&1
$commitOutput | Write-Host

Write-Host "`n8. Haciendo push..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1
$pushOutput | Write-Host
Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor $(if ($LASTEXITCODE -eq 0) { "Green" } else { "Red" })

Write-Host "`n9. Verificando commits locales vs remotos..." -ForegroundColor Yellow
git fetch origin 2>&1 | Write-Host
git log origin/main..HEAD --oneline | Write-Host

Write-Host "`n=== FIN DIAGNÓSTICO ===" -ForegroundColor Cyan

