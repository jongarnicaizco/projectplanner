# Script para verificar conexión con GitHub y hacer push
$ErrorActionPreference = "Continue"

Write-Host "`n=== Verificando conexión con GitHub ===" -ForegroundColor Cyan

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

Write-Host "`n1. Verificando remoto..." -ForegroundColor Yellow
$remote = git remote -v
Write-Host $remote

Write-Host "`n2. Verificando estado del repositorio..." -ForegroundColor Yellow
$status = git status
Write-Host $status

Write-Host "`n3. Verificando últimos commits..." -ForegroundColor Yellow
$log = git log --oneline -3
Write-Host $log

Write-Host "`n4. Verificando cambios pendientes..." -ForegroundColor Yellow
$changes = git status --porcelain
if ($changes) {
    Write-Host "  Cambios pendientes:" -ForegroundColor Yellow
    Write-Host $changes
    
    Write-Host "`n5. Añadiendo cambios..." -ForegroundColor Yellow
    git add -A
    Write-Host "  ✓ Cambios añadidos" -ForegroundColor Green
    
    Write-Host "`n6. Haciendo commit..." -ForegroundColor Yellow
    git commit -m "Fix: Añadir logs para debug de extractFromEmail y corregir cloudbuild.yaml"
    Write-Host "  ✓ Commit realizado" -ForegroundColor Green
} else {
    Write-Host "  No hay cambios pendientes" -ForegroundColor Gray
}

Write-Host "`n7. Verificando conexión con GitHub..." -ForegroundColor Yellow
try {
    $remoteCheck = git ls-remote origin 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Conexión con GitHub OK" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Error de conexión:" -ForegroundColor Red
        Write-Host $remoteCheck
        Write-Host "`n  Posibles soluciones:" -ForegroundColor Yellow
        Write-Host "  - Verifica tu autenticación con GitHub (token, SSH, etc.)" -ForegroundColor Gray
        Write-Host "  - Ejecuta: git config --global credential.helper manager" -ForegroundColor Gray
        exit 1
    }
} catch {
    Write-Host "  ✗ Error al verificar conexión:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

Write-Host "`n8. Haciendo push a GitHub..." -ForegroundColor Yellow
$pushResult = git push origin main 2>&1
Write-Host $pushResult

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Push exitoso a GitHub" -ForegroundColor Green
    Write-Host "  Repositorio: https://github.com/jongarnicaizco/mfs-lead-generation-ai" -ForegroundColor Gray
} else {
    Write-Host "`n✗ Error en push. Código de salida: $LASTEXITCODE" -ForegroundColor Red
    Write-Host "  Salida del comando:" -ForegroundColor Yellow
    Write-Host $pushResult
    
    Write-Host "`n  Posibles soluciones:" -ForegroundColor Yellow
    Write-Host "  - Verifica tu autenticación con GitHub" -ForegroundColor Gray
    Write-Host "  - Ejecuta: gh auth login (si tienes GitHub CLI)" -ForegroundColor Gray
    Write-Host "  - O configura un token: git remote set-url origin https://TOKEN@github.com/jongarnicaizco/mfs-lead-generation-ai.git" -ForegroundColor Gray
    exit 1
}

Write-Host "`n=== Verificación completada ===" -ForegroundColor Cyan

