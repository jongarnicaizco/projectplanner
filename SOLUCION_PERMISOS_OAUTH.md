# Solución: Problema de Permisos OAuth

## 🔴 Problema

El error `unauthorized_client` (401) persiste aunque el Client ID y Secret sean correctos. Esto indica un problema con los **scopes** del refresh token o la configuración del OAuth Client.

## 🔍 Causas Posibles

1. **El refresh token NO tiene el scope `gmail.readonly`**
   - El refresh token fue generado sin los scopes necesarios
   - Necesitas regenerar el refresh token con los scopes correctos

2. **El OAuth Client no tiene los scopes configurados**
   - El OAuth Client en Google Cloud Console no tiene los scopes necesarios
   - Necesitas verificar/actualizar la configuración del OAuth Client

3. **El redirect URI no está autorizado**
   - El redirect URI `http://localhost:3000/oauth2callback` no está en la lista de URIs autorizados
   - Necesitas agregarlo en el OAuth Client

## ✅ Solución Paso a Paso

### Paso 1: Verificar Scopes Necesarios

El servicio necesita estos scopes:
- ✅ **`https://www.googleapis.com/auth/gmail.readonly`** (REQUERIDO)
- ⚠️ `https://www.googleapis.com/auth/gmail.send` (opcional, solo si quieres enviar emails)

### Paso 2: Regenerar Refresh Token con Scopes Correctos

1. **Ejecuta el script para regenerar el refresh token:**
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   node obtener_refresh_token_completo.js
   ```

2. **Asegúrate de autorizar estos scopes cuando te pida:**
   - `https://www.googleapis.com/auth/gmail.readonly` ✅ (OBLIGATORIO)
   - `https://www.googleapis.com/auth/gmail.send` (opcional)

3. **Copia el refresh token generado**

4. **Actualiza el secret:**
   ```powershell
   echo "REFRESH_TOKEN_GENERADO" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf
   ```

### Paso 3: Verificar OAuth Client en Google Cloud Console

1. **Ve a:** https://console.cloud.google.com/apis/credentials?project=check-in-sf
   (O en `smn-content-v2` si el OAuth Client está ahí)

2. **Busca tu OAuth Client** (el que corresponde a `media.manager@feverup.com`)

3. **Verifica:**
   - ✅ Está **habilitado** (no deshabilitado)
   - ✅ Tiene el **redirect URI** autorizado: `http://localhost:3000/oauth2callback`
   - ✅ Los **scopes** están configurados (si hay una sección de scopes)

4. **Si el redirect URI no está autorizado:**
   - Haz clic en "Edit"
   - En "Authorized redirect URIs", agrega: `http://localhost:3000/oauth2callback`
   - Guarda los cambios

### Paso 4: Verificar que el Código Use los Scopes Correctos

El código en `services/gmail.js` no especifica scopes explícitos para OAuth (solo para JWT). Esto está bien porque los scopes vienen del refresh token.

**IMPORTANTE:** El refresh token debe tener los scopes correctos cuando se genera.

## 🔧 Verificación Rápida

Después de regenerar el refresh token, espera unos minutos y verifica los logs:

```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload:"unauthorized_client"' --limit=5 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=10m
```

Si el error desaparece, el problema está resuelto.

## 📋 Checklist

- [ ] Refresh token regenerado con scope `gmail.readonly`
- [ ] Refresh token actualizado en Secret Manager
- [ ] OAuth Client está habilitado
- [ ] Redirect URI `http://localhost:3000/oauth2callback` está autorizado
- [ ] Esperado unos minutos después de actualizar el refresh token
- [ ] Verificado que el error desapareció de los logs

## ⚠️ Nota Importante

**El refresh token contiene los scopes autorizados cuando se genera.** Si el refresh token actual fue generado sin `gmail.readonly`, **debes regenerarlo** con los scopes correctos. No puedes "agregar" scopes a un refresh token existente.

