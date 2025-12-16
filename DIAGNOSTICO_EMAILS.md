# Diagnóstico: Por qué no se procesan emails

## Posibles Causas

### 1. El servicio no está recibiendo notificaciones de Pub/Sub
**Síntoma:** No hay logs de `[mfs] _pubsub` en Cloud Run

**Verificar:**
- El servicio debe tener `--allow-unauthenticated` para recibir notificaciones de Pub/Sub
- El topic de Pub/Sub debe estar en el proyecto correcto (`PUBSUB_PROJECT_ID`)
- La suscripción de Pub/Sub debe estar configurada correctamente

**Solución:**
```powershell
# Verificar configuración del servicio
gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="value(spec.template.spec.containers[0].env)"

# Verificar si está permitido sin autenticación
gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="value(spec.template.metadata.annotations.'run.googleapis.com/ingress')"
```

### 2. El Cloud Scheduler no está ejecutándose
**Síntoma:** No hay actividad periódica en los logs

**Verificar:**
```powershell
# Listar jobs de Cloud Scheduler
gcloud scheduler jobs list --project=check-in-sf --location=us-central1
```

### 3. Errores en el procesamiento que no se están logueando
**Síntoma:** Hay notificaciones pero no se procesan emails

**Verificar logs:**
```powershell
# Ver logs recientes
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mfs-lead-generation-ai" --project=check-in-sf --limit=50 --format=json --freshness=2h
```

### 4. Problema de autenticación con Gmail
**Síntoma:** Errores 401/403 al acceder a Gmail API

**Verificar:**
- Los secrets de OAuth están configurados correctamente
- El refresh token es válido
- Los permisos de la cuenta de servicio son correctos

## Scripts de Diagnóstico

### Ejecutar para obtener logs:
```powershell
cd "Media Fees Lead Automation\mfs-lead-generation-ai"
python obtener_logs_cloudrun.py
```

O manualmente:
```powershell
# Logs recientes
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mfs-lead-generation-ai" --project=check-in-sf --limit=100 --format=json --freshness=2h > logs_recientes.json

# Errores
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mfs-lead-generation-ai AND severity>=ERROR" --project=check-in-sf --limit=30 --format=json --freshness=2h > logs_errores.json

# Logs de Pub/Sub
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mfs-lead-generation-ai AND textPayload=~\"_pubsub\"" --project=check-in-sf --limit=50 --format=json --freshness=2h > logs_pubsub.json
```

## Verificaciones Rápidas

1. **¿El servicio está corriendo?**
   ```powershell
   gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf
   ```

2. **¿Hay notificaciones de Pub/Sub?**
   - Buscar en logs: `[mfs] _pubsub`
   - Si no hay, el problema es que no llegan las notificaciones

3. **¿Hay errores?**
   - Buscar en logs: `ERROR`, `error`, `Error`
   - Revisar los últimos errores para identificar el problema

4. **¿El Cloud Scheduler está activo?**
   ```powershell
   gcloud scheduler jobs list --project=check-in-sf
   ```

