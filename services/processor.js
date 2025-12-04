/**
 * Procesador de mensajes de Gmail
 */
import { getGmailClient } from "./gmail.js";
import {
  backoff,
  logErr,
  bodyFromMessage,
  extractCleanEmail,
  extractFromEmail,
  extractToEmail,
  extractSenderName,
  extractFirstName,
  extractSenderNameWithAI,
  detectLanguage,
  getLocationFromEmail,
} from "../utils/helpers.js";

// Helper function para extraer emails de un header (duplicado de helpers.js para uso local)
function extractAllEmails(headerValue) {
  if (!headerValue) return [];
  const bracketMatches = Array.from(headerValue.matchAll(/<([^>]+)>/g));
  if (bracketMatches.length > 0) {
    const emails = bracketMatches.map(m => {
      const email = m[1].trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return email;
      }
      return null;
    }).filter(e => e !== null);
    if (emails.length > 0) return emails;
  }
  const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  const matches = Array.from(headerValue.matchAll(emailPattern));
  return matches.map(m => m[1].trim().toLowerCase()).filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}
import {
  acquireMessageLock,
  releaseMessageLock,
  saveToGCS,
  checkLockAge,
  readRateLimitState,
  writeRateLimitState,
} from "./storage.js";
import { classifyIntent, generateBodySummary, callModelText } from "./vertex.js";
import { airtableFindByEmailId, createAirtableRecord } from "./airtable.js";
import { sendBarterEmail, sendFreeCoverageEmail, sendRateLimitNotificationEmail } from "./email-sender.js";

// Cache para el ID de la etiqueta "processed" (evitar múltiples llamadas a la API)
let processedLabelIdCache = null;

/**
 * Obtiene el ID de la etiqueta "processed" (con cache)
 */
async function getProcessedLabelId(gmail) {
  if (processedLabelIdCache) {
    return processedLabelIdCache;
  }
  
  try {
    // Obtener todas las etiquetas del usuario para buscar "processed"
    const labelsResponse = await backoff(
      () => gmail.users.labels.list({ userId: "me" }),
      "labels.list"
    );
    
    const labels = labelsResponse.data.labels || [];
    const processedLabel = labels.find(label => label.name?.toLowerCase() === "processed");
    
    if (processedLabel) {
      processedLabelIdCache = processedLabel.id;
      return processedLabelIdCache;
    }
    
    // Si no existe, retornar null (no cachear null para intentar crearla después)
    return null;
  } catch (error) {
    console.warn("[mfs] Error obteniendo etiqueta 'processed':", error?.message || error);
    return null;
  }
}

/**
 * Verifica si un mensaje tiene la etiqueta "processed"
 */
async function checkProcessedLabel(gmail, labelIds) {
  try {
    const processedLabelId = await getProcessedLabelId(gmail);
    
    if (!processedLabelId) {
      // Si la etiqueta no existe, el mensaje no puede tenerla
      return false;
    }
    
    // Verificar si el mensaje tiene esta etiqueta
    return labelIds.includes(processedLabelId);
  } catch (error) {
    console.warn("[mfs] Error verificando etiqueta 'processed':", error?.message || error);
    // Si hay error, asumir que no tiene la etiqueta para no saltar emails por error
    return false;
  }
}

/**
 * Obtiene o crea la etiqueta "processed" en Gmail
 */
async function getOrCreateProcessedLabel(gmail) {
  // Primero intentar obtener del cache
  let processedLabelId = await getProcessedLabelId(gmail);
  
  if (processedLabelId) {
    return processedLabelId;
  }
  
  // Si no existe, crearla
  try {
    console.log("[mfs] Etiqueta 'processed' no existe, creándola...");
    const createResponse = await backoff(
      () => gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: "processed",
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      }),
      "labels.create"
    );
    
    const newLabelId = createResponse.data.id;
    console.log("[mfs] Etiqueta 'processed' creada:", newLabelId);
    
    // Actualizar cache
    processedLabelIdCache = newLabelId;
    
    return newLabelId;
  } catch (error) {
    console.error("[mfs] Error creando etiqueta 'processed':", error?.message || error);
    // Si falla, intentar usar el nombre directamente (Gmail puede crear automáticamente)
    return "processed";
  }
}

/**
 * Aplica la etiqueta "processed" a un mensaje
 */
async function applyProcessedLabel(gmail, messageId) {
  console.log("[mfs] [applyProcessedLabel] Iniciando aplicación de etiqueta 'processed'");
  console.log("[mfs] [applyProcessedLabel] Message ID:", messageId);
  console.log("[mfs] [applyProcessedLabel] Cliente Gmail disponible:", gmail ? "sí" : "no");
  
  if (!gmail) {
    throw new Error("Cliente Gmail no disponible para aplicar etiqueta");
  }
  
  try {
    console.log("[mfs] [applyProcessedLabel] Obteniendo o creando etiqueta 'processed'...");
    const labelId = await getOrCreateProcessedLabel(gmail);
    console.log("[mfs] [applyProcessedLabel] Label ID obtenido:", labelId);
    
    console.log("[mfs] [applyProcessedLabel] Aplicando etiqueta usando Gmail API...");
    await backoff(
      () => gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          addLabelIds: [labelId],
        },
      }),
      "messages.modify.addLabel"
    );
    
    console.log("[mfs] ✓✓✓ Etiqueta 'processed' aplicada exitosamente al email:", messageId);
  } catch (error) {
    console.error("[mfs] [applyProcessedLabel] Error aplicando etiqueta con ID:", error?.message || error);
    console.error("[mfs] [applyProcessedLabel] Error code:", error?.code || error?.response?.status || "unknown");
    console.error("[mfs] [applyProcessedLabel] Error details:", JSON.stringify({
      error: error?.response?.data?.error || error?.error || "unknown",
      errorDescription: error?.response?.data?.error_description || error?.error_description || "unknown",
      status: error?.response?.status || error?.status || "unknown",
    }, null, 2));
    
    // Si falla con el ID, intentar con el nombre directamente
    if (error?.response?.status === 400 || error?.code === 400) {
      console.log("[mfs] [applyProcessedLabel] Intentando aplicar etiqueta usando nombre 'processed' directamente...");
      try {
        await backoff(
          () => gmail.users.messages.modify({
            userId: "me",
            id: messageId,
            requestBody: {
              addLabelIds: ["processed"],
            },
          }),
          "messages.modify.addLabel.name"
        );
        console.log("[mfs] ✓✓✓ Etiqueta 'processed' aplicada al email (usando nombre):", messageId);
      } catch (error2) {
        console.error("[mfs] [applyProcessedLabel] Error también al usar nombre:", error2?.message || error2);
        throw error2;
      }
    } else {
      throw error;
    }
  }
}

