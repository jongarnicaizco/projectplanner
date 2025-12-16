# Script completo para verificar y corregir problemas con Airtable
Write-Host "`n=== Verificación y corrección completa de Airtable ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Obtener configuración actual del servicio
Write-Host "`n1. Obteniendo configuración actual del servicio..." -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json

if (-not $serviceInfo) {
    Write-Host "  ✗ Error: No se pudo obtener información del servicio" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Servicio encontrado" -ForegroundColor Green

# 2. Verificar variables de entorno
Write-Host "`n2. Verificando variables de entorno..." -ForegroundColor Yellow
$envVars = $serviceInfo.spec.template.spec.containers[0].env
$needsUpdate = $false
$updateVars = @{}

# Verificar SKIP_AIRTABLE
$skipVar = $envVars | Where-Object { $_.name -eq "SKIP_AIRTABLE" }
if ($skipVar) {
    $skipValue = if ($skipVar.value) { $skipVar.value } else { "false" }
    if ($skipValue -eq "true") {
        Write-Host "  ⚠️ PROBLEMA: SKIP_AIRTABLE está en 'true'" -ForegroundColor Red
        Write-Host "  Corrigiendo: estableciendo SKIP_AIRTABLE=false" -ForegroundColor Yellow
        $updateVars["SKIP_AIRTABLE"] = "false"
        $needsUpdate = $true
    } else {
        Write-Host "  ✓ SKIP_AIRTABLE está en 'false' (correcto)" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ SKIP_AIRTABLE no está configurada (por defecto es false)" -ForegroundColor Green
}

# Verificar AIRTABLE_BASE_ID
$baseIdVar = $envVars | Where-Object { $_.name -eq "AIRTABLE_BASE_ID" }
$expectedBaseId = "appT0vQS4arJ3dQ6w"
if ($baseIdVar) {
    $baseIdValue = if ($baseIdVar.value) { $baseIdVar.value } else { "" }
    if ($baseIdValue -ne $expectedBaseId) {
        Write-Host "  ⚠️ PROBLEMA: AIRTABLE_BASE_ID incorrecto: $baseIdValue" -ForegroundColor Red
        Write-Host "  Corrigiendo: estableciendo AIRTABLE_BASE_ID=$expectedBaseId" -ForegroundColor Yellow
        $updateVars["AIRTABLE_BASE_ID"] = $expectedBaseId
        $needsUpdate = $true
    } else {
        Write-Host "  ✓ AIRTABLE_BASE_ID correcto: $expectedBaseId" -ForegroundColor Green
    }
} else {
    Write-Host "  ⚠️ PROBLEMA: AIRTABLE_BASE_ID no está configurada" -ForegroundColor Red
    Write-Host "  Corrigiendo: agregando AIRTABLE_BASE_ID=$expectedBaseId" -ForegroundColor Yellow
    $updateVars["AIRTABLE_BASE_ID"] = $expectedBaseId
    $needsUpdate = $true
}

# Verificar AIRTABLE_TABLE
$tableVar = $envVars | Where-Object { $_.name -eq "AIRTABLE_TABLE" }
$expectedTable = "tblPIUeGJWqOtqage"
if ($tableVar) {
    $tableValue = if ($tableVar.value) { $tableVar.value } else { "" }
    if ($tableValue -ne $expectedTable) {
        Write-Host "  ⚠️ PROBLEMA: AIRTABLE_TABLE incorrecto: $tableValue" -ForegroundColor Red
        Write-Host "  Corrigiendo: estableciendo AIRTABLE_TABLE=$expectedTable" -ForegroundColor Yellow
        $updateVars["AIRTABLE_TABLE"] = $expectedTable
        $needsUpdate = $true
    } else {
        Write-Host "  ✓ AIRTABLE_TABLE correcto: $expectedTable" -ForegroundColor Green
    }
} else {
    Write-Host "  ⚠️ PROBLEMA: AIRTABLE_TABLE no está configurada" -ForegroundColor Red
    Write-Host "  Corrigiendo: agregando AIRTABLE_TABLE=$expectedTable" -ForegroundColor Yellow
    $updateVars["AIRTABLE_TABLE"] = $expectedTable
    $needsUpdate = $true
}

# Verificar AIRTABLE_TOKEN_SECRET
$tokenVar = $envVars | Where-Object { $_.name -eq "AIRTABLE_TOKEN_SECRET" }
if (-not $tokenVar) {
    Write-Host "  ⚠️ PROBLEMA: AIRTABLE_TOKEN_SECRET no está configurada" -ForegroundColor Red
    Write-Host "  Corrigiendo: agregando AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY" -ForegroundColor Yellow
    $updateVars["AIRTABLE_TOKEN_SECRET"] = "AIRTABLE_API_KEY"
    $needsUpdate = $true
} else {
    Write-Host "  ✓ AIRTABLE_TOKEN_SECRET configurada" -ForegroundColor Green
}

# 3. Actualizar servicio si es necesario
if ($needsUpdate) {
    Write-Host "`n3. Actualizando servicio con las correcciones..." -ForegroundColor Yellow
    
    # Construir comando de actualización
    $updateCmd = "gcloud run services update $service --region=$region --project=$project"
    
    # Agregar variables a actualizar
    $varsString = ($updateVars.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ","
    $updateCmd += " --update-env-vars $varsString"
    
    Write-Host "  Ejecutando: $updateCmd" -ForegroundColor Gray
    Invoke-Expression $updateCmd
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Servicio actualizado exitosamente" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Error al actualizar el servicio" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n3. No se requieren actualizaciones" -ForegroundColor Green
}

# 4. Verificar logs recientes
Write-Host "`n4. Verificando logs recientes..." -ForegroundColor Yellow
$recentLogs = gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$service AND (textPayload=~'Airtable' OR textPayload=~'procesar' OR textPayload=~'mensaje')" --project=$project --limit=5 --format="json" --freshness=1h 2>&1 | ConvertFrom-Json

if ($recentLogs -and $recentLogs.Count -gt 0) {
    Write-Host "  ✓ Se encontraron logs recientes de procesamiento" -ForegroundColor Green
} else {
    Write-Host "  ⚠️ No se encontraron logs recientes de procesamiento" -ForegroundColor Yellow
    Write-Host "  Esto puede indicar que:" -ForegroundColor Gray
    Write-Host "    - No hay correos nuevos para procesar" -ForegroundColor Gray
    Write-Host "    - El Cloud Scheduler no está ejecutándose" -ForegroundColor Gray
}

# 5. Resumen
Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
if ($needsUpdate) {
    Write-Host "✓ Correcciones aplicadas al servicio" -ForegroundColor Green
    Write-Host "✓ El servicio debería procesar correos en Airtable ahora" -ForegroundColor Green
} else {
    Write-Host "✓ Configuración correcta" -ForegroundColor Green
}

Write-Host "`nPara verificar que funciona:" -ForegroundColor Yellow
Write-Host "  1. Espera a que llegue un correo nuevo" -ForegroundColor Gray
Write-Host "  2. O ejecuta manualmente el endpoint de procesamiento" -ForegroundColor Gray
Write-Host "  3. Revisa los logs en: https://console.cloud.google.com/logs?project=$project" -ForegroundColor Gray

Write-Host "`n=== Fin ===" -ForegroundColor Cyan

