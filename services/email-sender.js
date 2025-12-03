/**
 * Servicio para enviar emails de prueba usando Gmail API con OAuth2
 */
import { google } from "googleapis";
import { accessSecret } from "./secrets.js";

/**
 * Crea un cliente de Gmail OAuth2 para enviar emails
 * Usa los mismos secrets de Secret Manager que el servicio principal
 */
async function getEmailSenderClient() {
  try {
    console.log("[mfs] Obteniendo credenciales OAuth desde Secret Manager para envío de emails...");
    
    // Obtener credenciales específicas para envío de emails desde Secret Manager
    const clientId = await accessSecret("GMAIL_CLIENT_ID_SENDER");
    const clientSecret = await accessSecret("GMAIL_CLIENT_SECRET_SENDER");
    const refreshToken = await accessSecret("GMAIL_REFRESH_TOKEN_SENDER");
    
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Faltan credenciales OAuth en Secret Manager. Verifica GMAIL_CLIENT_ID_SENDER, GMAIL_CLIENT_SECRET_SENDER y GMAIL_REFRESH_TOKEN_SENDER");
    }
    
    console.log("[mfs] Credenciales OAuth obtenidas:", {
      clientIdLength: clientId?.length || 0,
      clientSecretLength: clientSecret?.length || 0,
      refreshTokenLength: refreshToken?.length || 0,
    });
    
    // El redirect URI debe coincidir con el configurado en OAuth Client
    const redirectUri = process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/oauth2callback";
    console.log("[mfs] Usando redirect URI:", redirectUri);
    
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    
    // Intentar refrescar el token para verificar que funciona
    try {
      console.log("[mfs] Verificando y refrescando access token para envío de email...");
      const tokenResponse = await oAuth2Client.getAccessToken();
      
      if (tokenResponse.token) {
        console.log("[mfs] ✓ Access token obtenido exitosamente");
        oAuth2Client.setCredentials({
          access_token: tokenResponse.token,
          refresh_token: refreshToken,
        });
      } else {
        console.warn("[mfs] ⚠ No se obtuvo nuevo token, usando refresh token directamente");
      }
    } catch (oauthError) {
      // Extraer detalles del error de forma más completa
      const errorDetails = {
        message: oauthError?.message || "unknown",
        code: oauthError?.code || "unknown",
        error: oauthError?.response?.data?.error || oauthError?.data?.error || oauthError?.error || "unknown",
        errorDescription: oauthError?.response?.data?.error_description || oauthError?.data?.error_description || oauthError?.error_description || "unknown",
        status: oauthError?.response?.status || oauthError?.status || "unknown",
        statusText: oauthError?.response?.statusText || oauthError?.statusText || "unknown",
      };
      
      console.error("[mfs] ✗ Error verificando token OAuth:", JSON.stringify(errorDetails, null, 2));
      
      // Si es unauthorized_client, dar instrucciones específicas
      if (errorDetails.error === "unauthorized_client" || errorDetails.code === 401) {
        console.error("[mfs] ========================================");
        console.error("[mfs] ERROR: unauthorized_client");
        console.error("[mfs] Posibles causas:");
        console.error("[mfs] 1. El OAuth Client no está habilitado en Google Cloud Console");
        console.error("[mfs] 2. El redirect URI no está autorizado en el OAuth Client");
        console.error("[mfs] 3. El refresh token fue generado con un Client ID/Secret diferente");
        console.error("[mfs] 4. El refresh token ha expirado (regenerar con obtener_refresh_token_completo.js)");
        console.error("[mfs] 5. El refresh token no tiene el scope 'gmail.send' necesario para enviar emails");
        console.error("[mfs] ========================================");
        console.error("[mfs] NOTA: El OAuth Client debe estar en el proyecto correcto y tener este redirect URI autorizado");
        console.error("[mfs] Redirect URI usado:", redirectUri);
      }
      
      // Relanzar el error para que se maneje en el nivel superior
      throw new Error(`Error de autenticación OAuth: ${errorDetails.error} - ${errorDetails.errorDescription}`);
    }
    
    return google.gmail({ version: "v1", auth: oAuth2Client });
  } catch (secretError) {
    console.error("[mfs] ✗ Error obteniendo secrets de OAuth:", secretError?.message || secretError);
    throw new Error(`No se pudieron obtener las credenciales OAuth: ${secretError?.message || secretError}`);
  }
}

/**
 * Envía un email de prueba a jongarnicaizco@gmail.com
 * Por cada correo procesado, envía un email con el texto "test"
 * @param {string} subject - Asunto del email (opcional, por defecto "test")
 * @param {string} body - Cuerpo del email (opcional, por defecto "test")
 */
