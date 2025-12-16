# Comandos para Ver Logs en PowerShell

## ⚠️ Problema con Comillas en PowerShell

PowerShell interpreta las comillas de manera diferente. Usa **comillas simples** para el filtro.

## ✅ Comandos que Funcionan

### 1. Ver logs recientes (últimos 30 minutos):
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai"' --limit=30 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=30m
```

### 2. Ver solo logs de email enviado exitosamente:
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"Email.*enviado exitosamente"' --limit=10 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=30m
```

### 3. Ver errores de envío:
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"ERROR enviando email"' --limit=10 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=30m
```

### 4. Ver todos los logs relacionados con email:
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND (textPayload=~"Email" OR textPayload=~"sendLeadEmail" OR textPayload=~"DATOS PARA ENVIAR")' --limit=20 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=30m
```

### 5. Ver solo errores (severity ERROR):
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND severity>=ERROR' --limit=20 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=30m
```

## Usar el Script

Ejecuta el script que creé (usa comillas simples internamente):
```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
powershell -ExecutionPolicy Bypass -File "ver_logs_email.ps1"
```

## Ver en la Consola Web

También puedes ver los logs en la consola de Google Cloud:
https://console.cloud.google.com/logs/query?project=check-in-sf

Filtro para usar en la consola:
```
resource.type="cloud_run_revision" 
resource.labels.service_name="mfs-lead-generation-ai"
```

