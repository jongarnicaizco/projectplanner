# Script para corregir las variables de Airtable (actualizar por separado)
$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CORRIGIENDO VARIABLES DE AIRTABLE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Actualizando AIRTABLE_BASE_ID..." -ForegroundColor Yellow
gcloud run services update $serviceName `
  --region=$region `
  --project=$projectId `
  --update-env-vars AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ AIRTABLE_BASE_ID actualizado" -ForegroundColor Green
} else {
    Write-Host "✗ Error al actualizar AIRTABLE_BASE_ID" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Esperando 5 segundos..." -ForegroundColor Gray
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "2. Actualizando AIRTABLE_TABLE..." -ForegroundColor Yellow
gcloud run services update $serviceName `
  --region=$region `
  --project=$projectId `
  --update-env-vars AIRTABLE_TABLE=tblPIUeGJWqOtqage

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ AIRTABLE_TABLE actualizado" -ForegroundColor Green
} else {
    Write-Host "✗ Error al actualizar AIRTABLE_TABLE" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Esperando 10 segundos para que se despliegue..." -ForegroundColor Gray
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "3. Verificando configuración final..." -ForegroundColor Yellow
$serviceJson = gcloud run services describe $serviceName --region=$region --project=$projectId --format=json 2>&1 | ConvertFrom-Json
$envVars = $serviceJson.spec.template.spec.containers[0].env
$airtableVars = $envVars | Where-Object { $_.name -like "*AIRTABLE*" }

Write-Host ""
Write-Host "Variables de Airtable:" -ForegroundColor Cyan
foreach ($var in $airtableVars) {
    $color = if ($var.value -match "appT0vQS4arJ3dQ6w|tblPIUeGJWqOtqage") { "Green" } else { "Red" }
    Write-Host "  $($var.name) = $($var.value)" -ForegroundColor $color
}

$baseIdOk = ($airtableVars | Where-Object { $_.name -eq "AIRTABLE_BASE_ID" -and $_.value -eq "appT0vQS4arJ3dQ6w" }) -ne $null
$tableOk = ($airtableVars | Where-Object { $_.name -eq "AIRTABLE_TABLE" -and $_.value -eq "tblPIUeGJWqOtqage" }) -ne $null

if ($baseIdOk -and $tableOk) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✓ VARIABLES CORREGIDAS CORRECTAMENTE" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Los nuevos correos se guardarán en:" -ForegroundColor Cyan
    Write-Host "  Base ID: appT0vQS4arJ3dQ6w" -ForegroundColor White
    Write-Host "  Table ID: tblPIUeGJWqOtqage" -ForegroundColor White
    Write-Host ""
    Write-Host "Nueva revisión: $($serviceJson.status.latestReadyRevisionName)" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "⚠️  Verifica manualmente las variables" -ForegroundColor Yellow
}

