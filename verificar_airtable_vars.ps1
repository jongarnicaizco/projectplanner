# Script para verificar y actualizar variables de Airtable en Cloud Run
$projectId = "check-in-sf"
$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"

Write-Host "=== Verificando variables de Airtable en Cloud Run ===" -ForegroundColor Cyan
Write-Host ""

# Obtener todas las variables de entorno
Write-Host "Obteniendo variables de entorno actuales..." -ForegroundColor Yellow
$service = gcloud run services describe $serviceName --region=$region --project=$projectId --format=json 2>&1 | ConvertFrom-Json

$envVars = $service.spec.template.spec.containers[0].env
$airtableVars = $envVars | Where-Object { $_.name -like "*AIRTABLE*" }

Write-Host "Variables de Airtable actuales:" -ForegroundColor Yellow
foreach ($var in $airtableVars) {
    Write-Host "  $($var.name) = $($var.value)" -ForegroundColor Gray
}

Write-Host ""

# Verificar si están correctas
$baseIdCorrecto = ($airtableVars | Where-Object { $_.name -eq "AIRTABLE_BASE_ID" -and $_.value -eq "appT0vQS4arJ3dQ6w" }) -ne $null
$tableCorrecto = ($airtableVars | Where-Object { $_.name -eq "AIRTABLE_TABLE" -and $_.value -eq "tblPIUeGJWqOtqage" }) -ne $null

if ($baseIdCorrecto -and $tableCorrecto) {
    Write-Host "✓ Variables de Airtable están correctas" -ForegroundColor Green
    Write-Host "  Base ID: appT0vQS4arJ3dQ6w" -ForegroundColor Green
    Write-Host "  Table ID: tblPIUeGJWqOtqage" -ForegroundColor Green
} else {
    Write-Host "✗ Variables de Airtable NO están correctas" -ForegroundColor Red
    Write-Host ""
    Write-Host "Actualizando variables..." -ForegroundColor Yellow
    
    gcloud run services update $serviceName `
        --region=$region `
        --project=$projectId `
        --update-env-vars "AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,AIRTABLE_TABLE=tblPIUeGJWqOtqage" `
        --quiet
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Variables actualizadas correctamente" -ForegroundColor Green
        Write-Host ""
        Write-Host "Esperando 5 segundos para que se despliegue la nueva revisión..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        
        Write-Host ""
        Write-Host "Verificando nueva revisión..." -ForegroundColor Yellow
        $newService = gcloud run services describe $serviceName --region=$region --project=$projectId --format=json 2>&1 | ConvertFrom-Json
        $newEnvVars = $newService.spec.template.spec.containers[0].env
        $newAirtableVars = $newEnvVars | Where-Object { $_.name -like "*AIRTABLE*" }
        
        Write-Host "Nuevas variables:" -ForegroundColor Green
        foreach ($var in $newAirtableVars) {
            Write-Host "  $($var.name) = $($var.value)" -ForegroundColor Green
        }
        
        Write-Host ""
        Write-Host "✓ Servicio actualizado. Los nuevos correos se guardarán en el nuevo Airtable." -ForegroundColor Green
    } else {
        Write-Host "✗ Error al actualizar variables" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Verificación completada ===" -ForegroundColor Cyan

