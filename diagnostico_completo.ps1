# Diagnóstico completo y corrección del servicio
$ErrorActionPreference = "Continue"

$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DIAGNÓSTICO COMPLETO - MFS LEAD GENERATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar estado del servicio
Write-Host "1. Verificando estado del servicio..." -ForegroundColor Yellow
$service = gcloud run services describe $serviceName --region=$region --project=$projectId --format=json 2>&1 | ConvertFrom-Json
if ($service) {
    $url = $service.status.url
    $ready = $service.status.conditions | Where-Object { $_.type -eq "Ready" } | Select-Object -First 1
    Write-Host "   URL: $url" -ForegroundColor Green
    Write-Host "   Estado: $($ready.status)" -ForegroundColor $(if ($ready.status -eq "True") { "Green" } else { "Red" })
} else {
    Write-Host "   ERROR: No se pudo obtener información del servicio" -ForegroundColor Red
}

# 2. Verificar variables de entorno
Write-Host "`n2. Verificando variables de entorno..." -ForegroundColor Yellow
$envVars = $service.spec.template.spec.containers[0].env
$airtableBaseId = ($envVars | Where-Object { $_.name -eq "AIRTABLE_BASE_ID" }).value
$airtableTable = ($envVars | Where-Object { $_.name -eq "AIRTABLE_TABLE" }).value
$airtableTokenSecret = ($envVars | Where-Object { $_.name -eq "AIRTABLE_TOKEN_SECRET" }).value

Write-Host "   AIRTABLE_BASE_ID: $airtableBaseId" -ForegroundColor $(if ($airtableBaseId) { "Green" } else { "Red" })
Write-Host "   AIRTABLE_TABLE: $airtableTable" -ForegroundColor $(if ($airtableTable) { "Green" } else { "Red" })
Write-Host "   AIRTABLE_TOKEN_SECRET: $airtableTokenSecret" -ForegroundColor $(if ($airtableTokenSecret) { "Green" } else { "Red" })

# 3. Verificar logs recientes
Write-Host "`n3. Verificando logs recientes (últimas 2 horas)..." -ForegroundColor Yellow
$logs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$serviceName" --project=$projectId --limit=20 --format="value(textPayload,timestamp)" --freshness=2h 2>&1
if ($logs) {
    $errorLogs = $logs | Select-String -Pattern "ERROR|error|Airtable|airtable" | Select-Object -First 5
    if ($errorLogs) {
        Write-Host "   Errores encontrados:" -ForegroundColor Red
        $errorLogs | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    } else {
        Write-Host "   No se encontraron errores recientes" -ForegroundColor Green
    }
} else {
    Write-Host "   No se encontraron logs recientes" -ForegroundColor Yellow
}

# 4. Verificar procesamiento de emails
Write-Host "`n4. Verificando procesamiento de emails..." -ForegroundColor Yellow
$processingLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$serviceName AND textPayload=~\"procesando|processing|Airtable|airtable\"" --project=$projectId --limit=10 --format="value(textPayload,timestamp)" --freshness=2h 2>&1
if ($processingLogs) {
    Write-Host "   Logs de procesamiento encontrados: $($processingLogs.Count)" -ForegroundColor Green
    $processingLogs | Select-Object -First 3 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} else {
    Write-Host "   No se encontraron logs de procesamiento recientes" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DIAGNÓSTICO COMPLETADO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

