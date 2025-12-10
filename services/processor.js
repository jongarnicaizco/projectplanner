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
import { createAirtableRecord, airtableFindByEmailId } from "./airtable.js";
import { sendBarterEmail, sendFreeCoverageEmail } from "./email-sender.js";
import { createSalesforceLead } from "./salesforce.js";
import { getCityId } from "../config.js";

// Función para resetear el contador de rate limit (llamada desde index.js cuando se activa el servicio)
export function resetRateLimitCounter() {
  rateLimitCount = 0;
  rateLimitWindowStart = Date.now();
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
    
    // Si no se encuentra, CREAR el label automáticamente
    console.warn(`[mfs] ⚠️ Label "processed" no encontrado. Creando label automáticamente...`);
    try {
      const createResponse = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: "processed",
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      const newLabelId = createResponse.data.id;
      processedLabelIdCache.set(gmail, newLabelId);
      console.log(`[mfs] ✓ Label "processed" creado exitosamente con ID: ${newLabelId}`);
      return newLabelId;
    } catch (createError) {
      console.error(`[mfs] ✗ Error creando label "processed":`, createError?.message || createError);
      // Si falla la creación, usar el nombre como fallback (puede que funcione en algunos casos)
      console.warn(`[mfs] Usando nombre "processed" como fallback`);
      processedLabelIdCache.set(gmail, "processed");
      return "processed";
    }
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
    
    // Verificar que el mensaje existe antes de aplicar la etiqueta
    try {
      const msgCheck = await gmail.users.messages.get({ userId: "me", id: messageId, format: "metadata" });
      const currentLabels = msgCheck.data.labelIds || [];
      if (currentLabels.includes(labelId) || currentLabels.includes("processed")) {
        console.log(`[mfs] Mensaje ${messageId} ya tiene etiqueta processed, saltando aplicación`);
        return; // Ya tiene la etiqueta, no hacer nada
      }
    } catch (checkError) {
      if (String(checkError?.response?.status || checkError?.code || checkError?.status) === "404") {
        console.warn(`[mfs] Mensaje ${messageId} no existe (404), no se puede aplicar etiqueta processed`);
        return; // Mensaje no existe, no hacer nada
      }
      // Para otros errores, continuar e intentar aplicar la etiqueta
      console.warn(`[mfs] Error verificando mensaje ${messageId} antes de aplicar etiqueta:`, checkError?.message);
    }
    
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds: [labelId] },
    });
    console.log(`[mfs] ✓ Etiqueta "processed" aplicada exitosamente al mensaje ${messageId}`);
  } catch (error) {
    // Loggear el error para diagnóstico con más detalles
    const errorDetails = {
      message: error?.message || error,
      code: error?.code || error?.response?.status,
      status: error?.response?.status || error?.status,
      error: error?.response?.data?.error || error?.error,
      errorDescription: error?.response?.data?.error_description || error?.error_description,
      fullError: error?.response?.data || error?.data,
    };
    console.error(`[mfs] ✗ Error aplicando etiqueta processed a ${messageId}:`, JSON.stringify(errorDetails, null, 2));
    
    // Si es un error de permisos (403), loggear específicamente
    if (String(errorDetails.code) === "403" || String(errorDetails.status) === "403") {
      console.error(`[mfs] ⚠️ ERROR DE PERMISOS (403) al aplicar etiqueta processed a ${messageId}`);
      console.error(`[mfs] ⚠️ Verifica que el refresh token tenga permisos de Gmail API (gmail.modify)`);
      console.error(`[mfs] ⚠️ Verifica que el OAuth Client tenga los scopes correctos`);
    }
    
    // No relanzar el error - continuar procesamiento
  }
}

// Rate limiting por minuto - límite de seguridad
let rateLimitCount = 0;
let rateLimitWindowStart = Date.now();
const RATE_LIMIT_MAX = 7000; // 7000 ejecuciones por minuto - si se supera, se detiene automáticamente
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

async function checkRateLimit() {
  const now = Date.now();
  const windowAge = now - rateLimitWindowStart;
  
  // Resetear contador cada minuto
  if (windowAge >= RATE_LIMIT_WINDOW_MS) {
    rateLimitCount = 0;
    rateLimitWindowStart = now;
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
  }
  
  return rateLimitCount <= RATE_LIMIT_MAX;
}

