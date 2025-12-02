# Comando Correcto para Ver Logs

## ❌ Comando Incorrecto (no existe)
```powershell
gcloud logging tail '...'  # Este comando NO existe
```

## ✅ Comando Correcto

### Ver logs recientes (últimos 30 minutos):
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai"' --limit=50 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=30m
```

### Ver solo logs de email:
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND (textPayload=~"Email" OR textPayload=~"sendLeadEmail")' --limit=30 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=30m
```

### Ver solo errores:
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND severity>=ERROR' --limit=20 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=30m
```

### Ver logs de envío exitoso:
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"Email.*enviado exitosamente"' --limit=10 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=30m
```

### Ver logs de error de envío:
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"ERROR enviando email"' --limit=10 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=30m
```

## Usar el Script

Ejecuta el script que creé:
```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
powershell -ExecutionPolicy Bypass -File "ver_logs_tiempo_real.ps1"
```

## Ver en la Consola Web

También puedes ver los logs en la consola de Google Cloud:
https://console.cloud.google.com/logs/query?project=check-in-sf

