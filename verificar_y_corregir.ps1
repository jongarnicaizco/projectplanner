# Script simplificado para verificar y corregir
Write-Host "Verificando y corrigiendo servicio..." -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"
$image = "us-central1-docker.pkg.dev/$project/cloud-run-source-deploy/$service" + ":latest"

# 1. Verificar imagen actual
Write-Host "`n1. Imagen actual:" -ForegroundColor Yellow
$currentImage = gcloud run services describe $service --region=$region --project=$project --format="value(spec.template.spec.containers[0].image)" 2>&1
Write-Host $currentImage

# 2. Redesplegar con --no-source
Write-Host "`n2. Redesplegando con --no-source..." -ForegroundColor Yellow
$envVars = "GOOGLE_CLOUD_PROJECT=check-in-sf,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=True,GENAI_MODEL=gemini-2.5-flash,GMAIL_ADDRESS=media.manager@feverup.com,GMAIL_LABEL_FILTER=INBOX,AUTH_MODE=oauth,GCS_BUCKET=mfs_automatic_email_lead_classification,AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,AIRTABLE_TABLE=tblPIUeGJWqOtqage,AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY,PUBSUB_TOPIC=mfs-gmail-leads,PUBSUB_PROJECT_ID=check-in-sf"

gcloud run deploy $service --image=$currentImage --region=$region --project=$project --platform=managed --no-source --allow-unauthenticated --update-env-vars=$envVars --memory=512Mi --cpu=1 --max-instances=10 --timeout=540

# 3. Eliminar anotaciones
Write-Host "`n3. Eliminando anotaciones de source..." -ForegroundColor Yellow
gcloud run services update $service --region=$region --project=$project --remove-annotations="run.googleapis.com/source" 2>&1 | Out-Null
gcloud run services update $service --region=$region --project=$project --remove-annotations="run.googleapis.com/source-repo" 2>&1 | Out-Null
gcloud run services update $service --region=$region --project=$project --remove-annotations="run.googleapis.com/source-version" 2>&1 | Out-Null

Write-Host "`nListo! Refresca la consola de Cloud Run." -ForegroundColor Green

