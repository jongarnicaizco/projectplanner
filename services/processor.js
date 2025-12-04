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
import { airtableFindByEmailId, airtableFindByEmailIdsBatch, createAirtableRecord } from "./airtable.js";
import { sendBarterEmail, sendFreeCoverageEmail, sendRateLimitNotificationEmail } from "./email-sender.js";

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

// Rate limiting por minuto - límite de seguridad de 10k ejecuciones por minuto
let rateLimitCount = 0;
let rateLimitWindowStart = Date.now();
const RATE_LIMIT_MAX = 10000; // 10k ejecuciones por minuto
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto

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

function checkRateLimit() {
  const now = Date.now();
  const windowAge = now - rateLimitWindowStart;
  
  // Resetear contador cada minuto
  if (windowAge >= RATE_LIMIT_WINDOW_MS) {
    rateLimitCount = 0;
    rateLimitWindowStart = now;
  }
  
  // Si superamos el límite, detener procesamiento
  if (rateLimitCount >= RATE_LIMIT_MAX) {
    console.error(`[mfs] ⚠️ LÍMITE DE SEGURIDAD ALCANZADO: ${rateLimitCount} ejecuciones en el último minuto. Límite: ${RATE_LIMIT_MAX}. DETENIENDO PROCESAMIENTO.`);
    return false;
  }
  
  return true;
}

function incrementRateLimit() {
  const now = Date.now();
  const windowAge = now - rateLimitWindowStart;
  
  // Resetear contador cada minuto
  if (windowAge >= RATE_LIMIT_WINDOW_MS) {
    rateLimitCount = 0;
    rateLimitWindowStart = now;
  }
  
  rateLimitCount++;
  
  // Si superamos el límite después de incrementar, loguear advertencia
  if (rateLimitCount >= RATE_LIMIT_MAX) {
    console.error(`[mfs] ⚠️ LÍMITE DE SEGURIDAD SUPERADO: ${rateLimitCount} ejecuciones en el último minuto. Límite: ${RATE_LIMIT_MAX}.`);
  }
  
  return rateLimitCount <= RATE_LIMIT_MAX;
}

export async function processMessageIds(gmail, ids) {
  // Verificar límite de ejecuciones por minuto ANTES de procesar
  if (!checkRateLimit()) {
    console.error(`[mfs] ⚠️ PROCESAMIENTO DETENIDO: Límite de 10k ejecuciones por minuto alcanzado. Deteniendo para evitar costos excesivos.`);
    return {
      exitosos: 0,
      fallidos: 0,
      saltados: ids.length,
      rateLimitExceeded: true,
      resultados: ids.map(id => ({ id, skipped: true, reason: "rate_limit_exceeded_10k_per_minute" })),
    };
  }
  
  // OPTIMIZACIÓN: Verificar todos los Email IDs en batch ANTES de procesar
  // Esto reduce de N llamadas a Airtable a solo 1-2 llamadas (dependiendo del tamaño)
  console.log(`[mfs] Verificando ${ids.length} Email IDs en batch antes de procesar...`);
  const existingRecordsMap = await airtableFindByEmailIdsBatch(ids);
  console.log(`[mfs] Batch verification: ${existingRecordsMap.size} registros ya existen en Airtable`);
  
  const results = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    try {
      // Verificar si ya existe en Airtable ANTES de hacer cualquier llamada a Gmail
      const existingRecord = existingRecordsMap.get(id);
      if (existingRecord) {
        // Ya existe - saltar sin hacer llamadas
        results.push({ id, airtableId: existingRecord.id, intent: null, confidence: null, skipped: true, reason: "already_in_airtable" });
        continue;
      }

      // Lock en memoria ANTES de obtener mensaje
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
      if (msgLabelIds.includes("processed")) {
        console.log(`[mfs] Mensaje ${id} tiene etiqueta "processed". SALTANDO (nunca se procesan).`);
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

        // Extraer emails (simplificado)
        const from = String(extractFromEmail(fromHeader, cc, bcc, replyTo) || "").trim().toLowerCase();
        let to = String(extractToEmail(toHeader || "", cc || "", bcc || "", replyTo || "", "") || "").trim().toLowerCase();
        
        // FILTROS RÁPIDOS: saltar antes de procesar más
        if (from && from.includes("secretmedia@feverup.com")) {
          releaseProcessingLock(id);
          continue;
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
        } = await classifyIntent({ subject, from, to, body });

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

        // Verificar una vez más ANTES de crear usando el resultado anterior (sin llamada adicional)
        // Si otra instancia creó el registro entre la verificación y ahora, createAirtableRecord fallará
        // y no se duplicará el registro

        const airtableRecord = await createAirtableRecord({
          id, from, to, cc, subject, body, bodySummary, timestamp,
          intent: finalIntent, confidence: finalConfidence, reasoning: finalReasoning,
          meddicMetrics, meddicEconomicBuyer, meddicDecisionCriteria, meddicDecisionProcess,
          meddicIdentifyPain, meddicChampion, isFreeCoverage, isBarter, isPricing,
          senderName, senderFirstName, language, location,
        });

        // Si se creó exitosamente: enviar emails y aplicar etiqueta processed
        if (airtableRecord?.id) {
          // Verificar límite antes de continuar (cada mensaje procesado cuenta como ejecución)
          if (!checkRateLimit()) {
            console.error(`[mfs] ⚠️ Límite de 10k ejecuciones por minuto alcanzado. Deteniendo procesamiento.`);
            releaseProcessingLock(id);
            // Aplicar etiqueta processed aunque detengamos (para no reprocesar)
            try {
              await applyProcessedLabel(gmail, id);
            } catch (labelError) {
              // Continuar
            }
            break; // Salir del loop
          }

          // Enviar emails en paralelo (no bloqueante)
          if (isBarter) {
            sendBarterEmail(id, senderFirstName || "Client", brandName, subject).catch(() => {});
          }
          if (isFreeCoverage) {
            sendFreeCoverageEmail(id, senderFirstName || "Client", brandName, subject).catch(() => {});
          }

          // APLICAR ETIQUETA PROCESSED SIEMPRE AL FINAL (bloqueante para asegurar que se aplica)
          try {
            await applyProcessedLabel(gmail, id);
          } catch (labelError) {
            // Si falla, loguear pero continuar
            console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
          }
          
          // Incrementar contador de ejecuciones (cada mensaje procesado = 1 ejecución)
          incrementRateLimit();
        }

        results.push({
          id,
          airtableId: airtableRecord?.id || null,
          intent: finalIntent,
          confidence: finalConfidence,
        });
      } catch (e) {
        // En caso de error, no marcar como procesado
        // El mensaje se intentará procesar de nuevo en la próxima ejecución
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
