# Script para actualizar variables de Airtable en Cloud Run
$ErrorActionPreference = "Continue"

$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ACTUALIZANDO VARIABLES DE AIRTABLE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Obtener servicio actual
Write-Host "1. Obteniendo configuración actual..." -ForegroundColor Yellow
$serviceJson = gcloud run services describe $serviceName --region=$region --project=$projectId --format=json 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Error al obtener el servicio" -ForegroundColor Red
    Write-Host $serviceJson
    exit 1
}

$service = $serviceJson | ConvertFrom-Json
$envVars = $service.spec.template.spec.containers[0].env

Write-Host "Variables de Airtable actuales:" -ForegroundColor Yellow
$airtableVars = $envVars | Where-Object { $_.name -like "*AIRTABLE*" }
foreach ($var in $airtableVars) {
    Write-Host "  $($var.name) = $($var.value)" -ForegroundColor Gray
}

Write-Host ""

# Verificar si necesitan actualización
$needsUpdate = $false
$currentBaseId = ($airtableVars | Where-Object { $_.name -eq "AIRTABLE_BASE_ID" })?.value
$currentTable = ($airtableVars | Where-Object { $_.name -eq "AIRTABLE_TABLE" })?.value

if ($currentBaseId -ne "appT0vQS4arJ3dQ6w" -or $currentTable -ne "tblPIUeGJWqOtqage") {
    $needsUpdate = $true
    Write-Host "✗ Variables necesitan actualización" -ForegroundColor Red
    Write-Host "  Base ID actual: $currentBaseId (debe ser: appT0vQS4arJ3dQ6w)" -ForegroundColor Yellow
    Write-Host "  Table ID actual: $currentTable (debe ser: tblPIUeGJWqOtqage)" -ForegroundColor Yellow
} else {
    Write-Host "✓ Variables ya están correctas" -ForegroundColor Green
}

if ($needsUpdate) {
    Write-Host ""
    Write-Host "2. Actualizando variables..." -ForegroundColor Yellow
    
    $updateOutput = gcloud run services update $serviceName `
        --region=$region `
        --project=$projectId `
        --update-env-vars "AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,AIRTABLE_TABLE=tblPIUeGJWqOtqage" `
        2>&1
    
    Write-Host $updateOutput
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Variables actualizadas correctamente" -ForegroundColor Green
        Write-Host ""
        Write-Host "3. Esperando 10 segundos para que se despliegue la nueva revisión..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        
        Write-Host ""
        Write-Host "4. Verificando nueva configuración..." -ForegroundColor Yellow
        $newServiceJson = gcloud run services describe $serviceName --region=$region --project=$projectId --format=json 2>&1
        $newService = $newServiceJson | ConvertFrom-Json
        $newEnvVars = $newService.spec.template.spec.containers[0].env
        $newAirtableVars = $newEnvVars | Where-Object { $_.name -like "*AIRTABLE*" }
        
        Write-Host "Nuevas variables:" -ForegroundColor Green
        foreach ($var in $newAirtableVars) {
            Write-Host "  $($var.name) = $($var.value)" -ForegroundColor Green
        }
        
        $newBaseId = ($newAirtableVars | Where-Object { $_.name -eq "AIRTABLE_BASE_ID" })?.value
        $newTable = ($newAirtableVars | Where-Object { $_.name -eq "AIRTABLE_TABLE" })?.value
        
        if ($newBaseId -eq "appT0vQS4arJ3dQ6w" -and $newTable -eq "tblPIUeGJWqOtqage") {
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Green
            Write-Host "✓ ACTUALIZACIÓN COMPLETADA" -ForegroundColor Green
            Write-Host "========================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "Los nuevos correos se guardarán en:" -ForegroundColor Cyan
            Write-Host "  Base ID: appT0vQS4arJ3dQ6w" -ForegroundColor White
            Write-Host "  Table ID: tblPIUeGJWqOtqage" -ForegroundColor White
            Write-Host ""
            Write-Host "Nueva revisión: $($newService.status.latestReadyRevisionName)" -ForegroundColor Gray
        } else {
            Write-Host ""
            Write-Host "⚠️  Las variables pueden no haberse actualizado correctamente" -ForegroundColor Yellow
            Write-Host "   Verifica manualmente en la consola de Google Cloud" -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "✗ Error al actualizar variables" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "No se requiere actualización. El servicio ya está usando el nuevo Airtable." -ForegroundColor Green
}

Write-Host ""