export async function processMessageIds(gmail, ids, serviceSource = null) {
  // Verificar estado del servicio ANTES de procesar (máxima prioridad)
  // CRÍTICO: Esta es la segunda línea de defensa - si el servicio está detenido, NO procesar NADA
  const { readServiceStatus } = await import("./storage.js");
  const serviceStatus = await readServiceStatus();
  if (serviceStatus.status === "stopped") {
    console.log(`[mfs] 🚨 PROCESAMIENTO DETENIDO: Servicio está detenido (estado verificado: '${serviceStatus.status}'). NO se procesarán mensajes hasta que se reactive manualmente desde el webapp.`);
    return {
      exitosos: 0,
      fallidos: 0,
      saltados: ids.length,
      serviceStopped: true,
      resultados: ids.map(id => ({ id, skipped: true, reason: `service_stopped` })),
    };
  }
  
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
      // Verificar estado del servicio ANTES de procesar cada mensaje (para evitar procesamiento si se detiene durante el loop)
      // Esta verificación es CRÍTICA para evitar que se procesen mensajes si el servicio se detiene mientras se están procesando
      // CRÍTICO: Esta es la tercera línea de defensa - verificación en cada mensaje
      const { readServiceStatus } = await import("./storage.js");
      const currentServiceStatus = await readServiceStatus();
      if (currentServiceStatus.status === "stopped") {
        console.log(`[mfs] 🚨 PROCESAMIENTO DETENIDO: Servicio detenido durante procesamiento (estado verificado: '${currentServiceStatus.status}'). Saltando mensaje ${id} y todos los siguientes. NO se procesarán mensajes hasta que se reactive manualmente desde el webapp.`);
        // NO aplicar etiqueta processed a los mensajes restantes - se procesarán cuando se reactive el servicio
        // Esto permite que cuando se reactive, se procesen los mensajes que quedaron pendientes
        break; // Salir del loop completamente
      }
      
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
        // Si el mensaje no existe (404), no podemos aplicar etiqueta, solo liberar lock
        if (String(e?.response?.status || e?.code || e?.status) === "404") {
          releaseProcessingLock(id);
          continue;
        }
        // Para otros errores, intentar aplicar etiqueta processed antes de continuar
        try {
          await applyProcessedLabel(gmail, id);
        } catch (labelError) {
          // Si falla, continuar de todas formas
        }
        releaseProcessingLock(id);
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
        // Si no está en INBOX, aplicar etiqueta processed para evitar reprocesar
        try {
          await applyProcessedLabel(gmail, id);
      } catch (labelError) {
          console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
        }
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
        
        // Log específico para correos a secretmedia@feverup.com para debugging
        const isToSecretMedia = (to || "").toLowerCase().includes("secretmedia@feverup.com");
        if (isToSecretMedia) {
          console.log(`[mfs] 📧 Correo detectado TO secretmedia@feverup.com - ID: ${id}, From: ${from}, To: ${to}`);
          console.log(`[mfs] 🚀 INICIANDO PROCESAMIENTO de correo TO secretmedia@feverup.com - ID: ${id}`);
        }
        
        // FILTROS RÁPIDOS: saltar correos FROM secretmedia@feverup.com SOLO si NO van TO secretmedia@feverup.com
        // Esto permite procesar correos que LLEGAN a secretmedia@feverup.com (TO secretmedia@feverup.com)
        // pero salta correos ENVIADOS desde secretmedia@feverup.com a otros (FROM secretmedia@feverup.com, TO != secretmedia@feverup.com)
        if (from && from.includes("secretmedia@feverup.com")) {
          const toEmailLower = (to || "").toLowerCase().trim();
          // Si el correo NO va TO secretmedia@feverup.com, saltarlo (es un correo enviado a otros)
          if (!toEmailLower.includes("secretmedia@feverup.com")) {
            console.log(`[mfs] ⏭️ Saltando correo FROM secretmedia@feverup.com que NO va TO secretmedia@feverup.com - ID: ${id}`);
            // Aplicar etiqueta processed para evitar reprocesar
            try {
              await applyProcessedLabel(gmail, id);
            } catch (labelError) {
              console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
            }
            releaseProcessingLock(id);
        continue;
      }
          // Si el correo SÍ va TO secretmedia@feverup.com, procesarlo (es un correo que llega a esa cuenta)
          console.log(`[mfs] ✓ Procesando correo FROM secretmedia@feverup.com TO secretmedia@feverup.com (reply/forward) - ID: ${id}`);
        }
        if (subject && subject.toLowerCase().trim() === "test") {
          // Aplicar etiqueta processed para evitar reprocesar
          try {
            await applyProcessedLabel(gmail, id);
          } catch (labelError) {
            console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
          }
          releaseProcessingLock(id);
          continue;
        }
        if (from && from.includes("jongarnicaizco@gmail.com")) {
          // Aplicar etiqueta processed para evitar reprocesar
          try {
            await applyProcessedLabel(gmail, id);
          } catch (labelError) {
            console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
          }
          releaseProcessingLock(id);
          continue;
        }
        if (!from || !to) {
          console.log(`[mfs] ⏭️ Saltando correo sin from o to válido - ID: ${id}, From: ${from || "empty"}, To: ${to || "empty"}`);
          if (isToSecretMedia) {
            console.log(`[mfs] ⚠️ DEBUG - Correo TO secretmedia@feverup.com sin from o to válido - From: ${from || "empty"}, To: ${to || "empty"}`);
          }
          // Aplicar etiqueta processed para evitar reprocesar
          try {
            await applyProcessedLabel(gmail, id);
          } catch (labelError) {
            console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
          }
          releaseProcessingLock(id);
          continue;
        }
        
        // Si llegamos aquí, el correo pasó todos los filtros
        if (isToSecretMedia) {
          console.log(`[mfs] ✓ Correo TO secretmedia@feverup.com pasó todos los filtros - ID: ${id}, continuando con procesamiento`);
        }
        
        // Log específico para correos a secretmedia@feverup.com antes de procesar
        if (isToSecretMedia) {
          console.log(`[mfs] 🚀 Iniciando procesamiento de correo TO secretmedia@feverup.com - ID: ${id}, Subject: ${subject?.slice(0, 50)}`);
        }

        // Simplificar senderName
        const senderName = extractSenderName(fromHeader)?.replace(/["'`]/g, "").trim().slice(0, 100) || "";
        const senderFirstName = senderName.split(/\s+/)[0] || "";

        // Datos básicos (simplificado)
      const language = detectLanguage(subject + " " + body);
      
      // Detectar ubicación: si el correo viene de secretmedia@feverup.com, buscar en el cuerpo del mensaje
      // en lugar de usar el To (que siempre será secretmedia@feverup.com)
      // También actualizar el campo 'to' con el email encontrado en el body
      let location;
      if (isToSecretMedia) {
        // Buscar emails de ciudades en el cuerpo del mensaje
        const { getLocationFromEmailInBody } = await import("../utils/helpers.js");
        const bodyResult = getLocationFromEmailInBody(body);
        
        if (bodyResult && bodyResult.location && bodyResult.email) {
          // Se encontró un email de ciudad en el body - usar ese email para 'to' y su ubicación
          location = bodyResult.location;
          to = bodyResult.email;
          console.log(`[mfs] ✓ Email de ciudad encontrado en body para correo TO secretmedia@feverup.com - Actualizando 'to' a: ${to}`);
        } else {
          // Si no se encuentra en el cuerpo, intentar con el To como fallback
          location = getLocationFromEmail(toHeader);
          console.log(`[mfs] ⚠️ No se encontró email de ciudad en body, usando To original: ${to}`);
        }
      } else {
        // Para correos normales, usar el To como siempre
        location = getLocationFromEmail(toHeader);
      }
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

      let finalIntent = intent;
      let finalConfidence = confidence;
      let finalReasoning = reasoning;
      
      // Normalizar el intent (trim y asegurar formato correcto)
      if (finalIntent) {
        finalIntent = String(finalIntent).trim();
      }
      
      // Si el correo viene de secretmedia@feverup.com, el intent debe ser como mínimo "Medium"
      if (isToSecretMedia) {
        const intentHierarchy = ["Discard", "Low", "Medium", "High", "Very High"];
        const currentIntentIndex = intentHierarchy.indexOf(finalIntent || "Discard");
        const mediumIndex = intentHierarchy.indexOf("Medium");
        
        console.log(`[mfs] DEBUG secretmedia@feverup.com - Intent original: "${intent}", finalIntent: "${finalIntent}", currentIndex: ${currentIntentIndex}, mediumIndex: ${mediumIndex}`);
        
        if (currentIntentIndex < mediumIndex) {
          finalIntent = "Medium";
          finalConfidence = Math.max(finalConfidence || 0.75, 0.75);
          if (!finalReasoning || finalReasoning.length === 0) {
            finalReasoning = "Email comes from secretmedia@feverup.com, automatically classified as Medium intent (minimum).";
          } else {
            finalReasoning = finalReasoning + " Email comes from secretmedia@feverup.com, automatically classified as Medium intent (minimum).";
          }
          console.log(`[mfs] Intent actualizado a Medium (mínimo) para correo de secretmedia@feverup.com - Intent original: ${intent}`);
        }
      }
      
      // Log final del intent antes de crear lead en Salesforce
      console.log(`[mfs] DEBUG - finalIntent antes de crear lead: "${finalIntent}" (tipo: ${typeof finalIntent})`);

      // NO generar bodySummary para ahorrar llamadas a Gemini
      const bodySummary = "";

      const brandName = senderName || from.split("@")[0] || subject.split(" ")[0] || "Client";
      
        // VERIFICACIÓN DE DUPLICADOS: Verificar ANTES de crear para evitar duplicados
        // Procesamiento SECUENCIAL: un mensaje a la vez, completamente procesado antes del siguiente
        if (isToSecretMedia) {
          console.log(`[mfs] 🔍 Verificando duplicados en Airtable para ${id}...`);
        }
        let existingRecord = null;
        try {
          existingRecord = await airtableFindByEmailId(id);
        } catch (checkError) {
          // Si falla la verificación, continuar (mejor intentar crear que perder el mensaje)
          console.warn(`[mfs] No se pudo verificar duplicado para ${id}, continuando:`, checkError?.message);
          if (isToSecretMedia) {
            console.log(`[mfs] ⚠️ Error verificando duplicado para secretmedia@feverup.com - ID: ${id}, continuando...`);
          }
        }

        // Si ya existe, saltar y aplicar etiqueta processed
        if (existingRecord?.id) {
          console.log(`[mfs] Registro ya existe en Airtable para ${id}, saltando y aplicando etiqueta processed`);
          if (isToSecretMedia) {
            console.log(`[mfs] ⏭️ Registro duplicado para secretmedia@feverup.com - ID: ${id}, Airtable ID: ${existingRecord.id}`);
          }
          try {
            await applyProcessedLabel(gmail, id);
          } catch (labelError) {
            console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
          }
          results.push({
            id,
            airtableId: existingRecord.id,
            intent: finalIntent,
            confidence: finalConfidence,
            skipped: true,
            reason: "already_exists",
          });
          continue; // Continuar con el siguiente mensaje (SECUENCIAL)
        }

        // CREAR LEAD EN SALESFORCE ANTES DE AIRTABLE (solo para Medium, High, Very High)
        let salesforceLeadId = null;
        // Normalizar finalIntent para comparación (trim y asegurar formato correcto)
        const normalizedFinalIntent = String(finalIntent || "").trim();
        console.log(`[mfs] DEBUG - Verificando si crear lead en Salesforce - normalizedFinalIntent: "${normalizedFinalIntent}"`);
        
        if (normalizedFinalIntent === "Medium" || normalizedFinalIntent === "High" || normalizedFinalIntent === "Very High") {
          console.log(`[mfs] DEBUG - Condición cumplida, creando lead en Salesforce para intent: "${normalizedFinalIntent}"`);
          try {
            // Construir MEDDIC Analysis string igual que en Airtable
            const meddicParts = [];
            if (meddicMetrics) meddicParts.push(`M: ${meddicMetrics}`);
            if (meddicEconomicBuyer) meddicParts.push(`E: ${meddicEconomicBuyer}`);
            if (meddicDecisionCriteria) meddicParts.push(`D: ${meddicDecisionCriteria}`);
            if (meddicDecisionProcess) meddicParts.push(`D: ${meddicDecisionProcess}`);
            if (meddicIdentifyPain) meddicParts.push(`I: ${meddicIdentifyPain}`);
            if (meddicChampion) meddicParts.push(`C: ${meddicChampion}`);
            const meddicAnalysis = meddicParts.join("\n\n").slice(0, 1000);

            // Obtener City ID basándose en el nombre de la ciudad
            const cityId = location?.city ? getCityId(location.city) : null;
            
            // Mapeo de campos según especificación:
            // LastName/Company --> Client Name (senderName)
            // Email --> From
            // Country__c --> Country Code (location?.countryCode)
            // City__c --> City (location?.city)
            // City_ID__c --> City ID (cityId)
            // Lead_AI_Scoring__c --> Business Oppt (finalIntent)
            // MEDDIC_Analysis__c --> MEDDIC Analysis (meddicAnalysis)
            const salesforceResult = await createSalesforceLead({
              lastName: senderName || from.split("@")[0] || "Unknown",
              company: senderName || from.split("@")[0] || "Unknown",
              email: from,
              countryCode: location?.countryCode || null,
              city: location?.city || null,
              cityId: cityId,
              subject: subject || "",
              body: body || "",
              businessOppt: finalIntent,
              meddicAnalysis: meddicAnalysis || null,
            });

            if (salesforceResult?.id) {
              salesforceLeadId = salesforceResult.id;
              console.log(`[mfs] ✓ Lead creado en Salesforce para ${id} - Lead ID: ${salesforceLeadId}`);
            } else if (salesforceResult?.skipped) {
              console.log(`[mfs] Salesforce: Lead no creado (integración detenida) para ${id}`);
            } else if (salesforceResult?.duplicate) {
              console.log(`[mfs] Salesforce: Lead duplicado detectado para ${id}`);
            } else {
              console.warn(`[mfs] Salesforce: No se pudo crear lead para ${id}:`, salesforceResult?.error);
            }
          } catch (salesforceError) {
            // No bloquear el procesamiento si falla Salesforce
            console.error(`[mfs] ✗ Error creando lead en Salesforce para ${id}:`, salesforceError?.message || salesforceError);
          }
        }

        // Crear registro en Airtable (solo si no existe)
        if (isToSecretMedia) {
          console.log(`[mfs] 📝 Creando registro en Airtable para secretmedia@feverup.com - ID: ${id}, Intent: ${finalIntent}`);
        }
        let airtableRecord;
        try {
          airtableRecord = await createAirtableRecord({
        id, from, to, cc, subject, body, bodySummary, timestamp,
        intent: finalIntent, confidence: finalConfidence, reasoning: finalReasoning,
        meddicMetrics, meddicEconomicBuyer, meddicDecisionCriteria, meddicDecisionProcess,
        meddicIdentifyPain, meddicChampion, isFreeCoverage, isBarter, isPricing,
        senderName, senderFirstName, language, location,
        isFromSecretMedia: isToSecretMedia,
      });
          
          // Log detallado del resultado de createAirtableRecord
          if (isToSecretMedia) {
            console.log(`[mfs] 🔍 DEBUG secretmedia@feverup.com - Resultado de createAirtableRecord:`, {
              id: airtableRecord?.id,
              duplicate: airtableRecord?.duplicate,
              hasId: !!airtableRecord?.id,
              isDuplicate: !!airtableRecord?.duplicate,
              fullRecord: JSON.stringify(airtableRecord),
            });
          }
        } catch (airtableError) {
          // Si falla Airtable, verificar si es porque ya existe (duplicado)
          const errorData = airtableError?.response?.data;
          const errorStatus = airtableError?.response?.status;
          
          if (errorStatus === 422 || (errorData?.error?.message && errorData.error.message.includes("duplicate"))) {
            // Es un duplicado - aplicar etiqueta processed y continuar
            console.log(`[mfs] Registro duplicado detectado para ${id} (error 422), aplicando etiqueta processed`);
            try {
              await applyProcessedLabel(gmail, id);
            } catch (labelError) {
              console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
            }
            results.push({
              id,
              airtableId: null,
              intent: finalIntent,
              confidence: finalConfidence,
              skipped: true,
              reason: "duplicate_detected",
            });
            continue; // Continuar con el siguiente mensaje (SECUENCIAL)
          }
          
          // Si falla Airtable por otro motivo, loguear y NO aplicar etiqueta processed para permitir reintento
          console.error(`[mfs] ✗ Error creando registro en Airtable para ${id}:`, airtableError?.message || airtableError);
          console.error(`[mfs] ⚠️ NO se aplicará etiqueta processed a ${id} para permitir reintento en próxima ejecución`);
          if (isToSecretMedia) {
            console.error(`[mfs] ✗ ERROR CRÍTICO para secretmedia@feverup.com - Excepción al crear registro en Airtable - ID: ${id}`, {
              error: airtableError?.message || airtableError,
              errorStatus: airtableError?.response?.status,
              errorData: airtableError?.response?.data,
              from: from,
              to: to,
            });
          }
          // NO aplicar etiqueta processed - permitir que se reintente en la próxima ejecución
          results.push({
            id,
            airtableId: null,
            intent: finalIntent,
            confidence: finalConfidence,
            skipped: false,
            error: "airtable_error",
            willRetry: true, // Marcar para reintento
          });
          continue; // Continuar con el siguiente mensaje (SECUENCIAL)
        }

        // Si se creó exitosamente o ya existía (duplicado): enviar emails y aplicar etiqueta processed
        if (isToSecretMedia) {
          console.log(`[mfs] 🔍 DEBUG secretmedia@feverup.com - Verificando condición para aplicar processed:`, {
            hasId: !!airtableRecord?.id,
            isDuplicate: !!airtableRecord?.duplicate,
            conditionResult: !!(airtableRecord?.id || airtableRecord?.duplicate),
            airtableRecordId: airtableRecord?.id,
            airtableRecordDuplicate: airtableRecord?.duplicate,
          });
        }
        
        if (airtableRecord?.id || airtableRecord?.duplicate) {
          if (isToSecretMedia) {
            console.log(`[mfs] ✓ Condición cumplida - Registro creado o duplicado para secretmedia@feverup.com - ID: ${id}, Airtable ID: ${airtableRecord?.id || "duplicado"}`);
          }
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

          // Enviar emails SECUENCIALMENTE (bloqueante) - solo si se creó nuevo registro
          // Verificar estado de envío de emails antes de enviar
          if (airtableRecord?.id && !airtableRecord?.duplicate) {
            const { readEmailSendingStatus } = await import("./storage.js");
            const emailStatus = await readEmailSendingStatus();
            
            if (emailStatus.status === "active") {
              // Procesamiento secuencial: esperar a que se envíe antes de continuar
        if (isBarter) {
          try {
            await sendBarterEmail(id, senderFirstName || "Client", brandName, subject);
                } catch (emailError) {
                  console.warn(`[mfs] Error enviando email barter para ${id}:`, emailError?.message);
          }
        }
        if (isFreeCoverage) {
          try {
            await sendFreeCoverageEmail(id, senderFirstName || "Client", brandName, subject);
                } catch (emailError) {
                  console.warn(`[mfs] Error enviando email free coverage para ${id}:`, emailError?.message);
                }
              }
            } else {
              console.log(`[mfs] Envío de emails detenido, no se enviarán emails automáticos para ${id}`);
            }
          }

          // APLICAR ETIQUETA PROCESSED SIEMPRE AL FINAL (bloqueante para asegurar que se aplica)
          try {
            await applyProcessedLabel(gmail, id);
            if (isToSecretMedia) {
              console.log(`[mfs] ✓ Etiqueta processed aplicada exitosamente a correo TO secretmedia@feverup.com - ID: ${id}`);
            }
          } catch (labelError) {
            // Si falla, loguear pero continuar
            console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
            if (isToSecretMedia) {
              console.error(`[mfs] ✗ ERROR aplicando etiqueta processed a correo TO secretmedia@feverup.com - ID: ${id}, Error: ${labelError?.message}`);
            }
          }
          
          // Incrementar contador de ejecuciones (cada mensaje procesado = 1 ejecución)
          await incrementRateLimit();
        } else {
          // Si no se creó ni es duplicado, NO aplicar etiqueta processed para permitir reintento
          console.warn(`[mfs] ⚠️ Registro en Airtable no se creó ni es duplicado para ${id}. NO se aplicará etiqueta processed para permitir reintento.`);
          if (isToSecretMedia) {
            console.error(`[mfs] ✗ ERROR CRÍTICO para secretmedia@feverup.com - Registro NO creado en Airtable - ID: ${id}`, {
              airtableRecord: airtableRecord,
              hasId: !!airtableRecord?.id,
              isDuplicate: !!airtableRecord?.duplicate,
              fullRecord: JSON.stringify(airtableRecord),
            });
          }
          results.push({
            id,
            airtableId: null,
            intent: finalIntent,
            confidence: finalConfidence,
            skipped: false,
            error: "airtable_creation_failed",
            willRetry: true,
          });
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
        console.error(`[mfs] ⚠️ NO se aplicará etiqueta processed a ${id} para permitir reintento en próxima ejecución`);
        
        // NO aplicar etiqueta processed - permitir que se reintente en la próxima ejecución
        // Solo aplicar etiqueta si es un error crítico que no permite procesamiento (ej: mensaje no existe)
        const isCriticalError = String(e?.response?.status || e?.code || e?.status) === "404";
        if (isCriticalError) {
          // Si el mensaje no existe (404), aplicar etiqueta para no intentar de nuevo
          try {
            await applyProcessedLabel(gmail, id);
            console.log(`[mfs] ✓ Etiqueta processed aplicada a ${id} después de error 404 (mensaje no existe)`);
          } catch (labelError) {
            console.warn(`[mfs] No se pudo aplicar etiqueta processed a ${id}:`, labelError?.message);
          }
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
