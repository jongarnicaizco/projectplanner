# Script simple para desplegar el servicio
$ErrorActionPreference = "Continue"

$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DESPLEGANDO MFS LEAD GENERATION AI" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar que estamos en el directorio correcto
if (-not (Test-Path "cloudbuild.yaml")) {
    Write-Host "ERROR: No se encontró cloudbuild.yaml" -ForegroundColor Red
    Write-Host "Ejecuta este script desde el directorio mfs-lead-generation-ai" -ForegroundColor Yellow
    exit 1
}

# 2. Desplegar
Write-Host "Desplegando servicio..." -ForegroundColor Yellow
$imageTag = "fix-airtable-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "Tag: $imageTag" -ForegroundColor Gray
Write-Host ""

gcloud builds submit --config=cloudbuild.yaml --project=$projectId --substitutions="_IMAGE_TAG=$imageTag"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "DESPLIEGUE EXITOSO" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    
    # Verificar servicio
    Write-Host "Verificando servicio..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    $serviceUrl = gcloud run services describe $serviceName --region=$region --project=$projectId --format="value(status.url)" 2>&1
    if ($serviceUrl) {
        Write-Host "Servicio activo: $serviceUrl" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "El servicio está desplegado y debería procesar emails en Airtable." -ForegroundColor Cyan
    Write-Host "Para verificar logs, ejecuta: .\verificar_logs.ps1" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR EN EL DESPLIEGUE" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Revisa los mensajes de error arriba." -ForegroundColor Yellow
}

Write-Host ""
