/**
 * Servicio para enviar emails de prueba usando Gmail API con OAuth2
 */
import { google } from "googleapis";
import { accessSecret } from "./secrets.js";

/**
 * Crea un cliente de Gmail OAuth2 para enviar emails
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
      }
    } catch (oauthError) {
      const errorDetails = {
        message: oauthError?.message || "unknown",
        code: oauthError?.code || oauthError?.response?.status || "unknown",
        error: oauthError?.response?.data?.error || oauthError?.data?.error || oauthError?.error || "unknown",
        errorDescription: oauthError?.response?.data?.error_description || oauthError?.data?.error_description || oauthError?.error_description || "unknown",
      };
      console.error("[mfs] ✗ Error verificando token OAuth:", JSON.stringify(errorDetails, null, 2));
      throw new Error(`Error de autenticación OAuth: ${errorDetails.error} - ${errorDetails.errorDescription}`);
    }
    
    return google.gmail({ version: "v1", auth: oAuth2Client });
  } catch (secretError) {
    console.error("[mfs] ✗ Error obteniendo secrets de OAuth:", secretError?.message || secretError);
    throw new Error(`No se pudieron obtener las credenciales OAuth: ${secretError?.message || secretError}`);
  }
}

/**
 * Envía un email de prueba "TEST" a jongarnicaizco@gmail.com
 * @param {string} emailId - ID del email que se está procesando (para logging)
 */
export async function sendTestEmail(emailId) {
  try {
    console.log("[mfs] ===== INICIANDO ENVÍO DE EMAIL TEST =====");
    console.log("[mfs] Email ID procesado:", emailId);
    console.log("[mfs] Destinatario: jongarnicaizco@gmail.com");
    console.log("[mfs] Remitente: secretmedia@feverup.com");
    console.log("[mfs] Asunto: TEST");
    
    const gmail = await getEmailSenderClient();
    
    // Crear el mensaje en formato RFC 2822
    const from = "secretmedia@feverup.com";
    const to = "jongarnicaizco@gmail.com";
    const subject = "TEST";
    const body = "TEST";
    
    const messageHeaders = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];
    
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

    console.log("[mfs] ===== EMAIL TEST ENVIADO EXITOSAMENTE =====");
    console.log("[mfs] ✓✓✓ EMAIL TEST ENVIADO DESDE secretmedia@feverup.com A jongarnicaizco@gmail.com ✓✓✓");
    console.log("[mfs] Message ID:", response.data.id);
    console.log("[mfs] Thread ID:", response.data.threadId);
    console.log("[mfs] Email ID procesado:", emailId);
    console.log("[mfs] Timestamp:", new Date().toISOString());

    return {
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    };
  } catch (error) {
    console.error("[mfs] ===== ERROR ENVIANDO EMAIL TEST =====");
    console.error("[mfs] Email ID procesado:", emailId);
    
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
    console.error("[mfs] Error message:", errorInfo.message);
    console.error("[mfs] Error type:", errorInfo.error);
    console.error("[mfs] Error description:", errorInfo.errorDescription);
    console.error("[mfs] Error details:", JSON.stringify(errorInfo.details, null, 2));
    console.error("[mfs] Stack trace:", error?.stack);
    
    return {
      success: false,
      error: errorInfo.message,
      code: errorInfo.code,
      status: errorInfo.status,
      errorType: errorInfo.error,
      errorDescription: errorInfo.errorDescription,
    };
  }
}

/**
 * Genera el template de email para barter request
 * @param {string} firstName - Primer nombre del cliente
 * @param {string} brandName - Nombre de la marca/empresa
 */
