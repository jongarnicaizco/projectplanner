# Solución: Secrets de Gmail en Proyecto Diferente

## 🔴 Problema Identificado

Los secrets de Gmail (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`) están en el proyecto **`smn-content-v2`**, pero el código los estaba buscando en **`check-in-sf`**.

Esto causaba el error `unauthorized_client` porque no encontraba los secrets correctos.

## ✅ Solución Implementada

He actualizado el código para que busque los secrets de Gmail en el proyecto correcto:

### 1. `services/secrets.js`
- Agregado parámetro opcional `projectId` a `accessSecret()`
- Si no se especifica, usa `GMAIL_SECRETS_PROJECT_ID` o `CFG.PROJECT_ID`

### 2. `services/gmail.js`
- Actualizado para usar `smn-content-v2` al obtener secrets de Gmail
- Usa `process.env.GMAIL_SECRETS_PROJECT_ID` o `"smn-content-v2"` por defecto

### 3. `config.js`
- Agregado `GMAIL_SECRETS_PROJECT_ID` con valor por defecto `"smn-content-v2"`

### 4. `cloudbuild.yaml`
- Agregada variable de entorno: `GMAIL_SECRETS_PROJECT_ID=smn-content-v2`

## 🔍 Verificación

Para verificar que los secrets existen en `smn-content-v2`:

```powershell
# Verificar Client ID
gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=smn-content-v2

# Verificar Client Secret
gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=smn-content-v2

# Verificar Refresh Token
gcloud secrets versions access latest --secret="GMAIL_REFRESH_TOKEN" --project=smn-content-v2
```

## 🚀 Próximos Pasos

1. **Hacer commit y push de los cambios:**
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   git add .
   git commit -m "FIX: Buscar secrets de Gmail en smn-content-v2 en lugar de check-in-sf"
   git push origin main
   ```

2. **Cloud Build desplegará automáticamente** con la corrección

3. **Verificar que funciona:**
   - Espera unos minutos después del despliegue
   - Verifica los logs para confirmar que ya no hay error `unauthorized_client`

## ⚠️ Importante

- El servicio de Cloud Run debe tener permisos para acceder a secrets en `smn-content-v2`
- Verifica que la Service Account del servicio tenga el rol `Secret Manager Secret Accessor` en el proyecto `smn-content-v2`

Para verificar permisos:
```powershell
gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="value(spec.template.spec.serviceAccountName)"
```

Luego verifica que esa Service Account tenga permisos en `smn-content-v2`.

