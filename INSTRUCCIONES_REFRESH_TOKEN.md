# Instrucciones: Regenerar Refresh Token con Scope gmail.send

## 🔴 Problema

El refresh token actual solo tiene el scope `gmail.readonly`, pero necesitas `gmail.send` para enviar emails.

## ✅ Solución: Regenerar Refresh Token

### Paso 1: Obtener Credenciales OAuth

1. Ve a Google Cloud Console:
   - https://console.cloud.google.com/apis/credentials?project=check-in-sf

2. Encuentra tu **OAuth 2.0 Client ID** (el que usa el servicio)

3. Copia:
   - **Client ID**
   - **Client Secret**

### Paso 2: Ejecutar Script

1. **Instala dependencias** (si no las tienes):
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   npm install googleapis
   ```

2. **Ejecuta el script:**
   ```powershell
   node regenerar_refresh_token.js
   ```

3. **Sigue las instrucciones:**
   - Pega el Client ID cuando se solicite
   - Pega el Client Secret cuando se solicite
   - Abre la URL que se muestra en el navegador
   - Autoriza con la cuenta: **media.manager@feverup.com**
   - Copia el código de autorización de la URL de redirección
   - Pega el código en el script

4. **Copia el Refresh Token** que se muestra

### Paso 3: Actualizar Secret en Google Cloud

Ejecuta este comando (reemplaza `NUEVO_REFRESH_TOKEN` con el token que obtuviste):

**En PowerShell:**
```powershell
$token = "NUEVO_REFRESH_TOKEN_AQUI"
echo $token | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf
```

**O en Linux/Mac:**
```bash
echo -n "NUEVO_REFRESH_TOKEN_AQUI" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf
```

### Paso 4: Verificar

1. **Verifica que el secret se actualizó:**
   ```powershell
   gcloud secrets versions access latest --secret="GMAIL_REFRESH_TOKEN" --project=check-in-sf
   ```

2. **El servicio debería usar automáticamente el nuevo token** (no necesitas redesplegar)

3. **Prueba enviando un email** y verifica los logs:
   ```powershell
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"Email.*enviado exitosamente"' --limit=5 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=10m
   ```

## 🔍 Verificar Scopes del Token

Si quieres verificar qué scopes tiene el token actual, puedes usar este script:

```javascript
const { google } = require('googleapis');

async function verifyToken() {
  const refreshToken = 'TU_REFRESH_TOKEN';
  const clientId = 'TU_CLIENT_ID';
  const clientSecret = 'TU_CLIENT_SECRET';
  
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  // Intentar obtener un access token
  const tokenInfo = await oauth2Client.getAccessToken();
  console.log('Token obtenido:', tokenInfo ? 'Sí' : 'No');
  
  // Verificar scopes (esto requiere hacer una llamada a la API)
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  try {
    await gmail.users.getProfile({ userId: 'me' });
    console.log('✓ Permisos de lectura OK');
  } catch (e) {
    console.log('✗ Error de lectura:', e.message);
  }
  
  // Intentar enviar un email de prueba (esto fallará si no tiene gmail.send)
  try {
    // No enviamos realmente, solo verificamos permisos
    console.log('Para verificar gmail.send, intenta enviar un email de prueba');
  } catch (e) {
    console.log('✗ Error de envío:', e.message);
  }
}
```

## ⚠️ Importante

- El refresh token debe tener **ambos scopes**:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.send`

- Si solo regeneras el token con `gmail.send` pero no `gmail.readonly`, perderás la capacidad de leer emails.

- El script usa `prompt: 'consent'` para forzar a Google a pedir consentimiento y generar un nuevo refresh token.

