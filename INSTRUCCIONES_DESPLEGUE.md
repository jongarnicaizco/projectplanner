# Instrucciones para Desplegar Cambios

## ✅ Cambios Listos para Desplegar

He restaurado toda la funcionalidad de Airtable:

1. **services/processor.js** - Usa Airtable en lugar de emails
2. **config.js** - Variables de Airtable restauradas
3. **cloudbuild.yaml** - Variables de entorno de Airtable restauradas
4. **handlers/metrics.js** - Funcionalidad de Airtable restaurada

## 🚀 Para Desplegar

### Opción 1: Desde la Terminal de Cursor

1. Abre la terminal integrada (`Ctrl+``)
2. Ejecuta:
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   git add .
   git commit -m "RESTAURAR AIRTABLE - Volver a usar Airtable en lugar de emails"
   git push origin main
   ```

### Opción 2: Desde la Interfaz de Git de Cursor

1. Presiona `Ctrl+Shift+G` (abre el panel de Git)
2. Verifica que todos los cambios estén seleccionados
3. Escribe el mensaje de commit: "RESTAURAR AIRTABLE - Volver a usar Airtable en lugar de emails"
4. Haz clic en "Commit"
5. Haz clic en los tres puntos (⋯) y selecciona "Push"

### Opción 3: Usar el Script

```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
powershell -ExecutionPolicy Bypass -File "desplegar_cambios_airtable.ps1"
```

## 📋 Después del Push

1. **Cloud Build detectará el push automáticamente**
2. **Iniciará un build** (puedes verlo en: https://console.cloud.google.com/cloud-build/builds?project=check-in-sf)
3. **Desplegará el servicio** con los cambios

## ⚙️ Variables de Entorno Necesarias

Asegúrate de que estas variables estén configuradas en Cloud Run:

- `AIRTABLE_BASE_ID` - ID de tu base de Airtable
- `AIRTABLE_TABLE` - Nombre o ID de tu tabla
- `AIRTABLE_TOKEN_SECRET` - Nombre del secret en Secret Manager con el token de Airtable

Si no están configuradas, puedes agregarlas:

```powershell
gcloud run services update mfs-lead-generation-ai \
  --region=us-central1 \
  --project=check-in-sf \
  --set-env-vars="AIRTABLE_BASE_ID=tu_base_id,AIRTABLE_TABLE=tu_tabla,AIRTABLE_TOKEN_SECRET=tu_secret_name"
```

## 🔍 Verificación

Después del despliegue, verifica que:
- Los emails se procesan correctamente
- Los registros se crean en Airtable
- No hay errores en los logs relacionados con Airtable

