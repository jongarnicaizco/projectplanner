# Script de diagnóstico para Airtable
Write-Host "`n=== Diagnóstico de Airtable ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"

# 1. Verificar variables de entorno
Write-Host "`n1. Variables de entorno del servicio:" -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=us-central1 --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($serviceInfo) {
    $envVars = $serviceInfo.spec.template.spec.containers[0].env
    Write-Host "  Variables relacionadas con Airtable:" -ForegroundColor Green
    
    $airtableVars = @("SKIP_AIRTABLE", "AIRTABLE_BASE_ID", "AIRTABLE_TABLE", "AIRTABLE_TOKEN_SECRET")
    foreach ($varName in $airtableVars) {
        $var = $envVars | Where-Object { $_.name -eq $varName }
        if ($var) {
            $value = if ($var.value) { $var.value } else { $var.valueFrom.secretKeyRef.name }
            $displayValue = if ($varName -eq "SKIP_AIRTABLE" -and $value -eq "true") { 
                "$value ⚠️ PROBLEMA: Airtable está deshabilitado!" 
            } else { 
                $value 
            }
            $color = if ($varName -eq "SKIP_AIRTABLE" -and $value -eq "true") { "Red" } else { "Green" }
            Write-Host "    $varName = $displayValue" -ForegroundColor $color
        } else {
            Write-Host "    $varName = (no configurada)" -ForegroundColor Yellow
        }
    }
    
    # Verificar SKIP_AIRTABLE específicamente
    $skipVar = $envVars | Where-Object { $_.name -eq "SKIP_AIRTABLE" }
    if ($skipVar) {
        $skipValue = if ($skipVar.value) { $skipVar.value } else { 
            # Si está en Secret Manager, necesitamos obtenerlo
            $secretName = $skipVar.valueFrom.secretKeyRef.name
            Write-Host "    (SKIP_AIRTABLE está en Secret Manager: $secretName)" -ForegroundColor Gray
            "unknown"
        }
        if ($skipValue -eq "true") {
            Write-Host "`n  ⚠️ PROBLEMA ENCONTRADO: SKIP_AIRTABLE está en 'true'" -ForegroundColor Red
            Write-Host "  Esto impide que se guarden correos en Airtable" -ForegroundColor Red
        }
    } else {
        Write-Host "`n  ✓ SKIP_AIRTABLE no está configurada (por defecto es 'false')" -ForegroundColor Green
    }
}

# 2. Buscar logs recientes de procesamiento
Write-Host "`n2. Últimos logs de procesamiento (última hora):" -ForegroundColor Yellow
$logs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND (textPayload=~'procesar' OR textPayload=~'mensaje' OR textPayload=~'Airtable')" --project=$project --limit=20 --format="json" --freshness=1h 2>&1 | ConvertFrom-Json

if ($logs -and $logs.Count -gt 0) {
    Write-Host "  Logs encontrados: $($logs.Count)" -ForegroundColor Green
    $logs | Select-Object -First 5 | ForEach-Object {
        $severity = $_.severity
        $color = if ($severity -eq "ERROR") { "Red" } elseif ($severity -eq "WARNING") { "Yellow" } else { "Green" }
        Write-Host "`n  [$($_.timestamp)] $severity" -ForegroundColor $color
        if ($_.textPayload) {
            $payload = $_.textPayload.Substring(0, [Math]::Min(300, $_.textPayload.Length))
            Write-Host "  $payload" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  No se encontraron logs recientes de procesamiento" -ForegroundColor Yellow
    Write-Host "  Esto puede indicar que:" -ForegroundColor Yellow
    Write-Host "    - No hay correos nuevos para procesar" -ForegroundColor Gray
    Write-Host "    - El servicio no se está ejecutando" -ForegroundColor Gray
    Write-Host "    - Hay un problema con el Cloud Scheduler" -ForegroundColor Gray
}

# 3. Buscar errores específicos de Airtable
Write-Host "`n3. Errores relacionados con Airtable:" -ForegroundColor Yellow
$errors = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND severity>=ERROR AND (textPayload=~'Airtable' OR textPayload=~'airtable')" --project=$project --limit=10 --format="json" --freshness=24h 2>&1 | ConvertFrom-Json

if ($errors -and $errors.Count -gt 0) {
    Write-Host "  Errores encontrados: $($errors.Count)" -ForegroundColor Red
    $errors | Select-Object -First 3 | ForEach-Object {
        Write-Host "`n  [$($_.timestamp)]" -ForegroundColor Red
        if ($_.textPayload) {
            Write-Host "  $($_.textPayload)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  No se encontraron errores relacionados con Airtable" -ForegroundColor Green
}

# 4. Verificar si hay mensajes de SKIP_AIRTABLE
Write-Host "`n4. Verificando si SKIP_AIRTABLE está activado en logs:" -ForegroundColor Yellow
$skipLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND textPayload=~'SKIP_AIRTABLE'" --project=$project --limit=5 --format="json" --freshness=24h 2>&1 | ConvertFrom-Json

if ($skipLogs -and $skipLogs.Count -gt 0) {
    Write-Host "  ⚠️ PROBLEMA: Se encontraron logs indicando que SKIP_AIRTABLE está activado" -ForegroundColor Red
    $skipLogs | ForEach-Object {
        Write-Host "  [$($_.timestamp)] $($_.textPayload)" -ForegroundColor Red
    }
} else {
    Write-Host "  ✓ No se encontraron logs de SKIP_AIRTABLE activado" -ForegroundColor Green
}

Write-Host "`n=== Fin de diagnóstico ===" -ForegroundColor Cyan

