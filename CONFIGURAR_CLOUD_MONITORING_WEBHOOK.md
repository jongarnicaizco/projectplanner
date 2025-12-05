# Configurar Cloud Monitoring para Observar el Webhook de Airtable

## 🎯 Objetivo

Configurar Google Cloud Monitoring para que **observe** el webhook de Airtable y, cuando se active (desde el sistema de alerting), detenga automáticamente el servicio.

## 📋 Opciones de Implementación

### Opción 1: Cloud Monitoring Alert Policy (RECOMENDADA)

Esta opción crea una alerta que detecta cuando se supera un umbral de logs por minuto y ejecuta una Cloud Function que detiene el servicio.

#### Pasos:

1. **Crear Cloud Function que detiene el servicio:**

```powershell
# Crear directorio para la función
$functionDir = "cloud-function-stop-service"
New-Item -ItemType Directory -Path $functionDir -Force

# Crear index.js
@"
const functions = require('@google-cloud/functions-framework');
const axios = require('axios');

functions.http('stopService', async (req, res) => {
  try {
    const serviceUrl = 'https://mfs-lead-generation-ai-vtlrnibdxq-uc.a.run.app/webhook/airtable-stop';
    
    console.log('🚨 Cloud Monitoring detectó activación del webhook. Deteniendo servicio...');
    
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
"@ | Out-File -FilePath "$functionDir/index.js" -Encoding UTF8

# Crear package.json
@"
{
  "name": "mfs-stop-service-function",
  "version": "1.0.0",
  "dependencies": {
    "@google-cloud/functions-framework": "^3.0.0",
    "axios": "^1.6.0"
  }
}
"@ | Out-File -FilePath "$functionDir/package.json" -Encoding UTF8

# Desplegar la función
gcloud functions deploy mfs-stop-service-on-webhook `
  --gen2 `
  --runtime=nodejs20 `
  --region=us-central1 `
  --source=$functionDir `
  --entry-point=stopService `
  --trigger-http `
  --allow-unauthenticated `
  --project=check-in-sf
```

2. **Crear Cloud Monitoring Alert Policy:**

```powershell
# Crear política de alerta
$alertPolicy = @{
  displayName = "MFS - Detener servicio cuando se supera umbral de logs"
  conditions = @(
    @{
      displayName = "Logs por minuto superan umbral"
      conditionThreshold = @{
        filter = "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"mfs-lead-generation-ai`" AND jsonPayload.message=~`".*webhook.*airtable.*`""
        comparison = "COMPARISON_GT"
        thresholdValue = 1
        duration = "60s"
      }
    }
  )
  notificationChannels = @()
  alertStrategy = @{
    autoClose = "1800s"
  }
} | ConvertTo-Json -Depth 10

$alertPolicy | Out-File -FilePath "alert-policy.json" -Encoding UTF8

# Crear la política
gcloud alpha monitoring policies create --policy-from-file=alert-policy.json --project=check-in-sf
```

### Opción 2: Cloud Logging Sink + Cloud Function

Esta opción usa Cloud Logging para detectar cuando hay logs relacionados con el webhook y ejecuta una Cloud Function.

### Opción 3: Cloud Scheduler + Verificación de Logs

Esta opción usa Cloud Scheduler para verificar periódicamente si el webhook se activó (revisando logs recientes) y entonces detiene el servicio.

## 🔧 Configuración del Sistema de Alerting

El sistema de alerting de Cloud debe estar configurado para:

1. **Detectar cuando se supera un umbral de logs por minuto** (ej: más de 3000 logs/minuto)
2. **Activar el webhook de Airtable** cuando se detecta el umbral
3. **Cloud Monitoring detecta la activación del webhook** (por logs o métricas)
4. **Cloud Monitoring ejecuta la Cloud Function** que detiene el servicio

## 📝 Notas Importantes

- El webhook de Airtable debe estar configurado para generar logs cuando se active
- Cloud Monitoring debe tener permisos para invocar Cloud Functions
- La Cloud Function debe tener permisos para llamar al endpoint del servicio

## 🚀 Ejecutar Script de Configuración

```powershell
.\configurar_cloud_monitoring_webhook.ps1
```

Este script creará todos los archivos necesarios y te dará los comandos para configurar Cloud Monitoring.

