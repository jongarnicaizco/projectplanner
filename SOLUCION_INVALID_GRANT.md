# Solución: Error invalid_grant

## 🔴 Problema

El error `invalid_grant` significa que el refresh token es inválido. Esto puede ocurrir por:

1. **Token expirado o revocado**
2. **Token generado para una cuenta diferente**
3. **Token no corresponde al Client ID/Secret**
4. **Token fue regenerado y el anterior quedó inválido**

## ✅ Solución: Regenerar Refresh Token Correctamente

### Paso 1: Obtener Credenciales OAuth

1. Ve a Google Cloud Console:
   - https://console.cloud.google.com/apis/credentials?project=check-in-sf

2. Encuentra tu **OAuth 2.0 Client ID**

3. Haz clic en él y copia:
   - **Client ID**
   - **Client Secret**

4. **Verifica el Redirect URI configurado:**
   - Debe ser: `http://localhost:3000/oauth2callback`
   - O el que uses en tu aplicación

### Paso 2: Generar URL de Autorización

Crea un archivo HTML simple para generar la URL:

```html
<!DOCTYPE html>
<html>
<head>
    <title>OAuth Token Generator</title>
</head>
<body>
    <h1>OAuth Token Generator</h1>
    <div>
        <label>Client ID:</label>
        <input type="text" id="clientId" style="width: 500px;" />
    </div>
    <div>
        <label>Client Secret:</label>
        <input type="text" id="clientSecret" style="width: 500px;" />
    </div>
    <button onclick="generateAuthUrl()">Generar URL de Autorización</button>
    <div id="result"></div>

    <script>
        function generateAuthUrl() {
            const clientId = document.getElementById('clientId').value;
            const clientSecret = document.getElementById('clientSecret').value;
            const redirectUri = 'http://localhost:3000/oauth2callback';
            
            const scopes = [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.send'
            ].join(' ');
            
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${encodeURIComponent(clientId)}&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `response_type=code&` +
                `scope=${encodeURIComponent(scopes)}&` +
                `access_type=offline&` +
                `prompt=consent`;
            
            document.getElementById('result').innerHTML = 
                '<h2>URL de Autorización:</h2>' +
                '<a href="' + authUrl + '" target="_blank">' + authUrl + '</a>' +
                '<p><strong>IMPORTANTE:</strong> Abre esta URL y autoriza con la cuenta: media.manager@feverup.com</p>';
        }
    </script>
</body>
</html>
```

### Paso 3: Obtener el Código de Autorización

1. **Abre la URL generada** en el navegador
2. **Autoriza con la cuenta:** `media.manager@feverup.com`
3. **Copia el código** de la URL de redirección:
   - Debería verse: `http://localhost:3000/oauth2callback?code=4/0A...`

### Paso 4: Intercambiar Código por Refresh Token

Usa este script Node.js:

```javascript
const { google } = require('googleapis');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log('  INTERCAMBIAR CÓDIGO POR REFRESH TOKEN');
  console.log('='.repeat(70));
  console.log('');
  
  const clientId = await question('Client ID: ');
  const clientSecret = await question('Client Secret: ');
  const code = await question('Código de autorización: ');
  const redirectUri = 'http://localhost:3000/oauth2callback';
  
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('');
    console.log('='.repeat(70));
    console.log('  ✓ TOKENS OBTENIDOS');
    console.log('='.repeat(70));
    console.log('');
    console.log('REFRESH TOKEN (copia este):');
    console.log('='.repeat(70));
    console.log(tokens.refresh_token);
    console.log('='.repeat(70));
    console.log('');
    console.log('Scopes:', tokens.scope);
    console.log('');
    console.log('Actualiza el secret con:');
    console.log(`echo "${tokens.refresh_token}" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf`);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  }
  
  rl.close();
}

main().catch(console.error);
```

### Paso 5: Actualizar el Secret

```powershell
$token = "NUEVO_REFRESH_TOKEN_AQUI"
echo $token | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf
```

## 🔍 Verificar que Funciona

1. **Espera unos minutos** para que el servicio obtenga el nuevo token
2. **Verifica los logs:**
   ```powershell
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"invalid_grant"' --limit=5 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=10m
   ```
3. **Si no aparece el error**, el token funciona correctamente

## ⚠️ Importante

- **Usa la cuenta correcta:** `media.manager@feverup.com`
- **Incluye ambos scopes:** `gmail.readonly` y `gmail.send`
- **Usa `prompt=consent`** para forzar a generar un nuevo refresh token
- **El redirect URI debe coincidir** con el configurado en OAuth Client

