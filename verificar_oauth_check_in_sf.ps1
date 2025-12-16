# Script para verificar OAuth en check-in-sf
Write-Host "=== Verificando OAuth en check-in-sf ===" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"

# 1. Obtener secrets de Secret Manager
Write-Host "[1] Obteniendo secrets de Secret Manager en $project..." -ForegroundColor Yellow

$clientId = gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=$project 2>&1
if ($LASTEXITCODE -eq 0 -and -not $clientId.ToString().Contains("ERROR")) {
    Write-Host "  ✓ GMAIL_CLIENT_ID: $clientId" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error obteniendo GMAIL_CLIENT_ID: $clientId" -ForegroundColor Red
    exit 1
}

$clientSecret = gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=$project 2>&1
if ($LASTEXITCODE -eq 0 -and -not $clientSecret.ToString().Contains("ERROR")) {
    $preview = $clientSecret.Substring(0, [Math]::Min(20, $clientSecret.Length))
    Write-Host "  ✓ GMAIL_CLIENT_SECRET: $preview..." -ForegroundColor Green
} else {
    Write-Host "  ✗ Error obteniendo GMAIL_CLIENT_SECRET: $clientSecret" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Verificar OAuth Clients en check-in-sf
Write-Host "[2] Verificando OAuth Clients en $project..." -ForegroundColor Yellow
Write-Host "  Ve a: https://console.cloud.google.com/apis/credentials?project=$project" -ForegroundColor Cyan
Write-Host "  Busca el OAuth Client que corresponde a media.manager@feverup.com" -ForegroundColor Cyan
Write-Host "  Compara el Client ID y Client Secret con los valores de arriba" -ForegroundColor Cyan

Write-Host ""

# 3. Verificar OAuth Clients en smn-content-v2 (por si acaso)
Write-Host "[3] También verifica OAuth Clients en smn-content-v2..." -ForegroundColor Yellow
Write-Host "  Ve a: https://console.cloud.google.com/apis/credentials?project=smn-content-v2" -ForegroundColor Cyan
Write-Host "  (El OAuth Client puede estar aquí si la cuenta de Gmail está asociada a este proyecto)" -ForegroundColor Gray

Write-Host ""

# 4. Diagnóstico
Write-Host "[4] Diagnóstico del error 'unauthorized_client':" -ForegroundColor Yellow
Write-Host "  Este error significa que:" -ForegroundColor White
Write-Host "    1. El Client ID/Secret en Secret Manager NO coinciden con el OAuth Client" -ForegroundColor Red
Write-Host "    2. O el OAuth Client no está habilitado" -ForegroundColor Red
Write-Host "    3. O el redirect URI no está autorizado" -ForegroundColor Red

Write-Host ""

# 5. Solución
Write-Host "[5] Solución:" -ForegroundColor Yellow
Write-Host "  Si los valores NO coinciden:" -ForegroundColor White
Write-Host "    1. Obtén el Client ID/Secret correcto del OAuth Client" -ForegroundColor Cyan
Write-Host "    2. Actualiza los secrets:" -ForegroundColor Cyan
Write-Host '       echo "CLIENT_ID" | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf' -ForegroundColor Gray
Write-Host '       echo "CLIENT_SECRET" | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf' -ForegroundColor Gray
Write-Host "    3. Regenera el refresh token si cambiaste el Client ID/Secret" -ForegroundColor Cyan

Write-Host ""
Write-Host "=== Verificación completada ===" -ForegroundColor Cyan

