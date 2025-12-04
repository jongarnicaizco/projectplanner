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
import { airtableFindByEmailId, createAirtableRecord } from "./airtable.js";
import { sendBarterEmail, sendFreeCoverageEmail, sendRateLimitNotificationEmail } from "./email-sender.js";

// Cache global del label ID - solo se obtiene una vez
let processedLabelIdCache = null;
let labelIdFetchAttempted = false;

async function getProcessedLabelId(gmail) {
  if (processedLabelIdCache) return processedLabelIdCache;
  if (labelIdFetchAttempted) return "processed"; // Fallback si ya intentamos
  
  labelIdFetchAttempted = true;
  try {
    const labelsResponse = await gmail.users.labels.list({ userId: "me" });
    const labels = labelsResponse.data.labels || [];
    const processedLabel = labels.find(label => label.name?.toLowerCase() === "processed");
    if (processedLabel) {
      processedLabelIdCache = processedLabel.id;
      return processedLabelIdCache;
    }
    return "processed"; // Fallback
  } catch (error) {
    return "processed"; // Fallback
  }
}

async function checkProcessedLabel(gmail, labelIds) {
  if (!labelIds || labelIds.length === 0) return false;
  // Verificar directamente en labelIds sin llamar a API
  if (labelIds.includes("processed")) return true;
  if (processedLabelIdCache && labelIds.includes(processedLabelIdCache)) return true;
  return false;
}

async function applyProcessedLabel(gmail, messageId) {
  try {
    const labelId = await getProcessedLabelId(gmail);
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds: [labelId] },
    });
  } catch (error) {
    // Silently fail - no retries
  }
}

// Rate limiting simplificado - solo en memoria (sin GCS)
let rateLimitCount = 0;
let rateLimitWindowStart = Date.now();
const RATE_LIMIT_MAX = 200;
const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000;

function checkRateLimit() {
  const now = Date.now();
  const windowAge = now - rateLimitWindowStart;
  
  if (windowAge >= RATE_LIMIT_WINDOW_MS) {
    rateLimitCount = 0;
    rateLimitWindowStart = now;
  }
  
  return rateLimitCount < RATE_LIMIT_MAX;
}

function incrementRateLimit() {
  const now = Date.now();
  const windowAge = now - rateLimitWindowStart;
  
  if (windowAge >= RATE_LIMIT_WINDOW_MS) {
    rateLimitCount = 0;
    rateLimitWindowStart = now;
  }
  
  rateLimitCount++;
  return rateLimitCount <= RATE_LIMIT_MAX;
}

