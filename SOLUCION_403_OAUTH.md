# Solución: Error 403 "Insufficient Permission" - Falta Scope gmail.send

## 🔴 Problema Identificado

El error es:
```
[mfs] Email: ✗ ERROR enviando email {
  errorMessage: 'Insufficient Permission',
  errorCode: 403
}
```

## 🔍 Causa Raíz

El servicio está usando **OAuth** para autenticarse con Gmail, pero el **refresh token** no tiene el scope `gmail.send`, solo tiene `gmail.readonly`.

## ✅ Solución

### Opción 1: Regenerar Refresh Token con Scope Correcto (Recomendado)

1. **Ve a Google Cloud Console:**
   - https://console.cloud.google.com/apis/credentials?project=check-in-sf

2. **Encuentra tu OAuth 2.0 Client ID** (el que usa el servicio)

3. **Verifica los scopes autorizados:**
   - Debe incluir: `https://www.googleapis.com/auth/gmail.send`
   - Y también: `https://www.googleapis.com/auth/gmail.readonly`

4. **Si no tiene `gmail.send`, necesitas regenerar el refresh token:**

   a. **Crea un script para obtener un nuevo refresh token:**
   ```javascript
   // get_refresh_token.js
   const { google } = require('googleapis');
   
   const oauth2Client = new google.auth.OAuth2(
     'TU_CLIENT_ID',
     'TU_CLIENT_SECRET',
     'http://localhost:3000/oauth2callback'
   );
   
   const scopes = [
     'https://www.googleapis.com/auth/gmail.readonly',
     'https://www.googleapis.com/auth/gmail.send'
   ];
   
   const authUrl = oauth2Client.generateAuthUrl({
     access_type: 'offline',
     scope: scopes,
     prompt: 'consent' // Importante: fuerza a pedir consentimiento para obtener refresh token
   });
   
   console.log('Autoriza esta aplicación visitando esta URL:', authUrl);
   ```

   b. **Ejecuta el script y autoriza:**
   - Abre la URL en el navegador
   - Autoriza con la cuenta `media.manager@feverup.com`
   - Copia el código de autorización

   c. **Intercambia el código por un refresh token:**
   ```javascript
   oauth2Client.getToken(code, (err, token) => {
     if (err) return console.error('Error obteniendo token', err);
     console.log('Refresh Token:', token.refresh_token);
   });
   ```

   d. **Actualiza el secret en Google Cloud:**
   ```powershell
   echo -n "NUEVO_REFRESH_TOKEN" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf
   ```

### Opción 2: Verificar Scopes del Refresh Token Actual

El refresh token actual puede tener solo `gmail.readonly`. Necesitas regenerarlo con ambos scopes.

### Opción 3: Usar Domain-Wide Delegation (Si tienes Google Workspace)

Si usas Google Workspace, puedes configurar Domain-Wide Delegation:

1. **Habilita Domain-Wide Delegation en la Service Account**
2. **Configura los scopes en Google Workspace Admin:**
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
3. **Actualiza el código** para usar JWT con ambos scopes (ya lo hice)

## 🔧 Cambio Realizado en el Código

He actualizado `services/gmail.js` para incluir `gmail.send` cuando usa JWT (Domain-Wide Delegation):

```javascript
[
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send"  // ← Agregado
]
```

Pero si usas **OAuth** (que es el caso actual), necesitas **regenerar el refresh token** con el scope `gmail.send`.

## 📝 Próximos Pasos

1. **Verifica qué modo de autenticación estás usando:**
   - Si `AUTH_MODE=oauth` → Necesitas regenerar el refresh token
   - Si `AUTH_MODE=jwt` → Ya está corregido en el código

2. **Regenera el refresh token con los scopes correctos**

3. **Actualiza el secret `GMAIL_REFRESH_TOKEN` en Google Cloud**

4. **Redespliega el servicio** (o espera a que se actualice automáticamente)

## 🚨 Importante

El refresh token debe tener **ambos scopes**:
- `gmail.readonly` (para leer emails)
- `gmail.send` (para enviar emails)

Si solo tiene `gmail.readonly`, obtendrás el error 403 al intentar enviar.

