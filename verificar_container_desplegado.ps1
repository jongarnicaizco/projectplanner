# Script para verificar que el código correcto está en el container de Cloud Run
$ErrorActionPreference = "Continue"

Write-Host "`n=== VERIFICACIÓN DE CONTAINER DESPLEGADO ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host "`n1. Estado del build más reciente:" -ForegroundColor Yellow
$builds = gcloud builds list --project=$project --limit=1 --format=json 2>&1 | ConvertFrom-Json
if ($builds -and $builds.Count -gt 0) {
    $latestBuild = $builds[0]
    Write-Host "  Build ID: $($latestBuild.id)" -ForegroundColor White
    Write-Host "  Estado: $($latestBuild.status)" -ForegroundColor $(if ($latestBuild.status -eq "SUCCESS") { "Green" } elseif ($latestBuild.status -eq "FAILURE") { "Red" } else { "Yellow" })
    Write-Host "  Creado: $($latestBuild.createTime)" -ForegroundColor White
    if ($latestBuild.logUrl) {
        Write-Host "  Log: $($latestBuild.logUrl)" -ForegroundColor Cyan
    }
} else {
    Write-Host "  ⚠ No se encontraron builds" -ForegroundColor Yellow
}

Write-Host "`n2. Última revisión desplegada:" -ForegroundColor Yellow
$revision = gcloud run revisions list --service=$service --region=$region --project=$project --limit=1 --format=json 2>&1 | ConvertFrom-Json
if ($revision -and $revision.Count -gt 0) {
    $latestRevision = $revision[0]
    Write-Host "  Revisión: $($latestRevision.metadata.name)" -ForegroundColor White
    Write-Host "  Creada: $($latestRevision.metadata.creationTimestamp)" -ForegroundColor White
    Write-Host "  Estado: $($latestRevision.status.conditions[0].status)" -ForegroundColor $(if ($latestRevision.status.conditions[0].status -eq "True") { "Green" } else { "Yellow" })
} else {
    Write-Host "  ⚠ No se encontraron revisiones" -ForegroundColor Yellow
}

Write-Host "`n3. Verificando logs recientes de Airtable (debería haber):" -ForegroundColor Yellow
$airtableLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND textPayload=~'Registro creado en Airtable'" --project=$project --limit=3 --format="table(timestamp,textPayload)" --freshness=30m 2>&1
if ($airtableLogs -match "Registro creado") {
    Write-Host "  ✓ Se encontraron logs de creación en Airtable" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No se encontraron logs de Airtable recientes" -ForegroundColor Yellow
}

Write-Host "`n4. Verificando logs de envío de emails (NO debería haber):" -ForegroundColor Yellow
$emailLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND (textPayload=~'sendLeadEmail' OR textPayload=~'Email enviado' OR textPayload=~'gmail.send')" --project=$project --limit=3 --format="table(timestamp,textPayload)" --freshness=30m 2>&1
if ($emailLogs -match "sendLeadEmail|Email enviado|gmail.send") {
    Write-Host "  ✗ Se encontraron logs de envío de emails (NO debería haber)" -ForegroundColor Red
    Write-Host $emailLogs -ForegroundColor Red
} else {
    Write-Host "  ✓ No se encontraron logs de envío de emails (correcto)" -ForegroundColor Green
}

Write-Host "`n5. Verificando permisos de Gmail en el código desplegado:" -ForegroundColor Yellow
$gmailLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND textPayload=~'gmail.readonly'" --project=$project --limit=1 --format="value(textPayload)" --freshness=1h 2>&1
if ($gmailLogs) {
    Write-Host "  ✓ Se encontraron referencias a gmail.readonly" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No se encontraron logs recientes sobre permisos" -ForegroundColor Yellow
}

Write-Host "`n=== CONCLUSIÓN ===" -ForegroundColor Cyan
if ($latestBuild -and $latestBuild.status -eq "SUCCESS") {
    Write-Host "✓ Build exitoso - el código debería estar desplegado" -ForegroundColor Green
    Write-Host "  Si no ves logs de Airtable, espera unos minutos o verifica que haya emails nuevos procesándose" -ForegroundColor Yellow
} elseif ($latestBuild -and $latestBuild.status -eq "WORKING") {
    Write-Host "⏳ Build en progreso - espera a que termine" -ForegroundColor Yellow
} elseif ($latestBuild -and $latestBuild.status -eq "FAILURE") {
    Write-Host "✗ Build falló - revisa los logs" -ForegroundColor Red
    Write-Host "  Log: $($latestBuild.logUrl)" -ForegroundColor Cyan
} else {
    Write-Host "⚠ No se pudo verificar el estado del build" -ForegroundColor Yellow
}

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

