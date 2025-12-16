# Solución: OAuth Client en Proyecto Diferente

## 🔴 Problema Identificado

- **OAuth Client** está configurado en el proyecto **`smn-content-v2`**
- **Secrets** (Client ID, Client Secret, Refresh Token) están en Secret Manager del proyecto **`check-in-sf`**
- El error `unauthorized_client` ocurre porque el Client ID/Secret en `check-in-sf` **no corresponden** al OAuth Client en `smn-content-v2`

## ✅ Solución

### Opción 1: Verificar que los Secrets Coincidan (Recomendado)

1. **Obtén el Client ID/Secret del OAuth Client en `smn-content-v2`:**
   - Ve a: https://console.cloud.google.com/apis/credentials?project=smn-content-v2
   - Encuentra tu OAuth 2.0 Client ID
   - Copia el Client ID y Client Secret

2. **Compara con los secrets en `check-in-sf`:**
   ```powershell
   # Ver Client ID en check-in-sf
   gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf
   
   # Ver Client Secret en check-in-sf
   gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf
   ```

3. **Si NO coinciden, actualiza los secrets en `check-in-sf`:**
   ```powershell
   # Actualizar Client ID
   echo "CLIENT_ID_DEL_OAUTH_CLIENT_EN_smn-content-v2" | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=check-in-sf
   
   # Actualizar Client Secret
   echo "CLIENT_SECRET_DEL_OAUTH_CLIENT_EN_smn-content-v2" | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=check-in-sf
   ```

4. **Regenera el Refresh Token** usando el Client ID/Secret correctos:
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   node obtener_refresh_token_completo.js
   ```
   - Usa el Client ID/Secret del OAuth Client en `smn-content-v2`
   - Autoriza con `media.manager@feverup.com`

5. **Actualiza el Refresh Token:**
   ```powershell
   $token = "NUEVO_REFRESH_TOKEN"
   echo $token | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf
   ```

### Opción 2: Mover Secrets a smn-content-v2 (Alternativa)

Si prefieres tener todo en el mismo proyecto, puedes copiar los secrets a `smn-content-v2`:

```powershell
# Obtener valores de check-in-sf
$clientId = gcloud secrets versions access latest --secret="GMAIL_CLIENT_ID" --project=check-in-sf
$clientSecret = gcloud secrets versions access latest --secret="GMAIL_CLIENT_SECRET" --project=check-in-sf
$refreshToken = gcloud secrets versions access latest --secret="GMAIL_REFRESH_TOKEN" --project=check-in-sf

# Crear/copiar a smn-content-v2
echo $clientId | gcloud secrets create GMAIL_CLIENT_ID --data-file=- --project=smn-content-v2 --replication-policy="automatic" 2>&1 | Out-Null
echo $clientId | gcloud secrets versions add GMAIL_CLIENT_ID --data-file=- --project=smn-content-v2 2>&1 | Out-Null

echo $clientSecret | gcloud secrets create GMAIL_CLIENT_SECRET --data-file=- --project=smn-content-v2 --replication-policy="automatic" 2>&1 | Out-Null
echo $clientSecret | gcloud secrets versions add GMAIL_CLIENT_SECRET --data-file=- --project=smn-content-v2 2>&1 | Out-Null

echo $refreshToken | gcloud secrets create GMAIL_REFRESH_TOKEN --data-file=- --project=smn-content-v2 --replication-policy="automatic" 2>&1 | Out-Null
echo $refreshToken | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=smn-content-v2 2>&1 | Out-Null
```

Luego actualiza el código para buscar secrets en `smn-content-v2`.

## 🔍 Verificación

Después de actualizar los secrets, verifica que funcionen:

```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND (textPayload=~"unauthorized_client" OR textPayload=~"invalid_grant")' --limit=5 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=10m
```

Si no aparece el error, funciona correctamente.

## ⚠️ Importante

- El **Client ID/Secret en Secret Manager** (`check-in-sf`) **DEBEN coincidir exactamente** con los del **OAuth Client** en `smn-content-v2`
- El **Refresh Token** debe generarse usando el Client ID/Secret del OAuth Client en `smn-content-v2`
- El **Redirect URI** debe ser: `http://localhost:3000/oauth2callback` y estar configurado en el OAuth Client de `smn-content-v2`

