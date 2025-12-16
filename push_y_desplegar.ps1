# Script para hacer push a GitHub y verificar despliegue
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  PUSH A GITHUB Y DESPLIEGUE" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

# 1. Verificar estado
Write-Host "[1] Verificando estado del repositorio..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "⚠ Hay cambios sin commitear:" -ForegroundColor Yellow
    Write-Host $status -ForegroundColor Gray
    Write-Host ""
    Write-Host "¿Quieres hacer commit de estos cambios? (S/N)" -ForegroundColor Cyan
    $response = Read-Host
    if ($response -eq "S" -or $response -eq "s") {
        git add .
        git commit -m "Actualizar código - Eliminar Airtable y agregar envío de emails"
        Write-Host "✓ Cambios commiteados" -ForegroundColor Green
    }
} else {
    Write-Host "✓ No hay cambios sin commitear" -ForegroundColor Green
}

Write-Host ""

# 2. Verificar commits sin push
Write-Host "[2] Verificando commits sin push..." -ForegroundColor Yellow
git fetch origin 2>&1 | Out-Null
$unpushed = git log origin/main..HEAD --oneline 2>&1

if ($unpushed -and $unpushed.Count -gt 0) {
    Write-Host "Hay $($unpushed.Count) commit(s) sin push:" -ForegroundColor Yellow
    $unpushed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    Write-Host ""
    
    Write-Host "[3] Haciendo push a GitHub..." -ForegroundColor Yellow
    $pushOutput = git push origin main 2>&1 | Out-String
    
    Write-Host $pushOutput
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓✓✓ PUSH EXITOSO A GITHUB ✓✓✓" -ForegroundColor Green
        Write-Host ""
        
        # 4. Verificar que el push se completó
        Write-Host "[4] Verificando push..." -ForegroundColor Yellow
        git fetch origin 2>&1 | Out-Null
        $localCommit = git log --oneline -1 2>&1
        $remoteCommit = git log origin/main --oneline -1 2>&1
        
        Write-Host "Commit local:  $localCommit" -ForegroundColor Cyan
        Write-Host "Commit remoto: $remoteCommit" -ForegroundColor Cyan
        
        if ($localCommit -eq $remoteCommit) {
            Write-Host ""
            Write-Host "✓✓✓ VERIFICACIÓN EXITOSA ✓✓✓" -ForegroundColor Green
            Write-Host ""
            Write-Host "El código está en GitHub:" -ForegroundColor Cyan
            Write-Host "https://github.com/jongarnicaizco/mfs-lead-generation-ai" -ForegroundColor White
            Write-Host ""
            Write-Host "Cloud Build debería detectar el push automáticamente y desplegar." -ForegroundColor Cyan
            Write-Host "Puedes ver el progreso en:" -ForegroundColor Cyan
            Write-Host "https://console.cloud.google.com/cloud-build/builds?project=check-in-sf" -ForegroundColor White
        } else {
            Write-Host ""
            Write-Host "⚠ Los commits no coinciden - verifica manualmente" -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "✗✗✗ PUSH FALLÓ ✗✗✗" -ForegroundColor Red
        Write-Host ""
        Write-Host "Posibles soluciones:" -ForegroundColor Yellow
        Write-Host "1. Verifica tus credenciales de GitHub" -ForegroundColor White
        Write-Host "2. Usa la interfaz de Git de Cursor (Ctrl+Shift+G) y haz push desde ahí" -ForegroundColor White
        Write-Host "3. O ejecuta manualmente: git push origin main" -ForegroundColor White
    }
} else {
    Write-Host "✓ Todos los commits están pusheados" -ForegroundColor Green
    Write-Host ""
    Write-Host "El código ya está en GitHub." -ForegroundColor Cyan
    Write-Host "Si Cloud Build tiene un trigger configurado, debería desplegar automáticamente." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan

