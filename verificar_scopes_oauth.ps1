# Script para verificar scopes de OAuth
Write-Host "=== Verificando Scopes de OAuth ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1] Scopes necesarios para el servicio:" -ForegroundColor Yellow
Write-Host "  - https://www.googleapis.com/auth/gmail.readonly (para leer emails)" -ForegroundColor Green
Write-Host "  - https://www.googleapis.com/auth/gmail.send (opcional, para enviar emails)" -ForegroundColor Gray
Write-Host ""

Write-Host "[2] Verificando refresh token..." -ForegroundColor Yellow
$refreshToken = gcloud secrets versions access latest --secret="GMAIL_REFRESH_TOKEN" --project=check-in-sf 2>&1

if ($LASTEXITCODE -eq 0 -and -not $refreshToken.ToString().Contains("ERROR")) {
    Write-Host "  ✓ Refresh token encontrado" -ForegroundColor Green
    Write-Host "  (Los scopes del refresh token no se pueden verificar directamente)" -ForegroundColor Gray
    Write-Host "  Si el refresh token fue generado sin gmail.readonly, causará 'unauthorized_client'" -ForegroundColor Yellow
} else {
    Write-Host "  ✗ Error obteniendo refresh token: $refreshToken" -ForegroundColor Red
}

Write-Host ""

Write-Host "[3] Verificando OAuth Client en Google Cloud Console..." -ForegroundColor Yellow
Write-Host "  Ve a: https://console.cloud.google.com/apis/credentials?project=check-in-sf" -ForegroundColor Cyan
Write-Host "  O: https://console.cloud.google.com/apis/credentials?project=smn-content-v2" -ForegroundColor Cyan
Write-Host "  Busca tu OAuth Client y verifica:" -ForegroundColor White
Write-Host "    1. Que esté habilitado" -ForegroundColor White
Write-Host "    2. Que tenga autorizado el redirect URI: http://localhost:3000/oauth2callback" -ForegroundColor White
Write-Host "    3. Que los scopes estén configurados correctamente" -ForegroundColor White

Write-Host ""

Write-Host "[4] Solución: Regenerar Refresh Token con Scopes Correctos" -ForegroundColor Yellow
Write-Host ""
Write-Host "  El problema más común es que el refresh token NO tiene el scope gmail.readonly" -ForegroundColor Red
Write-Host ""
Write-Host "  Pasos:" -ForegroundColor Cyan
Write-Host "  1. Ejecuta el script para regenerar el refresh token:" -ForegroundColor White
Write-Host "     cd 'C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai'" -ForegroundColor Gray
Write-Host "     node obtener_refresh_token_completo.js" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Asegúrate de autorizar estos scopes:" -ForegroundColor White
Write-Host "     - https://www.googleapis.com/auth/gmail.readonly" -ForegroundColor Green
Write-Host "     - https://www.googleapis.com/auth/gmail.send (opcional)" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Copia el refresh token generado" -ForegroundColor White
Write-Host ""
Write-Host "  4. Actualiza el secret:" -ForegroundColor White
Write-Host "     echo 'REFRESH_TOKEN_AQUI' | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf" -ForegroundColor Gray

Write-Host ""
Write-Host "=== Verificación completada ===" -ForegroundColor Cyan

