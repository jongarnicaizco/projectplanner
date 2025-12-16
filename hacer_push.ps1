# Script para hacer push de los cambios
Set-Location "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Write-Host "`n=== Agregando archivos ===" -ForegroundColor Cyan
git add utils/helpers.js services/processor.js services/airtable.js
$addResult = $LASTEXITCODE
Write-Host "Exit code: $addResult"

Write-Host "`n=== Estado después de add ===" -ForegroundColor Cyan
git status --short

if ($addResult -eq 0) {
    Write-Host "`n=== Haciendo commit ===" -ForegroundColor Cyan
    git commit -m "feat: Add email parsing, language detection, and location mapping"
    $commitResult = $LASTEXITCODE
    Write-Host "Exit code: $commitResult"
    
    if ($commitResult -eq 0) {
        Write-Host "`n=== Haciendo push ===" -ForegroundColor Cyan
        git push origin main
        $pushResult = $LASTEXITCODE
        Write-Host "Exit code: $pushResult"
        
        if ($pushResult -eq 0) {
            Write-Host "`n=== ✓ Push exitoso! ===" -ForegroundColor Green
            Write-Host "Cloud Build debería desplegar automáticamente" -ForegroundColor Green
        } else {
            Write-Host "`n=== ✗ Error en push ===" -ForegroundColor Red
        }
    } else {
        Write-Host "`n=== ✗ Error en commit ===" -ForegroundColor Red
    }
} else {
    Write-Host "`n=== ✗ Error en add ===" -ForegroundColor Red
}

Write-Host "`n=== Estado final ===" -ForegroundColor Cyan
git status --short
git log --oneline -1

