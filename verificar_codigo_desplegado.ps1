# Script para verificar qué código está desplegado
$ErrorActionPreference = "Continue"

Write-Host "`n=== VERIFICACIÓN DE CÓDIGO DESPLEGADO ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host "`n1. Verificando última revisión desplegada..." -ForegroundColor Yellow
$revision = gcloud run revisions list --service=$service --region=$region --project=$project --limit=1 --format="value(name)" 2>&1
Write-Host "  Última revisión: $revision" -ForegroundColor White

Write-Host "`n2. Verificando logs recientes de envío de emails..." -ForegroundColor Yellow
$logs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND (textPayload=~'sendLeadEmail' OR textPayload=~'Email enviado' OR textPayload=~'ERROR enviando email')" --project=$project --limit=5 --format="table(timestamp,textPayload)" --freshness=1h 2>&1

if ($logs -match "sendLeadEmail|Email enviado") {
    Write-Host "  ✗ Se encontraron logs de envío de emails" -ForegroundColor Red
    Write-Host $logs -ForegroundColor Red
} else {
    Write-Host "  ✓ No se encontraron logs de envío de emails" -ForegroundColor Green
}

Write-Host "`n3. Verificando logs de Airtable..." -ForegroundColor Yellow
$airtableLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND textPayload=~'Airtable'" --project=$project --limit=5 --format="table(timestamp,textPayload)" --freshness=1h 2>&1

if ($airtableLogs -match "Registro creado en Airtable|createAirtableRecord") {
    Write-Host "  ✓ Se encontraron logs de creación en Airtable" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No se encontraron logs de Airtable recientes" -ForegroundColor Yellow
}

Write-Host "`n=== RECOMENDACIÓN ===" -ForegroundColor Cyan
Write-Host "Si ves logs de envío de emails, el código desplegado es antiguo." -ForegroundColor Yellow
Write-Host "Espera 3-5 minutos a que termine el build actual o ejecuta:" -ForegroundColor Yellow
Write-Host "  gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf" -ForegroundColor Gray

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

