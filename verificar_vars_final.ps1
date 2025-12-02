# Verificar variables de Airtable finales
$serviceJson = gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format=json 2>&1 | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error al obtener el servicio" -ForegroundColor Red
    exit 1
}

$envVars = $service.spec.template.spec.containers[0].env
$airtableVars = $envVars | Where-Object { $_.name -like "*AIRTABLE*" }

Write-Host "=== Variables de Airtable ===" -ForegroundColor Cyan
Write-Host ""

foreach ($var in $airtableVars) {
    $value = $var.value
    $isCorrect = $false
    
    if ($var.name -eq "AIRTABLE_BASE_ID") {
        $isCorrect = ($value -eq "appT0vQS4arJ3dQ6w")
    } elseif ($var.name -eq "AIRTABLE_TABLE") {
        $isCorrect = ($value -eq "tblPIUeGJWqOtqage")
    } else {
        $isCorrect = $true
    }
    
    $color = if ($isCorrect) { "Green" } else { "Red" }
    Write-Host "$($var.name) = $value" -ForegroundColor $color
}

Write-Host ""
$baseIdOk = ($airtableVars | Where-Object { $_.name -eq "AIRTABLE_BASE_ID" -and $_.value -eq "appT0vQS4arJ3dQ6w" }) -ne $null
$tableOk = ($airtableVars | Where-Object { $_.name -eq "AIRTABLE_TABLE" -and $_.value -eq "tblPIUeGJWqOtqage" }) -ne $null

if ($baseIdOk -and $tableOk) {
    Write-Host "✓ Variables correctas. Los nuevos correos se guardarán en el nuevo Airtable." -ForegroundColor Green
} else {
    Write-Host "✗ Variables incorrectas. Revisa los valores arriba." -ForegroundColor Red
}

