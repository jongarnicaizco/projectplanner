/**
 * Servicio para enviar emails de prueba usando Gmail API con OAuth2
 */
import { google } from "googleapis";
import { accessSecret } from "./secrets.js";
import { getEmailTemplate } from "../config/email-templates.js";

/**
 * Rate limiting por dirección de correo: solo un email por dirección cada 5 minutos
 * Map<emailAddress, timestamp>
 */
const emailRateLimitMap = new Map();

/**
 * Intervalo de tiempo en milisegundos (5 minutos)
 */
const EMAIL_RATE_LIMIT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Limpia entradas antiguas del rate limit map (más de 5 minutos)
 */
function cleanOldRateLimitEntries() {
  const now = Date.now();
  for (const [email, timestamp] of emailRateLimitMap.entries()) {
    if (now - timestamp > EMAIL_RATE_LIMIT_INTERVAL_MS) {
      emailRateLimitMap.delete(email);
    }
  }
}

/**
 * Verifica si se puede enviar un email a una dirección específica
 * @param {string} emailAddress - Dirección de correo a verificar
 * @returns {boolean} true si se puede enviar, false si está en rate limit
 */
function canSendEmailToAddress(emailAddress) {
  if (!emailAddress) return true; // Si no hay dirección, permitir (no debería pasar)
  
  const normalizedEmail = emailAddress.toLowerCase().trim();
  const now = Date.now();
  
  // Limpiar entradas antiguas periódicamente
  if (emailRateLimitMap.size > 1000) {
    cleanOldRateLimitEntries();
  }
  
  const lastSent = emailRateLimitMap.get(normalizedEmail);
  
  if (lastSent) {
    const timeSinceLastSent = now - lastSent;
    if (timeSinceLastSent < EMAIL_RATE_LIMIT_INTERVAL_MS) {
      const remainingMinutes = Math.ceil((EMAIL_RATE_LIMIT_INTERVAL_MS - timeSinceLastSent) / (60 * 1000));
      console.log(`[mfs] ⏸️ Rate limit: Ya se envió un email a ${normalizedEmail} hace ${Math.floor(timeSinceLastSent / 1000)} segundos. Esperando ${remainingMinutes} minuto(s) más antes de enviar otro.`);
      return false;
    }
  }
  
  return true;
}

/**
 * Registra que se envió un email a una dirección específica
 * @param {string} emailAddress - Dirección de correo
 */
function recordEmailSent(emailAddress) {
  if (!emailAddress) return;
  
  const normalizedEmail = emailAddress.toLowerCase().trim();
  emailRateLimitMap.set(normalizedEmail, Date.now());
  
  console.log(`[mfs] ✓ Email enviado a ${normalizedEmail} registrado en rate limit map`);
}

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
 * Detecta si un string es un nombre de persona (no empresa, no genérico)
 * @param {string} name - Nombre a verificar
 * @returns {boolean} true si parece ser un nombre de persona, false si no
 */
function isPersonName(name) {
  if (!name || typeof name !== "string") return false;
  
  const normalized = name.trim().toLowerCase();
  
  // Si está vacío o muy corto, no es un nombre
  if (normalized.length < 2) return false;
  
  // Si contiene @, es un email, no un nombre
  if (normalized.includes("@")) return false;
  
  // Palabras que indican que NO es un nombre de persona (empresas, departamentos, genéricos)
  const nonPersonKeywords = [
    "team", "marketing", "sales", "support", "info", "contact", "hello", "noreply", "no-reply",
    "newsletter", "notifications", "alerts", "system", "automated", "bot", "service",
    "customer service", "customer support", "help desk", "administrator", "admin",
    "communications", "media relations", "press", "pr", "public relations",
    "equipo", "marketing", "ventas", "soporte", "información", "contacto", "hola",
    "comunicación", "prensa", "relaciones públicas", "redacción", "editorial",
    "équipe", "marketing", "ventes", "support", "information", "contact", "bonjour",
    "communication", "presse", "relations publiques", "rédaction", "éditorial",
    "team", "marketing", "verkauf", "support", "information", "kontakt", "hallo",
    "kommunikation", "presse", "öffentlichkeitsarbeit", "redaktion", "editorial",
    "squadra", "marketing", "vendite", "supporto", "informazioni", "contatto", "ciao",
    "comunicazione", "stampa", "relazioni pubbliche", "redazione", "editoriale"
  ];
  
  // Si contiene alguna de estas palabras, probablemente no es un nombre de persona
  for (const keyword of nonPersonKeywords) {
    if (normalized.includes(keyword)) {
      return false;
    }
  }
  
  // Si contiene números, probablemente no es un nombre de persona
  if (/\d/.test(normalized)) {
    return false;
  }
  
  // Si es muy largo (más de 50 caracteres), probablemente no es un nombre
  if (normalized.length > 50) {
    return false;
  }
  
  // Si contiene caracteres especiales raros (excepto espacios, guiones, apóstrofes, puntos)
  if (!/^[a-záéíóúàèìòùâêîôûãõçñäëïöüÿ\s\-'\.]+$/i.test(name)) {
    return false;
  }
  
  // Si parece ser un nombre de empresa (contiene palabras como "inc", "ltd", "llc", "srl", etc.)
  const companySuffixes = ["inc", "ltd", "llc", "srl", "sl", "sa", "gmbh", "ag", "spa", "sas", "bv", "nv"];
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (companySuffixes.includes(word)) {
      return false;
    }
  }
  
  // Si pasa todas las verificaciones, probablemente es un nombre de persona
  return true;
}