function generateBarterEmailTemplate(firstName, brandName) {
  return `Hi ${firstName || "[First Name]"},

Thank you so much for reaching out and for thinking of Secret Media Network.

I really appreciate your proposal to collaborate on a barter basis. To protect the trust we have with our readers, our editorial team operates fully independently and doesn't participate in barter or value-in-kind arrangements. Any sponsored or branded content is handled separately by our commercial partnerships team under clear paid programs.

I completely understand why you'd explore a barter collaboration, especially when you're already investing in your product and experiences. Many of our partners felt the same way at first—they wanted to test the waters without committing to a large media budget. What they found is that structured paid campaigns, with clear content deliverables and guaranteed impressions, gave them much more predictable results and a stronger return on investment than one-off barter features.

For businesses like yours, we usually recommend:

- Content Creation: our team creates a dedicated, on-brand article and supporting assets (for example, a feature on our site, social posts, and/or newsletter placements).

- Guaranteed Impressions: we promote that content across Secret Media Network channels until it reaches an agreed number of impressions, so you know exactly what reach you're getting.

We can adapt the format (evergreen guide, spotlight article, launch feature, etc.) depending on whether your main goal is bookings, sales, or awareness.

If you'd like, I'd be happy to put together a short proposal with options and pricing tailored to ${brandName || "[Brand Name]"} and your timelines, or jump on a quick call to walk you through what similar partners have achieved with us.

Looking forward to hearing your thoughts.

Best regards,

Secret Media Network`;
}

/**
 * Genera el template de email para free coverage request
 * @param {string} firstName - Primer nombre del cliente
 * @param {string} brandName - Nombre de la marca/empresa
 */
function generateFreeCoverageEmailTemplate(firstName, brandName) {
  return `Hi ${firstName || "[First Name]"},

Thank you so much for reaching out. I've passed your note and key details along to our editorial team so they can consider it for future coverage. Because our editors independently decide what to feature based on newsworthiness, timing, and overall fit for our readers, we're not able to guarantee coverage or a specific timeline—but they will review it as part of their regular planning.

I completely understand that you're hoping to gain some organic exposure. Many of the local businesses we speak with feel the same way—they'd love to be featured editorially when they have a great story to tell. What they've found, however, is that relying only on earned media can be unpredictable: even strong stories sometimes don't line up with the editorial calendar, competing news, or space constraints.

For businesses that want more certainty, we usually recommend exploring our paid partnership options. Through our Content Creation offering, our team develops a dedicated, on-brand feature about ${brandName || "[Brand Name]"}. With Guaranteed Impressions, we then promote that content across Secret Media Network channels until it reaches an agreed number of impressions—so instead of hoping for coverage, you know in advance the minimum reach you're getting.

If you'd like, I'd be happy to share a short proposal with formats and pricing tailored to you and your goals, or we can jump on a quick call to walk through what similar partners have done with us.

Thanks again for thinking of Secret Media Network, and I look forward to hearing your thoughts.

Best regards,

Secret Media Network`;
}

/**
 * Envía un email de barter request a jongarnicaizco@gmail.com (TEST - NO se envía al cliente)
 * @param {string} emailId - ID del email que se está procesando (para logging)
 * @param {string} firstName - Primer nombre del cliente
 * @param {string} brandName - Nombre de la marca/empresa (se extrae del from o subject si no está disponible)
 * @param {string} originalSubject - Subject del correo original recibido
 */
export async function sendBarterEmail(emailId, firstName, brandName, originalSubject) {
  try {
    console.log("[mfs] ===== INICIANDO ENVÍO DE EMAIL BARTER (TEST) =====");
    console.log("[mfs] Email ID procesado:", emailId);
    console.log("[mfs] Destinatario: jongarnicaizco@gmail.com (TEST - NO se envía al cliente)");
    console.log("[mfs] Remitente: secretmedia@feverup.com");
    console.log("[mfs] Tipo: Barter Request");
    console.log("[mfs] Subject original:", originalSubject);
    
    const gmail = await getEmailSenderClient();
    
    const from = "secretmedia@feverup.com";
    const to = "jongarnicaizco@gmail.com"; // IMPORTANTE: Solo a jongarnicaizco@gmail.com, NO al cliente
    // El subject debe ser "Re: " seguido del subject original
    const subject = originalSubject ? `Re: ${originalSubject}` : `Re: Barter Request Response for ${brandName || "Client"}`;
    const body = generateBarterEmailTemplate(firstName, brandName);
    
    const messageHeaders = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];
    
    messageHeaders.push("");
    messageHeaders.push(body);
    
    const message = messageHeaders.join("\n");
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });
    
    console.log("[mfs] ===== EMAIL BARTER (TEST) ENVIADO EXITOSAMENTE =====");
    console.log("[mfs] Message ID:", response.data.id);
    console.log("[mfs] Thread ID:", response.data.threadId);
    
    return {
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    };
  } catch (error) {
    console.error("[mfs] ===== ERROR ENVIANDO EMAIL BARTER (TEST) =====");
    console.error("[mfs] Error:", error?.message || error);
    return {
      success: false,
      error: error?.message || "Unknown error",
    };
  }
}