/**
 * Verifica el estado actual del rate limiting (sin incrementar)
 * Retorna { allowed: boolean, currentCount: number, limit: number, shouldSendNotification: boolean }
 */
async function checkRateLimit() {
  const RATE_LIMIT_MAX = 200; // Máximo de emails procesados
  const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000; // 30 minutos en milisegundos
  
  try {
    const state = await readRateLimitState();
    const now = new Date();
    
    let currentCount = 0;
    let windowStart = now;
    let notificationSent = false;
    
    if (state) {
      const windowAge = now.getTime() - state.windowStart.getTime();
      
      // Si la ventana ha expirado (más de 30 minutos), reiniciar contador y flag de notificación
      if (windowAge >= RATE_LIMIT_WINDOW_MS) {
        console.log("[mfs] [rateLimit] Ventana de tiempo expirada, reiniciando contador y flag de notificación");
        currentCount = 0;
        windowStart = now;
        notificationSent = false;
        // Guardar el estado reseteado
        await writeRateLimitState(0, now, false);
      } else {
        currentCount = state.count || 0;
        windowStart = state.windowStart;
        notificationSent = state.notificationSent || false;
      }
    }
    
    const allowed = currentCount < RATE_LIMIT_MAX; // Permitir si está por debajo del límite
    
    // Solo enviar notificación si:
    // 1. Se excedió el límite (allowed = false)
    // 2. Aún no se ha enviado la notificación en esta ventana (notificationSent = false)
    const shouldSendNotification = !allowed && !notificationSent;
    
    console.log("[mfs] [rateLimit] Estado actual:", {
      currentCount,
      limit: RATE_LIMIT_MAX,
      allowed,
      notificationSent,
      shouldSendNotification,
      windowStart: windowStart.toISOString(),
      windowAgeMinutes: Math.floor((now.getTime() - windowStart.getTime()) / 60000),
    });
    
    return {
      allowed,
      currentCount,
      limit: RATE_LIMIT_MAX,
      windowMinutes: 30,
      shouldSendNotification,
    };
  } catch (error) {
    console.error("[mfs] [rateLimit] Error verificando rate limit:", error?.message || error);
    // En caso de error, permitir el procesamiento pero loguear el error
    return {
      allowed: true,
      currentCount: 0,
      limit: RATE_LIMIT_MAX,
      windowMinutes: 30,
      shouldSendNotification: false,
    };
  }
}

/**
 * Incrementa el contador de rate limiting cuando se procesa exitosamente un email
 * Retorna { allowed: boolean, currentCount: number, limit: number, shouldSendNotification: boolean }
 */
async function incrementRateLimit() {
  const RATE_LIMIT_MAX = 200; // Máximo de emails procesados
  const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000; // 30 minutos en milisegundos
  
  try {
    const state = await readRateLimitState();
    const now = new Date();
    
    let currentCount = 0;
    let windowStart = now;
    let notificationSent = false;
    
    if (state) {
      const windowAge = now.getTime() - state.windowStart.getTime();
      
      // Si la ventana ha expirado (más de 30 minutos), reiniciar contador y flag de notificación
      if (windowAge >= RATE_LIMIT_WINDOW_MS) {
        console.log("[mfs] [rateLimit] Ventana de tiempo expirada, reiniciando contador y flag de notificación");
        currentCount = 0;
        windowStart = now;
        notificationSent = false;
      } else {
        currentCount = state.count || 0;
        windowStart = state.windowStart;
        notificationSent = state.notificationSent || false;
      }
    }
    
    // Incrementar el contador SOLO cuando se procesa exitosamente un email
    const newCount = currentCount + 1;
    const allowed = newCount <= RATE_LIMIT_MAX;
    
    // Solo enviar notificación si:
    // 1. Se excedió el límite (allowed = false)
    // 2. Aún no se ha enviado la notificación en esta ventana (notificationSent = false)
    const shouldSendNotification = !allowed && !notificationSent;
    
    // Si vamos a enviar notificación, marcar el flag como enviado
    if (shouldSendNotification) {
      notificationSent = true;
    }
    
    console.log("[mfs] [rateLimit] Incrementando contador:", {
      previousCount: currentCount,
      newCount,
      limit: RATE_LIMIT_MAX,
      allowed,
      notificationSent,
      shouldSendNotification,
      windowStart: windowStart.toISOString(),
      windowAgeMinutes: Math.floor((now.getTime() - windowStart.getTime()) / 60000),
    });
    
    // Actualizar el estado
    await writeRateLimitState(newCount, windowStart, notificationSent);
    
    return {
      allowed,
      currentCount: newCount,
      limit: RATE_LIMIT_MAX,
      windowMinutes: 30,
      shouldSendNotification,
    };
  } catch (error) {
    console.error("[mfs] [rateLimit] Error incrementando rate limit:", error?.message || error);
    // En caso de error, permitir el procesamiento pero loguear el error
    return {
      allowed: true,
      currentCount: 0,
      limit: RATE_LIMIT_MAX,
      windowMinutes: 30,
      shouldSendNotification: false,
    };
  }
}

/**
 * Procesa una lista de IDs de mensajes
 */
