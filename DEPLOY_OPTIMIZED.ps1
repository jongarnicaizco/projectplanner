$ErrorActionPreference = "Stop"
Write-Host "Iniciando despliegue de optimizaciones..." -ForegroundColor Cyan

$project = "check-in-sf"
$tag = "optimized-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$substitutions = "_IMAGE_TAG=$tag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"

Write-Host "Enviando build a Cloud Build..." -ForegroundColor Yellow
gcloud builds submit --config=cloudbuild.yaml --project=$project --substitutions=$substitutions

if ($?) {
    Write-Host "`nDespliegue completado exitosamente!" -ForegroundColor Green
} else {
    Write-Host "`nError en el despliegue." -ForegroundColor Red
    exit 1
}