/**
 * Envía un email de alerta crítica cuando se superan 3k ejecuciones por minuto
 * @param {number} count - Número de ejecuciones en el último minuto
 * @param {number} limit - Límite crítico (3000)
 * @param {string} serviceSource - Servicio de Cloud que está generando el problema
 */
export async function sendCriticalAlertEmail(count, limit, serviceSource) {
  try {
    console.log("[mfs] ===== ENVIANDO EMAIL DE ALERTA CRÍTICA =====");
    console.log("[mfs] Count:", count);
    console.log("[mfs] Limit:", limit);
    console.log("[mfs] Service Source:", serviceSource);
    
    const gmail = await getEmailSenderClient();
    
    const from = "secretmedia@feverup.com";
    const to = "jon.garnica@feverup.com";
    const subject = `🚨 ALERTA: ${count} ejecuciones por minuto - Límite de 3k superado`;
    const body = `Hola Jon,

ALERTA: El sistema ha superado el límite de ${limit.toLocaleString()} ejecuciones por minuto.

Detalles:
- Ejecuciones en el último minuto: ${count.toLocaleString()}
- Límite crítico: ${limit.toLocaleString()} ejecuciones por minuto
- Servicio de Cloud que está generando el problema: ${serviceSource}

Esta es una alerta para informarte de que el sistema está procesando un volumen alto de ejecuciones, lo que podría indicar:
- Un bucle infinito
- Un problema con el procesamiento de mensajes
- Un uso anormal del sistema

El servicio NO se ha detenido automáticamente (solo se detiene a los 7,000 ejecuciones), pero es importante que revises qué está causando este volumen alto.

Para revisar:
1. Ve a los logs de Cloud Run: https://console.cloud.google.com/run
2. Revisa qué servicio está generando tantas ejecuciones
3. Verifica si hay algún bucle o problema en el procesamiento

Este es un mensaje automático del sistema de procesamiento de leads.

Saludos,
Sistema de Automatización MFS`;

    const messageHeaders = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];
    
    messageHeaders.push("");
    messageHeaders.push(body);
    
    const message = messageHeaders.join("\n");
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });
    
    console.log("[mfs] ===== EMAIL DE ALERTA CRÍTICA ENVIADO EXITOSAMENTE =====");
    console.log("[mfs] Message ID:", response.data.id);
    console.log("[mfs] Thread ID:", response.data.threadId);
    
    return {
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    };
  } catch (error) {
    console.error("[mfs] ===== ERROR ENVIANDO EMAIL DE ALERTA CRÍTICA =====");
    console.error("[mfs] Error message:", error?.message || error);
    console.error("[mfs] Error code:", error?.code || error?.response?.status || "unknown");
    
    return {
      success: false,
      error: error?.message || "Unknown error",
      code: error?.code || error?.response?.status || "unknown",
    };
  }
}

/**
 * Envía un email de notificación de rate limit excedido
 * @param {number} count - Número de emails procesados
 * @param {number} limit - Límite máximo permitido
 * @param {number} windowMinutes - Ventana de tiempo en minutos
 */