export async function processMessageIds(gmail, ids) {
  console.log("[mfs] ========================================");
  console.log("[mfs] ===== INICIANDO PROCESAMIENTO DE MENSAJES =====");
  console.log("[mfs] Número de mensajes a procesar:", ids.length);
  console.log("[mfs] Cliente Gmail disponible:", gmail ? "sí" : "no");
  
  // Verificar rate limiting ANTES de procesar (solo verificar, no incrementar)
  console.log("[mfs] [rateLimit] Verificando límite de procesamiento...");
  const rateLimitCheck = await checkRateLimit();
  
  if (!rateLimitCheck.allowed) {
    console.error("[mfs] ========================================");
    console.error("[mfs] ✗✗✗ LÍMITE DE RATE LIMITING EXCEDIDO ✗✗✗");
    console.error("[mfs] Emails solicitados:", ids.length);
    console.error("[mfs] Emails procesados (total):", rateLimitCheck.currentCount);
    console.error("[mfs] Límite máximo:", rateLimitCheck.limit);
    console.error("[mfs] Ventana de tiempo:", rateLimitCheck.windowMinutes, "minutos");
    console.error("[mfs] ========================================");
    console.error("[mfs] DETENIENDO PROCESAMIENTO PARA EVITAR BUCLES");
    console.error("[mfs] ========================================");
    
    // Enviar email de notificación SOLO si aún no se ha enviado en esta ventana
    if (rateLimitCheck.shouldSendNotification) {
      try {
        console.log("[mfs] [rateLimit] Enviando email de notificación (primera vez en esta ventana)...");
        const notificationResult = await sendRateLimitNotificationEmail(
          rateLimitCheck.currentCount,
          rateLimitCheck.limit,
          rateLimitCheck.windowMinutes
        );
        
        if (notificationResult.success) {
          console.log("[mfs] [rateLimit] ✓ Email de notificación enviado exitosamente");
        } else {
          console.error("[mfs] [rateLimit] ✗ Error enviando email de notificación:", notificationResult.error);
        }
      } catch (notificationError) {
        console.error("[mfs] [rateLimit] ✗ Excepción enviando email de notificación:", notificationError?.message || notificationError);
      }
    } else {
      console.log("[mfs] [rateLimit] Notificación ya enviada en esta ventana, omitiendo para evitar bucles");
    }
    
    // Retornar resultados vacíos indicando que se detuvo por rate limit
    return {
      exitosos: 0,
      fallidos: 0,
      saltados: ids.length,
      rateLimitExceeded: true,
      rateLimitInfo: {
        currentCount: rateLimitCheck.currentCount,
        limit: rateLimitCheck.limit,
        windowMinutes: rateLimitCheck.windowMinutes,
      },
      resultados: ids.map(id => ({
        id,
        skipped: true,
        reason: "rate_limit_exceeded",
      })),
    };
  }
  
  console.log("[mfs] [rateLimit] ✓ Límite OK, continuando con procesamiento");
  console.log("[mfs] INICIO: Procesando lote de mensajes", {
    totalMensajes: ids.length,
    ids: ids.slice(0, 5), // Mostrar primeros 5 IDs
  });
  const results = [];

  for (const id of ids) {
    let lockAcquired = false;
    // Declarar allHeaders al inicio del scope para evitar problemas de referencia
    let allHeaders = [];
    let getAllHeaders = null;

    try {
      console.log("––––––––––––––––––––––––––––––––––––––––––");
      console.log("[mfs] Empiezo a procesar mensaje:", id);

      // Lock por messageId para evitar duplicados
      // Si el lock existe pero tiene más de 10 minutos, asumimos que falló y lo liberamos
      lockAcquired = await acquireMessageLock(id);
      if (!lockAcquired) {
        // Verificar si el lock es muy antiguo (más de 10 minutos = posible fallo)
        try {
          const lockAge = await checkLockAge(id);
          if (lockAge !== null && lockAge > 600000) { // 10 minutos en ms
            console.warn(`[mfs] Lock antiguo detectado (${Math.round(lockAge/1000)}s), liberando y reprocesando:`, id);
            await releaseMessageLock(id);
            lockAcquired = await acquireMessageLock(id);
          }
        } catch (e) {
          console.warn("[mfs] Error verificando edad del lock:", e.message);
        }
        
        if (!lockAcquired) {
          console.log(
            "[mfs] Mensaje saltado porque otra instancia ya lo está tratando:",
            id
          );
          results.push({ id, success: false, skipped: true, reason: "lock_exists" });
          continue;
        }
      }

      let msg;
      try {
        msg = await backoff(
          () => gmail.users.messages.get({ userId: "me", id, format: "full" }),
          "messages.get"
        );
      } catch (e) {
        const code = e?.response?.status || e?.code || e?.status;
        if (String(code) === "404") {
          console.warn(
            "[mfs] Gmail devolvió 404 para este mensaje, lo salto:",
            id
          );
          continue;
        }
        logErr("[mfs] Error al leer mensaje de Gmail:", e);
        continue;
      }

      const msgLabelIds = msg.data.labelIds || [];
      if (!msgLabelIds.includes("INBOX")) {
        console.log(
          "[mfs] Mensaje no está en INBOX, lo ignoro:",
          id,
          msgLabelIds
        );
        await releaseMessageLock(id);
        continue;
      }

      // Verificar si el email ya tiene la etiqueta "processed" - si la tiene, saltarlo
      try {
        const hasProcessedLabel = await checkProcessedLabel(gmail, msgLabelIds);
        if (hasProcessedLabel) {
          console.log(
            "[mfs] Mensaje ya tiene etiqueta 'processed', saltando procesamiento:",
            id
          );
          results.push({
            id,
            airtableId: null,
            intent: null,
            confidence: null,
            skipped: true,
            reason: "already_processed",
          });
          await releaseMessageLock(id);
          continue;
        } else {
          console.log("[mfs] Mensaje NO tiene etiqueta 'processed', continuando con procesamiento:", id);
        }
      } catch (labelCheckError) {
        console.warn("[mfs] Error verificando etiqueta 'processed', continuando con procesamiento:", id, labelCheckError?.message || labelCheckError);
        // Si hay error verificando la etiqueta, continuar procesando (no bloquear por error)
      }

      // Obtener headers básicos para verificar si es un email enviado por nosotros o de test
      const basicHeaders = msg.data.payload?.headers || [];
      const fromHeaderBasic = basicHeaders.find(h => h.name?.toLowerCase() === "from")?.value || "";
      const subjectHeaderBasic = basicHeaders.find(h => h.name?.toLowerCase() === "subject")?.value || "";
      
      // Filtrar emails enviados desde secretmedia@feverup.com para evitar bucles
      if (fromHeaderBasic && fromHeaderBasic.toLowerCase().includes("secretmedia@feverup.com")) {
        console.log(
          "[mfs] Mensaje ignorado: es un email enviado desde secretmedia@feverup.com (evitando bucle):",
          id
        );
        await releaseMessageLock(id);
        continue;
      }
      
      // Filtrar emails con subject "test" (case insensitive) para evitar bucles
      if (subjectHeaderBasic && subjectHeaderBasic.toLowerCase().trim() === "test") {
        console.log(
          "[mfs] Mensaje ignorado: tiene subject 'test' (evitando bucle):",
          id
        );
        await releaseMessageLock(id);
        continue;
      }
      
      // Filtrar emails que vengan de jongarnicaizco@gmail.com para evitar bucles
      if (fromHeaderBasic && fromHeaderBasic.toLowerCase().includes("jongarnicaizco@gmail.com")) {
        console.log(
          "[mfs] Mensaje ignorado: es un email de jongarnicaizco@gmail.com (evitando bucle):",
          id
        );
        await releaseMessageLock(id);
        continue;
      }

      // No verificamos duplicados, procesamos todos los emails
      console.log("[mfs] Procesando mensaje:", id);

      // Función helper para buscar headers en todas las partes del mensaje
      getAllHeaders = (payload) => {
        const headersArray = [];
        
        // Headers del payload principal
        if (payload && payload.headers && Array.isArray(payload.headers)) {
          headersArray.push(...payload.headers);
        }
        
        // Buscar headers en partes anidadas (para mensajes multipart)
        const searchParts = (parts) => {
          if (!parts || !Array.isArray(parts)) return;
          for (const part of parts) {
            if (part && part.headers && Array.isArray(part.headers)) {
              headersArray.push(...part.headers);
            }
            if (part && part.parts) {
              searchParts(part.parts);
            }
          }
        };
        
        if (payload && payload.parts) {
          searchParts(payload.parts);
        }
        
        return headersArray;
      };
      
      // Obtener todos los headers del mensaje
      if (msg && msg.data && msg.data.payload) {
        allHeaders = getAllHeaders(msg.data.payload);
      } else {
        console.error("[mfs] ERROR: msg.data.payload no está disponible");
        allHeaders = [];
      }
      
      // Log completo de headers RAW para diagnóstico
      console.log("[mfs] ===== HEADERS RAW DEL EMAIL =====");
      console.log("[mfs] Total headers encontrados:", allHeaders.length);
      console.log("[mfs] Headers disponibles:", allHeaders.map(h => h.name).join(", "));
      console.log("[mfs] Array completo:", JSON.stringify(allHeaders.map(h => ({ 
        name: h.name, 
        value: h.value?.substring(0, 150) 
      })), null, 2));

      // Función para buscar header específico (case-insensitive)
      const findHeader = (headerName) => {
        const lowerName = headerName.toLowerCase();
        for (const h of allHeaders) {
          if (h && h.name && h.name.toLowerCase() === lowerName) {
            return h.value || "";
          }
        }
        return "";
      };
      
      // Extraer FROM: debe ser el remitente (quien envía el email)
      let fromHeader = findHeader("From");
      
      if (!fromHeader) {
        console.error("[mfs] ERROR: No se encontró header 'From' en el email");
        console.error("[mfs] Headers disponibles:", allHeaders.map(h => h.name).join(", "));
      } else {
        console.log("[mfs] ✓ Header 'From' encontrado:", fromHeader.substring(0, 100));
      }
      
      // Extraer TO: debe ser el destinatario (a quién se envía el email)
      // Prioridad: To > Delivered-To > Envelope-To > X-Original-To
      let toHeader = findHeader("To");
      
      if (!toHeader) {
        toHeader = findHeader("Delivered-To");
        if (toHeader) console.log("[mfs] ✓ Usando 'Delivered-To':", toHeader.substring(0, 100));
      }
      
      if (!toHeader) {
        toHeader = findHeader("Envelope-To");
        if (toHeader) console.log("[mfs] ✓ Usando 'Envelope-To':", toHeader.substring(0, 100));
      }
      
      if (!toHeader) {
        toHeader = findHeader("X-Original-To");
        if (toHeader) console.log("[mfs] ✓ Usando 'X-Original-To':", toHeader.substring(0, 100));
      }
      
      // Si aún no hay "to", usar el email de Gmail configurado como último recurso
      if (!toHeader && process.env.GMAIL_ADDRESS) {
        console.warn("[mfs] ADVERTENCIA: No se encontró header 'to', usando GMAIL_ADDRESS como fallback");
        toHeader = process.env.GMAIL_ADDRESS;
      }
      
      const subject = findHeader("Subject") || "";
      const cc = findHeader("CC") || "";
      const bcc = findHeader("BCC") || findHeader("Bcc") || "";
      // Buscar Reply-To (findHeader ya es case-insensitive)
      const replyTo = findHeader("Reply-To") || "";
      
      // Detectar si es una respuesta (reply)
      // Verificar: subject con "Re:" o "RE:" o "Fwd:" o "FWD:", In-Reply-To header, o threadId
      const inReplyTo = findHeader("In-Reply-To") || "";
      const threadId = msg.data.threadId || null;
      const isReply = 
        /^(Re|RE|Fwd|FWD|Fw|FW):\s*/i.test(subject) || 
        !!inReplyTo || 
        (threadId && threadId !== id); // Si threadId existe y es diferente del messageId, es parte de un thread
      
      console.log("[mfs] ===== DETECCIÓN DE RESPUESTA =====");
      console.log("[mfs] Subject:", subject);
      console.log("[mfs] In-Reply-To:", inReplyTo ? "SÍ" : "NO");
      console.log("[mfs] Thread ID:", threadId);
      console.log("[mfs] Message ID:", id);
      console.log("[mfs] ¿Es respuesta?:", isReply);
      
      // Log para debug
      console.log("[mfs] ===== BÚSQUEDA DE REPLY-TO =====");
      console.log("[mfs] Reply-To encontrado:", replyTo ? "SÍ" : "NO");
      if (replyTo) {
        console.log("[mfs] Reply-To valor:", replyTo);
      } else {
        // Listar todos los headers disponibles para debug
        const replyHeaders = allHeaders.filter(h => h.name && h.name.toLowerCase().includes("reply"));
        console.log("[mfs] Headers disponibles que contienen 'reply':", 
          replyHeaders.length > 0 ? replyHeaders.map(h => `${h.name}=${h.value?.substring(0, 50)}`).join(", ") : "NINGUNO");
      }
      
      // Buscar headers de mailing list que puedan contener el email del destinatario
      const listId = findHeader("List-Id") || "";
      const listPost = findHeader("List-Post") || "";
      const listUnsubscribe = findHeader("List-Unsubscribe") || "";
      const xGoogleOriginalTo = findHeader("X-Google-Original-To") || "";
      const xOriginalTo = findHeader("X-Original-To") || "";
      
      // Función helper para convertir formato "ciudad.dominio.com" a "ciudad@dominio.com"
      const convertMailingListToEmail = (text) => {
        if (!text) return "";
        
        // Primero buscar emails completos (formato estándar)
        const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@secretmedianetwork\.com|[a-zA-Z0-9._%+-]+@feverup\.com|[a-zA-Z0-9._%+-]+@secretldn\.com)/i);
        if (emailMatch) {
          return emailMatch[1].toLowerCase();
        }
        
        // Si no hay email completo, buscar formato "ciudad.secretmedianetwork.com" o "ciudad.feverup.com" o "ciudad.secretldn.com"
        // y convertirlo a "ciudad@secretmedianetwork.com"
        const domainPatterns = [
          { pattern: /([a-zA-Z0-9._-]+)\.secretmedianetwork\.com/i, replacement: (match, ciudad) => `${ciudad}@secretmedianetwork.com` },
          { pattern: /([a-zA-Z0-9._-]+)\.feverup\.com/i, replacement: (match, ciudad) => `${ciudad}@feverup.com` },
          { pattern: /([a-zA-Z0-9._-]+)\.secretldn\.com/i, replacement: (match, ciudad) => `${ciudad}@secretldn.com` },
        ];
        
        for (const { pattern, replacement } of domainPatterns) {
          const match = text.match(pattern);
          if (match) {
            const email = replacement(match, match[1]).toLowerCase();
            console.log("[mfs] Convertido mailing list de formato 'ciudad.dominio.com' a email:", email);
            return email;
          }
        }
        
        return "";
      };
      
      // Extraer email de mailing list de estos headers si están disponibles
      let mailingListEmail = "";
      if (listId) {
        mailingListEmail = convertMailingListToEmail(listId);
        if (mailingListEmail) {
          console.log("[mfs] Email de mailing list encontrado en List-Id:", mailingListEmail);
        }
      }
      if (!mailingListEmail && listPost) {
        mailingListEmail = convertMailingListToEmail(listPost);
        if (mailingListEmail) {
          console.log("[mfs] Email de mailing list encontrado en List-Post:", mailingListEmail);
        }
      }
      if (!mailingListEmail && (xGoogleOriginalTo || xOriginalTo)) {
        const originalTo = xGoogleOriginalTo || xOriginalTo;
        mailingListEmail = convertMailingListToEmail(originalTo);
        if (mailingListEmail) {
          console.log("[mfs] Email de mailing list encontrado en X-Google-Original-To/X-Original-To:", mailingListEmail);
        }
      }
      
      const body = bodyFromMessage(msg.data);
      
      // Log de headers extraídos para diagnóstico
      console.log("[mfs] ===== HEADERS EXTRAÍDOS =====");
      console.log("[mfs] fromHeader (RAW):", JSON.stringify(fromHeader));
      console.log("[mfs] toHeader (RAW):", JSON.stringify(toHeader));
      console.log("[mfs] ccHeader (RAW):", JSON.stringify(cc));
      console.log("[mfs] subject (RAW):", JSON.stringify(subject.substring(0, 100)));
      
      // Extraer email FROM (remitente) - debe ser DISTINTO a secretmedianetwork.com o feverup.com
      // Si el From tiene uno de esos dominios, busca en Reply-To, CC, BCC
      // Log para debug
      console.log("[mfs] ===== EXTRACCIÓN DE FROM =====");
      console.log("[mfs] ANTES de llamar a extractFromEmail");
      console.log("[mfs] fromHeader (RAW):", JSON.stringify(fromHeader));
      console.log("[mfs] replyTo (RAW):", JSON.stringify(replyTo));
      console.log("[mfs] cc (RAW):", JSON.stringify(cc));
      console.log("[mfs] bcc (RAW):", JSON.stringify(bcc));
      
      console.log("[mfs] LLAMANDO a extractFromEmail ahora...");
      const fromEmailRaw = extractFromEmail(fromHeader, cc, bcc, replyTo);
      console.log("[mfs] extractFromEmail RETORNÓ:", JSON.stringify(fromEmailRaw));
      const from = String(fromEmailRaw || "").trim().toLowerCase();
      
      console.log("[mfs] fromEmailRaw resultado:", JSON.stringify(fromEmailRaw));
      console.log("[mfs] from final:", JSON.stringify(from));
      
      // Extraer email TO (destinatario) - debe ser secretmedianetwork.com o feverup.com
      // Si el To no tiene uno de esos dominios, busca en mailing list, CC, BCC, Reply-To
      // Log para debug
      console.log("[mfs] ===== EXTRACCIÓN DE TO =====");
      console.log("[mfs] toHeader (RAW):", JSON.stringify(toHeader));
      console.log("[mfs] bcc (RAW):", JSON.stringify(bcc));
      console.log("[mfs] cc (RAW):", JSON.stringify(cc));
      console.log("[mfs] replyTo (RAW):", JSON.stringify(replyTo));
      console.log("[mfs] mailingListEmail:", JSON.stringify(mailingListEmail));
      
      const toEmailRaw = extractToEmail(toHeader || "", cc || "", bcc || "", replyTo || "", mailingListEmail || "");
      let to = String(toEmailRaw || "").trim().toLowerCase();
      
      console.log("[mfs] toEmailRaw resultado:", JSON.stringify(toEmailRaw));
      console.log("[mfs] to final (antes de corrección):", JSON.stringify(to));
      
      // CORRECCIÓN CRÍTICA: Si el toHeader tiene un email válido, usarlo directamente
      // Esto evita que extractToEmail busque en otros campos y encuentre el mismo email que from
      if (toHeader && toHeader.trim()) {
        const toHeaderEmail = extractCleanEmail(toHeader);
        if (toHeaderEmail && toHeaderEmail.trim() !== "") {
          // Si extractToEmail retornó algo diferente o si from y to son iguales, usar toHeader
          if (toHeaderEmail !== to || (from && from === to)) {
            console.log("[mfs] CORRECCIÓN: Usando email del toHeader directamente");
            console.log("[mfs]   toHeader email:", toHeaderEmail);
            console.log("[mfs]   extractToEmail retornó:", to);
            console.log("[mfs]   from actual:", from);
            console.log("[mfs]   from === to?", from === to);
            to = toHeaderEmail.toLowerCase();
            console.log("[mfs]   to corregido:", to);
          }
        }
      }
      
      console.log("[mfs] to final (después de corrección):", JSON.stringify(to));
      
      // Log de emails extraídos
      console.log("[mfs] ===== EMAILS EXTRAÍDOS =====");
      console.log("[mfs] from (limpio):", JSON.stringify(from));
      console.log("[mfs] to (limpio):", JSON.stringify(to));
      console.log("[mfs] from length:", from.length);
      console.log("[mfs] to length:", to.length);
      console.log("[mfs] from !== to?", from !== to);
      console.log("[mfs] from es válido?", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from));
      console.log("[mfs] to es válido?", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to));
      
      // Validación crítica: asegurar que from y to son diferentes y no están vacíos
      if (!from) {
        console.error("[mfs] ERROR CRÍTICO: No se pudo extraer email del remitente (from)", {
          fromHeader,
        });
      }
      if (!to) {
        console.error("[mfs] ERROR CRÍTICO: No se pudo extraer email del destinatario (to)", {
          toHeader,
        });
      }
      
      // Extraer nombre del remitente
      let senderName = extractSenderName(fromHeader);
      
      // Si el nombre extraído tiene problemas (comillas, caracteres extra, etc.), usar IA
      if (senderName && (senderName.includes('"') || senderName.includes("'") || senderName.includes("`") || 
          /[<>{}|\\]/.test(senderName) || senderName.length > 100)) {
        console.log("[mfs] Nombre extraído tiene problemas, intentando con IA:", senderName);
        const aiName = await extractSenderNameWithAI(fromHeader, callModelText);
        if (aiName && aiName.length > 0) {
          console.log("[mfs] IA extrajo nombre limpio:", aiName);
          senderName = aiName;
        } else {
          console.warn("[mfs] IA no pudo extraer nombre mejor, usando el extraído básico");
        }
      }
      
      // Extraer primer nombre del nombre limpio usando IA para determinar si es empresa o persona
      const senderFirstName = await extractFirstName(senderName, callModelText);
      
      // Detectar idioma
      const language = detectLanguage(subject + " " + body);
      
      // Obtener ubicación basada en el email To
      const location = getLocationFromEmail(toHeader);
      
      // Log detallado de extracción
      console.log("[mfs] Datos extraídos del email:", {
        fromHeader: fromHeader.slice(0, 100),
        toHeader: toHeader.slice(0, 100),
        from: from,
        to: to,
        senderName: senderName || "(vacío)",
        senderFirstName: senderFirstName || "(vacío)",
        language: language || "(no detectado)",
        location: location ? `${location.city}, ${location.country} (${location.countryCode})` : "(no encontrada)",
      });
      
      // Verificación crítica: si from y to son iguales, buscar en BCC/mailing list primero
      if (from === to && from) {
        console.error("[mfs] ===== ERROR CRÍTICO: from y to son iguales =====");
        console.error("[mfs] from:", JSON.stringify(from));
        console.error("[mfs] to:", JSON.stringify(to));
        console.error("[mfs] fromHeader original:", JSON.stringify(fromHeader));
        console.error("[mfs] toHeader original:", JSON.stringify(toHeader));
        console.error("[mfs] bcc:", JSON.stringify(bcc));
        console.error("[mfs] mailingListEmail:", JSON.stringify(mailingListEmail));
        console.error("[mfs] emailId:", id);
        
        // INTENTO 1: Usar mailing list si tiene dominio válido
        if (mailingListEmail && mailingListEmail.trim()) {
          const mailingListEmailClean = extractCleanEmail(mailingListEmail);
          if (mailingListEmailClean && mailingListEmailClean.toLowerCase() !== from) {
            const VALID_DOMAINS = ["secretmedianetwork.com", "feverup.com", "secretldn.com"];
            const domain = mailingListEmailClean.split("@")[1];
            if (domain && VALID_DOMAINS.includes(domain)) {
              console.warn("[mfs] CORRECCIÓN 1: Usando mailing list porque from y to eran iguales", {
                originalTo: to,
                correctedTo: mailingListEmailClean,
              });
              to = mailingListEmailClean.toLowerCase();
            }
          }
        }
        
        // INTENTO 2: Si aún son iguales, usar BCC si tiene dominio válido
        if (from === to && bcc && bcc.trim()) {
          const bccEmails = extractAllEmails(bcc);
          const VALID_DOMAINS = ["secretmedianetwork.com", "feverup.com", "secretldn.com"];
          for (const bccEmail of bccEmails) {
            const domain = bccEmail.split("@")[1];
            if (domain && VALID_DOMAINS.includes(domain) && bccEmail.toLowerCase() !== from) {
              console.warn("[mfs] CORRECCIÓN 2: Usando BCC porque from y to eran iguales", {
                originalTo: to,
                correctedTo: bccEmail,
              });
              to = bccEmail.toLowerCase();
              break;
            }
          }
        }
        
        // INTENTO 3: Si aún son iguales, usar CC si tiene dominio válido
        if (from === to && cc && cc.trim()) {
          const ccEmails = extractAllEmails(cc);
          const VALID_DOMAINS = ["secretmedianetwork.com", "feverup.com", "secretldn.com"];
          for (const ccEmail of ccEmails) {
            const domain = ccEmail.split("@")[1];
            if (domain && VALID_DOMAINS.includes(domain) && ccEmail.toLowerCase() !== from) {
              console.warn("[mfs] CORRECCIÓN 3: Usando CC porque from y to eran iguales", {
                originalTo: to,
                correctedTo: ccEmail,
              });
              to = ccEmail.toLowerCase();
              break;
            }
          }
        }
        
        // INTENTO 4: Si aún son iguales, usar el email del toHeader directamente si es diferente a from
        if (from === to && toHeader && toHeader.trim()) {
          const toHeaderEmail = extractCleanEmail(toHeader);
          if (toHeaderEmail && toHeaderEmail.toLowerCase() !== from) {
            console.warn("[mfs] CORRECCIÓN 4: Usando email del toHeader directamente", {
              originalTo: to,
              correctedTo: toHeaderEmail,
            });
            to = toHeaderEmail.toLowerCase();
          }
        }
        
        // INTENTO 5: Si aún son iguales, usar el email de Gmail configurado como "to" (último recurso)
        if (from === to && process.env.GMAIL_ADDRESS) {
          const correctedTo = extractCleanEmail(process.env.GMAIL_ADDRESS);
          if (correctedTo && correctedTo !== from) {
            console.warn("[mfs] CORRECCIÓN 5: Usando GMAIL_ADDRESS como 'to' (último recurso)", {
              originalTo: to,
              correctedTo: correctedTo,
            });
            to = correctedTo;
          } else {
            console.error("[mfs] ERROR: No se puede corregir 'to' porque GMAIL_ADDRESS también coincide con 'from'");
          }
        }
        
        // Si después de las correcciones aún son iguales, loguear pero continuar
        if (from === to) {
          console.error("[mfs] ERROR: No se pudo corregir 'to'. from y to siguen siendo iguales.");
          console.error("[mfs] Este email se procesará pero puede tener problemas.");
          // NO retornar aquí, dejar que el código continúe para que se loguee el error completo
        }
      }
      
      // Validación final: asegurar que from y to son diferentes antes de continuar
      if (!from || !to) {
        console.error("[mfs] ERROR: from o to están vacíos, no se puede procesar", {
          from: from || "(vacío)",
          to: to || "(vacío)",
          emailId: id,
        });
      }
      
      // Extraer timestamp del mensaje (internalDate está en milisegundos)
      const internalDate = msg.data.internalDate;
      const timestamp = internalDate 
        ? new Date(parseInt(internalDate, 10)).toISOString()
        : new Date().toISOString(); // Fallback a fecha actual si no hay internalDate

      console.log("[mfs] Mensaje listo para clasificar:", {
        id,
        from,
        to,
        subject: subject.slice(0, 120),
        senderName: senderName || "(no extraído)",
        senderFirstName: senderFirstName || "(no extraído)",
        language: language || "(no detectado)",
        location: location ? `${location.city}, ${location.country}` : "(no encontrada)",
      });

      // Guardar en GCS
      // Asegurar que allHeaders está definido y es un array antes de usarlo
      if (!allHeaders || !Array.isArray(allHeaders)) {
        console.error("[mfs] ERROR CRÍTICO: allHeaders no está definido o no es un array");
        console.error("[mfs] allHeaders type:", typeof allHeaders);
        console.error("[mfs] allHeaders value:", allHeaders);
        // Re-obtener headers como fallback
        try {
          if (msg && msg.data && msg.data.payload && getAllHeaders) {
            const fallbackHeaders = getAllHeaders(msg.data.payload);
            console.log("[mfs] Re-obteniendo headers como fallback, encontrados:", fallbackHeaders.length);
            allHeaders = fallbackHeaders;
          } else {
            console.error("[mfs] No se puede re-obtener headers: msg o getAllHeaders no disponible");
            allHeaders = []; // Array vacío como último recurso
          }
        } catch (e) {
          console.error("[mfs] ERROR: No se pudo re-obtener headers:", e.message);
          allHeaders = []; // Array vacío como último recurso
        }
      }
      
      // Validación final antes de usar allHeaders
      if (!Array.isArray(allHeaders)) {
        console.error("[mfs] ERROR: allHeaders no es un array después de todos los intentos, usando array vacío");
        allHeaders = [];
      }
      
      const baseName = `${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}_${id}`;

      await saveToGCS(
        `${baseName}_meta.json`,
        JSON.stringify({ headers: allHeaders }, null, 2),
        "application/json"
      );

      await saveToGCS(`${baseName}_body.txt`, body, "text/plain");

      // Clasificar el lead
      const {
        intent,
        confidence,
        reasoning,
        meddicMetrics,
        meddicEconomicBuyer,
        meddicDecisionCriteria,
        meddicDecisionProcess,
        meddicIdentifyPain,
        meddicChampion,
        isFreeCoverage,
        isBarter,
        isPricing,
      } = await classifyIntent({
        subject,
        from,
        to,
        body,
      });

      // REGLA ESPECIAL: Para emails recibidos en secretmedia@feverup.com
      // - Si es una RESPUESTA (reply) → Medium automáticamente
      // - Si NO es respuesta → pasar por la lógica normal de clasificación (no forzar Medium)
      const toEmailLower = (to || "").toLowerCase().trim();
      const isSecretMediaEmail = toEmailLower.includes("secretmedia@feverup.com");
      
      let finalIntent = intent;
      let finalConfidence = confidence;
      let finalReasoning = reasoning;
      
      if (isSecretMediaEmail) {
        if (isReply) {
          // Si es una respuesta, forzar Medium automáticamente
          console.log("[mfs] ===== APLICANDO REGLA: Email RESPUESTA a secretmedia@feverup.com =====");
          console.log("[mfs] Intent original:", finalIntent);
          console.log("[mfs] Forzando a Medium (es una respuesta)");
          finalIntent = "Medium";
          finalConfidence = Math.max(finalConfidence || 0.75, 0.75);
          if (!finalReasoning || finalReasoning.length === 0) {
            finalReasoning = "Email is a reply to secretmedia@feverup.com, automatically classified as Medium intent.";
          } else {
            finalReasoning = finalReasoning + " Email is a reply to secretmedia@feverup.com, automatically classified as Medium intent.";
          }
        } else {
          // Si NO es respuesta, pasar por la lógica normal (no forzar Medium)
          console.log("[mfs] Email a secretmedia@feverup.com (NO es respuesta), usando clasificación normal:", finalIntent);
        }
      }

      // Generar resumen del body con Gemini
      const bodySummary = await generateBodySummary(body);
      console.log("[mfs] Resumen del body generado:", {
        hasSummary: !!bodySummary,
        summaryLength: bodySummary?.length || 0,
        preview: bodySummary?.slice(0, 100) || "(vacío)",
      });

      // Log final antes de crear en Airtable
      console.log("[mfs] ===== VALORES FINALES PARA AIRTABLE =====");
      console.log("[mfs] from (final):", JSON.stringify(from));
      console.log("[mfs] to (final):", JSON.stringify(to));
      console.log("[mfs] from !== to?", from !== to);
      console.log("[mfs] Email ID:", id);

      console.log("[mfs] ===== CONTINUANDO CON VERIFICACIÓN DE DUPLICADOS =====");

      // Verificar si ya existe en Airtable (evitar duplicados)
      const existingRecord = await airtableFindByEmailId(id);
      if (existingRecord) {
        console.log("[mfs] Email ya existe en Airtable, saltando creación:", {
          emailId: id,
          airtableId: existingRecord.id,
        });
        
        // Aplicar etiqueta "processed" incluso si ya existe en Airtable
        try {
          await applyProcessedLabel(gmail, id);
        } catch (labelError) {
          console.warn("[mfs] No se pudo aplicar etiqueta 'processed' al email existente:", id, labelError?.message || labelError);
        }
        
        results.push({
          id,
          airtableId: existingRecord.id,
          intent,
          confidence,
          skipped: true,
        });
        await releaseMessageLock(id);
        continue;
      }

      // Si es un registro nuevo, enviar emails según el tipo detectado
      // IMPORTANTE: Estos emails se envían SOLO a jongarnicaizco@gmail.com (TEST), NO al cliente
      console.log("[mfs] ===== REGISTRO NUEVO DETECTADO - VERIFICANDO TIPO DE EMAIL =====");
      console.log("[mfs] Email ID:", id);
      console.log("[mfs] From:", from);
      console.log("[mfs] To:", to);
      console.log("[mfs] Subject:", subject);
      console.log("[mfs] isBarter:", isBarter);
      console.log("[mfs] isFreeCoverage:", isFreeCoverage);
      
      // Extraer brandName del from email o subject como fallback
      const brandName = senderName || from.split("@")[0] || subject.split(" ")[0] || "Client";
      
      // Enviar email de barter si se detectó barter request
      if (isBarter) {
        console.log("[mfs] ===== DETECTADO BARTER REQUEST - ENVIANDO EMAIL BARTER (TEST) =====");
        try {
          const barterResult = await sendBarterEmail(id, senderFirstName || "Client", brandName, subject);
          if (barterResult.success) {
            console.log("[mfs] ✓✓✓ Email BARTER (TEST) enviado exitosamente a jongarnicaizco@gmail.com ✓✓✓");
            console.log("[mfs] Message ID:", barterResult.messageId);
          } else {
            console.error("[mfs] ✗ Error enviando email BARTER (TEST):", barterResult.error);
          }
        } catch (barterError) {
          console.error("[mfs] ✗ Excepción enviando email BARTER (TEST):", barterError?.message || barterError);
        }
      }
      
      // Enviar email de free coverage si se detectó free coverage request
      if (isFreeCoverage) {
        console.log("[mfs] ===== DETECTADO FREE COVERAGE REQUEST - ENVIANDO EMAIL FREE COVERAGE (TEST) =====");
        try {
          const freeCoverageResult = await sendFreeCoverageEmail(id, senderFirstName || "Client", brandName, subject);
          if (freeCoverageResult.success) {
            console.log("[mfs] ✓✓✓ Email FREE COVERAGE (TEST) enviado exitosamente a jongarnicaizco@gmail.com ✓✓✓");
            console.log("[mfs] Message ID:", freeCoverageResult.messageId);
          } else {
            console.error("[mfs] ✗ Error enviando email FREE COVERAGE (TEST):", freeCoverageResult.error);
          }
        } catch (freeCoverageError) {
          console.error("[mfs] ✗ Excepción enviando email FREE COVERAGE (TEST):", freeCoverageError?.message || freeCoverageError);
        }
      }
      
      // Si NO es barter ni free coverage, NO enviar email TEST genérico
      if (!isBarter && !isFreeCoverage) {
        console.log("[mfs] ===== NO ES BARTER NI FREE COVERAGE - NO SE ENVÍA EMAIL TEST GENÉRICO =====");
        console.log("[mfs] Continuando con creación en Airtable sin enviar email TEST");
      }

      // Crear registro en Airtable
      const airtableRecord = await createAirtableRecord({
        id,
        from,
        to,
        cc,
        subject,
        body,
        bodySummary,
        timestamp,
        intent: finalIntent,
        confidence: finalConfidence,
        reasoning: finalReasoning,
        meddicMetrics,
        meddicEconomicBuyer,
        meddicDecisionCriteria,
        meddicDecisionProcess,
        meddicIdentifyPain,
        meddicChampion,
        isFreeCoverage,
        isBarter,
        isPricing,
        senderName,
        senderFirstName,
        language,
        location,
      });

      if (airtableRecord?.id) {
        console.log("[mfs] ✓ Registro creado en Airtable:", {
          emailId: id,
          airtableId: airtableRecord.id,
          intent,
        });
      } else {
        console.error("[mfs] ✗ Error: No se pudo crear registro en Airtable", {
          emailId: id,
          intent,
        });
      }

      results.push({
        id,
        airtableId: airtableRecord?.id || null,
        intent: finalIntent,
        confidence: finalConfidence,
      });

      console.log("[mfs] Fin de procesado para mensaje:", {
        id,
        airtableId: airtableRecord?.id || null,
        intent: finalIntent,
        confidence: finalConfidence,
        isSecretMediaEmail,
      });

      // Aplicar etiqueta "processed" al email procesado
      // IMPORTANTE: Esto debe ejecutarse SIEMPRE, incluso si hay errores en Airtable
      console.log("[mfs] ===== APLICANDO ETIQUETA 'processed' =====");
      console.log("[mfs] Email ID:", id);
      console.log("[mfs] isSecretMediaEmail:", isSecretMediaEmail);
      console.log("[mfs] Cliente Gmail usado:", gmail ? "disponible" : "no disponible");
      
      try {
        await applyProcessedLabel(gmail, id);
        console.log("[mfs] ✓✓✓ Etiqueta 'processed' aplicada exitosamente ✓✓✓");
        
        // IMPORTANTE: Incrementar el contador de rate limiting SOLO cuando se procesa exitosamente un email
        // (se creó en Airtable Y se aplicó la etiqueta "processed")
        console.log("[mfs] [rateLimit] Incrementando contador por email procesado exitosamente");
        const rateLimitUpdate = await incrementRateLimit();
        
        // Si se excedió el límite después de incrementar, enviar notificación
        if (!rateLimitUpdate.allowed && rateLimitUpdate.shouldSendNotification) {
          try {
            console.log("[mfs] [rateLimit] Límite excedido después de procesar email, enviando notificación...");
            const notificationResult = await sendRateLimitNotificationEmail(
              rateLimitUpdate.currentCount,
              rateLimitUpdate.limit,
              rateLimitUpdate.windowMinutes
            );
            
            if (notificationResult.success) {
              console.log("[mfs] [rateLimit] ✓ Email de notificación enviado exitosamente");
            } else {
              console.error("[mfs] [rateLimit] ✗ Error enviando email de notificación:", notificationResult.error);
            }
          } catch (notificationError) {
            console.error("[mfs] [rateLimit] ✗ Excepción enviando email de notificación:", notificationError?.message || notificationError);
          }
        }
      } catch (labelError) {
        console.error("[mfs] ✗✗✗ ERROR aplicando etiqueta 'processed' ✗✗✗");
        console.error("[mfs] Email ID:", id);
        console.error("[mfs] Error message:", labelError?.message || labelError);
        console.error("[mfs] Error code:", labelError?.code || labelError?.response?.status || "unknown");
        console.error("[mfs] Error details:", JSON.stringify({
          error: labelError?.response?.data?.error || labelError?.error || "unknown",
          errorDescription: labelError?.response?.data?.error_description || labelError?.error_description || "unknown",
          status: labelError?.response?.status || labelError?.status || "unknown",
        }, null, 2));
        console.error("[mfs] Stack trace:", labelError?.stack);
        // No fallar el procesamiento si no se puede aplicar la etiqueta, pero loguear el error
        // NO incrementar el contador si no se pudo aplicar la etiqueta
      }

      // Pequeño delay para evitar picos
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.error("[mfs] ✗ ERROR procesando mensaje:", id);
      logErr("[mfs] Error en el bucle de processMessageIds:", e);
      console.error("[mfs] Stack trace:", e?.stack);
    } finally {
      if (lockAcquired) {
        await releaseMessageLock(id);
      }
    }
  }

  console.log("[mfs] ========================================");
  console.log("[mfs] FIN: Resumen del lote procesado", {
    totalProcesados: results.length,
    exitosos: results.filter(r => r.airtableId && !r.skipped).length,
    fallidos: results.filter(r => !r.airtableId && !r.skipped).length,
    saltados: results.filter(r => r.skipped).length,
    resultados: results.map(r => ({
      id: r.id,
      intent: r.intent,
      airtableId: r.airtableId,
      skipped: r.skipped || false,
    })),
  });
  return results;
}


