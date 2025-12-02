# Script para actualizar el refresh token
$ErrorActionPreference = "Continue"

$token = "1//04KYWifxh1hstCgYIARAAGAQSNwF-L9IrxrDcRstPuvNmht1Sa6vvvy6S3e0EjwwGxTjLYEJnkLajiwlrHS6hjoDpShP9NJH3H_c"
$project = "check-in-sf"
$secretName = "GMAIL_REFRESH_TOKEN"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  ACTUALIZAR REFRESH TOKEN" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

Write-Host "[1] Actualizando secret..." -ForegroundColor Yellow
$token | gcloud secrets versions add $secretName --data-file=- --project=$project 2>&1 | Out-String | Write-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓✓✓ SECRET ACTUALIZADO EXITOSAMENTE ✓✓✓" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "[2] Verificando versión más reciente..." -ForegroundColor Yellow
    $latest = gcloud secrets versions list $secretName --project=$project --limit=1 --format="value(name)" 2>&1
    
    if ($latest) {
        Write-Host "✓ Última versión: $latest" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "[3] Verificando contenido (primeros 20 caracteres)..." -ForegroundColor Yellow
    $content = gcloud secrets versions access latest --secret=$secretName --project=$project 2>&1
    
    if ($content) {
        $preview = $content.Substring(0, [Math]::Min(20, $content.Length))
        Write-Host "✓ Token actualizado: $preview..." -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "=" * 70 -ForegroundColor Cyan
    Write-Host "  PRÓXIMOS PASOS" -ForegroundColor Cyan
    Write-Host "=" * 70 -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. El servicio usará automáticamente el nuevo token" -ForegroundColor Cyan
    Write-Host "2. Espera unos minutos para que se actualice" -ForegroundColor Cyan
    Write-Host "3. El próximo email procesado debería enviarse correctamente" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Para verificar que funciona, revisa los logs:" -ForegroundColor Yellow
    Write-Host 'gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mfs-lead-generation-ai\" AND textPayload=~\"Email.*enviado exitosamente\"" --limit=5 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=10m' -ForegroundColor White
    
} else {
    Write-Host ""
    Write-Host "✗✗✗ ERROR AL ACTUALIZAR SECRET ✗✗✗" -ForegroundColor Red
    Write-Host ""
    Write-Host "Verifica que:" -ForegroundColor Yellow
    Write-Host "1. Tienes permisos para actualizar secrets" -ForegroundColor White
    Write-Host "2. El secret GMAIL_REFRESH_TOKEN existe" -ForegroundColor White
    Write-Host "3. Estás autenticado en gcloud" -ForegroundColor White
}

