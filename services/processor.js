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
  detectLanguage,
  getLocationFromEmail,
} from "../utils/helpers.js";

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

// Eliminadas todas las operaciones de storage para minimizar costes
import { classifyIntent } from "./vertex.js";
import { createAirtableRecord } from "./airtable.js";
import { sendBarterEmail, sendFreeCoverageEmail, sendRateLimitNotificationEmail } from "./email-sender.js";

// Función para resetear el contador de rate limit (llamada desde index.js cuando se activa el servicio)
export function resetRateLimitCounter() {
  rateLimitCount = 0;
  rateLimitWindowStart = Date.now();
  rateLimitNotificationSent = false;
  console.log(`[mfs] ✓ Contador de rate limit reseteado`);
}

// Cache del label ID por cuenta (usando el objeto gmail como clave)
// Esto permite que cada cuenta (principal y SENDER) tenga su propio cache
const processedLabelIdCache = new WeakMap();

async function getProcessedLabelId(gmail) {
  // Verificar si ya tenemos el label ID cacheado para esta cuenta
  if (processedLabelIdCache.has(gmail)) {
    return processedLabelIdCache.get(gmail);
  }
  
  try {
    const labelsResponse = await gmail.users.labels.list({ userId: "me" });
    const labels = labelsResponse.data.labels || [];
    const processedLabel = labels.find(label => label.name?.toLowerCase() === "processed");
    if (processedLabel) {
      const labelId = processedLabel.id;
      processedLabelIdCache.set(gmail, labelId);
      console.log(`[mfs] Label "processed" encontrado con ID: ${labelId}`);
      return labelId;
    }
    // Si no se encuentra, usar el nombre como fallback
    console.warn(`[mfs] Label "processed" no encontrado, usando nombre como fallback`);
    processedLabelIdCache.set(gmail, "processed");
    return "processed";
  } catch (error) {
    console.error(`[mfs] Error obteniendo label ID:`, error?.message || error);
    // Fallback al nombre del label
    processedLabelIdCache.set(gmail, "processed");
    return "processed";
  }
}

async function checkProcessedLabel(gmail, labelIds) {
  if (!labelIds || labelIds.length === 0) return false;
  // Verificar directamente en labelIds
  if (labelIds.includes("processed")) return true;
  // También verificar si el label ID cacheado está en la lista
  const cachedLabelId = processedLabelIdCache.get(gmail);
  if (cachedLabelId && labelIds.includes(cachedLabelId)) return true;
  return false;
}

async function applyProcessedLabel(gmail, messageId) {
  try {
    const labelId = await getProcessedLabelId(gmail);
    console.log(`[mfs] Aplicando etiqueta "processed" (ID: ${labelId}) al mensaje ${messageId}`);
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds: [labelId] },
    });
    console.log(`[mfs] ✓ Etiqueta "processed" aplicada exitosamente al mensaje ${messageId}`);
  } catch (error) {
    // Loggear el error para diagnóstico
    console.error(`[mfs] ✗ Error aplicando etiqueta processed a ${messageId}:`, {
      message: error?.message || error,
      code: error?.code || error?.response?.status,
      error: error?.response?.data?.error || error?.error,
    });
    // No relanzar el error - continuar procesamiento
  }
}

// Rate limiting por minuto - límite de seguridad
let rateLimitCount = 0;
let rateLimitWindowStart = Date.now();
const RATE_LIMIT_MAX = 7000; // 7000 ejecuciones por minuto - si se supera, se detiene automáticamente
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto

// Flag para evitar múltiples correos de notificación
let rateLimitNotificationSent = false;

// Lock en memoria para evitar procesamiento concurrente del mismo mensaje
// Se limpia automáticamente después de procesar (éxito o fallo)
const processingLocks = new Set();
const PROCESSING_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos máximo

function acquireProcessingLock(messageId) {
  if (processingLocks.has(messageId)) {
    return false; // Ya está siendo procesado
  }
  processingLocks.add(messageId);
  // Limpiar el lock después del timeout (protección contra locks huérfanos)
  setTimeout(() => {
    processingLocks.delete(messageId);
  }, PROCESSING_LOCK_TIMEOUT_MS);
  return true;
}

