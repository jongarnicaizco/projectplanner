# Comandos Simples para Diagnosticar

## Problema Observado

Hay muchos errores (ERROR severity) pero el `textPayload` está vacío. La información del error probablemente está en `jsonPayload`.

## Comandos Simples (Ejecuta estos)

### 1. Ver un error completo en formato JSON
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND severity>=ERROR' --limit=1 --format="json" --project=check-in-sf --freshness=2h
```

Esto te mostrará el error completo con `jsonPayload` incluido.

### 2. Ver todos los logs recientes (última hora)
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai"' --limit=50 --format="json" --project=check-in-sf --freshness=1h > logs_recientes.json
```

Luego abre `logs_recientes.json` para ver todos los detalles.

### 3. Buscar logs que contengan texto específico
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai"' --limit=100 --format="json" --project=check-in-sf --freshness=1h | ConvertFrom-Json | Where-Object { $_.textPayload -match "pubsub" -or $_.textPayload -match "Airtable" -or $_.textPayload -match "ERROR" } | Select-Object -First 10 | ForEach-Object { Write-Host "[$($_.timestamp)] $($_.textPayload)" }
```

## Análisis de los Errores

Basándome en lo que veo:

1. **Hay muchos errores** (cada 20 minutos aproximadamente) - esto sugiere que puede ser el Cloud Scheduler
2. **El textPayload está vacío** - los errores pueden estar en jsonPayload
3. **Los errores son periódicos** - probablemente relacionados con el procesamiento automático

## Posibles Causas

1. **Cloud Scheduler está fallando** - El job programado puede estar fallando
2. **Error en el procesamiento** - Algo falla al procesar emails
3. **Error de autenticación** - OAuth puede estar fallando periódicamente

## Próximos Pasos

1. Ejecuta el comando #1 para ver el contenido completo de un error
2. Comparte el resultado del JSON para identificar el problema específico
3. Revisamos el código para aplicar la solución

