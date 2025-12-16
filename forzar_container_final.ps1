# Script final para forzar contenedor puro
Write-Host "Forzando servicio como contenedor puro..." -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Obtener imagen actual
Write-Host "`n1. Obteniendo imagen Docker..." -ForegroundColor Yellow
$image = gcloud run services describe $service --region=$region --project=$project --format="value(spec.template.spec.containers[0].image)" 2>&1
Write-Host "   $image" -ForegroundColor Gray

# 2. Obtener servicio completo y eliminar anotaciones
Write-Host "`n2. Eliminando anotaciones de source/repo..." -ForegroundColor Yellow
$tempFile = "temp_mfs_$(Get-Random).json"

# Obtener JSON
gcloud run services describe $service --region=$region --project=$project --format=json > $tempFile 2>&1

# Leer y modificar
$content = Get-Content $tempFile -Raw
$json = $content | ConvertFrom-Json

# Eliminar anotaciones de source/repo
$annotations = $json.metadata.annotations
$toRemove = @("run.googleapis.com/build-source-location", "run.googleapis.com/build-source-repo", "run.googleapis.com/build-name", "run.googleapis.com/build-image-uri", "run.googleapis.com/build-id", "run.googleapis.com/build-enable-automatic-updates", "run.googleapis.com/source", "run.googleapis.com/source-version", "run.googleapis.com/source-repo")

$removed = 0
foreach ($ann in $toRemove) {
    if ($annotations.PSObject.Properties.Name -contains $ann) {
        $annotations.PSObject.Properties.Remove($ann)
        $removed++
        Write-Host "   Eliminada: $ann" -ForegroundColor Green
    }
}

if ($removed -eq 0) {
    Write-Host "   No se encontraron anotaciones" -ForegroundColor Gray
} else {
    Write-Host "   Total eliminadas: $removed" -ForegroundColor Green
}

# Guardar JSON modificado
$json | ConvertTo-Json -Depth 100 | Out-File -FilePath $tempFile -Encoding UTF8

# 3. Reemplazar servicio
Write-Host "`n3. Actualizando servicio..." -ForegroundColor Yellow
gcloud run services replace $tempFile --region=$region --project=$project 2>&1 | Out-Null

# Limpiar
Remove-Item $tempFile -ErrorAction SilentlyContinue

# 4. Redesplegar
Write-Host "`n4. Redesplegando..." -ForegroundColor Yellow
$envVars = "GOOGLE_CLOUD_PROJECT=check-in-sf,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=True,GENAI_MODEL=gemini-2.5-flash,GMAIL_ADDRESS=media.manager@feverup.com,GMAIL_LABEL_FILTER=INBOX,AUTH_MODE=oauth,GCS_BUCKET=mfs_automatic_email_lead_classification,AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,AIRTABLE_TABLE=tblPIUeGJWqOtqage,AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY,PUBSUB_TOPIC=mfs-gmail-leads,PUBSUB_PROJECT_ID=check-in-sf"

gcloud run deploy $service --image=$image --region=$region --project=$project --platform=managed --allow-unauthenticated --update-env-vars=$envVars --memory=512Mi --cpu=1 --max-instances=10 --timeout=540

Write-Host "`nListo! Si aun ves 'Repository', puede ser cache de la UI." -ForegroundColor Green
Write-Host "Intenta: 1) Cerrar y abrir la consola, 2) Modo incognito, 3) Esperar 5 minutos" -ForegroundColor Yellow

