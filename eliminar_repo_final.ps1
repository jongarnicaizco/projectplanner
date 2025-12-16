# Script final para eliminar vinculación a repositorio
Write-Host "Eliminando vinculación a repositorio..." -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Obtener imagen actual
$image = gcloud run services describe $service --region=$region --project=$project --format="value(spec.template.spec.containers[0].image)" 2>&1
Write-Host "Imagen actual: $image" -ForegroundColor Gray

# 2. Obtener anotaciones actuales
$serviceInfo = gcloud run services describe $service --region=$region --project=$project --format=json 2>&1 | ConvertFrom-Json
$annotations = $serviceInfo.metadata.annotations

# 3. Construir comando para eliminar anotaciones de source
$annotationsToClear = @()
if ($annotations."run.googleapis.com/source") {
    $annotationsToClear += "run.googleapis.com/source="
}
if ($annotations."run.googleapis.com/source-repo") {
    $annotationsToClear += "run.googleapis.com/source-repo="
}
if ($annotations."run.googleapis.com/source-version") {
    $annotationsToClear += "run.googleapis.com/source-version="
}

if ($annotationsToClear.Count -gt 0) {
    Write-Host "Eliminando anotaciones de source..." -ForegroundColor Yellow
    $annotStr = $annotationsToClear -join ","
    gcloud run services update $service --region=$region --project=$project --update-annotations=$annotStr 2>&1
} else {
    Write-Host "No hay anotaciones de source para eliminar" -ForegroundColor Green
}

# 4. Redesplegar usando solo --image (sin --source)
Write-Host "`nRedesplegando con solo --image..." -ForegroundColor Yellow
$envVars = "GOOGLE_CLOUD_PROJECT=check-in-sf,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=True,GENAI_MODEL=gemini-2.5-flash,GMAIL_ADDRESS=media.manager@feverup.com,GMAIL_LABEL_FILTER=INBOX,AUTH_MODE=oauth,GCS_BUCKET=mfs_automatic_email_lead_classification,AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,AIRTABLE_TABLE=tblPIUeGJWqOtqage,AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY,PUBSUB_TOPIC=mfs-gmail-leads,PUBSUB_PROJECT_ID=check-in-sf"

gcloud run deploy $service --image=$image --region=$region --project=$project --platform=managed --allow-unauthenticated --update-env-vars=$envVars --memory=512Mi --cpu=1 --max-instances=10 --timeout=540

Write-Host "`nListo! Refresca la consola de Cloud Run." -ForegroundColor Green

