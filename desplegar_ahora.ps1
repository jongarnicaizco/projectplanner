# Script para desplegar inmediatamente
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  DESPLIEGUE MANUAL DE mfs-lead-generation-ai" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$imageTag = "manual-$timestamp"

Write-Host "[1] Generando tag de imagen: $imageTag" -ForegroundColor Yellow
Write-Host ""

Write-Host "[2] Ejecutando Cloud Build..." -ForegroundColor Yellow
Write-Host "Esto puede tardar varios minutos..." -ForegroundColor Gray
Write-Host ""

$buildOutput = gcloud builds submit `
  --config=cloudbuild.yaml `
  --project=$project `
  --substitutions="_IMAGE_TAG=$imageTag" `
  2>&1

Write-Host $buildOutput

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓✓✓ BUILD COMPLETADO EXITOSAMENTE ✓✓✓" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "[3] Esperando a que el despliegue se complete..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    
    Write-Host ""
    Write-Host "[4] Verificando servicio..." -ForegroundColor Yellow
    $serviceInfo = gcloud run services describe mfs-lead-generation-ai `
      --region=us-central1 `
      --project=$project `
      --format="json" `
      2>&1 | ConvertFrom-Json
    
    if ($serviceInfo) {
        Write-Host "✓ Servicio desplegado correctamente" -ForegroundColor Green
        Write-Host "  URL: $($serviceInfo.status.url)" -ForegroundColor Cyan
        Write-Host "  Revisión: $($serviceInfo.status.latestReadyRevisionName)" -ForegroundColor Gray
        Write-Host ""
        
        # Verificar variables de entorno
        Write-Host "[5] Verificando variables de entorno..." -ForegroundColor Yellow
        $envVars = $serviceInfo.spec.template.spec.containers[0].env
        $hasEmailFrom = $envVars | Where-Object { $_.name -eq "EMAIL_FROM" }
        $hasEmailTo = $envVars | Where-Object { $_.name -eq "EMAIL_TO" }
        $hasAirtable = $envVars | Where-Object { $_.name -like "*AIRTABLE*" }
        
        if ($hasEmailFrom -and $hasEmailTo) {
            Write-Host "✓ Variables de email configuradas:" -ForegroundColor Green
            Write-Host "  EMAIL_FROM: $($hasEmailFrom.value)" -ForegroundColor Gray
            Write-Host "  EMAIL_TO: $($hasEmailTo.value)" -ForegroundColor Gray
        } else {
            Write-Host "⚠ Variables de email no encontradas" -ForegroundColor Yellow
        }
        
        if ($hasAirtable) {
            Write-Host "⚠ Variables de Airtable aún presentes (deben eliminarse)" -ForegroundColor Yellow
        } else {
            Write-Host "✓ Variables de Airtable eliminadas" -ForegroundColor Green
        }
        
        Write-Host ""
        Write-Host "=" * 70 -ForegroundColor Cyan
        Write-Host "  DESPLIEGUE COMPLETADO" -ForegroundColor Cyan
        Write-Host "=" * 70 -ForegroundColor Cyan
        Write-Host ""
        Write-Host "El servicio está activo y listo para procesar emails." -ForegroundColor Green
        Write-Host "Los emails se enviarán a: jongarnicaizco@gmail.com" -ForegroundColor Cyan
    } else {
        Write-Host "⚠ No se pudo verificar el despliegue" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "✗✗✗ ERROR EN EL BUILD ✗✗✗" -ForegroundColor Red
    Write-Host ""
    Write-Host "Revisa los logs en:" -ForegroundColor Yellow
    Write-Host "https://console.cloud.google.com/cloud-build/builds?project=$project" -ForegroundColor White
}