export async function processMessageIds(gmail, ids) {
  if (!checkRateLimit()) {
    return {
      exitosos: 0,
      fallidos: 0,
      saltados: ids.length,
      rateLimitExceeded: true,
      resultados: ids.map(id => ({ id, skipped: true, reason: "rate_limit_exceeded" })),
    };
  }
  
  const results = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    let allHeaders = [];
    let getAllHeaders = null;

    try {

      let msg;
      try {
        msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      } catch (e) {
        if (String(e?.response?.status || e?.code || e?.status) === "404") {
          continue;
        }
        continue;
      }

      const msgLabelIds = msg.data.labelIds || [];
      if (!msgLabelIds.includes("INBOX")) {
        continue;
      }

      // Verificar etiqueta processed localmente (sin API)
      const hasProcessedLabel = msgLabelIds.includes("processed") || (processedLabelIdCache && msgLabelIds.includes(processedLabelIdCache));
      if (hasProcessedLabel) {
        results.push({ id, airtableId: null, intent: null, confidence: null, skipped: true, reason: "already_processed" });
        continue;
      }

      // APLICAR ETIQUETA "PROCESSED" INMEDIATAMENTE COMO LOCK OPTIMISTA
      // Si falla, otra instancia ya está procesando este email
      let labelApplied = false;
      try {
        const labelId = await getProcessedLabelId(gmail);
        await gmail.users.messages.modify({
          userId: "me",
          id: id,
          requestBody: { addLabelIds: [labelId] },
        });
        labelApplied = true;
      } catch (labelError) {
        // Si falla al aplicar etiqueta, otra instancia ya la aplicó - saltar
        results.push({ id, airtableId: null, intent: null, confidence: null, skipped: true, reason: "concurrent_processing" });
        continue;
      }

      const basicHeaders = msg.data.payload?.headers || [];
      const fromHeaderBasic = basicHeaders.find(h => h.name?.toLowerCase() === "from")?.value || "";
      const subjectHeaderBasic = basicHeaders.find(h => h.name?.toLowerCase() === "subject")?.value || "";
      
      if (fromHeaderBasic && fromHeaderBasic.toLowerCase().includes("secretmedia@feverup.com")) {
        continue;
      }
      
      if (subjectHeaderBasic && subjectHeaderBasic.toLowerCase().trim() === "test") {
        continue;
      }
      
      if (fromHeaderBasic && fromHeaderBasic.toLowerCase().includes("jongarnicaizco@gmail.com")) {
        continue;
      }

      getAllHeaders = (payload) => {
        const headersArray = [];
        if (payload && payload.headers && Array.isArray(payload.headers)) {
          headersArray.push(...payload.headers);
        }
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
      
      if (msg && msg.data && msg.data.payload) {
        allHeaders = getAllHeaders(msg.data.payload);
      } else {
        allHeaders = [];
      }
      
      if (!Array.isArray(allHeaders)) {
        allHeaders = [];
      }

      const findHeader = (name) => {
        const h = allHeaders.find(header => header.name?.toLowerCase() === name.toLowerCase());
        return h ? h.value : "";
      };

      const fromHeader = findHeader("From");
      const toHeader = findHeader("To");
      const cc = findHeader("Cc");
      const bcc = findHeader("Bcc");
      const replyTo = findHeader("Reply-To");
      const subject = findHeader("Subject") || "";
      const body = bodyFromMessage(msg.data);

      const fromEmailRaw = extractFromEmail(fromHeader, cc, bcc, replyTo);
      const from = String(fromEmailRaw || "").trim().toLowerCase();
      
      const toEmailRaw = extractToEmail(toHeader || "", cc || "", bcc || "", replyTo || "", "");
      let to = String(toEmailRaw || "").trim().toLowerCase();
      
      if (toHeader && toHeader.trim()) {
        const toHeaderEmail = extractCleanEmail(toHeader);
        if (toHeaderEmail && toHeaderEmail.trim() !== "") {
          if (toHeaderEmail !== to || (from && from === to)) {
            to = toHeaderEmail.toLowerCase();
          }
        }
      }

      if (!from || !to) {
        continue;
      }

      if (from === to && from) {
        if (toHeader && toHeader.trim()) {
          const toHeaderEmail = extractCleanEmail(toHeader);
          if (toHeaderEmail && toHeaderEmail.toLowerCase() !== from) {
            to = toHeaderEmail.toLowerCase();
          }
        }
      }

      let senderName = extractSenderName(fromHeader);
      if (senderName) {
        senderName = senderName.replace(/["'`]/g, "").trim();
        if (/[<>{}|\\]/.test(senderName) || senderName.length > 100) {
          const cleanName = senderName.split(/[<>{}|\\]/)[0].trim();
          if (cleanName && cleanName.length > 0) {
            senderName = cleanName;
          }
        }
      }
      
      let senderFirstName = "";
      if (senderName) {
        const nameParts = senderName.split(/\s+/);
        if (nameParts.length > 0) {
          senderFirstName = nameParts[0];
          if (senderName.length < 20 && nameParts.length <= 2) {
            senderFirstName = senderName;
          }
        }
      }

      const language = detectLanguage(subject + " " + body);
      const location = getLocationFromEmail(toHeader);
      const internalDate = msg.data.internalDate;
      const timestamp = internalDate ? new Date(parseInt(internalDate, 10)).toISOString() : new Date().toISOString();

      // VERIFICAR SI YA EXISTE EN AIRTABLE ANTES DE LLAMAR A GEMINI
      // (La etiqueta ya está aplicada como lock, pero verificamos Airtable por si acaso)
      const existingRecord = await airtableFindByEmailId(id);
      if (existingRecord) {
        // Ya existe en Airtable, pero la etiqueta ya está aplicada - todo OK
        results.push({ id, airtableId: existingRecord.id, intent: null, confidence: null, skipped: true });
        continue;
      }

      // SOLO LLAMAR A GEMINI SI EL EMAIL NO EXISTE EN AIRTABLE
      const isReply = subject.toLowerCase().startsWith("re:") ||
                      subject.toLowerCase().startsWith("fwd:") ||
                      (findHeader("In-Reply-To") && findHeader("In-Reply-To").length > 0) ||
                      (msg.data.threadId && msg.data.threadId !== msg.data.id);

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
      
      // Enviar emails solo si se creó exitosamente en Airtable
      // (se moverá después de crear en Airtable)

      // Verificar una vez más ANTES de crear (race condition protection)
      const doubleCheckRecord = await airtableFindByEmailId(id);
      if (doubleCheckRecord) {
        // Otra instancia ya creó el registro - saltar
        results.push({ id, airtableId: doubleCheckRecord.id, intent: null, confidence: null, skipped: true });
        continue;
      }

      const airtableRecord = await createAirtableRecord({
        id, from, to, cc, subject, body, bodySummary, timestamp,
        intent: finalIntent, confidence: finalConfidence, reasoning: finalReasoning,
        meddicMetrics, meddicEconomicBuyer, meddicDecisionCriteria, meddicDecisionProcess,
        meddicIdentifyPain, meddicChampion, isFreeCoverage, isBarter, isPricing,
        senderName, senderFirstName, language, location,
      });

      // Solo enviar emails si se creó exitosamente
      if (airtableRecord?.id) {
        if (isBarter) {
          try {
            await sendBarterEmail(id, senderFirstName || "Client", brandName, subject);
          } catch (barterError) {
            // Continue
          }
        }
        
        if (isFreeCoverage) {
          try {
            await sendFreeCoverageEmail(id, senderFirstName || "Client", brandName, subject);
          } catch (freeCoverageError) {
            // Continue
          }
        }

        // La etiqueta ya está aplicada (se aplicó al inicio como lock)
        // Solo incrementar rate limit
        incrementRateLimit();
      }

      results.push({
        id,
        airtableId: airtableRecord?.id || null,
        intent: finalIntent,
        confidence: finalConfidence,
      });
    } catch (e) {
      // Silently continue
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