function releaseProcessingLock(messageId) {
  processingLocks.delete(messageId);
}

async function checkRateLimit() {
  const now = Date.now();
  const windowAge = now - rateLimitWindowStart;
  
  // Resetear contador cada minuto
  if (windowAge >= RATE_LIMIT_WINDOW_MS) {
    rateLimitCount = 0;
    rateLimitWindowStart = now;
    // Resetear flag de notificación cuando se resetea el contador
    rateLimitNotificationSent = false;
  }
  
  // Si superamos el límite, detener servicio automáticamente
  if (rateLimitCount >= RATE_LIMIT_MAX) {
    console.error(`[mfs] ⚠️ LÍMITE DE SEGURIDAD ALCANZADO: ${rateLimitCount} ejecuciones en el último minuto. Límite: ${RATE_LIMIT_MAX}. DETENIENDO SERVICIO AUTOMÁTICAMENTE.`);
    
    // Detener servicio automáticamente (como si se hubiera presionado STOP)
    try {
      const { writeServiceStatus } = await import("./storage.js");
      await writeServiceStatus("stopped");
      console.log(`[mfs] ✓ Servicio detenido automáticamente por límite de ejecuciones`);
    } catch (stopError) {
      console.error(`[mfs] ✗ Error deteniendo servicio automáticamente:`, stopError?.message);
    }
    
    // Enviar UN SOLO correo de notificación (solo si no se ha enviado ya)
    if (!rateLimitNotificationSent) {
      rateLimitNotificationSent = true;
      try {
        await sendRateLimitNotificationEmail(rateLimitCount, RATE_LIMIT_MAX, 1);
        console.log(`[mfs] ✓ Email de notificación enviado`);
      } catch (emailError) {
        console.error(`[mfs] ✗ Error enviando email de notificación:`, emailError?.message);
      }
    }
    
    return false;
  }
  
  return true;
}

async function incrementRateLimit() {
  const now = Date.now();
  const windowAge = now - rateLimitWindowStart;
  
  // Resetear contador cada minuto
  if (windowAge >= RATE_LIMIT_WINDOW_MS) {
    rateLimitCount = 0;
    rateLimitWindowStart = now;
    // Resetear flag de notificación cuando se resetea el contador
    rateLimitNotificationSent = false;
  }
  
  rateLimitCount++;
  
  // Si superamos el límite después de incrementar, detener servicio automáticamente
  if (rateLimitCount >= RATE_LIMIT_MAX) {
    console.error(`[mfs] ⚠️ LÍMITE DE SEGURIDAD SUPERADO: ${rateLimitCount} ejecuciones en el último minuto. Límite: ${RATE_LIMIT_MAX}. DETENIENDO SERVICIO AUTOMÁTICAMENTE.`);
    
    // Detener servicio automáticamente (como si se hubiera presionado STOP)
    try {
      const { writeServiceStatus } = await import("./storage.js");
      await writeServiceStatus("stopped");
      console.log(`[mfs] ✓ Servicio detenido automáticamente por límite de ejecuciones`);
    } catch (stopError) {
      console.error(`[mfs] ✗ Error deteniendo servicio automáticamente:`, stopError?.message);
    }
    
    // Enviar UN SOLO correo de notificación (solo si no se ha enviado ya)
    if (!rateLimitNotificationSent) {
      rateLimitNotificationSent = true;
      try {
        await sendRateLimitNotificationEmail(rateLimitCount, RATE_LIMIT_MAX, 1);
        console.log(`[mfs] ✓ Email de notificación enviado`);
      } catch (emailError) {
        console.error(`[mfs] ✗ Error enviando email de notificación:`, emailError?.message);
      }
    }
  }
  
  return rateLimitCount <= RATE_LIMIT_MAX;
}