export async function sendTestEmail(subject = "test", body = "test") {
  try {
    console.log("[mfs] ===== INICIANDO ENVÍO DE EMAIL =====");
    console.log("[mfs] Destinatario: jongarnicaizco@gmail.com");
    console.log("[mfs] Remitente: secretmedia@feverup.com");
    console.log("[mfs] Asunto:", subject);
    console.log("[mfs] Cuerpo:", body);
    
    const gmail = await getEmailSenderClient();
    
    // Crear el mensaje en formato RFC 2822
    const to = "jongarnicaizco@gmail.com";
    const from = "secretmedia@feverup.com";
    
    const message = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      body,
    ].join("\n");

    console.log("[mfs] Mensaje creado, codificando en base64url...");

    // Codificar el mensaje en base64url
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    console.log("[mfs] Mensaje codificado, enviando a Gmail API...");

    // Enviar el email
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log("[mfs] ===== EMAIL ENVIADO EXITOSAMENTE =====");
    console.log("[mfs] ✓✓✓ EMAIL ENVIADO DESDE secretmedia@feverup.com A jongarnicaizco@gmail.com ✓✓✓");
    console.log("[mfs] Message ID:", response.data.id);
    console.log("[mfs] Thread ID:", response.data.threadId);
    console.log("[mfs] Destinatario:", to);
    console.log("[mfs] Remitente:", from);
    console.log("[mfs] Asunto:", subject);
    console.log("[mfs] Timestamp:", new Date().toISOString());

    return {
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    };
  } catch (error) {
    console.error("[mfs] ===== ERROR ENVIANDO EMAIL =====");
    
    // Extraer información detallada del error
    const errorInfo = {
      message: error?.message || "Unknown error",
      code: error?.code || error?.response?.status || "unknown",
      status: error?.response?.status || error?.status || "unknown",
      statusText: error?.response?.statusText || error?.statusText || "unknown",
      error: error?.response?.data?.error || error?.data?.error || error?.error || "unknown",
      errorDescription: error?.response?.data?.error_description || error?.data?.error_description || error?.error_description || "unknown",
      details: error?.response?.data || error?.data || {},
    };
    
    console.error("[mfs] Error code:", errorInfo.code);
    console.error("[mfs] Error status:", errorInfo.status);
    console.error("[mfs] Error statusText:", errorInfo.statusText);
    console.error("[mfs] Error message:", errorInfo.message);
    console.error("[mfs] Error type:", errorInfo.error);
    console.error("[mfs] Error description:", errorInfo.errorDescription);
    console.error("[mfs] Error details:", JSON.stringify(errorInfo.details, null, 2));
    
    // Si es un error de OAuth, dar información adicional
    if (errorInfo.error === "unauthorized_client" || errorInfo.code === 401) {
      console.error("[mfs] ========================================");
      console.error("[mfs] ERROR DE AUTENTICACIÓN: unauthorized_client");
      console.error("[mfs] Esto significa que las credenciales OAuth no son válidas.");
      console.error("[mfs] Soluciones:");
      console.error("[mfs] 1. Verifica que GMAIL_CLIENT_ID_SENDER, GMAIL_CLIENT_SECRET_SENDER y GMAIL_REFRESH_TOKEN_SENDER");
      console.error("[mfs]    estén correctamente configurados en Secret Manager");
      console.error("[mfs] 2. Verifica que el refresh token tenga el scope 'gmail.send'");
      console.error("[mfs] 3. Regenera el refresh token si es necesario usando obtener_refresh_token_completo.js");
      console.error("[mfs] ========================================");
    }
    
    // Si es un error de permisos (403), indicar que falta el scope
    if (errorInfo.code === 403 || errorInfo.error === "insufficient_permission") {
      console.error("[mfs] ========================================");
      console.error("[mfs] ERROR DE PERMISOS: insufficient_permission");
      console.error("[mfs] El refresh token no tiene el scope 'gmail.send' necesario para enviar emails.");
      console.error("[mfs] Solución: Regenera el refresh token con los scopes:");
      console.error("[mfs]   - https://www.googleapis.com/auth/gmail.readonly");
      console.error("[mfs]   - https://www.googleapis.com/auth/gmail.send");
      console.error("[mfs] ========================================");
    }
    
    console.error("[mfs] Stack trace:", error?.stack);
    
    return {
      success: false,
      error: errorInfo.message,
      code: errorInfo.code,
      status: errorInfo.status,
      errorType: errorInfo.error,
      errorDescription: errorInfo.errorDescription,
      details: errorInfo.details,
    };
  }
}

