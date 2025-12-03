# Script completo para push a GitHub y despliegue
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PUSH A GITHUB Y DESPLIEGUE - MFS LEAD AI" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "cloudbuild.yaml")) {
    Write-Host "ERROR: No estás en el directorio correcto" -ForegroundColor Red
    Write-Host "Ejecuta: cd 'Media Fees Lead Automation\mfs-lead-generation-ai'" -ForegroundColor Yellow
    exit 1
}

# 1. Estado de Git
Write-Host "1. Estado de Git:" -ForegroundColor Yellow
git status 2>&1 | Write-Host

# 2. Último commit
Write-Host "`n2. Último commit:" -ForegroundColor Yellow
git log --oneline -1 2>&1 | Write-Host

# 3. Remoto
Write-Host "`n3. Remoto configurado:" -ForegroundColor Yellow
git remote -v 2>&1 | Write-Host

# 4. Añadir cambios
Write-Host "`n4. Añadiendo cambios..." -ForegroundColor Yellow
git add -A 2>&1 | Write-Host

# 5. Ver qué se va a commitear
Write-Host "`n5. Cambios a commitear:" -ForegroundColor Yellow
git status --short 2>&1 | Write-Host

# 6. Commit
Write-Host "`n6. Haciendo commit..." -ForegroundColor Yellow
$commitMsg = "Fix: Asegurar procesamiento de emails en Airtable - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git commit -m $commitMsg 2>&1 | Write-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Commit realizado" -ForegroundColor Green
} else {
    Write-Host "   ⚠ No hay cambios para commit o error" -ForegroundColor Yellow
}

# 7. Push
Write-Host "`n7. Haciendo push a GitHub..." -ForegroundColor Yellow
git push origin main 2>&1 | Write-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Push completado" -ForegroundColor Green
} else {
    Write-Host "   ✗ ERROR en push" -ForegroundColor Red
    Write-Host "   Verifica la conexión con GitHub" -ForegroundColor Yellow
    exit 1
}

# 8. Verificar push
Write-Host "`n8. Verificando push..." -ForegroundColor Yellow
git log --oneline -1 2>&1 | Write-Host

# 9. Desplegar
Write-Host "`n9. Desplegando con Cloud Build..." -ForegroundColor Yellow
$imageTag = "fix-airtable-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "   Tag: $imageTag" -ForegroundColor Gray
Write-Host ""

gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions="_IMAGE_TAG=$imageTag" 2>&1 | Write-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "PROCESO COMPLETADO EXITOSAMENTE" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "✓ Cambios pusheados a GitHub" -ForegroundColor Green
    Write-Host "✓ Servicio desplegado" -ForegroundColor Green
    Write-Host ""
    Write-Host "El servicio debería estar procesando emails en Airtable ahora." -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR EN EL DESPLIEGUE" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Revisa los mensajes de error arriba." -ForegroundColor Yellow
}

Write-Host ""