export async function processMessageIds(gmail, ids) {
  // Verificar límite de ejecuciones por minuto ANTES de procesar
  if (!(await checkRateLimit())) {
    console.error(`[mfs] ⚠️ PROCESAMIENTO DETENIDO: Límite de ${RATE_LIMIT_MAX} ejecuciones por minuto alcanzado. Servicio detenido automáticamente.`);
    return {
      exitosos: 0,
      fallidos: 0,
      saltados: ids.length,
      rateLimitExceeded: true,
      resultados: ids.map(id => ({ id, skipped: true, reason: `rate_limit_exceeded_${RATE_LIMIT_MAX}_per_minute` })),
    };
  }
  
  // Sistema de cola: procesar todos los mensajes que llegan sin verificar Airtable antes
  // createAirtableRecord manejará duplicados (si ya existe, fallará y no se duplicará)
  const results = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    try {
      // Lock en memoria ANTES de obtener mensaje (sistema de cola)
      if (!acquireProcessingLock(id)) {
        results.push({ id, airtableId: null, intent: null, confidence: null, skipped: true, reason: "concurrent_processing" });
        continue;
      }

      // Obtener mensaje completo (ya filtramos procesados en query)
      let msg;
      try {
        msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      } catch (e) {
        releaseProcessingLock(id);
        if (String(e?.response?.status || e?.code || e?.status) === "404") {
          continue;
        }
        continue;
      }

      const msgLabelIds = msg.data.labelIds || [];
      
      // NUNCA procesar mensajes con etiqueta "processed" - bajo ningún concepto
      // Verificar ANTES de hacer cualquier procesamiento para evitar bucles
      if (msgLabelIds.includes("processed")) {
        releaseProcessingLock(id);
        continue;
      }
      
      if (!msgLabelIds.includes("INBOX")) {
        releaseProcessingLock(id);
        continue;
      }

      try {
        // Simplificado: usar headers básicos directamente (más rápido)
        const basicHeaders = msg.data.payload?.headers || [];
        const findHeader = (name) => {
          const h = basicHeaders.find(header => header.name?.toLowerCase() === name.toLowerCase());
          return h ? h.value : "";
        };

        const fromHeader = findHeader("From");
        const toHeader = findHeader("To");
        const cc = findHeader("Cc");
        const bcc = findHeader("Bcc");
        const replyTo = findHeader("Reply-To");
        const subject = findHeader("Subject") || "";
        const body = bodyFromMessage(msg.data);

        // Extraer emails (sin logs para reducir carga operacional)
        const from = String(extractFromEmail(fromHeader, cc, bcc, replyTo) || "").trim().toLowerCase();
        let to = String(extractToEmail(toHeader || "", cc || "", bcc || "", replyTo || "", "") || "").trim().toLowerCase();
        
        // FILTROS RÁPIDOS: saltar correos FROM secretmedia@feverup.com SOLO si NO van TO secretmedia@feverup.com
        // Esto permite procesar correos que LLEGAN a secretmedia@feverup.com (TO secretmedia@feverup.com)
        // pero salta correos ENVIADOS desde secretmedia@feverup.com a otros (FROM secretmedia@feverup.com, TO != secretmedia@feverup.com)
        if (from && from.includes("secretmedia@feverup.com")) {
          const toEmailLower = (to || "").toLowerCase().trim();
          // Si el correo NO va TO secretmedia@feverup.com, saltarlo (es un correo enviado a otros)
          if (!toEmailLower.includes("secretmedia@feverup.com")) {
            releaseProcessingLock(id);
            continue;
          }
          // Si el correo SÍ va TO secretmedia@feverup.com, procesarlo (es un correo que llega a esa cuenta)
        }
        if (subject && subject.toLowerCase().trim() === "test") {
          releaseProcessingLock(id);
          continue;
        }
        if (from && from.includes("jongarnicaizco@gmail.com")) {
          releaseProcessingLock(id);
          continue;
        }
        if (!from || !to) {
          releaseProcessingLock(id);
          continue;
        }

        // Simplificar senderName
        const senderName = extractSenderName(fromHeader)?.replace(/["'`]/g, "").trim().slice(0, 100) || "";
        const senderFirstName = senderName.split(/\s+/)[0] || "";

        // Datos básicos (simplificado)
        const language = detectLanguage(subject + " " + body);
        const location = getLocationFromEmail(toHeader);
        const timestamp = msg.data.internalDate ? new Date(parseInt(msg.data.internalDate, 10)).toISOString() : new Date().toISOString();

        // Verificar si es reply (simplificado)
        const isReply = subject.toLowerCase().startsWith("re:") || subject.toLowerCase().startsWith("fwd:") || (msg.data.threadId && msg.data.threadId !== msg.data.id);

        // ÚNICA LLAMADA A GEMINI: classifyIntent
        let intent, confidence, reasoning, meddicMetrics, meddicEconomicBuyer, meddicDecisionCriteria, meddicDecisionProcess, meddicIdentifyPain, meddicChampion, isFreeCoverage, isBarter, isPricing;
        
        try {
          const classificationResult = await classifyIntent({ subject, from, to, body });
          intent = classificationResult.intent;
          confidence = classificationResult.confidence;
          reasoning = classificationResult.reasoning;
          meddicMetrics = classificationResult.meddicMetrics;
          meddicEconomicBuyer = classificationResult.meddicEconomicBuyer;
          meddicDecisionCriteria = classificationResult.meddicDecisionCriteria;
          meddicDecisionProcess = classificationResult.meddicDecisionProcess;
          meddicIdentifyPain = classificationResult.meddicIdentifyPain;
          meddicChampion = classificationResult.meddicChampion;
          isFreeCoverage = classificationResult.isFreeCoverage;
          isBarter = classificationResult.isBarter;
          isPricing = classificationResult.isPricing;
        } catch (classifyError) {
          // Si falla la clasificación, usar valores por defecto y continuar
          console.error(`[mfs] ✗ Error en classifyIntent para ${id}:`, classifyError?.message || classifyError);
          intent = "Discard";
          confidence = 0;
          reasoning = "Error en clasificación: " + (classifyError?.message || "unknown");
          meddicMetrics = "";
          meddicEconomicBuyer = "";
          meddicDecisionCriteria = "";
          meddicDecisionProcess = "";
          meddicIdentifyPain = "";
          meddicChampion = "";
          isFreeCoverage = false;
          isBarter = false;
          isPricing = false;
        }

        const toEmailLower = (to || "").toLowerCase().trim();
        const isSecretMediaEmail = toEmailLower.includes("secretmedia@feverup.com");
        
        let finalIntent = intent;
        let finalConfidence = confidence;
        let finalReasoning = reasoning;
        
        if (isSecretMediaEmail && isReply) {
          finalIntent = "Medium";
          finalConfidence = Math.max(finalConfidence || 0.75, 0.75);
          if (!finalReasoning || finalReasoning.length === 0) {
            finalReasoning = "Email is a reply to secretmedia@feverup.com, automatically classified as Medium intent.";
          } else {
            finalReasoning = finalReasoning + " Email is a reply to secretmedia@feverup.com, automatically classified as Medium intent.";
          }
        }

        // NO generar bodySummary para ahorrar llamadas a Gemini
        const bodySummary = "";

        const brandName = senderName || from.split("@")[0] || subject.split(" ")[0] || "Client";

        // Crear registro en Airtable directamente (sin verificación previa)
        // Si ya existe, createAirtableRecord manejará el error y no se duplicará
        let airtableRecord;
        try {
          airtableRecord = await createAirtableRecord({
            id, from, to, cc, subject, body, bodySummary, timestamp,
            intent: finalIntent, confidence: finalConfidence, reasoning: finalReasoning,
            meddicMetrics, meddicEconomicBuyer, meddicDecisionCriteria, meddicDecisionProcess,
            meddicIdentifyPain, meddicChampion, isFreeCoverage, isBarter, isPricing,
            senderName, senderFirstName, language, location,
          });
        } catch (airtableError) {
          // Si falla Airtable, loguear pero continuar - aplicar etiqueta processed para evitar bucles
          console.error(`[mfs] ✗ Error creando registro en Airtable para ${id}:`, airtableError?.message || airtableError);
          // Aplicar etiqueta processed para evitar que se quede pillado en bucle
          try {
            await applyProcessedLabel(gmail, id);
            console.log(`[mfs] ✓ Etiqueta processed aplicada a ${id} después de error en Airtable (para evitar bucle)`);
          } catch (labelError) {
            console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id} después de error:`, labelError?.message);
          }
          results.push({
            id,
            airtableId: null,
            intent: finalIntent,
            confidence: finalConfidence,
            skipped: false,
            error: "airtable_error",
          });
          continue; // Continuar con el siguiente mensaje
        }

        // Si se creó exitosamente o ya existía (duplicado): enviar emails y aplicar etiqueta processed
        if (airtableRecord?.id || airtableRecord?.duplicate) {
          // Verificar límite antes de continuar (cada mensaje procesado cuenta como ejecución)
          if (!(await checkRateLimit())) {
            console.error(`[mfs] ⚠️ Límite de ${RATE_LIMIT_MAX} ejecuciones por minuto alcanzado. Servicio detenido automáticamente.`);
            // Aplicar etiqueta processed aunque detengamos (para no reprocesar)
            try {
              await applyProcessedLabel(gmail, id);
            } catch (labelError) {
              // Continuar
            }
            break; // Salir del loop
          }

          // Enviar emails en paralelo (no bloqueante) - solo si se creó nuevo registro
          if (airtableRecord?.id && !airtableRecord?.duplicate) {
            if (isBarter) {
              sendBarterEmail(id, senderFirstName || "Client", brandName, subject).catch(() => {});
            }
            if (isFreeCoverage) {
              sendFreeCoverageEmail(id, senderFirstName || "Client", brandName, subject).catch(() => {});
            }
          }

          // APLICAR ETIQUETA PROCESSED SIEMPRE AL FINAL (bloqueante para asegurar que se aplica)
          try {
            await applyProcessedLabel(gmail, id);
          } catch (labelError) {
            // Si falla, loguear pero continuar
            console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
          }
          
          // Incrementar contador de ejecuciones (cada mensaje procesado = 1 ejecución)
          await incrementRateLimit();
        } else {
          // Si no se creó ni es duplicado, aplicar etiqueta processed para evitar bucles
          console.warn(`[mfs] ⚠️ Registro en Airtable no se creó ni es duplicado para ${id}. Aplicando etiqueta processed para evitar bucle.`);
          try {
            await applyProcessedLabel(gmail, id);
          } catch (labelError) {
            console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
          }
        }

        results.push({
          id,
          airtableId: airtableRecord?.id || null,
          intent: finalIntent,
          confidence: finalConfidence,
        });
      } catch (e) {
        // En caso de error, loguear y aplicar etiqueta processed para evitar bucles infinitos
        console.error(`[mfs] ✗ Error procesando mensaje ${id}:`, e?.message || e);
        console.error(`[mfs] Stack trace:`, e?.stack);
        
        // Aplicar etiqueta processed para evitar que se quede pillado en bucle
        try {
          await applyProcessedLabel(gmail, id);
          console.log(`[mfs] ✓ Etiqueta processed aplicada a ${id} después de error (para evitar bucle)`);
        } catch (labelError) {
          console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id} después de error:`, labelError?.message);
        }
        
        results.push({
          id,
          airtableId: null,
          intent: null,
          confidence: null,
          skipped: false,
          error: e?.message || "unknown_error",
        });
      } finally {
        // Liberar el lock siempre, incluso si hubo error o continue
        releaseProcessingLock(id);
      }
    } catch (e) {
      // Error en el procesamiento del mensaje - liberar lock si existe
      releaseProcessingLock(id);
      // Silently continue - el mensaje se intentará procesar de nuevo
    }
  }

  return {
    exitosos: results.filter(r => r.airtableId && !r.skipped).length,
    fallidos: results.filter(r => !r.airtableId && !r.skipped).length,
    saltados: results.filter(r => r.skipped).length,
    resultados: results.map(r => ({
      id: r.id,
      intent: r.intent,
      airtableId: r.airtableId,
      skipped: r.skipped || false,
    })),
  };
}