export async function sendRateLimitNotificationEmail(count, limit, windowMinutes) {
  try {
    console.log("[mfs] ===== ENVIANDO EMAIL DE NOTIFICACIÓN DE RATE LIMIT =====");
    console.log("[mfs] Count:", count);
    console.log("[mfs] Limit:", limit);
    console.log("[mfs] Window (minutes):", windowMinutes);
    
    const gmail = await getEmailSenderClient();
    
    const from = "secretmedia@feverup.com";
    const to = "jon.garnica@feverup.com";
    const subject = `⚠️ ALERTA: Servicio detenido automáticamente - Límite de ejecuciones excedido`;
    const body = `Hola,

El servicio de procesamiento de emails se ha detenido AUTOMÁTICAMENTE porque se ha excedido el límite de ejecuciones configurado.

Detalles:
- Ejecuciones en el último minuto: ${count}
- Límite máximo permitido: ${limit} ejecuciones por minuto
- Ventana de tiempo: ${windowMinutes} minuto(s)

El servicio se ha detenido automáticamente (como si hubieras presionado el botón STOP) para evitar costos excesivos o bucles.

Para reactivar el servicio:
1. Ve al web app de control: https://mfs-lead-generation-ai-vtlrnibdxq-uc.a.run.app/control
2. Presiona el botón "ACTIVAR"
3. El contador de ejecuciones se reseteará automáticamente
4. Solo se procesarán mensajes nuevos a partir de ese momento

Este es un mensaje automático del sistema de procesamiento de leads.

Saludos,
Sistema de Automatización MFS`;

    const messageHeaders = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];
    
    messageHeaders.push("");
    messageHeaders.push(body);
    
    const message = messageHeaders.join("\n");
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });
    
    console.log("[mfs] ===== EMAIL DE NOTIFICACIÓN ENVIADO EXITOSAMENTE =====");
    console.log("[mfs] Message ID:", response.data.id);
    console.log("[mfs] Thread ID:", response.data.threadId);
    
    return {
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    };
  } catch (error) {
    console.error("[mfs] ===== ERROR ENVIANDO EMAIL DE NOTIFICACIÓN =====");
    console.error("[mfs] Error message:", error?.message || error);
    console.error("[mfs] Error code:", error?.code || error?.response?.status || "unknown");
    console.error("[mfs] Error details:", JSON.stringify({
      error: error?.response?.data?.error || error?.error || "unknown",
      errorDescription: error?.response?.data?.error_description || error?.error_description || "unknown",
      status: error?.response?.status || error?.status || "unknown",
    }, null, 2));
    
    return {
      success: false,
      error: error?.message || "Unknown error",
      code: error?.code || error?.response?.status || "unknown",
      status: error?.response?.status || error?.status || "unknown",
      errorType: error?.response?.data?.error || error?.error || "unknown",
      errorDescription: error?.response?.data?.error_description || error?.error_description || "unknown",
    };
  }
}

/**
 * Envía un email de free coverage request a jongarnicaizco@gmail.com (TEST - NO se envía al cliente)
 * @param {string} emailId - ID del email que se está procesando (para logging)
 * @param {string} firstName - Primer nombre del cliente
 * @param {string} brandName - Nombre de la marca/empresa (se extrae del from o subject si no está disponible)
 * @param {string} originalSubject - Subject del correo original recibido
 */
export async function sendFreeCoverageEmail(emailId, firstName, brandName, originalSubject) {
  try {
    console.log("[mfs] ===== INICIANDO ENVÍO DE EMAIL FREE COVERAGE (TEST) =====");
    console.log("[mfs] Email ID procesado:", emailId);
    console.log("[mfs] Destinatario: jongarnicaizco@gmail.com (TEST - NO se envía al cliente)");
    console.log("[mfs] Remitente: secretmedia@feverup.com");
    console.log("[mfs] Tipo: Free Coverage Request");
    console.log("[mfs] Subject original:", originalSubject);
    
    const gmail = await getEmailSenderClient();
    
    const from = "secretmedia@feverup.com";
    const to = "jongarnicaizco@gmail.com"; // IMPORTANTE: Solo a jongarnicaizco@gmail.com, NO al cliente
    // El subject debe ser "Re: " seguido del subject original
    const subject = originalSubject ? `Re: ${originalSubject}` : `Re: Free Coverage Request Response for ${brandName || "Client"}`;
    const body = generateFreeCoverageEmailTemplate(firstName, brandName);
    
    const messageHeaders = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];
    
    messageHeaders.push("");
    messageHeaders.push(body);
    
    const message = messageHeaders.join("\n");
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });
    
    console.log("[mfs] ===== EMAIL FREE COVERAGE (TEST) ENVIADO EXITOSAMENTE =====");
    console.log("[mfs] Message ID:", response.data.id);
    console.log("[mfs] Thread ID:", response.data.threadId);
    
    return {
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    };
  } catch (error) {
    console.error("[mfs] ===== ERROR ENVIANDO EMAIL FREE COVERAGE (TEST) =====");
    console.error("[mfs] Error:", error?.message || error);
    return {
      success: false,
      error: error?.message || "Unknown error",
    };
  }
}

