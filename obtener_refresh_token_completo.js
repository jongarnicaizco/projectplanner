/**
 * Script completo para obtener un nuevo refresh token
 * 
 * Uso:
 * 1. npm install googleapis (si no lo tienes)
 * 2. node obtener_refresh_token_completo.js
 * 3. Sigue las instrucciones
 */

const { google } = require('googleapis');
const readline = require('readline');
const http = require('http');
const url = require('url');

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
  console.log('  OBTENER REFRESH TOKEN CON SCOPES CORRECTOS');
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
    prompt: 'consent' // Importante: fuerza a pedir consentimiento
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
  console.log('2. IMPORTANTE: Autoriza con la cuenta: media.manager@feverup.com');
  console.log('3. Copia el código de autorización de la URL de redirección');
  console.log('   (debería verse algo como: http://localhost:3000/oauth2callback?code=...)');
  console.log('');
  console.log('   O si prefieres, puedo iniciar un servidor local para capturar el código automáticamente');
  console.log('');
  
  const useServer = await question('¿Iniciar servidor local para capturar código automáticamente? (s/n): ');
  
  let code;
  
  if (useServer.toLowerCase() === 's' || useServer.toLowerCase() === 'y') {
    // Iniciar servidor local
    console.log('');
    console.log('Iniciando servidor local en http://localhost:3000...');
    console.log('Abre la URL de autorización en tu navegador...');
    console.log('');
    
    code = await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const code = parsedUrl.query.code;
        
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>✓ Código recibido</h1>
                <p>Puedes cerrar esta ventana.</p>
                <p>Código: ${code.substring(0, 20)}...</p>
              </body>
            </html>
          `);
          server.close();
          resolve(code);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Esperando autorización...</h1>
                <p>Abre la URL de autorización en otra pestaña.</p>
              </body>
            </html>
          `);
        }
      });
      
      server.listen(3000, () => {
        console.log('Servidor iniciado. Abre la URL de autorización ahora.');
      });
      
      // Timeout después de 5 minutos
      setTimeout(() => {
        server.close();
        reject(new Error('Timeout: No se recibió el código en 5 minutos'));
      }, 300000);
    });
  } else {
    // Solicitar código manualmente
    code = await question('Pega el código de autorización aquí: ');
  }
  
  console.log('');
  console.log('Intercambiando código por tokens...');
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('');
    console.log('='.repeat(70));
    console.log('  ✓ TOKENS OBTENIDOS');
    console.log('='.repeat(70));
    console.log('');
    console.log('Access Token:', tokens.access_token ? tokens.access_token.substring(0, 20) + '...' : 'N/A');
    console.log('');
    
    if (tokens.refresh_token) {
      console.log('REFRESH TOKEN (copia este):');
      console.log('='.repeat(70));
      console.log(tokens.refresh_token);
      console.log('='.repeat(70));
      console.log('');
    } else {
      console.log('⚠ ADVERTENCIA: No se obtuvo refresh_token');
      console.log('Esto puede ocurrir si ya autorizaste antes. Revoca el acceso y vuelve a autorizar.');
      console.log('');
    }
    
    console.log('Scopes autorizados:', tokens.scope || 'N/A');
    console.log('');
    console.log('='.repeat(70));
    console.log('  PASO 2: ACTUALIZAR SECRET EN GOOGLE CLOUD');
    console.log('='.repeat(70));
    console.log('');
    
    if (tokens.refresh_token) {
      console.log('Ejecuta este comando para actualizar el secret:');
      console.log('');
      console.log('En PowerShell:');
      console.log(`"${tokens.refresh_token}" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf`);
      console.log('');
      console.log('O en Linux/Mac:');
      console.log(`echo -n "${tokens.refresh_token}" | gcloud secrets versions add GMAIL_REFRESH_TOKEN --data-file=- --project=check-in-sf`);
    } else {
      console.log('No hay refresh_token para actualizar. Regenera el token con prompt=consent.');
    }
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('✗✗✗ ERROR OBTENIENDO TOKENS ✗✗✗');
    console.error('');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Respuesta:', error.response.data);
    }
    console.error('');
    console.error('Posibles causas:');
    console.error('1. El código de autorización expiró (válido por ~10 minutos)');
    console.error('2. El código ya fue usado');
    console.error('3. El Client ID/Secret no coinciden');
    console.error('4. El redirect URI no coincide');
  }
  
  rl.close();
}

main().catch(console.error);

