# Script para verificar y corregir OAuth
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  VERIFICACIÓN Y CORRECCIÓN DE OAUTH" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"

Write-Host "[1] Verificando secrets actuales..." -ForegroundColor Yellow
Write-Host ""

# Client ID
Write-Host "GMAIL_CLIENT_ID:" -ForegroundColor Cyan
$clientId = gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=$project 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host $clientId -ForegroundColor Gray
} else {
    Write-Host "✗ Error obteniendo Client ID" -ForegroundColor Red
    Write-Host $clientId -ForegroundColor Red
}

Write-Host ""

# Client Secret
Write-Host "GMAIL_CLIENT_SECRET:" -ForegroundColor Cyan
$clientSecret = gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=$project 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host ($clientSecret.Substring(0, [Math]::Min(20, $clientSecret.Length)) + "...") -ForegroundColor Gray
} else {
    Write-Host "✗ Error obteniendo Client Secret" -ForegroundColor Red
    Write-Host $clientSecret -ForegroundColor Red
}

Write-Host ""

# Refresh Token
Write-Host "GMAIL_REFRESH_TOKEN:" -ForegroundColor Cyan
$refreshToken = gcloud secrets versions access latest --secret="GMAIL_REFRESH_TOKEN" --project=$project 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host ($refreshToken.Substring(0, [Math]::Min(30, $refreshToken.Length)) + "...") -ForegroundColor Gray
} else {
    Write-Host "✗ Error obteniendo Refresh Token" -ForegroundColor Red
    Write-Host $refreshToken -ForegroundColor Red
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  INSTRUCCIONES" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Ve a Google Cloud Console:" -ForegroundColor Yellow
Write-Host "   https://console.cloud.google.com/apis/credentials?project=check-in-sf" -ForegroundColor White
Write-Host ""
Write-Host "2. Encuentra tu OAuth 2.0 Client ID" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Verifica que el Client ID y Client Secret coincidan con los mostrados arriba" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. Si NO coinciden:" -ForegroundColor Yellow
Write-Host "   - Actualiza los secrets con los valores correctos" -ForegroundColor White
Write-Host "   - O regenera el refresh token usando los valores actuales" -ForegroundColor White
Write-Host ""
Write-Host "5. Para regenerar el refresh token:" -ForegroundColor Yellow
Write-Host "   node obtener_refresh_token_completo.js" -ForegroundColor White
Write-Host ""
Write-Host "   Usa el mismo Client ID/Secret que están en Secret Manager" -ForegroundColor Cyan
Write-Host ""

