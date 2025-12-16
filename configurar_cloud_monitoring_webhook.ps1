# Script para configurar Cloud Monitoring que "observa" el webhook de Airtable
# Cuando el webhook se activa (desde el sistema de alerting), Cloud Monitoring detecta la activación
# y ejecuta una Cloud Function que detiene el servicio

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CONFIGURAR CLOUD MONITORING PARA WEBHOOK" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$region = "us-central1"
$serviceName = "mfs-lead-generation-ai"
$serviceUrl = "https://mfs-lead-generation-ai-vtlrnibdxq-uc.a.run.app"
$webhookUrl = "https://hooks.airtable.com/workflows/v1/genericWebhook/appaleRB8wz8qWJGX/wfl3ElRaRfmFQW1sq/wtr5wkc4U2GDOfPwP"

Write-Host "Proyecto: $project" -ForegroundColor Gray
Write-Host "Región: $region" -ForegroundColor Gray
Write-Host "Servicio: $serviceName" -ForegroundColor Gray
Write-Host "URL del servicio: $serviceUrl" -ForegroundColor Gray
Write-Host "Webhook de Airtable: $webhookUrl" -ForegroundColor Gray
Write-Host ""

# OPCIÓN 1: Cloud Monitoring Alert Policy que detecta logs del webhook
Write-Host "[OPCIÓN 1] Configurando Cloud Monitoring Alert Policy..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Esta opción crea una alerta que detecta cuando el webhook se activa" -ForegroundColor Gray
Write-Host "basándose en logs o métricas, y entonces llama al endpoint para detener el servicio." -ForegroundColor Gray
Write-Host ""

# Crear una Cloud Function que será invocada por la alerta
$functionName = "mfs-stop-service-on-webhook"
$functionRegion = "us-central1"

Write-Host "[1] Creando Cloud Function para detener el servicio..." -ForegroundColor Yellow

# Crear directorio temporal para la función
$tempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
$functionCode = @"
const functions = require('@google-cloud/functions-framework');
const axios = require('axios');

