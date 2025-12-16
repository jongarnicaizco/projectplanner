# Solución Definitiva: Error invalid_grant

## 🔴 Problema Actual

El servicio sigue mostrando el error:
```
Pub/Sub handler error: {"name":"Error","code":400,"message":"invalid_grant"}
```

Esto significa que el **refresh token** en Secret Manager es inválido o no corresponde al Client ID/Secret actual.

## ✅ Solución: Regenerar Refresh Token Correctamente

### Paso 1: Obtener Credenciales OAuth

1. Ve a Google Cloud Console:
   - https://console.cloud.google.com/apis/credentials?project=check-in-sf

2. Encuentra tu **OAuth 2.0 Client ID** (el que usa el servicio)

3. Copia:
   - **Client ID**
   - **Client Secret**

4. **Verifica el Redirect URI configurado:**
   - Debe ser: `http://localhost:3000/oauth2callback`

### Paso 2: Verificar Secrets Actuales

```powershell
# Ver Client ID actual
gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf

# Ver Client Secret actual
gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf

# Ver Refresh Token actual
gcloud secrets versions access latest --secret="GMAIL_REFRESH_TOKEN" --project=check-in-sf
```

**IMPORTANTE:** El Client ID/Secret en Secret Manager **DEBEN coincidir exactamente** con los del OAuth Client en Google Cloud Console.

### Paso 3: Regenerar Refresh Token

Usa el script que creé:

```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
node obtener_refresh_token_completo.js
```

O manualmente:

1. **Genera URL de autorización:**
   - Usa el Client ID y Client Secret que están en Secret Manager
   - Scopes: `https://www.googleapis.com/auth/gmail.readonly` y `https://www.googleapis.com/auth/gmail.send`
   - Redirect URI: `http://localhost:3000/oauth2callback`
   - Access type: `offline`
   - Prompt: `consent`

2. **Autoriza con la cuenta:** `media.manager@feverup.com`

3. **Obtén el código de autorización**

4. **Intercambia el código por refresh token**

5. **Actualiza el secret:**
   ```powershell
   $token = "NUEVO_REFRESH_TOKEN"
   echo $token | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf
   ```

### Paso 4: Verificar que Funciona

Espera unos minutos y verifica los logs:

```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"invalid_grant"' --limit=5 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=10m
```

Si no aparece el error, funciona correctamente.

## 🔍 Verificación de Coincidencia

El problema más común es que el Client ID/Secret en Secret Manager no coinciden con los usados para generar el refresh token.

**Solución:**
1. Verifica qué Client ID/Secret están en Secret Manager
2. Usa **esos mismos** Client ID/Secret para regenerar el refresh token
3. O actualiza los secrets con los correctos antes de regenerar el token

## ⚠️ Importante

- El refresh token debe generarse con el **mismo Client ID/Secret** que están en Secret Manager
- El redirect URI debe ser exactamente: `http://localhost:3000/oauth2callback`
- Debes autorizar con la cuenta: `media.manager@feverup.com`
- El token debe tener ambos scopes: `gmail.readonly` y `gmail.send`

