# Script para diagnosticar problemas con Airtable
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  DIAGNOSTICO DE AIRTABLE" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$region = "us-central1"
$service = "mfs-lead-generation-ai"

Write-Host "[1] Verificando variables de entorno de Airtable..." -ForegroundColor Yellow
$envVars = gcloud run services describe $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($envVars) {
    $containerEnv = $envVars.spec.template.spec.containers[0].env
    $airtableBaseId = $containerEnv | Where-Object { $_.name -eq "AIRTABLE_BASE_ID" }
    $airtableTable = $containerEnv | Where-Object { $_.name -eq "AIRTABLE_TABLE" }
    $airtableTokenSecret = $containerEnv | Where-Object { $_.name -eq "AIRTABLE_TOKEN_SECRET" }
    
    Write-Host ""
    if ($airtableBaseId) {
        Write-Host "  [OK] AIRTABLE_BASE_ID: $($airtableBaseId.value)" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] AIRTABLE_BASE_ID no configurado" -ForegroundColor Red
    }
    
    if ($airtableTable) {
        Write-Host "  [OK] AIRTABLE_TABLE: $($airtableTable.value)" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] AIRTABLE_TABLE no configurado" -ForegroundColor Red
    }
    
    if ($airtableTokenSecret) {
        Write-Host "  [OK] AIRTABLE_TOKEN_SECRET: $($airtableTokenSecret.value)" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] AIRTABLE_TOKEN_SECRET no configurado" -ForegroundColor Red
    }
} else {
    Write-Host "  [ERROR] No se pudo obtener información del servicio" -ForegroundColor Red
}

Write-Host ""
Write-Host "[2] Buscando logs de creación exitosa en Airtable..." -ForegroundColor Yellow
$exitosos = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND textPayload=~`"Registro creado en Airtable`"" `
  --limit=5 `
  --format="table(timestamp,textPayload)" `
  --project=$project `
  --freshness=30m `
  2>&1

if ($LASTEXITCODE -eq 0 -and $exitosos) {
    Write-Host $exitosos -ForegroundColor Green
    Write-Host ""
    Write-Host "  [OK] Se encontraron registros creados exitosamente" -ForegroundColor Green
} else {
    Write-Host "  [WARNING] No se encontraron registros creados exitosamente" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[3] Buscando errores de Airtable..." -ForegroundColor Yellow
$errores = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND (textPayload=~`"ERROR.*Airtable`" OR textPayload=~`"Error.*Airtable`" OR textPayload=~`"Airtable.*ERROR`")" `
  --limit=10 `
  --format="table(timestamp,textPayload)" `
  --project=$project `
  --freshness=30m `
  2>&1

if ($LASTEXITCODE -eq 0 -and $errores) {
    Write-Host $errores -ForegroundColor Red
    Write-Host ""
    Write-Host "  [ERROR] Se encontraron errores de Airtable" -ForegroundColor Red
} else {
    Write-Host "  [OK] No se encontraron errores de Airtable" -ForegroundColor Green
}

Write-Host ""
Write-Host "[4] Buscando logs de procesamiento de emails..." -ForegroundColor Yellow
$procesamiento = gcloud logging read `
  "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$service`" AND (textPayload=~`"Empiezo a procesar mensaje`" OR textPayload=~`"Mensaje listo para clasificar`")" `
  --limit=5 `
  --format="table(timestamp,textPayload)" `
  --project=$project `
  --freshness=30m `
  2>&1

if ($LASTEXITCODE -eq 0 -and $procesamiento) {
    Write-Host $procesamiento -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [OK] El servicio está procesando emails" -ForegroundColor Green
} else {
    Write-Host "  [WARNING] No se encontraron logs de procesamiento recientes" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  RESUMEN" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "Si las variables de entorno no están configuradas, configúralas:" -ForegroundColor Yellow
Write-Host "gcloud run services update $service --region=$region --project=$project --set-env-vars=`"AIRTABLE_BASE_ID=tu_base_id,AIRTABLE_TABLE=tu_tabla,AIRTABLE_TOKEN_SECRET=tu_secret_name`"" -ForegroundColor White
Write-Host ""

