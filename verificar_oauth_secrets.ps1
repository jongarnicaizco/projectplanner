# Script para verificar y corregir OAuth secrets
Write-Host "=== Verificando OAuth Secrets ===" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$oauthProject = "smn-content-v2"  # Proyecto donde está el OAuth Client

# 1. Obtener Client ID y Secret de Secret Manager
Write-Host "[1] Obteniendo secrets de Secret Manager en $project..." -ForegroundColor Yellow

$clientId = gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=$project 2>&1
$clientSecret = gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=$project 2>&1

if ($LASTEXITCODE -eq 0 -and $clientId -and -not $clientId.ToString().Contains("ERROR")) {
    Write-Host "  ✓ GMAIL_CLIENT_ID encontrado: $($clientId.Substring(0, [Math]::Min(30, $clientId.Length)))..." -ForegroundColor Green
} else {
    Write-Host "  ✗ Error obteniendo GMAIL_CLIENT_ID: $clientId" -ForegroundColor Red
}

if ($LASTEXITCODE -eq 0 -and $clientSecret -and -not $clientSecret.ToString().Contains("ERROR")) {
    Write-Host "  ✓ GMAIL_CLIENT_SECRET encontrado: $($clientSecret.Substring(0, [Math]::Min(10, $clientSecret.Length)))..." -ForegroundColor Green
} else {
    Write-Host "  ✗ Error obteniendo GMAIL_CLIENT_SECRET: $clientSecret" -ForegroundColor Red
}

Write-Host ""

# 2. Listar OAuth Clients en smn-content-v2
Write-Host "[2] Listando OAuth Clients en $oauthProject..." -ForegroundColor Yellow
$oauthClients = gcloud alpha iap oauth-clients list --project=$oauthProject 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OAuth Clients encontrados:" -ForegroundColor Cyan
    Write-Host $oauthClients
} else {
    # Intentar con el método alternativo
    Write-Host "  Intentando método alternativo..." -ForegroundColor Yellow
    $oauthClients = gcloud projects describe $oauthProject --format="value(projectId)" 2>&1
    Write-Host "  Para ver OAuth Clients, ve a:" -ForegroundColor Cyan
    Write-Host "  https://console.cloud.google.com/apis/credentials?project=$oauthProject" -ForegroundColor White
}

Write-Host ""

# 3. Verificar redirect URI
Write-Host "[3] Verificando redirect URI configurado..." -ForegroundColor Yellow
Write-Host "  El redirect URI debe ser uno de estos:" -ForegroundColor Gray
Write-Host "    - http://localhost:3000/oauth2callback" -ForegroundColor White
Write-Host "    - https://mfs-lead-generation-ai-vtlrnibdxq-uc.a.run.app/oauth2callback" -ForegroundColor White
Write-Host "    - (o el que esté configurado en el código)" -ForegroundColor Gray

Write-Host ""
Write-Host "=== Solución ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "El error 'unauthorized_client' significa que:" -ForegroundColor Yellow
Write-Host "1. El Client ID/Secret en Secret Manager NO coinciden con el OAuth Client en $oauthProject" -ForegroundColor Red
Write-Host "2. O el redirect URI no está autorizado en el OAuth Client" -ForegroundColor Red
Write-Host ""
Write-Host "Pasos para solucionar:" -ForegroundColor Cyan
Write-Host "1. Ve a: https://console.cloud.google.com/apis/credentials?project=$oauthProject" -ForegroundColor White
Write-Host "2. Encuentra el OAuth Client que corresponde a la cuenta media.manager@feverup.com" -ForegroundColor White
Write-Host "3. Copia el Client ID y Client Secret" -ForegroundColor White
Write-Host "4. Actualiza los secrets en Secret Manager:" -ForegroundColor White
Write-Host "   gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=$project" -ForegroundColor Gray
Write-Host "   gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=$project" -ForegroundColor Gray
Write-Host "5. Verifica que el redirect URI esté autorizado en el OAuth Client" -ForegroundColor White

