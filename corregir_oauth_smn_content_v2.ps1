# Script para corregir OAuth cuando el Client está en smn-content-v2
$ErrorActionPreference = "Continue"

Write-Host "`n=== CORRECCIÓN DE OAUTH (smn-content-v2) ===" -ForegroundColor Cyan

Write-Host "`nEl OAuth Client está en smn-content-v2, pero los secrets están en check-in-sf." -ForegroundColor Yellow
Write-Host "Necesitamos asegurarnos de que los valores coincidan exactamente." -ForegroundColor Yellow

Write-Host "`n=== PASO 1: Obtener Client ID y Secret de smn-content-v2 ===" -ForegroundColor Cyan
Write-Host "`n1. Ve a: https://console.cloud.google.com/apis/credentials?project=smn-content-v2" -ForegroundColor Yellow
Write-Host "2. Busca el OAuth 2.0 Client ID para media.manager@feverup.com" -ForegroundColor Yellow
Write-Host "3. Haz clic en el Client ID para ver los detalles" -ForegroundColor Yellow
Write-Host "4. Copia el Client ID (algo como: 123456789-abcdefghijklmnop.apps.googleusercontent.com)" -ForegroundColor Yellow
Write-Host "5. Copia el Client Secret (si no lo ves, haz clic en 'Reset secret' o 'Show secret')" -ForegroundColor Yellow

Write-Host "`n=== PASO 2: Verificar valores actuales en Secret Manager ===" -ForegroundColor Cyan
Write-Host "`nValores actuales en check-in-sf:" -ForegroundColor Yellow

try {
    $currentClientId = gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf 2>&1 | Out-String
    $currentClientId = $currentClientId.Trim()
    
    $currentClientSecret = gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf 2>&1 | Out-String
    $currentClientSecret = $currentClientSecret.Trim()
    
    if ($currentClientId -notmatch "ERROR" -and $currentClientId.Length -gt 0) {
        Write-Host "  Client ID actual: $($currentClientId.Substring(0, [Math]::Min(50, $currentClientId.Length)))..." -ForegroundColor White
    } else {
        Write-Host "  ✗ Error obteniendo Client ID" -ForegroundColor Red
    }
    
    if ($currentClientSecret -notmatch "ERROR" -and $currentClientSecret.Length -gt 0) {
        Write-Host "  Client Secret actual: $($currentClientSecret.Substring(0, [Math]::Min(20, $currentClientSecret.Length)))..." -ForegroundColor White
    } else {
        Write-Host "  ✗ Error obteniendo Client Secret" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== PASO 3: Comparar y Actualizar ===" -ForegroundColor Cyan
Write-Host "`nSi los valores NO coinciden con el OAuth Client en smn-content-v2:" -ForegroundColor Yellow
Write-Host "`n1. Actualiza el Client ID:" -ForegroundColor Yellow
Write-Host "   echo 'CLIENT_ID_DEL_OAUTH_CLIENT_EN_smn-content-v2' | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf" -ForegroundColor Gray

Write-Host "`n2. Actualiza el Client Secret:" -ForegroundColor Yellow
Write-Host "   echo 'CLIENT_SECRET_DEL_OAUTH_CLIENT_EN_smn-content-v2' | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf" -ForegroundColor Gray

Write-Host "`n=== PASO 4: Regenerar Refresh Token ===" -ForegroundColor Cyan
Write-Host "`nIMPORTANTE: Si actualizaste el Client ID/Secret, DEBES regenerar el refresh token:" -ForegroundColor Yellow
Write-Host "`n1. Ejecuta:" -ForegroundColor Yellow
Write-Host "   cd 'Media Fees Lead Automation\mfs-lead-generation-ai'" -ForegroundColor Gray
Write-Host "   node obtener_refresh_token_completo.js" -ForegroundColor Gray

Write-Host "`n2. Usa el Client ID y Secret del OAuth Client en smn-content-v2" -ForegroundColor Yellow
Write-Host "3. Autoriza con media.manager@feverup.com" -ForegroundColor Yellow
Write-Host "4. Copia el refresh token generado" -ForegroundColor Yellow

Write-Host "`n5. Actualiza el refresh token:" -ForegroundColor Yellow
Write-Host "   echo 'NUEVO_REFRESH_TOKEN' | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf" -ForegroundColor Gray

Write-Host "`n=== PASO 5: Verificar Redirect URI ===" -ForegroundColor Cyan
Write-Host "`nEn el OAuth Client en smn-content-v2, verifica que esté autorizado:" -ForegroundColor Yellow
Write-Host "   - http://localhost:3000/oauth2callback" -ForegroundColor White
Write-Host "   Si no está, añádelo con 'ADD URI'" -ForegroundColor White

Write-Host "`n=== FIN ===" -ForegroundColor Cyan
Write-Host "`nDespués de actualizar los secrets, espera 1-2 minutos y verifica los logs." -ForegroundColor Green

