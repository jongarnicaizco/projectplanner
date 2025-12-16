# Solución: Error unauthorized_client

## 🔴 Problema Actual

El error cambió de `invalid_grant` a `unauthorized_client`:
```
Error: unauthorized_client
error_description: "Unauthorized"
```

Esto significa que el **Client ID o Client Secret** no coinciden o no están autorizados correctamente.

## 🔍 Causas Posibles

1. **Client ID no existe o está deshabilitado** en Google Cloud Console
2. **Client Secret no coincide** con el Client ID
3. **OAuth Client no está configurado correctamente**
4. **Redirect URI no coincide** con el configurado en OAuth Client

## ✅ Solución Paso a Paso

### Paso 1: Verificar OAuth Client en Google Cloud Console

1. Ve a: https://console.cloud.google.com/apis/credentials?project=check-in-sf

2. Busca tu **OAuth 2.0 Client ID**

3. Verifica que:
   - ✅ Está **habilitado** (no deshabilitado)
   - ✅ Tiene el **Redirect URI** correcto: `http://localhost:3000/oauth2callback`
   - ✅ Está en el proyecto correcto: `check-in-sf`

### Paso 2: Verificar Secrets en Secret Manager

Ejecuta estos comandos para ver los valores actuales:

```powershell
# Ver Client ID
gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf

# Ver Client Secret
gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf
```

### Paso 3: Comparar Valores

**IMPORTANTE:** El Client ID y Client Secret en Secret Manager **DEBEN coincidir exactamente** con los del OAuth Client en Google Cloud Console.

- Si no coinciden → Actualiza los secrets
- Si coinciden → El problema puede ser el redirect URI o la configuración del OAuth Client

### Paso 4: Actualizar Secrets (Si no coinciden)

Si los valores no coinciden, actualiza los secrets:

```powershell
# Actualizar Client ID
echo "TU_CLIENT_ID_AQUI" | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf

# Actualizar Client Secret
echo "TU_CLIENT_SECRET_AQUI" | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf
```

### Paso 5: Verificar Redirect URI

El código usa este redirect URI por defecto:
```javascript
const redirectUri = process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/oauth2callback";
```

**Asegúrate de que este redirect URI esté configurado en tu OAuth Client:**
1. Ve a tu OAuth Client en Google Cloud Console
2. En "Authorized redirect URIs", debe estar: `http://localhost:3000/oauth2callback`
3. Si no está, agrégalo

### Paso 6: Regenerar Refresh Token (Si es necesario)

Si actualizaste el Client ID/Secret, necesitas regenerar el refresh token:

```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
node obtener_refresh_token_completo.js
```

Usa el **mismo Client ID/Secret** que acabas de actualizar en Secret Manager.

### Paso 7: Verificar que Funciona

Espera unos minutos y verifica los logs:

```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND (textPayload=~"unauthorized_client" OR textPayload=~"invalid_grant")' --limit=5 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=10m
```

Si no aparece el error, funciona correctamente.

## 🔧 Verificación Rápida

Ejecuta este script para verificar todo:

```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
powershell -ExecutionPolicy Bypass -File "verificar_y_corregir_oauth.ps1"
```

## ⚠️ Importante

- El Client ID y Client Secret **deben coincidir exactamente** con los del OAuth Client
- El OAuth Client **debe estar habilitado**
- El Redirect URI **debe coincidir** con el configurado en OAuth Client
- Si cambias el Client ID/Secret, **debes regenerar el refresh token**

