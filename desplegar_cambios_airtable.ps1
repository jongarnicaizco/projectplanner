# Script para desplegar cambios de Airtable
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  DESPLIEGUE DE CAMBIOS - RESTAURAR AIRTABLE" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

# 1. Verificar estado
Write-Host "[1] Verificando estado del repositorio..." -ForegroundColor Yellow
$status = git status --short
if ($status) {
    Write-Host "Cambios pendientes:" -ForegroundColor Cyan
    Write-Host $status -ForegroundColor Gray
} else {
    Write-Host "✓ No hay cambios pendientes" -ForegroundColor Green
}

Write-Host ""

# 2. Agregar todos los cambios
Write-Host "[2] Agregando todos los cambios..." -ForegroundColor Yellow
git add -A
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Cambios agregados" -ForegroundColor Green
} else {
    Write-Host "✗ Error al agregar cambios" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 3. Hacer commit
Write-Host "[3] Haciendo commit..." -ForegroundColor Yellow
$commitMsg = @"
RESTAURAR AIRTABLE - Volver a usar Airtable en lugar de emails

- Restaurado import de airtableFindByEmailId y createAirtableRecord
- Eliminado import de sendLeadEmail
- Restaurada verificación de duplicados en Airtable
- Reemplazado sendLeadEmail por createAirtableRecord en processor.js
- Restauradas variables de Airtable en config.js
- Restauradas variables de entorno de Airtable en cloudbuild.yaml
- Restaurada funcionalidad getAirtableRecords en handlers/metrics.js
- Actualizado logging para mostrar AIRTABLE en lugar de EMAIL
"@

git commit -m $commitMsg
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Commit realizado" -ForegroundColor Green
    $commitHash = git log --oneline -1
    Write-Host "  Commit: $commitHash" -ForegroundColor Gray
} else {
    Write-Host "⚠ No hay cambios para commitear (puede que ya esté commitado)" -ForegroundColor Yellow
}

Write-Host ""

# 4. Hacer push
Write-Host "[4] Haciendo push a GitHub..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1 | Out-String

Write-Host $pushOutput

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓✓✓ PUSH EXITOSO ✓✓✓" -ForegroundColor Green
    Write-Host ""
    
    # 5. Verificar push
    Write-Host "[5] Verificando push..." -ForegroundColor Yellow
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
        Write-Host "Cloud Build debería detectar el push y desplegar automáticamente." -ForegroundColor Cyan
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

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan

