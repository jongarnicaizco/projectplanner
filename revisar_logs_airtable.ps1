# Script para revisar logs relacionados con Airtable
Write-Host "`n=== Revisando logs de mfs-lead-generation-ai ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"

# Verificar estado del servicio
Write-Host "`n1. Estado del servicio Cloud Run:" -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=us-central1 --project=$project --format="json" 2>&1 | ConvertFrom-Json
if ($serviceInfo) {
    Write-Host "  URL: $($serviceInfo.status.url)" -ForegroundColor Green
    Write-Host "  Latest Revision: $($serviceInfo.status.latestReadyRevisionName)" -ForegroundColor Green
    Write-Host "  Conditions:" -ForegroundColor Green
    $serviceInfo.status.conditions | ForEach-Object {
        Write-Host "    - $($_.type): $($_.status)" -ForegroundColor Gray
    }
}

# Buscar errores recientes
Write-Host "`n2. Errores recientes (últimas 2 horas):" -ForegroundColor Yellow
$errors = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND severity>=ERROR" --project=$project --limit=20 --format="json" --freshness=2h 2>&1 | ConvertFrom-Json

if ($errors -and $errors.Count -gt 0) {
    Write-Host "  Errores encontrados: $($errors.Count)" -ForegroundColor Red
    $errors | Select-Object -First 5 | ForEach-Object {
        Write-Host "`n  [$($_.timestamp)] $($_.severity)" -ForegroundColor Red
        if ($_.textPayload) {
            Write-Host "  $($_.textPayload)" -ForegroundColor Gray
        }
        if ($_.jsonPayload -and $_.jsonPayload.message) {
            Write-Host "  $($_.jsonPayload.message)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  No se encontraron errores recientes" -ForegroundColor Green
}

# Buscar logs relacionados con Airtable
Write-Host "`n3. Logs relacionados con Airtable (últimas 2 horas):" -ForegroundColor Yellow
$airtableLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND (textPayload=~'Airtable' OR textPayload=~'airtable' OR jsonPayload.message=~'Airtable')" --project=$project --limit=30 --format="json" --freshness=2h 2>&1 | ConvertFrom-Json

if ($airtableLogs -and $airtableLogs.Count -gt 0) {
    Write-Host "  Logs encontrados: $($airtableLogs.Count)" -ForegroundColor Green
    $airtableLogs | Select-Object -First 10 | ForEach-Object {
        $severity = $_.severity
        $color = if ($severity -eq "ERROR") { "Red" } elseif ($severity -eq "WARNING") { "Yellow" } else { "Green" }
        Write-Host "`n  [$($_.timestamp)] $severity" -ForegroundColor $color
        if ($_.textPayload) {
            Write-Host "  $($_.textPayload)" -ForegroundColor Gray
        }
        if ($_.jsonPayload -and $_.jsonPayload.message) {
            Write-Host "  $($_.jsonPayload.message)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  No se encontraron logs relacionados con Airtable" -ForegroundColor Yellow
}

# Buscar logs de procesamiento de correos
Write-Host "`n4. Logs de procesamiento de correos (última hora):" -ForegroundColor Yellow
$emailLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND (textPayload=~'procesar' OR textPayload=~'mensaje' OR textPayload=~'email')" --project=$project --limit=20 --format="json" --freshness=1h 2>&1 | ConvertFrom-Json

if ($emailLogs -and $emailLogs.Count -gt 0) {
    Write-Host "  Logs encontrados: $($emailLogs.Count)" -ForegroundColor Green
    $emailLogs | Select-Object -First 5 | ForEach-Object {
        Write-Host "`n  [$($_.timestamp)]" -ForegroundColor Cyan
        if ($_.textPayload) {
            Write-Host "  $($_.textPayload.Substring(0, [Math]::Min(200, $_.textPayload.Length)))" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  No se encontraron logs de procesamiento de correos recientes" -ForegroundColor Yellow
}

# Verificar variables de entorno
Write-Host "`n5. Variables de entorno relacionadas con Airtable:" -ForegroundColor Yellow
$envVars = $serviceInfo.spec.template.spec.containers[0].env
$airtableVars = $envVars | Where-Object { $_.name -like "*AIRTABLE*" }
if ($airtableVars) {
    $airtableVars | ForEach-Object {
        $value = if ($_.value) { $_.value } else { $_.valueFrom.secretKeyRef.name }
        Write-Host "  $($_.name): $value" -ForegroundColor Green
    }
} else {
    Write-Host "  No se encontraron variables de entorno de Airtable" -ForegroundColor Red
}

Write-Host "`n=== Fin de revisión ===" -ForegroundColor Cyan

