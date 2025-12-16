# Script completo para verificar y corregir OAuth
$ErrorActionPreference = "Continue"

$separator = "=" * 70
Write-Host $separator -ForegroundColor Cyan
Write-Host "  VERIFICACION COMPLETA DE OAUTH" -ForegroundColor Cyan
Write-Host $separator -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"

Write-Host "[1] Obteniendo secrets actuales..." -ForegroundColor Yellow
Write-Host ""

# Client ID
Write-Host "GMAIL_CLIENT_ID:" -ForegroundColor Cyan
try {
    $clientId = gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=$project 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  $clientId" -ForegroundColor Green
        $clientIdValue = $clientId
    } else {
        Write-Host "  [ERROR] $clientId" -ForegroundColor Red
        $clientIdValue = $null
    }
} catch {
        Write-Host "  [ERROR] Error obteniendo Client ID" -ForegroundColor Red
    $clientIdValue = $null
}

Write-Host ""

# Client Secret
Write-Host "GMAIL_CLIENT_SECRET:" -ForegroundColor Cyan
try {
    $clientSecret = gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=$project 2>&1
    if ($LASTEXITCODE -eq 0) {
        $preview = $clientSecret.Substring(0, [Math]::Min(20, $clientSecret.Length))
        Write-Host "  $preview..." -ForegroundColor Green
        $clientSecretValue = $clientSecret
    } else {
        Write-Host "  [ERROR] $clientSecret" -ForegroundColor Red
        $clientSecretValue = $null
    }
} catch {
        Write-Host "  [ERROR] Error obteniendo Client Secret" -ForegroundColor Red
    $clientSecretValue = $null
}

Write-Host ""

# Refresh Token
Write-Host "GMAIL_REFRESH_TOKEN:" -ForegroundColor Cyan
try {
    $refreshToken = gcloud secrets versions access latest --secret="GMAIL_REFRESH_TOKEN" --project=$project 2>&1
    if ($LASTEXITCODE -eq 0) {
        $preview = $refreshToken.Substring(0, [Math]::Min(30, $refreshToken.Length))
        Write-Host "  $preview..." -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] $refreshToken" -ForegroundColor Red
    }
} catch {
        Write-Host "  [ERROR] Error obteniendo Refresh Token" -ForegroundColor Red
}

Write-Host ""
Write-Host $separator -ForegroundColor Cyan
Write-Host "  VERIFICACION EN GOOGLE CLOUD CONSOLE" -ForegroundColor Cyan
Write-Host $separator -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Ve a:" -ForegroundColor Yellow
Write-Host "   https://console.cloud.google.com/apis/credentials?project=check-in-sf" -ForegroundColor White
Write-Host ""
Write-Host "2. Encuentra tu OAuth 2.0 Client ID" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Verifica que:" -ForegroundColor Yellow
Write-Host "   [OK] El Client ID coincide con el mostrado arriba" -ForegroundColor White
Write-Host "   [OK] El Client Secret coincide con el mostrado arriba" -ForegroundColor White
Write-Host "   [OK] El OAuth Client esta HABILITADO (no deshabilitado)" -ForegroundColor White
Write-Host "   [OK] Tiene el Redirect URI: http://localhost:3000/oauth2callback" -ForegroundColor White
Write-Host ""
Write-Host "4. Si NO coinciden, actualiza los secrets:" -ForegroundColor Yellow
if ($clientIdValue -and $clientSecretValue) {
    Write-Host "   echo `"NUEVO_CLIENT_ID`" | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=$project" -ForegroundColor White
    Write-Host "   echo `"NUEVO_CLIENT_SECRET`" | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=$project" -ForegroundColor White
} else {
    Write-Host "   (Primero necesitas obtener los valores correctos)" -ForegroundColor Gray
}
Write-Host ""
Write-Host "5. Si actualizaste Client ID/Secret, regenera el refresh token:" -ForegroundColor Yellow
Write-Host "   node obtener_refresh_token_completo.js" -ForegroundColor White
Write-Host ""
Write-Host $separator -ForegroundColor Cyan

