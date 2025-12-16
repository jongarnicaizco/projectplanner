# Script simple para verificar secrets de OAuth
$ErrorActionPreference = "Continue"

Write-Host "VERIFICACION DE SECRETS OAUTH" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"

Write-Host "GMAIL_CLIENT_ID:" -ForegroundColor Yellow
$clientId = gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=$project 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host $clientId -ForegroundColor Green
} else {
    Write-Host "[ERROR] No se pudo obtener Client ID" -ForegroundColor Red
    Write-Host $clientId -ForegroundColor Red
}

Write-Host ""
Write-Host "GMAIL_CLIENT_SECRET:" -ForegroundColor Yellow
$clientSecret = gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=$project 2>&1
if ($LASTEXITCODE -eq 0) {
    $preview = $clientSecret.Substring(0, [Math]::Min(20, $clientSecret.Length))
    Write-Host "$preview..." -ForegroundColor Green
} else {
    Write-Host "[ERROR] No se pudo obtener Client Secret" -ForegroundColor Red
    Write-Host $clientSecret -ForegroundColor Red
}

Write-Host ""
Write-Host "GMAIL_REFRESH_TOKEN:" -ForegroundColor Yellow
$refreshToken = gcloud secrets versions access latest --secret="GMAIL_REFRESH_TOKEN" --project=$project 2>&1
if ($LASTEXITCODE -eq 0) {
    $preview = $refreshToken.Substring(0, [Math]::Min(30, $refreshToken.Length))
    Write-Host "$preview..." -ForegroundColor Green
} else {
    Write-Host "[ERROR] No se pudo obtener Refresh Token" -ForegroundColor Red
    Write-Host $refreshToken -ForegroundColor Red
}

Write-Host ""
Write-Host "INSTRUCCIONES:" -ForegroundColor Cyan
Write-Host "1. Ve a: https://console.cloud.google.com/apis/credentials?project=check-in-sf" -ForegroundColor White
Write-Host "2. Compara los valores mostrados arriba con los de tu OAuth Client" -ForegroundColor White
Write-Host "3. Si NO coinciden, actualiza los secrets o regenera el refresh token" -ForegroundColor White

