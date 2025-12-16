# Script completo para diagnosticar por qué no se procesan emails
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  DIAGNOSTICO COMPLETO DE PROCESAMIENTO" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$timestamp = "2025-12-02T23:13:00Z"

Write-Host "[1] Verificando variables de entorno de Airtable..." -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=us-central1 --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($serviceInfo) {
    $envVars = $serviceInfo.spec.template.spec.containers[0].env
    $airtableBaseId = $envVars | Where-Object { $_.name -eq "AIRTABLE_BASE_ID" }
    $airtableTable = $envVars | Where-Object { $_.name -eq "AIRTABLE_TABLE" }
    $airtableTokenSecret = $envVars | Where-Object { $_.name -eq "AIRTABLE_TOKEN_SECRET" }
    
    Write-Host ""
    if ($airtableBaseId -and $airtableBaseId.value) {
        Write-Host "  [OK] AIRTABLE_BASE_ID: $($airtableBaseId.value)" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] AIRTABLE_BASE_ID no configurado o vacío" -ForegroundColor Red
    }
    
    if ($airtableTable -and $airtableTable.value) {
        Write-Host "  [OK] AIRTABLE_TABLE: $($airtableTable.value)" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] AIRTABLE_TABLE no configurado o vacío" -ForegroundColor Red
    }
    
    if ($airtableTokenSecret -and $airtableTokenSecret.value) {
        Write-Host "  [OK] AIRTABLE_TOKEN_SECRET: $($airtableTokenSecret.value)" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] AIRTABLE_TOKEN_SECRET no configurado o vacío" -ForegroundColor Red
    }
    
    if (-not $airtableBaseId -or -not $airtableTable) {
        Write-Host ""
        Write-Host "  [SOLUCION] Configura las variables de entorno:" -ForegroundColor Yellow
        Write-Host "  gcloud run services update $service --region=us-central1 --project=$project --set-env-vars=`"AIRTABLE_BASE_ID=tu_base_id,AIRTABLE_TABLE=tu_tabla,AIRTABLE_TOKEN_SECRET=tu_secret_name`"" -ForegroundColor White
    }
} else {
    Write-Host "  [ERROR] No se pudo obtener información del servicio" -ForegroundColor Red
}

Write-Host ""
Write-Host "[2] Buscando logs de procesamiento desde $timestamp..." -ForegroundColor Yellow
$logs = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND timestamp>=`"$timestamp`"" `
  --limit=100 `
  --format="json" `
  --project=$project `
  2>&1 | ConvertFrom-Json

if ($logs) {
    Write-Host "  Se encontraron $($logs.Count) logs" -ForegroundColor Cyan
    Write-Host ""
    
    # Buscar logs relevantes
    $procesamiento = $logs | Where-Object {
        $text = $_.textPayload -or ($_.jsonPayload | ConvertTo-Json -Compress)
        $text -match "Empiezo a procesar mensaje|Delta INBOX|nuevosMensajes|Airtable.*Iniciando|Airtable.*ERROR|ERROR.*Airtable"
    }
    
    if ($procesamiento) {
        Write-Host "  Logs relevantes encontrados:" -ForegroundColor Green
        foreach ($log in $procesamiento | Select-Object -First 10) {
            $ts = $log.timestamp
            $text = $log.textPayload
            if (-not $text) {
                $text = ($log.jsonPayload | ConvertTo-Json -Compress)
            }
            Write-Host "  [$ts] $($text.Substring(0, [Math]::Min(150, $text.Length)))" -ForegroundColor Gray
        }
    } else {
        Write-Host "  [WARNING] No se encontraron logs de procesamiento" -ForegroundColor Yellow
    }
    
    # Buscar errores
    $errores = $logs | Where-Object {
        $text = $_.textPayload -or ($_.jsonPayload | ConvertTo-Json -Compress)
        $text -match "ERROR|Error|error|unauthorized|invalid"
    }
    
    if ($errores) {
        Write-Host ""
        Write-Host "  [ERROR] Errores encontrados:" -ForegroundColor Red
        foreach ($error in $errores | Select-Object -First 5) {
            $ts = $error.timestamp
            $text = $error.textPayload
            if (-not $text) {
                $text = ($error.jsonPayload | ConvertTo-Json -Compress)
            }
            Write-Host "  [$ts] $($text.Substring(0, [Math]::Min(200, $text.Length)))" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  [WARNING] No se encontraron logs recientes" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[3] Verificando si hay mensajes nuevos detectados..." -ForegroundColor Yellow
$deltaLogs = $logs | Where-Object {
    $text = $_.textPayload -or ($_.jsonPayload | ConvertTo-Json -Compress)
    $text -match "Delta INBOX|nuevosMensajes"
}

if ($deltaLogs) {
    foreach ($log in $deltaLogs | Select-Object -First 3) {
        $text = $log.textPayload
        if (-not $text) {
            $text = ($log.jsonPayload | ConvertTo-Json -Compress)
        }
        Write-Host "  $text" -ForegroundColor Cyan
    }
} else {
    Write-Host "  [WARNING] No se encontraron logs de detección de mensajes nuevos" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan

