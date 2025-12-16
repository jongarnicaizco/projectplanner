# Script para forzar push completo de todos los cambios
$ErrorActionPreference = "Continue"

Write-Host "FORZANDO PUSH COMPLETO A GITHUB" -ForegroundColor Cyan
Write-Host ""

# Configurar remoto con token
$token = "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"
$user = "jongarnicaizco"
$repo = "mfs-lead-generation-ai"

Write-Host "[1] Configurando remoto con token..." -ForegroundColor Yellow
git remote set-url origin "https://${user}:${token}@github.com/${user}/${repo}.git"
Write-Host "✓ Remoto configurado" -ForegroundColor Green

Write-Host ""
Write-Host "[2] Agregando todos los archivos..." -ForegroundColor Yellow
git add -A
$status = git status --short
if ($status) {
    Write-Host "Archivos modificados:" -ForegroundColor Cyan
    Write-Host $status -ForegroundColor Gray
} else {
    Write-Host "No hay cambios para agregar" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[3] Haciendo commit..." -ForegroundColor Yellow
$commitMsg = @"
ELIMINAR AIRTABLE COMPLETAMENTE - Reemplazar con envío de emails

- Eliminado servicio de Airtable, creado servicio de email
- Reemplazado createAirtableRecord por sendLeadEmail  
- Eliminada verificación de duplicados en Airtable
- Renombrado airtableData a emailData
- Eliminadas todas las referencias a Airtable en handlers
- Actualizado config.js y cloudbuild.yaml
- Los emails se envían desde media.manager@feverup.com a jongarnicaizco@gmail.com
"@

git commit -m $commitMsg
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Commit realizado" -ForegroundColor Green
} else {
    Write-Host "⚠ No hay cambios para commitear (puede que ya esté commitado)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[4] Haciendo push a GitHub..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1 | Out-String
Write-Host $pushOutput

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓✓✓ PUSH COMPLETADO EXITOSAMENTE ✓✓✓" -ForegroundColor Green
    Write-Host ""
    Write-Host "Los cambios están en GitHub y Cloud Build debería desplegar automáticamente" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "✗ Error en push. Código: $LASTEXITCODE" -ForegroundColor Red
    Write-Host "Salida:" -ForegroundColor Yellow
    Write-Host $pushOutput -ForegroundColor Gray
}

Write-Host ""
Write-Host "[5] Verificando estado final..." -ForegroundColor Yellow
$unpushed = git log origin/main..HEAD --oneline 2>&1
if ($unpushed -and $unpushed.Count -gt 0) {
    Write-Host "⚠ Aún hay commits sin push:" -ForegroundColor Yellow
    Write-Host $unpushed -ForegroundColor Gray
} else {
    Write-Host "✓ Todos los commits están pusheados" -ForegroundColor Green
}

Write-Host ""
Write-Host "Últimos 3 commits:" -ForegroundColor Cyan
git log --oneline -3

