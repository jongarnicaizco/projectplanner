# Solución: Refresh Token OAuth Expirado

## 🔴 Problema

Los logs muestran:
```
Error: unauthorized_client
error_description: Unauthorized
```

Esto significa que el **refresh token de OAuth ha expirado o es inválido**.

## ✅ Solución Rápida

### Opción 1: Regenerar Refresh Token (Recomendado)

1. **Ejecuta el script para regenerar el refresh token:**
   ```powershell
   cd "Media Fees Lead Automation\mfs-lead-generation-ai"
   node obtener_refresh_token_completo.js
   ```

2. **Sigue las instrucciones:**
   - Ingresa el Client ID del OAuth Client
   - Ingresa el Client Secret
   - Autoriza con `media.manager@feverup.com`
   - Copia el refresh token generado

3. **Actualiza el secret:**
   ```powershell
   echo "TU_REFRESH_TOKEN_AQUI" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf
   ```

4. **Verifica que el Client ID y Secret coincidan:**
   ```powershell
   # Ver Client ID actual
   gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf
   
   # Ver Client Secret actual
   gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf
   ```

5. **Si no coinciden con el OAuth Client, actualízalos:**
   ```powershell
   echo "CLIENT_ID_DEL_OAUTH_CLIENT" | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf
   echo "CLIENT_SECRET_DEL_OAUTH_CLIENT" | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf
   ```

### Opción 2: Usar JWT (Domain-wide Delegation)

Si tienes configurado JWT, el código ahora intentará usarlo automáticamente como fallback.

**Verifica que estas variables estén configuradas en Cloud Run:**
- `GOOGLE_CLIENT_EMAIL` (service account email)
- `GOOGLE_PRIVATE_KEY` (private key del service account)

## 🔍 Verificar OAuth Client

1. Ve a: https://console.cloud.google.com/apis/credentials?project=check-in-sf
2. Busca el **OAuth 2.0 Client ID** para `media.manager@feverup.com`
3. Verifica que esté **habilitado**
4. Verifica que el **redirect URI** `http://localhost:3000/oauth2callback` esté autorizado

## 📝 Después de Corregir

Una vez actualizado el refresh token, el servicio debería funcionar automáticamente. No necesitas redesplegar, solo espera unos minutos.

Para verificar:
```powershell
$url = gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="value(status.url)"
Invoke-RestMethod -Uri "$url/diagnostico" -Method GET
```

