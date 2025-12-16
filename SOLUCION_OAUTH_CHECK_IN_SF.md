# Solución: OAuth Client en check-in-sf

## 🔴 Problema Actual

El error `unauthorized_client` (401) indica que:
- Los secrets están en Secret Manager de `check-in-sf` ✅ (correcto)
- Pero los valores **NO coinciden** con el OAuth Client configurado

## 🔍 Verificación

### Paso 1: Ver valores actuales en Secret Manager

```powershell
# Ver Client ID
gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf

# Ver Client Secret
gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf
```

### Paso 2: Ver OAuth Client en Google Cloud Console

1. Ve a: https://console.cloud.google.com/apis/credentials?project=check-in-sf
2. Busca el **OAuth 2.0 Client ID** que corresponde a `media.manager@feverup.com`
3. Haz clic en el Client ID para ver los detalles
4. **Copia el Client ID y Client Secret**

### Paso 3: Comparar Valores

**IMPORTANTE:** Los valores en Secret Manager **DEBEN coincidir exactamente** con los del OAuth Client.

- Si **coinciden** → El problema puede ser:
  - El OAuth Client no está habilitado
  - El redirect URI no está autorizado
  - El refresh token fue generado con un Client ID/Secret diferente
  
- Si **NO coinciden** → Actualiza los secrets (Paso 4)

## ✅ Solución

### Si los valores NO coinciden:

```powershell
# Actualizar Client ID
echo "CLIENT_ID_DEL_OAUTH_CLIENT" | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf

# Actualizar Client Secret
echo "CLIENT_SECRET_DEL_OAUTH_CLIENT" | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf
```

### Si los valores coinciden pero sigue fallando:

1. **Verifica que el OAuth Client esté habilitado** en Google Cloud Console
2. **Verifica el redirect URI:**
   - En el código: `http://localhost:3000/oauth2callback` (o el configurado en `GMAIL_REDIRECT_URI`)
   - En el OAuth Client: Debe estar autorizado este mismo URI
3. **Regenera el refresh token** usando el Client ID/Secret correctos:
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   node obtener_refresh_token_completo.js
   ```
   - Usa el Client ID/Secret del OAuth Client en `check-in-sf`
   - Autoriza con `media.manager@feverup.com`
   - Actualiza el refresh token en Secret Manager

## 🔧 Verificación del Redirect URI

El redirect URI en el código (`services/gmail.js`) es:
```javascript
const redirectUri = process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/oauth2callback";
```

**Este URI DEBE estar autorizado en el OAuth Client.**

Para verificar/agregar:
1. Ve a: https://console.cloud.google.com/apis/credentials?project=check-in-sf
2. Haz clic en tu OAuth Client
3. En "Authorized redirect URIs", verifica que esté: `http://localhost:3000/oauth2callback`
4. Si no está, agrégalo y guarda

## 📋 Checklist

- [ ] Client ID en Secret Manager coincide con OAuth Client
- [ ] Client Secret en Secret Manager coincide con OAuth Client
- [ ] OAuth Client está habilitado
- [ ] Redirect URI está autorizado en OAuth Client
- [ ] Refresh token fue generado con el Client ID/Secret correctos

