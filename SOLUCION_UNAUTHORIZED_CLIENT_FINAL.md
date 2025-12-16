# Solución Definitiva: Error unauthorized_client

## 🔴 Problema Actual

Los logs muestran:
```
Pub/Sub handler error: {"name":"Error","code":401,"message":"unauthorized_client","error":"unauthorized_client","error_description":"Unauthorized"}
```

Esto ocurre cuando intenta refrescar el token OAuth. El error `unauthorized_client` significa que:

1. **El Client ID/Secret en Secret Manager NO coinciden** con el OAuth Client configurado en Google Cloud Console
2. **El OAuth Client no está autorizado** para el redirect URI que se está usando
3. **El refresh token fue generado con un Client ID/Secret diferente** al que está almacenado

## 🔍 Contexto

- **OAuth Client** está configurado en: `smn-content-v2`
- **Secrets** están almacenados en: `check-in-sf`
- **El código busca secrets en:** `check-in-sf` (proyecto por defecto)

## ✅ Solución Paso a Paso

### Paso 1: Obtener Client ID/Secret del OAuth Client

1. Ve a: https://console.cloud.google.com/apis/credentials?project=smn-content-v2
2. Busca el **OAuth 2.0 Client ID** que corresponde a `media.manager@feverup.com`
3. Haz clic en el Client ID para ver los detalles
4. **Copia el Client ID** (algo como: `123456789-abcdefghijklmnop.apps.googleusercontent.com`)
5. **Copia el Client Secret** (si no lo ves, haz clic en "Reset secret" o "Show secret")

### Paso 2: Verificar Secrets Actuales en Secret Manager

```powershell
# Ver Client ID actual
gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf

# Ver Client Secret actual
gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf
```

### Paso 3: Comparar Valores

**IMPORTANTE:** Los valores en Secret Manager **DEBEN coincidir exactamente** con los del OAuth Client en `smn-content-v2`.

- Si **NO coinciden** → Continúa con Paso 4
- Si **coinciden** → El problema puede ser el redirect URI o el refresh token (ve a Paso 5)

### Paso 4: Actualizar Secrets en Secret Manager

Si los valores no coinciden, actualízalos:

```powershell
# Actualizar Client ID
echo "TU_CLIENT_ID_DEL_OAUTH_CLIENT_EN_smn-content-v2" | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf

# Actualizar Client Secret
echo "TU_CLIENT_SECRET_DEL_OAUTH_CLIENT_EN_smn-content-v2" | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf
```

**Reemplaza:**
- `TU_CLIENT_ID_DEL_OAUTH_CLIENT_EN_smn-content-v2` con el Client ID real
- `TU_CLIENT_SECRET_DEL_OAUTH_CLIENT_EN_smn-content-v2` con el Client Secret real

### Paso 5: Verificar Redirect URI

El redirect URI en el código debe coincidir con el configurado en el OAuth Client.

**En el código (`services/gmail.js`):**
```javascript
const redirectUri = process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/oauth2callback";
```

**En el OAuth Client (Google Cloud Console):**
- Debe tener autorizado: `http://localhost:3000/oauth2callback`
- O el que esté configurado en `GMAIL_REDIRECT_URI`

### Paso 6: Regenerar Refresh Token (Si es necesario)

Si actualizaste el Client ID/Secret, **debes regenerar el refresh token**:

1. **Usa el script:**
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   node obtener_refresh_token_completo.js
   ```

2. **Usa el Client ID/Secret del OAuth Client en `smn-content-v2`**

3. **Autoriza con `media.manager@feverup.com`**

4. **Copia el refresh token generado**

5. **Actualiza el secret:**
   ```powershell
   echo "TU_REFRESH_TOKEN_AQUI" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf
   ```

## 🔧 Verificación

Después de actualizar los secrets, espera unos minutos y verifica los logs:

```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload:"unauthorized_client"' --limit=5 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=10m
```

Si el error desaparece, el problema está resuelto.

## ⚠️ Notas Importantes

1. **El OAuth Client debe estar en `smn-content-v2`** porque es el proyecto asociado a la cuenta de Gmail
2. **Los secrets pueden estar en `check-in-sf`** (donde está el servicio) o en `smn-content-v2`
3. **Lo importante es que los valores coincidan** entre Secret Manager y el OAuth Client
4. **El redirect URI debe estar autorizado** en el OAuth Client

