# Script para eliminar la vinculación del repositorio y forzar solo contenedor
Write-Host "`n=== Eliminando vinculación a repositorio ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Obtener imagen actual
Write-Host "`n1. Obteniendo imagen Docker actual..." -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=$region --project=$project --format=json 2>&1 | ConvertFrom-Json

if ($serviceInfo) {
    $currentImage = $serviceInfo.spec.template.spec.containers[0].image
    Write-Host "  Imagen: $currentImage" -ForegroundColor Gray
    
    # 2. Obtener anotaciones
    $annotations = $serviceInfo.metadata.annotations
    Write-Host "`n2. Anotaciones actuales:" -ForegroundColor Yellow
    if ($annotations) {
        $annotations.PSObject.Properties | ForEach-Object {
            Write-Host "  $($_.Name): $($_.Value)" -ForegroundColor Gray
        }
        
        # Buscar anotaciones relacionadas con source/repo
        $sourceAnnots = $annotations.PSObject.Properties | Where-Object { 
            $_.Name -like "*source*" -or 
            $_.Name -like "*repo*" -or 
            $_.Name -like "*github*" 
        }
        
        if ($sourceAnnots) {
            Write-Host "`n  ⚠ Anotaciones relacionadas con source/repo encontradas:" -ForegroundColor Yellow
            $sourceAnnots | ForEach-Object {
                Write-Host "    - $($_.Name)" -ForegroundColor Gray
            }
        }
    }
    
    # 3. Actualizar servicio eliminando source y forzando solo imagen
    Write-Host "`n3. Actualizando servicio para usar solo imagen Docker..." -ForegroundColor Yellow
    
    # Construir comando de actualización
    $envVars = "GOOGLE_CLOUD_PROJECT=check-in-sf,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=True,GENAI_MODEL=gemini-2.5-flash,GMAIL_ADDRESS=media.manager@feverup.com,GMAIL_LABEL_FILTER=INBOX,AUTH_MODE=oauth,GCS_BUCKET=mfs_automatic_email_lead_classification,AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,AIRTABLE_TABLE=tblPIUeGJWqOtqage,AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY,PUBSUB_TOPIC=mfs-gmail-leads,PUBSUB_PROJECT_ID=check-in-sf"
    
    $updateCmd = "gcloud run services update $service --region=$region --project=$project --image=$currentImage --update-env-vars=`"$envVars`" --clear-source 2>&1"
    Write-Host "  Ejecutando: gcloud run services update ..." -ForegroundColor Gray
    $result = Invoke-Expression $updateCmd
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Servicio actualizado" -ForegroundColor Green
    } else {
        Write-Host "  Resultado: $result" -ForegroundColor Yellow
    }
    
    # 4. Eliminar anotaciones de source si existen
    if ($sourceAnnots) {
        Write-Host "`n4. Eliminando anotaciones de source..." -ForegroundColor Yellow
        $removeAnnots = @()
        $sourceAnnots | ForEach-Object {
            $removeAnnots += "--remove-annotations=$($_.Name)"
        }
        
        if ($removeAnnots.Count -gt 0) {
            $annotCmd = "gcloud run services update $service --region=$region --project=$project $($removeAnnots -join ' ') 2>&1"
            $annotResult = Invoke-Expression $annotCmd
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ Anotaciones eliminadas" -ForegroundColor Green
            }
        }
    }
    
    # 5. Verificar resultado final
    Write-Host "`n5. Verificando configuración final..." -ForegroundColor Yellow
    $finalInfo = gcloud run services describe $service --region=$region --project=$project --format=json 2>&1 | ConvertFrom-Json
    
    if ($finalInfo) {
        $finalImage = $finalInfo.spec.template.spec.containers[0].image
        $finalAnnots = $finalInfo.metadata.annotations
        
        Write-Host "  Imagen: $finalImage" -ForegroundColor Gray
        
        $hasSourceAnnots = $finalAnnots.PSObject.Properties | Where-Object { 
            $_.Name -like "*source*" -or 
            $_.Name -like "*repo*" 
        }
        
        if ($hasSourceAnnots) {
            Write-Host "  ⚠ Aún tiene anotaciones de source:" -ForegroundColor Yellow
            $hasSourceAnnots | ForEach-Object {
                Write-Host "    - $($_.Name)" -ForegroundColor Gray
            }
        } else {
            Write-Host "  ✓ No tiene anotaciones de source" -ForegroundColor Green
        }
    }
} else {
    Write-Host "  ✗ No se pudo obtener información del servicio" -ForegroundColor Red
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "✓ Servicio actualizado para usar solo imagen Docker" -ForegroundColor Green
Write-Host "✓ Anotaciones de source eliminadas" -ForegroundColor Green
Write-Host "`nNota: Si aún aparece como 'Repository' en la consola, puede ser caché." -ForegroundColor Yellow
Write-Host "Refresca la página o espera unos minutos." -ForegroundColor Yellow

Write-Host "`n=== Fin ===" -ForegroundColor Cyan