/**
 * Codifica el subject del email usando MIME (RFC 2047) para respetar caracteres especiales como tildes
 * @param {string} subject - Subject a codificar
 * @returns {string} Subject codificado
 */
function encodeSubject(subject) {
  // Si el subject solo contiene caracteres ASCII, no necesita codificación
  if (/^[\x00-\x7F]*$/.test(subject)) {
    return subject;
  }
  
  // Codificar usando MIME (RFC 2047) con UTF-8 y Base64
  // Formato: =?charset?encoding?encoded-text?=
  const encoded = Buffer.from(subject, 'utf-8').toString('base64');
  // Dividir en chunks de 75 caracteres (límite de RFC 2047)
  const chunks = [];
  for (let i = 0; i < encoded.length; i += 75) {
    chunks.push(encoded.slice(i, i + 75));
  }
  
  return `=?UTF-8?B?${chunks.join('?=\r\n =?UTF-8?B?')}?=`;
}

/**
 * Envía un email de barter request a jongarnicaizco@gmail.com (TEST - NO se envía al cliente)
 * @param {string} emailId - ID del email que se está procesando (para logging)
 * @param {string} firstName - Primer nombre del cliente
 * @param {string} brandName - Nombre de la marca/empresa (se extrae del from o subject si no está disponible)
 * @param {string} originalSubject - Subject del correo original recibido
 * @param {string} language - Idioma del email (pt, it, en, es, fr, de) - se obtiene del campo Language de Airtable
 * @param {string} originalBody - Body del correo original (opcional, se añade al final)
 * @param {string} originalFromEmail - Email del remitente original (para rate limiting)
 */
