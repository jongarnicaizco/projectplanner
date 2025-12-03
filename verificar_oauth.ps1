# Script para verificar y corregir OAuth
$ErrorActionPreference = "Continue"

Write-Host "`n=== VERIFICACIÓN DE OAUTH ===" -ForegroundColor Cyan

# 1. Verificar secrets en Secret Manager
Write-Host "`n1. Verificando secrets en Secret Manager..." -ForegroundColor Yellow
try {
    $clientId = gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf 2>&1
    $clientSecret = gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf 2>&1
    $refreshToken = gcloud secrets versions access latest --secret="GMAIL_REFRESH_TOKEN" --project=check-in-sf 2>&1
    
    if ($clientId -match "ERROR" -or $clientSecret -match "ERROR" -or $refreshToken -match "ERROR") {
        Write-Host "  ✗ Error obteniendo secrets:" -ForegroundColor Red
        Write-Host "    Client ID: $($clientId -match 'ERROR' ? 'ERROR' : 'OK')" -ForegroundColor $(if ($clientId -match "ERROR") { "Red" } else { "Green" })
        Write-Host "    Client Secret: $($clientSecret -match 'ERROR' ? 'ERROR' : 'OK')" -ForegroundColor $(if ($clientSecret -match "ERROR") { "Red" } else { "Green" })
        Write-Host "    Refresh Token: $($refreshToken -match 'ERROR' ? 'ERROR' : 'OK')" -ForegroundColor $(if ($refreshToken -match "ERROR") { "Red" } else { "Green" })
    } else {
        Write-Host "  ✓ Secrets encontrados:" -ForegroundColor Green
        Write-Host "    Client ID: $($clientId.Substring(0, [Math]::Min(50, $clientId.Length)))..." -ForegroundColor White
        Write-Host "    Client Secret: $($clientSecret.Substring(0, [Math]::Min(20, $clientSecret.Length)))..." -ForegroundColor White
        Write-Host "    Refresh Token: $($refreshToken.Substring(0, [Math]::Min(30, $refreshToken.Length)))..." -ForegroundColor White
    }
} catch {
    Write-Host "  ✗ Error verificando secrets: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. Instrucciones para corregir
Write-Host "`n2. Si el refresh token está expirado, necesitas regenerarlo:" -ForegroundColor Yellow
Write-Host "   a) Ve a: https://console.cloud.google.com/apis/credentials?project=check-in-sf" -ForegroundColor White
Write-Host "   b) Busca el OAuth 2.0 Client ID para media.manager@feverup.com" -ForegroundColor White
Write-Host "   c) Copia el Client ID y Client Secret" -ForegroundColor White
Write-Host "   d) Ejecuta: node obtener_refresh_token_completo.js" -ForegroundColor White
Write-Host "   e) Actualiza los secrets con:" -ForegroundColor White
Write-Host "      echo 'CLIENT_ID' | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf" -ForegroundColor Gray
Write-Host "      echo 'CLIENT_SECRET' | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf" -ForegroundColor Gray
Write-Host "      echo 'REFRESH_TOKEN' | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf" -ForegroundColor Gray

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

