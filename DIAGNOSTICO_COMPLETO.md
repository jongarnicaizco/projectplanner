# Diagnóstico Completo - Qué Está Fallando

## 🔍 Comandos para Ejecutar Manualmente

Dado que los comandos automáticos no muestran output, ejecuta estos comandos manualmente en PowerShell:

### 1. Ver Errores Recientes
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND severity>=ERROR' --limit=20 --format="table(timestamp,severity,textPayload)" --project=check-in-sf --freshness=2h
```

### 2. Ver Logs de Pub/Sub
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"_pubsub"' --limit=10 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=1h
```

### 3. Ver Logs de Airtable
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"Airtable"' --limit=20 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=1h
```

### 4. Ver Logs de Procesamiento
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND (textPayload=~"procesando mensaje" OR textPayload=~"Delta INBOX" OR textPayload=~"IDs que voy a procesar")' --limit=10 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=1h
```

### 5. Ver Estado del Servicio
```powershell
gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="yaml(status.url,status.latestReadyRevisionName,status.conditions)"
```

## 🔴 Problemas Comunes y Soluciones

### Problema 1: No se reciben notificaciones de Pub/Sub
**Síntoma:** No hay logs de `[mfs] _pubsub`

**Verificar:**
- Permisos IAM del servicio
- Topic existe en `smn-content-v2`
- Gmail Watch está configurado

**Solución:**
```powershell
# Verificar permisos
gcloud run services get-iam-policy mfs-lead-generation-ai --region=us-central1 --project=check-in-sf

# Verificar topic
gcloud pubsub topics describe mfs-gmail-leads --project=smn-content-v2
```

### Problema 2: Errores de OAuth (invalid_grant, unauthorized_client)
**Síntoma:** Errores 400/401 en logs

**Solución:**
- Verificar que Client ID/Secret están correctos en Secret Manager
- Regenerar refresh token si es necesario
- Verificar que el OAuth Client está en el proyecto correcto

### Problema 3: No se procesan emails en Airtable
**Síntoma:** Hay logs de procesamiento pero no se guardan en Airtable

**Verificar:**
- Variables de entorno de Airtable están configuradas
- Token de Airtable es válido
- Base ID y Table ID son correctos

**Solución:**
```powershell
# Verificar variables de entorno
gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="value(spec.template.spec.containers[0].env)" | Select-String "AIRTABLE"
```

### Problema 4: HistoryId desincronizado
**Síntoma:** No se detectan mensajes nuevos aunque lleguen

**Solución:**
- El código ya tiene fallback automático
- Verificar logs de "Delta INBOX" y "fallback"

## 📋 Checklist de Verificación

- [ ] Servicio está activo y accesible
- [ ] Permisos IAM configurados (allUsers o serviceAccount)
- [ ] Topic de Pub/Sub existe en smn-content-v2
- [ ] Variables de entorno de Airtable están configuradas
- [ ] OAuth credentials están correctos
- [ ] Gmail Watch está configurado
- [ ] No hay errores en los logs recientes

## 🎯 Próximos Pasos

1. Ejecuta los comandos de arriba para obtener los logs
2. Comparte los resultados para identificar el problema específico
3. Aplicamos la solución correspondiente

