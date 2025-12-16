# Script para monitorear el progreso del despliegue
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  MONITOREO DE DESPLIEGUE" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"

Write-Host "Buscando el build más reciente..." -ForegroundColor Yellow
Write-Host ""

$builds = gcloud builds list --limit=1 --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($builds -and $builds.Count -gt 0) {
    $latestBuild = $builds[0]
    
    Write-Host "Build ID: $($latestBuild.id)" -ForegroundColor Cyan
    Write-Host "Estado: $($latestBuild.status)" -ForegroundColor $(if ($latestBuild.status -eq "SUCCESS") { "Green" } elseif ($latestBuild.status -eq "FAILURE") { "Red" } else { "Yellow" })
    Write-Host "Iniciado: $($latestBuild.createTime)" -ForegroundColor Gray
    Write-Host "URL: $($latestBuild.logUrl)" -ForegroundColor White
    Write-Host ""
    
    if ($latestBuild.status -eq "WORKING" -or $latestBuild.status -eq "QUEUED") {
        Write-Host "⏳ El build está en progreso..." -ForegroundColor Yellow
        Write-Host "Puedes ver el progreso en tiempo real en:" -ForegroundColor Cyan
        Write-Host $latestBuild.logUrl -ForegroundColor White
    } elseif ($latestBuild.status -eq "SUCCESS") {
        Write-Host "✓✓✓ BUILD COMPLETADO EXITOSAMENTE ✓✓✓" -ForegroundColor Green
        Write-Host ""
        
        Write-Host "Verificando servicio Cloud Run..." -ForegroundColor Yellow
        $service = gcloud run services describe mfs-lead-generation-ai `
          --region=us-central1 `
          --project=$project `
          --format="json" `
          2>&1 | ConvertFrom-Json
        
        if ($service) {
            Write-Host "✓ Servicio activo" -ForegroundColor Green
            Write-Host "  URL: $($service.status.url)" -ForegroundColor Cyan
            Write-Host "  Revisión: $($service.status.latestReadyRevisionName)" -ForegroundColor Gray
            Write-Host ""
            
            # Verificar variables de entorno
            $envVars = $service.spec.template.spec.containers[0].env
            $emailFrom = $envVars | Where-Object { $_.name -eq "EMAIL_FROM" }
            $emailTo = $envVars | Where-Object { $_.name -eq "EMAIL_TO" }
            $airtableVars = $envVars | Where-Object { $_.name -like "*AIRTABLE*" }
            
            Write-Host "Variables de entorno:" -ForegroundColor Cyan
            if ($emailFrom) {
                Write-Host "  ✓ EMAIL_FROM: $($emailFrom.value)" -ForegroundColor Green
            }
            if ($emailTo) {
                Write-Host "  ✓ EMAIL_TO: $($emailTo.value)" -ForegroundColor Green
            }
            if ($airtableVars) {
                Write-Host "  ✗ Variables de Airtable aún presentes" -ForegroundColor Red
            } else {
                Write-Host "  ✓ Variables de Airtable eliminadas" -ForegroundColor Green
            }
            
            Write-Host ""
            Write-Host "=" * 70 -ForegroundColor Cyan
            Write-Host "  DESPLIEGUE COMPLETADO Y VERIFICADO" -ForegroundColor Cyan
            Write-Host "=" * 70 -ForegroundColor Cyan
            Write-Host ""
            Write-Host "El servicio está listo para procesar emails." -ForegroundColor Green
            Write-Host "Los emails se enviarán a: jongarnicaizco@gmail.com" -ForegroundColor Cyan
        }
    } elseif ($latestBuild.status -eq "FAILURE") {
        Write-Host "✗✗✗ BUILD FALLÓ ✗✗✗" -ForegroundColor Red
        Write-Host ""
        Write-Host "Revisa los logs en:" -ForegroundColor Yellow
        Write-Host $latestBuild.logUrl -ForegroundColor White
    }
} else {
    Write-Host "⚠ No se encontraron builds recientes" -ForegroundColor Yellow
    Write-Host "Puede que el build aún no haya iniciado" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Para ver todos los builds:" -ForegroundColor Cyan
Write-Host "https://console.cloud.google.com/cloud-build/builds?project=$project" -ForegroundColor White