export async function sendBarterEmail(emailId, firstName, brandName, originalSubject, language = "en", originalBody = null, originalFromEmail = null) {
  try {
    console.log("[mfs] ===== INICIANDO ENVÍO DE EMAIL BARTER (TEST) =====");
    console.log("[mfs] Email ID procesado:", emailId);
    console.log("[mfs] Destinatario: jongarnicaizco@gmail.com (TEST - NO se envía al cliente)");
    console.log("[mfs] Remitente: secretmedia@feverup.com");
    console.log("[mfs] Tipo: Barter Request");
    console.log("[mfs] Idioma:", language);
    console.log("[mfs] Subject original:", originalSubject);
    console.log("[mfs] Email original (from):", originalFromEmail);
    
    // Verificar rate limiting por dirección de correo (5 minutos)
    if (originalFromEmail && !canSendEmailToAddress(originalFromEmail)) {
      console.log(`[mfs] ⏸️ Email NO enviado: Ya se envió una respuesta a ${originalFromEmail} en los últimos 5 minutos. Saltando envío para evitar duplicados.`);
      return {
        success: false,
        skipped: true,
        reason: "rate_limit",
        message: `Ya se envió un email a ${originalFromEmail} en los últimos 5 minutos`,
      };
    }
    
    const gmail = await getEmailSenderClient();
    
    const from = "secretmedia@feverup.com";
    const to = "jongarnicaizco@gmail.com"; // IMPORTANTE: Siempre a jongarnicaizco@gmail.com
    
    // Obtener template según idioma
    let template = getEmailTemplate(language, "barter");
    
    // Solo usar el nombre si es realmente un nombre de persona (no empresa, no genérico)
    if (firstName && isPersonName(firstName)) {
      // Reemplazar [First Name] con el firstName real
      template = template.replace(/\[First Name\]/g, firstName);
    } else {
      // Si no es un nombre de persona, eliminar "[First Name]" y dejar solo el saludo
      // Reemplazar "Hola [First Name]," o "Hi [First Name]," etc. con solo "Hola," o "Hi,"
      template = template.replace(/^(Hola|Hi|Hello|Olá|Ciao|Bonjour|Hallo)\s+\[First Name\],/m, (match, greeting) => {
        // Mapear saludos a su versión sin nombre
        const greetingMap = {
          "Hola": "Hola",
          "Hi": "Hi",
          "Hello": "Hello",
          "Olá": "Olá",
          "Ciao": "Ciao",
          "Bonjour": "Bonjour",
          "Hallo": "Hallo"
        };
        return `${greetingMap[greeting] || greeting},`;
      });
      // También manejar casos donde [First Name] está en otra posición
      template = template.replace(/\[First Name\]/g, "");
    }
    
    // Construir el body completo (template + body original si existe)
    let body = template;
    if (originalBody) {
      body += "\n\n---\n\n";
      body += "Original email body:\n\n";
      body += originalBody;
    }
    
    // El subject debe ser "Re: " seguido del subject original, codificado correctamente
    const subjectText = originalSubject ? `Re: ${originalSubject}` : `Re: Barter Request Response for ${brandName || "Client"}`;
    const encodedSubject = encodeSubject(subjectText);
    
    const messageHeaders = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${encodedSubject}`,
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
    
    // Registrar que se envió el email (para rate limiting)
    if (originalFromEmail) {
      recordEmailSent(originalFromEmail);
    }
    
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
 * @param {string} language - Idioma del email (pt, it, en, es, fr, de) - se obtiene del campo Language de Airtable
 * @param {string} originalBody - Body del correo original (opcional, se añade al final)
 * @param {string} originalFromEmail - Email del remitente original (para rate limiting)
 */
export async function sendFreeCoverageEmail(emailId, firstName, brandName, originalSubject, language = "en", originalBody = null, originalFromEmail = null) {
  try {
    console.log("[mfs] ===== INICIANDO ENVÍO DE EMAIL FREE COVERAGE (TEST) =====");
    console.log("[mfs] Email ID procesado:", emailId);
    console.log("[mfs] Destinatario: jongarnicaizco@gmail.com (TEST - NO se envía al cliente)");
    console.log("[mfs] Remitente: secretmedia@feverup.com");
    console.log("[mfs] Tipo: Free Coverage Request");
    console.log("[mfs] Idioma:", language);
    console.log("[mfs] Subject original:", originalSubject);
    console.log("[mfs] Email original (from):", originalFromEmail);
    
    // Verificar rate limiting por dirección de correo (5 minutos)
    if (originalFromEmail && !canSendEmailToAddress(originalFromEmail)) {
      console.log(`[mfs] ⏸️ Email NO enviado: Ya se envió una respuesta a ${originalFromEmail} en los últimos 5 minutos. Saltando envío para evitar duplicados.`);
      return {
        success: false,
        skipped: true,
        reason: "rate_limit",
        message: `Ya se envió un email a ${originalFromEmail} en los últimos 5 minutos`,
      };
    }
    
    const gmail = await getEmailSenderClient();
    
    const from = "secretmedia@feverup.com";
    const to = "jongarnicaizco@gmail.com"; // IMPORTANTE: Siempre a jongarnicaizco@gmail.com
    
    // Obtener template según idioma
    let template = getEmailTemplate(language, "free coverage request");
    
    // Solo usar el nombre si es realmente un nombre de persona (no empresa, no genérico)
    if (firstName && isPersonName(firstName)) {
      // Reemplazar [First Name] con el firstName real
      template = template.replace(/\[First Name\]/g, firstName);
    } else {
      // Si no es un nombre de persona, eliminar "[First Name]" y dejar solo el saludo
      // Reemplazar "Hola [First Name]," o "Hi [First Name]," etc. con solo "Hola," o "Hi,"
      template = template.replace(/^(Hola|Hi|Hello|Olá|Ciao|Bonjour|Hallo)\s+\[First Name\],/m, (match, greeting) => {
        // Mapear saludos a su versión sin nombre
        const greetingMap = {
          "Hola": "Hola",
          "Hi": "Hi",
          "Hello": "Hello",
          "Olá": "Olá",
          "Ciao": "Ciao",
          "Bonjour": "Bonjour",
          "Hallo": "Hallo"
        };
        return `${greetingMap[greeting] || greeting},`;
      });
      // También manejar casos donde [First Name] está en otra posición
      template = template.replace(/\[First Name\]/g, "");
    }
    
    // Construir el body completo (template + body original si existe)
    let body = template;
    if (originalBody) {
      body += "\n\n---\n\n";
      body += "Original email body:\n\n";
      body += originalBody;
    }
    
    // El subject debe ser "Re: " seguido del subject original, codificado correctamente
    const subjectText = originalSubject ? `Re: ${originalSubject}` : `Re: Free Coverage Request Response for ${brandName || "Client"}`;
    const encodedSubject = encodeSubject(subjectText);
    
    const messageHeaders = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${encodedSubject}`,
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
    
    // Registrar que se envió el email (para rate limiting)
    if (originalFromEmail) {
      recordEmailSent(originalFromEmail);
    }
    
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

