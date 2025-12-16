# Script para verificar configuración del OAuth Client
$ErrorActionPreference = "Continue"

Write-Host "`n=== VERIFICACIÓN DE OAUTH CLIENT ===" -ForegroundColor Cyan

Write-Host "`nEste script te ayudará a verificar la configuración del OAuth Client." -ForegroundColor Yellow
Write-Host "El error 'unauthorized_client' puede deberse a:" -ForegroundColor Yellow
Write-Host "  1. OAuth Client no habilitado" -ForegroundColor White
Write-Host "  2. Redirect URI no autorizado" -ForegroundColor White
Write-Host "  3. Refresh token expirado o generado con credenciales diferentes" -ForegroundColor White
Write-Host "  4. OAuth Client en proyecto diferente" -ForegroundColor White

Write-Host "`n=== PASOS PARA VERIFICAR ===" -ForegroundColor Cyan

Write-Host "`n1. Verifica el OAuth Client en Google Cloud Console:" -ForegroundColor Yellow
Write-Host "   https://console.cloud.google.com/apis/credentials?project=check-in-sf" -ForegroundColor Cyan
Write-Host "   Busca el OAuth 2.0 Client ID para media.manager@feverup.com" -ForegroundColor White

Write-Host "`n2. Verifica que esté HABILITADO:" -ForegroundColor Yellow
Write-Host "   - Debe aparecer como 'Enabled' o 'Habilitado'" -ForegroundColor White
Write-Host "   - Si está 'Disabled', haz clic en 'Enable' o 'Habilitar'" -ForegroundColor White

Write-Host "`n3. Verifica el Redirect URI autorizado:" -ForegroundColor Yellow
Write-Host "   - Debe incluir: http://localhost:3000/oauth2callback" -ForegroundColor White
Write-Host "   - O el que esté configurado en GMAIL_REDIRECT_URI" -ForegroundColor White
Write-Host "   - Si no está, haz clic en 'ADD URI' y añádelo" -ForegroundColor White

Write-Host "`n4. Compara Client ID y Secret:" -ForegroundColor Yellow
Write-Host "   - Copia el Client ID del OAuth Client" -ForegroundColor White
Write-Host "   - Compara con el de Secret Manager:" -ForegroundColor White
$clientIdSecret = gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf 2>&1
if ($clientIdSecret -notmatch "ERROR") {
    Write-Host "   Secret Manager Client ID: $($clientIdSecret.Substring(0, [Math]::Min(50, $clientIdSecret.Length)))..." -ForegroundColor Gray
} else {
    Write-Host "   Error obteniendo Client ID de Secret Manager" -ForegroundColor Red
}

Write-Host "`n5. Si todo coincide pero sigue fallando, regenera el refresh token:" -ForegroundColor Yellow
Write-Host "   cd 'Media Fees Lead Automation\mfs-lead-generation-ai'" -ForegroundColor Gray
Write-Host "   node obtener_refresh_token_completo.js" -ForegroundColor Gray
Write-Host "   (Usa el Client ID y Secret del OAuth Client)" -ForegroundColor Gray

Write-Host "`n6. También verifica en el proyecto smn-content-v2:" -ForegroundColor Yellow
Write-Host "   https://console.cloud.google.com/apis/credentials?project=smn-content-v2" -ForegroundColor Cyan
Write-Host "   (Por si el OAuth Client está en ese proyecto)" -ForegroundColor White

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

