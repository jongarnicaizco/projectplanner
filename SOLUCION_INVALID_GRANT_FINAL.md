# Solución Final: Error invalid_grant

## 🔴 Problema

El error `invalid_grant` ocurre aunque el refresh token tiene los scopes correctos (`gmail.send` y `gmail.modify`).

## 🔍 Causas Posibles

1. **Client ID/Secret no coinciden**: El token fue generado con un Client ID/Secret diferente al que está en Secret Manager
2. **Redirect URI no coincide**: El token fue generado con un redirect URI diferente
3. **Token revocado**: El token fue revocado manualmente o expiró
4. **Token usado con cuenta diferente**: El token fue generado para otra cuenta

## ✅ Solución

### Paso 1: Verificar Client ID/Secret

1. **Ve a Google Cloud Console:**
   - https://console.cloud.google.com/apis/credentials?project=check-in-sf

2. **Encuentra el OAuth 2.0 Client ID** que usaste para generar el token

3. **Verifica que coincidan con los secrets:**
   ```powershell
   gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf
   gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf
   ```

4. **Si no coinciden**, actualiza los secrets:
   ```powershell
   echo "TU_CLIENT_ID" | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf
   echo "TU_CLIENT_SECRET" | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf
   ```

### Paso 2: Verificar Redirect URI

El redirect URI debe ser el mismo que usaste para generar el token. Por defecto es `http://localhost:3000/oauth2callback`.

**Verifica en OAuth Client:**
- Ve a tu OAuth 2.0 Client ID en Google Cloud Console
- Verifica los "Authorized redirect URIs"
- Debe incluir: `http://localhost:3000/oauth2callback`

### Paso 3: Regenerar Token (Si es necesario)

Si los Client ID/Secret no coinciden, necesitas regenerar el token con los correctos:

1. **Usa el script:**
   ```powershell
   node obtener_refresh_token_completo.js
   ```

2. **Usa el mismo Client ID/Secret que están en Secret Manager**

3. **Genera el nuevo token**

4. **Actualiza el secret:**
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

## 🔧 Cambio Realizado en el Código

He actualizado `services/gmail.js` para incluir el redirect URI al crear el OAuth2Client. Esto asegura que coincida con el usado para generar el token.

## ⚠️ Importante

- **El Client ID/Secret deben coincidir exactamente** con los usados para generar el refresh token
- **El redirect URI debe coincidir** con el configurado en OAuth Client
- **El token debe estar activo** (no revocado)

## 🚨 Si Sigue Fallando

1. **Revoca el acceso anterior:**
   - Ve a: https://myaccount.google.com/permissions
   - Busca la aplicación y revoca el acceso

2. **Regenera el token completamente:**
   - Usa el script `obtener_refresh_token_completo.js`
   - Asegúrate de usar el mismo Client ID/Secret que están en Secret Manager
   - Genera un nuevo token

3. **Actualiza todos los secrets:**
   - GMAIL_CLIENT_ID
   - GMAIL_CLIENT_SECRET
   - GMAIL_REFRESH_TOKEN

