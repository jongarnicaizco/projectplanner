# Instrucciones: Verificar y Corregir OAuth

## 🔍 Paso 1: Ver valores actuales en Secret Manager

Ejecuta estos comandos para ver los valores actuales:

```powershell
# Ver Client ID
gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf

# Ver Client Secret
gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf
```

## 🔍 Paso 2: Ver OAuth Client en Google Cloud Console

1. **Ve a:** https://console.cloud.google.com/apis/credentials?project=check-in-sf
2. **Busca** el OAuth 2.0 Client ID que corresponde a `media.manager@feverup.com`
3. **Haz clic** en el Client ID para ver los detalles
4. **Copia** el Client ID y Client Secret

**También verifica en smn-content-v2** (por si el OAuth Client está ahí):
- https://console.cloud.google.com/apis/credentials?project=smn-content-v2

## ✅ Paso 3: Comparar y Corregir

### Si los valores NO coinciden:

1. **Actualiza el Client ID:**
   ```powershell
   echo "CLIENT_ID_DEL_OAUTH_CLIENT" | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf
   ```

2. **Actualiza el Client Secret:**
   ```powershell
   echo "CLIENT_SECRET_DEL_OAUTH_CLIENT" | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf
   ```

3. **Regenera el refresh token** (porque cambió el Client ID/Secret):
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   node obtener_refresh_token_completo.js
   ```
   - Usa el Client ID/Secret del OAuth Client
   - Autoriza con `media.manager@feverup.com`
   - Copia el refresh token generado

4. **Actualiza el refresh token:**
   ```powershell
   echo "REFRESH_TOKEN_GENERADO" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf
   ```

### Si los valores coinciden pero sigue fallando:

1. **Verifica que el OAuth Client esté habilitado**
2. **Verifica el redirect URI:**
   - En el código: `http://localhost:3000/oauth2callback`
   - En el OAuth Client: Debe estar en "Authorized redirect URIs"
3. **Regenera el refresh token** (puede estar desincronizado)

## 🔧 Verificar Redirect URI

El redirect URI en el código es: `http://localhost:3000/oauth2callback`

**Este URI DEBE estar autorizado en el OAuth Client.**

Para agregarlo:
1. Ve al OAuth Client en Google Cloud Console
2. En "Authorized redirect URIs", agrega: `http://localhost:3000/oauth2callback`
3. Guarda los cambios

## 📋 Resumen

El error `unauthorized_client` significa que:
- Los valores en Secret Manager NO coinciden con el OAuth Client, O
- El OAuth Client no está habilitado, O
- El redirect URI no está autorizado, O
- El refresh token fue generado con un Client ID/Secret diferente

**Solución:** Asegúrate de que todo coincida y regenera el refresh token si es necesario.

