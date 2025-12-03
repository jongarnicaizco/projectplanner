# Script para verificar OAuth Client en smn-content-v2
$ErrorActionPreference = "Continue"

Write-Host "VERIFICACION DE OAUTH CLIENT" -ForegroundColor Cyan
Write-Host ""

Write-Host "Los secrets estan en check-in-sf, pero el OAuth Client esta en smn-content-v2" -ForegroundColor Yellow
Write-Host ""

Write-Host "Secrets en check-in-sf:" -ForegroundColor Cyan
Write-Host ""

# Client ID en check-in-sf
Write-Host "GMAIL_CLIENT_ID (check-in-sf):" -ForegroundColor Yellow
$clientIdCheckIn = gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host $clientIdCheckIn -ForegroundColor Green
} else {
    Write-Host "[ERROR] No se pudo obtener" -ForegroundColor Red
}

Write-Host ""

# Client Secret en check-in-sf
Write-Host "GMAIL_CLIENT_SECRET (check-in-sf):" -ForegroundColor Yellow
$clientSecretCheckIn = gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf 2>&1
if ($LASTEXITCODE -eq 0) {
    $preview = $clientSecretCheckIn.Substring(0, [Math]::Min(20, $clientSecretCheckIn.Length))
    Write-Host "$preview..." -ForegroundColor Green
} else {
    Write-Host "[ERROR] No se pudo obtener" -ForegroundColor Red
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "INSTRUCCIONES" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Ve a Google Cloud Console del proyecto smn-content-v2:" -ForegroundColor Yellow
Write-Host "   https://console.cloud.google.com/apis/credentials?project=smn-content-v2" -ForegroundColor White
Write-Host ""
Write-Host "2. Encuentra tu OAuth 2.0 Client ID" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Compara el Client ID y Client Secret con los mostrados arriba" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. Si NO coinciden, actualiza los secrets en check-in-sf:" -ForegroundColor Yellow
Write-Host "   echo `"CLIENT_ID_DEL_OAUTH_CLIENT`" | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf" -ForegroundColor White
Write-Host "   echo `"CLIENT_SECRET_DEL_OAUTH_CLIENT`" | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf" -ForegroundColor White
Write-Host ""
Write-Host "5. Regenera el refresh token usando el Client ID/Secret correctos:" -ForegroundColor Yellow
Write-Host "   node obtener_refresh_token_completo.js" -ForegroundColor White
Write-Host ""

