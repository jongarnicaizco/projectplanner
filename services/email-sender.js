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
 * Genera el template de email para Free Coverage Request
 */
function generateFreeCoverageEmail(firstName, brandName = "your business") {
  return `Hi ${firstName || "there"},

Thank you so much for reaching out. I've passed your note and key details along to our editorial team so they can consider it for future coverage. Because our editors independently decide what to feature based on newsworthiness, timing, and overall fit for our readers, we're not able to guarantee coverage or a specific timeline—but they will review it as part of their regular planning.

I completely understand that you're hoping to gain some organic exposure. Many of the local businesses we speak with feel the same way—they'd love to be featured editorially when they have a great story to tell. What they've found, however, is that relying only on earned media can be unpredictable: even strong stories sometimes don't line up with the editorial calendar, competing news, or space constraints.

For businesses that want more certainty, we usually recommend exploring our paid partnership options. Through our Content Creation offering, our team develops a dedicated, on-brand feature about ${brandName}. With Guaranteed Impressions, we then promote that content across Secret Media Network channels until it reaches an agreed number of impressions—so instead of hoping for coverage, you know in advance the minimum reach you're getting.

If you'd like, I'd be happy to share a short proposal with formats and pricing tailored to you and your goals, or we can jump on a quick call to walk through what similar partners have done with us.

Thanks again for thinking of Secret Media Network, and I look forward to hearing your thoughts.

Best regards,

Secret Media Network`;
}

/**
 * Genera el template de email para Barter Request
 */
function generateBarterEmail(firstName, brandName = "your business") {
  return `Hi ${firstName || "there"},

Thank you so much for reaching out and for thinking of Secret Media Network.

I really appreciate your proposal to collaborate on a barter basis. To protect the trust we have with our readers, our editorial team operates fully independently and doesn't participate in barter or value-in-kind arrangements. Any sponsored or branded content is handled separately by our commercial partnerships team under clear paid programs.

I completely understand why you'd explore a barter collaboration, especially when you're already investing in your product and experiences. Many of our partners felt the same way at first—they wanted to test the waters without committing to a large media budget. What they found is that structured paid campaigns, with clear content deliverables and guaranteed impressions, gave them much more predictable results and a stronger return on investment than one-off barter features.

For businesses like ${brandName}, we usually recommend:

Content Creation: our team creates a dedicated, on-brand article and supporting assets (for example, a feature on our site, social posts, and/or newsletter placements).

Guaranteed Impressions: we promote that content across Secret Media Network channels until it reaches an agreed number of impressions, so you know exactly what reach you're getting.

We can adapt the format (evergreen guide, spotlight article, launch feature, etc.) depending on whether your main goal is bookings, sales, or awareness.

If you'd like, I'd be happy to put together a short proposal with options and pricing tailored to you and your timelines, or jump on a quick call to walk you through what similar partners have achieved with us.

Looking forward to hearing your thoughts.

Best regards,

Secret Media Network`;
}

/**
 * Envía un email personalizado
 * @param {string} to - Email del destinatario
 * @param {string} subject - Asunto del email
 * @param {string} body - Cuerpo del email
 * @param {string} originalMessageId - Message-ID del email original (opcional, para responder)
 */
export async function sendEmail(to, subject, body, originalMessageId = null) {
  try {
    console.log("[mfs] ===== INICIANDO ENVÍO DE EMAIL =====");
    console.log("[mfs] Destinatario:", to);
    console.log("[mfs] Remitente: secretmedia@feverup.com");
    console.log("[mfs] Asunto:", subject);
    console.log("[mfs] Cuerpo (primeros 200 chars):", body.slice(0, 200));
    
    const gmail = await getEmailSenderClient();
    
    // Crear el mensaje en formato RFC 2822
    const from = "secretmedia@feverup.com";
    
    const messageHeaders = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];
    
    // Si hay un Message-ID original, agregar headers para que sea una respuesta
    if (originalMessageId) {
      messageHeaders.push(`In-Reply-To: ${originalMessageId}`);
      messageHeaders.push(`References: ${originalMessageId}`);
    }
    
    messageHeaders.push(""); // Línea vacía antes del body
    messageHeaders.push(body);
    
    const message = messageHeaders.join("\n");

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
    console.log("[mfs] ✓✓✓ EMAIL ENVIADO DESDE secretmedia@feverup.com A", to, "✓✓✓");
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

/**
 * Envía un email de prueba a jongarnicaizco@gmail.com (mantenido para compatibilidad)
 * @param {string} subject - Asunto del email (opcional, por defecto "test")
 * @param {string} body - Cuerpo del email (opcional, por defecto "test")
 */
export async function sendTestEmail(subject = "test", body = "test") {
  return sendEmail("jongarnicaizco@gmail.com", subject, body);
}

/**
 * Envía un email personalizado para Free Coverage Request
 * @param {string} to - Email del destinatario
 * @param {string} firstName - Primer nombre del destinatario
 * @param {string} brandName - Nombre de la marca/empresa (opcional)
 * @param {string} originalSubject - Asunto del email original (opcional)
 * @param {string} originalMessageId - Message-ID del email original (opcional)
 */
export async function sendFreeCoverageEmail(to, firstName, brandName, originalSubject = "", originalMessageId = null) {
  // Usar el subject original con "Re: " si existe, sino usar uno genérico
  const subject = originalSubject 
    ? (originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`)
    : "Re: Your inquiry to Secret Media Network";
  const body = generateFreeCoverageEmail(firstName, brandName);
  return sendEmail(to, subject, body, originalMessageId);
}

/**
 * Envía un email personalizado para Barter Request
 * @param {string} to - Email del destinatario
 * @param {string} firstName - Primer nombre del destinatario
 * @param {string} brandName - Nombre de la marca/empresa (opcional)
 * @param {string} originalSubject - Asunto del email original (opcional)
 * @param {string} originalMessageId - Message-ID del email original (opcional)
 */
export async function sendBarterEmail(to, firstName, brandName, originalSubject = "", originalMessageId = null) {
  // Usar el subject original con "Re: " si existe, sino usar uno genérico
  const subject = originalSubject 
    ? (originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`)
    : "Re: Your collaboration proposal to Secret Media Network";
  const body = generateBarterEmail(firstName, brandName);
  return sendEmail(to, subject, body, originalMessageId);
}
