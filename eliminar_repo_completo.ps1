# Script completo para eliminar TODAS las anotaciones de source/repo
$ErrorActionPreference = "Continue"

Write-Host "Eliminando vinculacion a repositorio..." -ForegroundColor Cyan

$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Obtener servicio completo
Write-Host "`n1. Obteniendo configuracion del servicio..." -ForegroundColor Yellow
$serviceJson = gcloud run services describe $serviceName --region $region --project $projectId --format="json" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error al obtener el servicio" -ForegroundColor Red
    exit 1
}

# Guardar en archivo temporal
$tempFile = "temp_mfs_$(Get-Date -Format 'yyyyMMddHHmmss').json"
$serviceJson | Out-File -FilePath $tempFile -Encoding UTF8

# 2. Leer y modificar JSON
Write-Host "2. Eliminando anotaciones de source/repo..." -ForegroundColor Yellow
$service = Get-Content $tempFile -Raw | ConvertFrom-Json

# Anotaciones a eliminar
$annotationsToRemove = @(
    "run.googleapis.com/build-source-location",
    "run.googleapis.com/build-source-repo",
    "run.googleapis.com/build-name",
    "run.googleapis.com/build-image-uri",
    "run.googleapis.com/build-id",
    "run.googleapis.com/build-enable-automatic-updates",
    "run.googleapis.com/source",
    "run.googleapis.com/source-version",
    "run.googleapis.com/source-repo"
)

$annotations = $service.metadata.annotations
$removed = @()

if ($annotations) {
    foreach ($ann in $annotationsToRemove) {
        if ($annotations.PSObject.Properties.Name -contains $ann) {
            $value = $annotations.$ann
            $annotations.PSObject.Properties.Remove($ann)
            $removed += $ann
            Write-Host "  Eliminada: $ann" -ForegroundColor Green
        }
    }
}

if ($removed.Count -eq 0) {
    Write-Host "  No se encontraron anotaciones de source" -ForegroundColor Gray
} else {
    Write-Host "  Total eliminadas: $($removed.Count)" -ForegroundColor Green
}

# Guardar JSON modificado
$service | ConvertTo-Json -Depth 100 | Out-File -FilePath $tempFile -Encoding UTF8

# 3. Reemplazar servicio
Write-Host "`n3. Actualizando servicio..." -ForegroundColor Yellow
$result = gcloud run services replace $tempFile --region $region --project $projectId 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Servicio actualizado correctamente" -ForegroundColor Green
} else {
    Write-Host "  Resultado: $result" -ForegroundColor Yellow
}

# Limpiar
Remove-Item $tempFile -ErrorAction SilentlyContinue

# 4. Redesplegar con solo imagen
Write-Host "`n4. Redesplegando con solo imagen Docker..." -ForegroundColor Yellow
$image = gcloud run services describe $serviceName --region $region --project $projectId --format="value(spec.template.spec.containers[0].image)" 2>&1

$envVars = "GOOGLE_CLOUD_PROJECT=check-in-sf,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=True,GENAI_MODEL=gemini-2.5-flash,GMAIL_ADDRESS=media.manager@feverup.com,GMAIL_LABEL_FILTER=INBOX,AUTH_MODE=oauth,GCS_BUCKET=mfs_automatic_email_lead_classification,AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,AIRTABLE_TABLE=tblPIUeGJWqOtqage,AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY,PUBSUB_TOPIC=mfs-gmail-leads,PUBSUB_PROJECT_ID=check-in-sf"

gcloud run deploy $serviceName --image=$image --region=$region --project=$projectId --platform=managed --allow-unauthenticated --update-env-vars=$envVars --memory=512Mi --cpu=1 --max-instances=10 --timeout=540

Write-Host "`nListo! Refresca la consola de Cloud Run." -ForegroundColor Green

