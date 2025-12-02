# Script para corregir el trigger de Cloud Build
Write-Host "`n=== Corrigiendo trigger de Cloud Build ===" -ForegroundColor Cyan

$project = "check-in-sf"
$region = "us-central1"
$triggerName = "mfs-lead-generation-ai-deploy"
$repoOwner = "jongarnicaizco"
$repoName = "mfs-lead-generation-ai"
$buildConfig = "mfs-lead-generation-ai/cloudbuild.yaml"

# Listar triggers existentes
Write-Host "`nBuscando triggers existentes..." -ForegroundColor Yellow
$triggers = gcloud builds triggers list --project=$project --format="json" 2>&1 | ConvertFrom-Json

$existingTrigger = $null
if ($triggers) {
    $existingTrigger = $triggers | Where-Object { 
        $_.name -eq $triggerName -or 
        ($_.github -and $_.github.name -eq $repoName -and $_.github.owner -eq $repoOwner)
    }
}

if ($existingTrigger) {
    Write-Host "`nTrigger existente encontrado: $($existingTrigger.name)" -ForegroundColor Yellow
    Write-Host "Configuración actual:" -ForegroundColor Gray
    Write-Host "  Build config: $($existingTrigger.build.buildConfigPath)" -ForegroundColor Gray
    
    # Eliminar el trigger existente
    Write-Host "`nEliminando trigger existente..." -ForegroundColor Yellow
    gcloud builds triggers delete $($existingTrigger.name) --project=$project --quiet 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Trigger eliminado" -ForegroundColor Green
    } else {
        Write-Host "Error al eliminar trigger" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`nNo se encontró trigger existente" -ForegroundColor Yellow
}

# Crear nuevo trigger con la configuración correcta
Write-Host "`nCreando nuevo trigger con configuración correcta..." -ForegroundColor Yellow

$createCmd = @"
gcloud builds triggers create github `
  --name=$triggerName `
  --repo-name=$repoName `
  --repo-owner=$repoOwner `
  --branch-pattern='^main$' `
  --build-config=$buildConfig `
  --region=$region `
  --project=$project
"@

Write-Host "Ejecutando: $createCmd" -ForegroundColor Gray
Invoke-Expression $createCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Trigger creado exitosamente!" -ForegroundColor Green
    Write-Host "`nEl trigger ahora usará el archivo cloudbuild.yaml correcto" -ForegroundColor Green
} else {
    Write-Host "`n✗ Error al crear el trigger" -ForegroundColor Red
    Write-Host "`nVerifica que:" -ForegroundColor Yellow
    Write-Host "  1. La conexión con GitHub esté configurada" -ForegroundColor Yellow
    Write-Host "  2. El repositorio esté autorizado" -ForegroundColor Yellow
    Write-Host "  3. Tengas los permisos necesarios" -ForegroundColor Yellow
}

Write-Host "`n=== Fin ===" -ForegroundColor Cyan