functions.http('stopService', async (req, res) => {
  try {
    const serviceUrl = '${serviceUrl}/webhook/airtable-stop';
    
    console.log('🚨 Cloud Monitoring detectó activación del webhook. Deteniendo servicio...');
    
    // Llamar al endpoint para detener el servicio
    const response = await axios.post(serviceUrl, {}, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('✓ Servicio detenido exitosamente:', response.data);
    
    res.status(200).json({
      success: true,
      message: 'Servicio detenido desde Cloud Monitoring',
      data: response.data
    });
  } catch (error) {
    console.error('✗ Error deteniendo servicio:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
"@

$packageJson = @"
{
  "name": "mfs-stop-service-function",
  "version": "1.0.0",
  "dependencies": {
    "@google-cloud/functions-framework": "^3.0.0",
    "axios": "^1.6.0"
  }
}
"@

Set-Content -Path "$tempDir/index.js" -Value $functionCode
Set-Content -Path "$tempDir/package.json" -Value $packageJson

Write-Host "  ✓ Código de la función creado en: $tempDir" -ForegroundColor Green

# Desplegar la función
Write-Host ""
Write-Host "[2] Desplegando Cloud Function..." -ForegroundColor Yellow
Write-Host "  NOTA: Necesitas tener gcloud CLI configurado y permisos para crear Cloud Functions" -ForegroundColor Gray
Write-Host ""
Write-Host "  Comando para desplegar:" -ForegroundColor Cyan
Write-Host "  gcloud functions deploy $functionName \`" -ForegroundColor White
Write-Host "    --gen2 \`" -ForegroundColor White
Write-Host "    --runtime=nodejs20 \`" -ForegroundColor White
Write-Host "    --region=$functionRegion \`" -ForegroundColor White
Write-Host "    --source=$tempDir \`" -ForegroundColor White
Write-Host "    --entry-point=stopService \`" -ForegroundColor White
Write-Host "    --trigger-http \`" -ForegroundColor White
Write-Host "    --allow-unauthenticated \`" -ForegroundColor White
Write-Host "    --project=$project" -ForegroundColor White
Write-Host ""

# OPCIÓN 2: Cloud Logging que detecta cuando el webhook se activa
Write-Host "[OPCIÓN 2] Configurando Cloud Logging Sink..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Esta opción usa Cloud Logging para detectar cuando hay logs relacionados" -ForegroundColor Gray
Write-Host "con el webhook y entonces ejecuta una acción." -ForegroundColor Gray
Write-Host ""

# OPCIÓN 3: Cloud Monitoring que observa métricas del servicio
Write-Host "[OPCIÓN 3] Configurando Cloud Monitoring Alert Policy..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Esta opción crea una alerta basada en métricas (ej: número de logs por minuto)" -ForegroundColor Gray
Write-Host "y cuando se supera un umbral, ejecuta una acción." -ForegroundColor Gray
Write-Host ""

# Crear política de alerta usando gcloud
Write-Host "[3] Creando política de alerta de Cloud Monitoring..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Política de alerta que detecta cuando se supera un umbral de logs/minuto" -ForegroundColor Gray
Write-Host "  y ejecuta la Cloud Function para detener el servicio." -ForegroundColor Gray
Write-Host ""

$alertPolicyJson = @"
{
  "displayName": "MFS - Detener servicio cuando webhook se activa",
  "conditions": [
    {
      "displayName": "Logs por minuto superan umbral",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$serviceName\" AND jsonPayload.message=~\"webhook.*airtable\"",
        "comparison": "COMPARISON_GT",
        "thresholdValue": 1,
        "duration": "60s"
      }
    }
  ],
  "notificationChannels": [],
  "alertStrategy": {
    "autoClose": "1800s"
  }
}
"@

$alertPolicyFile = "$tempDir/alert-policy.json"
Set-Content -Path $alertPolicyFile -Value $alertPolicyJson

Write-Host "  ✓ Política de alerta creada en: $alertPolicyFile" -ForegroundColor Green
Write-Host ""
Write-Host "  Para crear la política de alerta, ejecuta:" -ForegroundColor Cyan
Write-Host "  gcloud alpha monitoring policies create --policy-from-file=$alertPolicyFile --project=$project" -ForegroundColor White
Write-Host ""

# OPCIÓN 4: Cloud Scheduler que verifica periódicamente si el webhook se activó
Write-Host "[OPCIÓN 4] Configurando Cloud Scheduler para verificar webhook..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Esta opción usa Cloud Scheduler para verificar periódicamente si el webhook" -ForegroundColor Gray
Write-Host "se activó (por ejemplo, verificando logs recientes) y entonces detiene el servicio." -ForegroundColor Gray
Write-Host ""

Write-Host "  NOTA: Esta opción requiere crear un endpoint que verifique logs recientes" -ForegroundColor Yellow
Write-Host "  y si detecta que el webhook se activó, detenga el servicio." -ForegroundColor Yellow
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESUMEN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para que Google Cloud 'observe' el webhook y detenga el servicio cuando se active:" -ForegroundColor White
Write-Host ""
Write-Host "1. Desplegar Cloud Function que detiene el servicio" -ForegroundColor Yellow
Write-Host "2. Configurar Cloud Monitoring Alert Policy que detecta la activación del webhook" -ForegroundColor Yellow
Write-Host "3. La alerta invoca la Cloud Function cuando detecta la activación" -ForegroundColor Yellow
Write-Host ""
Write-Host "Archivos temporales creados en: $tempDir" -ForegroundColor Gray
Write-Host ""
Write-Host "IMPORTANTE: El webhook de Airtable debe estar configurado para que cuando se active," -ForegroundColor Red
Write-Host "genere logs o métricas que Cloud Monitoring pueda detectar." -ForegroundColor Red
Write-Host ""

