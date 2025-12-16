/**
 * Script para regenerar el refresh token de OAuth con los scopes correctos
 * 
 * Uso:
 * 1. Obtén tu CLIENT_ID y CLIENT_SECRET de Google Cloud Console
 * 2. Ejecuta: node regenerar_refresh_token.js
 * 3. Abre la URL que se muestra y autoriza
 * 4. Copia el código de autorización
 * 5. Pega el código cuando se solicite
 * 6. Copia el refresh_token que se muestra
 * 7. Actualiza el secret en Google Cloud
 */

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
  console.log('  REGENERAR REFRESH TOKEN CON SCOPES CORRECTOS');
  console.log('='.repeat(70));
  console.log('');
  
  // Solicitar credenciales
  const clientId = await question('Client ID: ');
  const clientSecret = await question('Client Secret: ');
  const redirectUri = 'http://localhost:3000/oauth2callback';
  
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  
  // Scopes necesarios
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send'
  ];
  
  // Generar URL de autorización
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent' // Importante: fuerza a pedir consentimiento para obtener refresh token
  });
  
  console.log('');
  console.log('='.repeat(70));
  console.log('  PASO 1: AUTORIZAR');
  console.log('='.repeat(70));
  console.log('');
  console.log('1. Abre esta URL en tu navegador:');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log('2. Autoriza la aplicación con la cuenta: media.manager@feverup.com');
  console.log('3. Copia el código de autorización de la URL de redirección');
  console.log('   (debería verse algo como: http://localhost:3000/oauth2callback?code=...)');
  console.log('');
  
  const code = await question('Pega el código de autorización aquí: ');
  
  console.log('');
  console.log('Intercambiando código por tokens...');
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('');
    console.log('='.repeat(70));
    console.log('  ✓ TOKENS OBTENIDOS');
    console.log('='.repeat(70));
    console.log('');
    console.log('Access Token:', tokens.access_token?.substring(0, 20) + '...');
    console.log('');
    console.log('REFRESH TOKEN (copia este):');
    console.log('='.repeat(70));
    console.log(tokens.refresh_token);
    console.log('='.repeat(70));
    console.log('');
    console.log('Scopes autorizados:', tokens.scope);
    console.log('');
    console.log('='.repeat(70));
    console.log('  PASO 2: ACTUALIZAR SECRET EN GOOGLE CLOUD');
    console.log('='.repeat(70));
    console.log('');
    console.log('Ejecuta este comando para actualizar el secret:');
    console.log('');
    console.log(`echo -n "${tokens.refresh_token}" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf`);
    console.log('');
    console.log('O en PowerShell:');
    console.log('');
    console.log(`"${tokens.refresh_token}" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf`);
    console.log('');
    
  } catch (error) {
    console.error('Error obteniendo tokens:', error.message);
    console.error(error);
  }
  
  rl.close();
}

main().catch(console.error);

