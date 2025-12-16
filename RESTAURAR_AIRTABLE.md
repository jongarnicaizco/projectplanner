# Restauración de Funcionalidad Airtable

## ✅ Cambios Realizados

### 1. `services/processor.js`
- ✅ Restaurado import: `import { airtableFindByEmailId, createAirtableRecord } from "./airtable.js";`
- ✅ Eliminado import de email: `import { sendLeadEmail } from "./email.js";`
- ✅ Restaurada verificación de duplicados con `airtableFindByEmailId`
- ✅ Reemplazado `sendLeadEmail` por `createAirtableRecord`
- ✅ Actualizado logging para mostrar "AIRTABLE" en lugar de "EMAIL"
- ✅ Actualizado `results.push` para usar `airtableId` en lugar de `emailSent`/`messageId`

### 2. `config.js`
- ✅ Restauradas variables de Airtable:
  - `AIRTABLE_BASE_ID`
  - `AIRTABLE_TABLE`
  - `AIRTABLE_TOKEN_SECRET`
- ❌ Eliminadas variables de email:
  - `EMAIL_FROM`
  - `EMAIL_TO`

### 3. `cloudbuild.yaml`
- ✅ Restauradas variables de entorno de Airtable:
  - `AIRTABLE_BASE_ID=${AIRTABLE_BASE_ID}`
  - `AIRTABLE_TABLE=${AIRTABLE_TABLE}`
  - `AIRTABLE_TOKEN_SECRET=${AIRTABLE_TOKEN_SECRET}`
- ❌ Eliminadas variables de email:
  - `EMAIL_FROM`
  - `EMAIL_TO`

## 📋 Variables de Entorno Necesarias

Para que funcione correctamente, necesitas configurar estas variables en Cloud Run:

```powershell
AIRTABLE_BASE_ID=tu_base_id
AIRTABLE_TABLE=tu_tabla
AIRTABLE_TOKEN_SECRET=tu_secret_name
```

## 🔧 Próximos Pasos

1. **Configurar variables de entorno en Cloud Run:**
   ```powershell
   gcloud run services update mfs-lead-generation-ai \
     --region=us-central1 \
     --project=check-in-sf \
     --set-env-vars="AIRTABLE_BASE_ID=tu_base_id,AIRTABLE_TABLE=tu_tabla,AIRTABLE_TOKEN_SECRET=tu_secret_name"
   ```

2. **O configurarlas en cloudbuild.yaml** (ya están agregadas como variables de sustitución)

3. **Hacer commit y push:**
   ```powershell
   git add .
   git commit -m "RESTAURAR AIRTABLE - Volver a usar Airtable en lugar de emails"
   git push origin main
   ```

4. **Verificar que Cloud Build despliega correctamente**

## ⚠️ Nota

El archivo `services/email.js` sigue existiendo pero ya no se usa. Puedes eliminarlo si quieres, o dejarlo para uso futuro.

