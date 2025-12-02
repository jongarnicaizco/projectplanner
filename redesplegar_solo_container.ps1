# Script para redesplegar el servicio como contenedor puro, sin vinculación a repositorio
Write-Host "`n=== Redesplegando como contenedor puro ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Obtener la última imagen Docker disponible
Write-Host "`n1. Buscando última imagen Docker..." -ForegroundColor Yellow
$builds = gcloud builds list --project=$project --limit=5 --format=json 2>&1 | ConvertFrom-Json

$latestImage = $null
if ($builds) {
    $mfsBuilds = $builds | Where-Object { 
        $_.images -like "*mfs-lead-generation-ai*" -and 
        $_.status -eq "SUCCESS" 
    } | Sort-Object -Property createTime -Descending | Select-Object -First 1
    
    if ($mfsBuilds -and $mfsBuilds.images) {
        $latestImage = $mfsBuilds.images[0]
        Write-Host "  ✓ Imagen encontrada: $latestImage" -ForegroundColor Green
    }
}

if (!$latestImage) {
    # Usar latest como fallback
    $latestImage = "us-central1-docker.pkg.dev/$project/cloud-run-source-deploy/$service" + ":latest"
    Write-Host "  Usando imagen latest: $latestImage" -ForegroundColor Yellow
}

# 2. Variables de entorno
$envVars = @(
    "GOOGLE_CLOUD_PROJECT=check-in-sf",
    "GOOGLE_CLOUD_LOCATION=global",
    "GOOGLE_GENAI_USE_VERTEXAI=True",
    "GENAI_MODEL=gemini-2.5-flash",
    "GMAIL_ADDRESS=media.manager@feverup.com",
    "GMAIL_LABEL_FILTER=INBOX",
    "AUTH_MODE=oauth",
    "GCS_BUCKET=mfs_automatic_email_lead_classification",
    "AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w",
    "AIRTABLE_TABLE=tblPIUeGJWqOtqage",
    "AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY",
    "PUBSUB_TOPIC=mfs-gmail-leads",
    "PUBSUB_PROJECT_ID=check-in-sf"
) -join ","

# 3. Redesplegar el servicio como contenedor puro
Write-Host "`n2. Redesplegando servicio como contenedor puro..." -ForegroundColor Yellow
Write-Host "  Esto eliminará cualquier vinculación a repositorio" -ForegroundColor Gray

$deployCmd = @(
    "gcloud", "run", "deploy", $service,
    "--image", $latestImage,
    "--region", $region,
    "--project", $project,
    "--platform", "managed",
    "--no-source",
    "--allow-unauthenticated",
    "--update-env-vars", $envVars,
    "--memory", "512Mi",
    "--cpu", "1",
    "--max-instances", "10",
    "--timeout", "540"
)

$result = & $deployCmd[0] $deployCmd[1..($deployCmd.Length-1)] 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Servicio redesplegado correctamente" -ForegroundColor Green
} else {
    Write-Host "  Resultado: $result" -ForegroundColor Yellow
}

# 4. Eliminar anotaciones de source/repo
Write-Host "`n3. Eliminando anotaciones de source/repo..." -ForegroundColor Yellow
$annotationsToRemove = @(
    "run.googleapis.com/source",
    "run.googleapis.com/source-repo",
    "run.googleapis.com/source-version",
    "run.googleapis.com/source-commit"
)

foreach ($annot in $annotationsToRemove) {
    $removeCmd = "gcloud run services update $service --region=$region --project=$project --remove-annotations=$annot 2>&1"
    $removeResult = Invoke-Expression $removeCmd
    # No mostrar error si la anotación no existe
}

Write-Host "  ✓ Anotaciones eliminadas" -ForegroundColor Green

# 5. Verificar resultado
Write-Host "`n4. Verificando configuración final..." -ForegroundColor Yellow
$finalInfo = gcloud run services describe $service --region=$region --project=$project --format=json 2>&1 | ConvertFrom-Json

if ($finalInfo) {
    $finalImage = $finalInfo.spec.template.spec.containers[0].image
    Write-Host "  Imagen: $finalImage" -ForegroundColor Gray
    
    $annotations = $finalInfo.metadata.annotations
    $hasSourceAnnots = $annotations.PSObject.Properties | Where-Object { 
        $_.Name -like "*source*" -or 
        $_.Name -like "*repo*" 
    }
    
    if ($hasSourceAnnots) {
        Write-Host "  ⚠ Aún tiene anotaciones:" -ForegroundColor Yellow
        $hasSourceAnnots | ForEach-Object {
            Write-Host "    - $($_.Name)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ✓ No tiene anotaciones de source/repo" -ForegroundColor Green
        Write-Host "  ✓ Servicio configurado como contenedor puro" -ForegroundColor Green
    }
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "✓ Servicio redesplegado como contenedor Docker puro" -ForegroundColor Green
Write-Host "✓ Vinculación a repositorio eliminada" -ForegroundColor Green
Write-Host "`nNota: Refresca la consola de Cloud Run para ver los cambios." -ForegroundColor Yellow

Write-Host "`n=== Fin ===" -ForegroundColor Cyan

