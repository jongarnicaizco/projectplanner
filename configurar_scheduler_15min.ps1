# Script para configurar Cloud Scheduler que procesa mensajes sin processed cada 15 minutos
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CONFIGURAR CLOUD SCHEDULER (15 MIN)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$region = "us-central1"
$serviceName = "mfs-lead-generation-ai"
$serviceUrl = "https://mfs-lead-generation-ai-vtlrnibdxq-uc.a.run.app"
$jobName = "mfs-process-unprocessed-15min"

Write-Host "Proyecto: $project" -ForegroundColor Gray
Write-Host "Región: $region" -ForegroundColor Gray
Write-Host "Servicio: $serviceName" -ForegroundColor Gray
Write-Host "URL: $serviceUrl" -ForegroundColor Gray
Write-Host "Job: $jobName" -ForegroundColor Gray
Write-Host ""

# 1. Verificar si el job ya existe
Write-Host "[1] Verificando si el job ya existe..." -ForegroundColor Yellow
$existingJob = gcloud scheduler jobs describe $jobName --location=$region --project=$project 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Job ya existe. Actualizando..." -ForegroundColor Yellow
    $update = $true
} else {
    Write-Host "  Job no existe. Creando nuevo..." -ForegroundColor Yellow
    $update = $false
}

Write-Host ""

# 2. Crear o actualizar el job
Write-Host "[2] Configurando Cloud Scheduler..." -ForegroundColor Yellow

if ($update) {
    # Actualizar job existente
    Write-Host "  Actualizando job existente..." -ForegroundColor Gray
    gcloud scheduler jobs update http $jobName `
        --location=$region `
        --project=$project `
        --schedule="*/15 * * * *" `
        --uri="$serviceUrl/control/process-unprocessed" `
        --http-method=POST `
        --headers="Content-Type=application/json" `
        --time-zone="UTC" `
        --attempt-deadline=540s `
        2>&1 | Out-Host
} else {
    # Crear nuevo job
    Write-Host "  Creando nuevo job..." -ForegroundColor Gray
    gcloud scheduler jobs create http $jobName `
        --location=$region `
        --project=$project `
        --schedule="*/15 * * * *" `
        --uri="$serviceUrl/control/process-unprocessed" `
        --http-method=POST `
        --headers="Content-Type=application/json" `
        --time-zone="UTC" `
        --attempt-deadline=540s `
        2>&1 | Out-Host
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Cloud Scheduler configurado correctamente" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error configurando Cloud Scheduler" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 3. Verificar el job
Write-Host "[3] Verificando configuración del job..." -ForegroundColor Yellow
$jobInfo = gcloud scheduler jobs describe $jobName --location=$region --project=$project --format=json 2>&1 | ConvertFrom-Json

if ($jobInfo) {
    Write-Host "  ✓ Job configurado:" -ForegroundColor Green
    Write-Host "    Nombre: $($jobInfo.name)" -ForegroundColor White
    Write-Host "    Schedule: $($jobInfo.schedule)" -ForegroundColor White
    Write-Host "    Estado: $($jobInfo.state)" -ForegroundColor White
    Write-Host "    URI: $($jobInfo.httpTarget.uri)" -ForegroundColor White
    Write-Host "    Método: $($jobInfo.httpTarget.httpMethod)" -ForegroundColor White
} else {
    Write-Host "  ⚠ No se pudo obtener información del job" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "CONFIGURACIÓN COMPLETADA" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "El Cloud Scheduler ejecutará automáticamente cada 15 minutos:" -ForegroundColor Cyan
Write-Host "  POST $serviceUrl/control/process-unprocessed" -ForegroundColor White
Write-Host ""
Write-Host "Esto procesará todos los mensajes sin etiqueta 'processed' de las últimas 24 horas." -ForegroundColor Cyan
Write-Host ""
Write-Host "Para verificar el job:" -ForegroundColor Yellow
Write-Host "  gcloud scheduler jobs describe $jobName --location=$region --project=$project" -ForegroundColor White
Write-Host ""
Write-Host "Para ver logs de ejecuciones:" -ForegroundColor Yellow
Write-Host "  gcloud scheduler jobs list --location=$region --project=$project" -ForegroundColor White
Write-Host ""

