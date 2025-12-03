# Script para verificar que el código de Airtable está correcto
$ErrorActionPreference = "Continue"

Write-Host "`n=== VERIFICACIÓN DE CÓDIGO AIRTABLE ===" -ForegroundColor Cyan

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

Write-Host "`n1. Verificando imports en processor.js..." -ForegroundColor Yellow
$processorContent = Get-Content "services\processor.js" -Raw

if ($processorContent -match "import.*airtableFindByEmailId.*createAirtableRecord") {
    Write-Host "  ✓ Import de Airtable encontrado" -ForegroundColor Green
} else {
    Write-Host "  ✗ Import de Airtable NO encontrado" -ForegroundColor Red
}

if ($processorContent -match "import.*sendLeadEmail|import.*email\.js") {
    Write-Host "  ✗ Import de email encontrado (NO debería estar)" -ForegroundColor Red
} else {
    Write-Host "  ✓ No hay import de email (correcto)" -ForegroundColor Green
}

Write-Host "`n2. Verificando llamada a createAirtableRecord..." -ForegroundColor Yellow
if ($processorContent -match "createAirtableRecord\(") {
    Write-Host "  ✓ Llamada a createAirtableRecord encontrada" -ForegroundColor Green
} else {
    Write-Host "  ✗ Llamada a createAirtableRecord NO encontrada" -ForegroundColor Red
}

if ($processorContent -match "sendLeadEmail\(") {
    Write-Host "  ✗ Llamada a sendLeadEmail encontrada (NO debería estar)" -ForegroundColor Red
} else {
    Write-Host "  ✓ No hay llamada a sendLeadEmail (correcto)" -ForegroundColor Green
}

Write-Host "`n3. Estado de git:" -ForegroundColor Yellow
git status --short

Write-Host "`n4. Último commit:" -ForegroundColor Yellow
git log --oneline -1

Write-Host "`n5. Verificando si hay cambios sin commit..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "  ⚠ Hay cambios sin commit:" -ForegroundColor Yellow
    Write-Host $status -ForegroundColor White
    Write-Host "`n  Ejecuta: git add -A && git commit -m 'mensaje' && git push origin main" -ForegroundColor Gray
} else {
    Write-Host "  ✓ No hay cambios sin commit" -ForegroundColor Green
}

Write-Host "`n=== RECOMENDACIÓN ===" -ForegroundColor Cyan
Write-Host "Si todo está correcto pero no se despliega:" -ForegroundColor Yellow
Write-Host "1. Verifica que el push a GitHub fue exitoso" -ForegroundColor White
Write-Host "2. Espera 2-3 minutos a que Cloud Build detecte el cambio" -ForegroundColor White
Write-Host "3. O ejecuta un build manual:" -ForegroundColor White
Write-Host "   gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf" -ForegroundColor Gray

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

