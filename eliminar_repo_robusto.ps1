# Script robusto para eliminar vinculacion a repositorio
$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ELIMINAR VINCULACION A REPOSITORIO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"

# Paso 1: Obtener servicio
Write-Host "Paso 1: Obteniendo configuracion del servicio..." -ForegroundColor Yellow
$serviceJson = gcloud run services describe $serviceName --region $region --project $projectId --format="json" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: No se pudo obtener el servicio" -ForegroundColor Red
    Write-Host $serviceJson
    exit 1
}

$tempFile = "temp_mfs_service.json"
$serviceJson | Out-File -FilePath $tempFile -Encoding UTF8
Write-Host "OK: Configuracion guardada en $tempFile" -ForegroundColor Green
Write-Host ""

# Paso 2: Leer y modificar JSON
Write-Host "Paso 2: Eliminando anotaciones de source/repo..." -ForegroundColor Yellow

$jsonContent = Get-Content $tempFile -Raw
$service = $jsonContent | ConvertFrom-Json

if (-not $service.metadata.annotations) {
    Write-Host "No hay anotaciones en el servicio" -ForegroundColor Gray
} else {
    $annotations = $service.metadata.annotations
    
    # Lista completa de anotaciones a eliminar
    $toRemove = @(
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
    
    $removed = 0
    foreach ($ann in $toRemove) {
        if ($annotations.PSObject.Properties.Name -contains $ann) {
            $value = $annotations.$ann
            $annotations.PSObject.Properties.Remove($ann)
            $removed++
            Write-Host "  Eliminada: $ann = $value" -ForegroundColor Green
        }
    }
    
    if ($removed -eq 0) {
        Write-Host "  No se encontraron anotaciones de source/repo" -ForegroundColor Gray
    } else {
        Write-Host "  Total eliminadas: $removed" -ForegroundColor Green
    }
}

# Guardar JSON modificado
$service | ConvertTo-Json -Depth 100 | Out-File -FilePath $tempFile -Encoding UTF8
Write-Host "OK: JSON modificado guardado" -ForegroundColor Green
Write-Host ""

# Paso 3: Reemplazar servicio
Write-Host "Paso 3: Actualizando servicio (eliminando anotaciones)..." -ForegroundColor Yellow
$replaceResult = gcloud run services replace $tempFile --region $region --project $projectId 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "OK: Servicio actualizado correctamente" -ForegroundColor Green
} else {
    Write-Host "ADVERTENCIA: $replaceResult" -ForegroundColor Yellow
}

Write-Host ""

# Limpiar archivo temporal
Remove-Item $tempFile -ErrorAction SilentlyContinue

# Paso 4: Obtener imagen y redesplegar
Write-Host "Paso 4: Obteniendo imagen Docker actual..." -ForegroundColor Yellow
$image = gcloud run services describe $serviceName --region $region --project $projectId --format="value(spec.template.spec.containers[0].image)" 2>&1
Write-Host "  Imagen: $image" -ForegroundColor Gray
Write-Host ""

Write-Host "Paso 5: Redesplegando con solo imagen Docker..." -ForegroundColor Yellow
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
    2>&1

Write-Host $deployResult

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "COMPLETADO" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "El servicio ahora esta configurado como contenedor puro." -ForegroundColor Green
    Write-Host ""
    Write-Host "Si aun ves 'Repository' en la consola:" -ForegroundColor Yellow
    Write-Host "1. Cierra y abre la consola de Cloud Run" -ForegroundColor White
    Write-Host "2. Prueba en modo incognito" -ForegroundColor White
    Write-Host "3. Espera 5-10 minutos (puede ser cache)" -ForegroundColor White
    Write-Host "4. Verifica que el servicio use solo --image (no --source)" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "ERROR en el despliegue" -ForegroundColor Red
}

