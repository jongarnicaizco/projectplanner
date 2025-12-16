# Script definitivo para eliminar vinculación a repositorio usando services replace
$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ELIMINAR VINCULACION A REPOSITORIO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host "Paso 1/5: Obteniendo configuración actual del servicio..." -ForegroundColor Yellow

# Obtener el servicio en formato JSON
$serviceJson = gcloud run services describe $serviceName --region $region --project $projectId --format="json" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Error al obtener el servicio" -ForegroundColor Red
    exit 1
}

# Guardar en archivo temporal
$tempFile = "temp_service_mfs_$([guid]::NewGuid().ToString('N').Substring(0,8)).json"
$serviceJson | Out-File -FilePath $tempFile -Encoding UTF8

Write-Host "✓ Configuración obtenida" -ForegroundColor Green
Write-Host ""

Write-Host "Paso 2/5: Leyendo y modificando JSON..." -ForegroundColor Yellow

# Leer el JSON
$service = Get-Content $tempFile | ConvertFrom-Json

# Anotaciones a eliminar (lista completa)
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

# Verificar y eliminar anotaciones
$annotations = $service.metadata.annotations
$removed = @()

if ($annotations) {
    foreach ($ann in $annotationsToRemove) {
        if ($annotations.PSObject.Properties.Name -contains $ann) {
            $value = $annotations.$ann
            $annotations.PSObject.Properties.Remove($ann)
            $removed += $ann
            Write-Host "  ✓ Eliminada: $ann = $value" -ForegroundColor Green
        }
    }
}

if ($removed.Count -eq 0) {
    Write-Host "  (No se encontraron anotaciones de source)" -ForegroundColor Gray
} else {
    Write-Host "  Total eliminadas: $($removed.Count)" -ForegroundColor Green
}

# Guardar el JSON modificado
$service | ConvertTo-Json -Depth 100 | Out-File -FilePath $tempFile -Encoding UTF8

Write-Host ""
Write-Host "Paso 3/5: Actualizando el servicio (eliminando anotaciones)..." -ForegroundColor Yellow

$updateResult = gcloud run services replace $tempFile --region $region --project $projectId 2>&1 | Out-String

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Adverencia al actualizar (puede ser normal):" -ForegroundColor Yellow
    Write-Host $updateResult
} else {
    Write-Host "✓ Anotaciones eliminadas del servicio" -ForegroundColor Green
}

# Limpiar archivo temporal
Remove-Item $tempFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Paso 4/5: Obteniendo imagen Docker actual..." -ForegroundColor Yellow

$image = gcloud run services describe $serviceName --region $region --project $projectId --format="value(spec.template.spec.containers[0].image)" 2>&1
Write-Host "  Imagen: $image" -ForegroundColor Gray

Write-Host ""
Write-Host "Paso 5/5: Redesplegando SOLO la imagen (sin código fuente)..." -ForegroundColor Yellow
Write-Host ""

$envVars = "GOOGLE_CLOUD_PROJECT=check-in-sf,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=True,GENAI_MODEL=gemini-2.5-flash,GMAIL_ADDRESS=media.manager@feverup.com,GMAIL_LABEL_FILTER=INBOX,AUTH_MODE=oauth,GCS_BUCKET=mfs_automatic_email_lead_classification,AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,AIRTABLE_TABLE=tblPIUeGJWqOtqage,AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY,PUBSUB_TOPIC=mfs-gmail-leads,PUBSUB_PROJECT_ID=check-in-sf"

$deployResult = gcloud run deploy $serviceName `
    --image=$image `
    --region=$region `
    --project=$projectId `
    --platform=managed `
    --allow-unauthenticated `
    --update-env-vars=$envVars `
    --memory=512Mi `
    --cpu=1 `
    --max-instances=10 `
    --timeout=540 `
    2>&1 | Out-String

Write-Host $deployResult

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✓ COMPLETADO" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "El servicio ahora está configurado como contenedor puro." -ForegroundColor Green
    Write-Host "Refresca la consola de Cloud Run para ver los cambios." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "⚠️  Hubo un error en el despliegue" -ForegroundColor Yellow
    Write-Host $deployResult
}

