# Script para verificar que NO hay logs de envío de emails
$ErrorActionPreference = "Continue"

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"

Write-Host "`n=== VERIFICACIÓN: NO DEBE HABER ENVÍO DE EMAILS ===" -ForegroundColor Cyan

Write-Host "`nBuscando logs de envío de emails (NO debería haber ninguno)..." -ForegroundColor Yellow

# Buscar logs de sendLeadEmail
$filter1 = "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND textPayload=~`"sendLeadEmail`""
$logs1 = gcloud logging read $filter1 --project=$project --limit=5 --format=json --freshness=30m 2>&1

# Buscar logs de Email enviado
$filter2 = "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND textPayload=~`"Email enviado`""
$logs2 = gcloud logging read $filter2 --project=$project --limit=5 --format=json --freshness=30m 2>&1

$foundAny = $false

if ($logs1 -notmatch "ERROR") {
    try {
        $logsJson1 = $logs1 | ConvertFrom-Json
        if ($logsJson1 -and $logsJson1.Count -gt 0) {
            Write-Host "  ✗ Se encontraron logs de sendLeadEmail (NO debería haber):" -ForegroundColor Red
            $foundAny = $true
            foreach ($log in $logsJson1) {
                Write-Host "    [$($log.timestamp)] $($log.textPayload)" -ForegroundColor Red
            }
        }
    } catch { }
}

if ($logs2 -notmatch "ERROR") {
    try {
        $logsJson2 = $logs2 | ConvertFrom-Json
        if ($logsJson2 -and $logsJson2.Count -gt 0) {
            Write-Host "  ✗ Se encontraron logs de 'Email enviado' (NO debería haber):" -ForegroundColor Red
            $foundAny = $true
            foreach ($log in $logsJson2) {
                Write-Host "    [$($log.timestamp)] $($log.textPayload)" -ForegroundColor Red
            }
        }
    } catch { }
}

if (-not $foundAny) {
    Write-Host "  ✓ No se encontraron logs de envío de emails (correcto)" -ForegroundColor Green
}

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

