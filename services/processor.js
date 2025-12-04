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

import {
  acquireMessageLock,
  releaseMessageLock,
  checkLockAge,
  readRateLimitState,
  writeRateLimitState,
  resetRateLimitState,
} from "./storage.js";
import { classifyIntent } from "./vertex.js";
import { airtableFindByEmailId, createAirtableRecord } from "./airtable.js";
import { sendBarterEmail, sendFreeCoverageEmail, sendRateLimitNotificationEmail } from "./email-sender.js";

let processedLabelIdCache = null;

async function getProcessedLabelId(gmail) {
  if (processedLabelIdCache) return processedLabelIdCache;
  try {
    const labelsResponse = await backoff(() => gmail.users.labels.list({ userId: "me" }), "labels.list");
    const labels = labelsResponse.data.labels || [];
    const processedLabel = labels.find(label => label.name?.toLowerCase() === "processed");
    if (processedLabel) {
      processedLabelIdCache = processedLabel.id;
      return processedLabelIdCache;
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function checkProcessedLabel(gmail, labelIds) {
  try {
    const processedLabelId = await getProcessedLabelId(gmail);
    if (!processedLabelId) return false;
    return labelIds.includes(processedLabelId);
  } catch (error) {
    return false;
  }
}

async function getOrCreateProcessedLabel(gmail) {
  let processedLabelId = await getProcessedLabelId(gmail);
  if (processedLabelId) return processedLabelId;
  
  try {
    const newLabel = await backoff(
      () => gmail.users.labels.create({
        userId: "me",
        requestBody: { name: "processed", labelListVisibility: "labelShow", messageListVisibility: "show" },
      }),
      "labels.create"
    );
    processedLabelIdCache = newLabel.data.id;
    return newLabel.data.id;
  } catch (error) {
    return "processed";
  }
}

async function applyProcessedLabel(gmail, messageId) {
  try {
    const labelId = await getOrCreateProcessedLabel(gmail);
    await backoff(
      () => gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: { addLabelIds: [labelId] },
      }),
      "messages.modify.addLabel"
    );
  } catch (error) {
    if (error?.response?.status === 400 || error?.code === 400) {
      try {
        await backoff(
          () => gmail.users.messages.modify({
            userId: "me",
            id: messageId,
            requestBody: { addLabelIds: ["processed"] },
          }),
          "messages.modify.addLabel.name"
        );
      } catch (error2) {
        throw error2;
      }
    } else {
      throw error;
    }
  }
}

async function checkRateLimit() {
  const RATE_LIMIT_MAX = 200;
  const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000;
  
  try {
    const state = await readRateLimitState();
    const now = new Date();
    
    let currentCount = 0;
    let windowStart = now;
    let notificationSent = false;
    
    if (state) {
      const windowAge = now.getTime() - state.windowStart.getTime();
      if (windowAge >= RATE_LIMIT_WINDOW_MS) {
        currentCount = 0;
        windowStart = now;
        notificationSent = false;
        await writeRateLimitState(0, now, false);
      } else {
        currentCount = state.count || 0;
        windowStart = state.windowStart;
        notificationSent = state.notificationSent || false;
      }
    }
    
    const allowed = currentCount < RATE_LIMIT_MAX;
    const shouldSendNotification = !allowed && !notificationSent;
    
    return { allowed, currentCount, limit: RATE_LIMIT_MAX, windowMinutes: 30, shouldSendNotification };
  } catch (error) {
    return { allowed: true, currentCount: 0, limit: RATE_LIMIT_MAX, windowMinutes: 30, shouldSendNotification: false };
  }
}

async function incrementRateLimit() {
  const RATE_LIMIT_MAX = 200;
  const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000;
  
  try {
    const state = await readRateLimitState();
    const now = new Date();
    
    let currentCount = 0;
    let windowStart = now;
    let notificationSent = false;
    
    if (state) {
      const windowAge = now.getTime() - state.windowStart.getTime();
      if (windowAge >= RATE_LIMIT_WINDOW_MS) {
        currentCount = 0;
        windowStart = now;
        notificationSent = false;
      } else {
        currentCount = state.count || 0;
        windowStart = state.windowStart;
        notificationSent = state.notificationSent || false;
      }
    }
    
    const newCount = currentCount + 1;
    const allowed = newCount <= RATE_LIMIT_MAX;
    const shouldSendNotification = !allowed && !notificationSent;
    
    if (shouldSendNotification) {
      notificationSent = true;
    }
    
    await writeRateLimitState(newCount, windowStart, notificationSent);
    
    return { allowed, currentCount: newCount, limit: RATE_LIMIT_MAX, windowMinutes: 30, shouldSendNotification };
  } catch (error) {
    return { allowed: true, currentCount: 0, limit: RATE_LIMIT_MAX, windowMinutes: 30, shouldSendNotification: false };
  }
}

export async function processMessageIds(gmail, ids) {
  const rateLimitCheck = await checkRateLimit();
  
  if (!rateLimitCheck.allowed) {
    const state = await readRateLimitState();
    let windowAgeMinutes = 0;
    if (state && state.windowStart) {
      windowAgeMinutes = Math.floor((new Date().getTime() - new Date(state.windowStart).getTime()) / 60000);
    }
    
    if (windowAgeMinutes >= 30) {
      await resetRateLimitState();
    } else {
      if (rateLimitCheck.shouldSendNotification) {
        try {
          await sendRateLimitNotificationEmail(rateLimitCheck.currentCount, rateLimitCheck.limit, rateLimitCheck.windowMinutes);
        } catch (notificationError) {
          // Silently fail
        }
      }
      return {
        exitosos: 0,
        fallidos: 0,
        saltados: ids.length,
        rateLimitExceeded: true,
        resultados: ids.map(id => ({ id, skipped: true, reason: "rate_limit_exceeded" })),
      };
    }
  }
  
  const results = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    let lockAcquired = false;
    let allHeaders = [];
    let getAllHeaders = null;

    try {
      lockAcquired = await acquireMessageLock(id);
      if (!lockAcquired) {
        try {
          const lockAge = await checkLockAge(id);
          if (lockAge !== null && lockAge > 600000) {
            await releaseMessageLock(id);
            lockAcquired = await acquireMessageLock(id);
          }
        } catch (e) {
          // Continue
        }
        
        if (!lockAcquired) {
          results.push({ id, success: false, skipped: true, reason: "lock_exists" });
          continue;
        }
      }

      let msg;
      try {
        msg = await backoff(() => gmail.users.messages.get({ userId: "me", id, format: "full" }), "messages.get");
      } catch (e) {
        if (String(e?.response?.status || e?.code || e?.status) === "404") {
          continue;
        }
        logErr("[mfs] Error al leer mensaje de Gmail:", e);
        continue;
      }

      const msgLabelIds = msg.data.labelIds || [];
      if (!msgLabelIds.includes("INBOX")) {
        await releaseMessageLock(id);
        continue;
      }

      try {
        const hasProcessedLabel = await checkProcessedLabel(gmail, msgLabelIds);
        if (hasProcessedLabel) {
          results.push({ id, airtableId: null, intent: null, confidence: null, skipped: true, reason: "already_processed" });
          await releaseMessageLock(id);
          continue;
        }
      } catch (labelCheckError) {
        // Continue
      }

      const basicHeaders = msg.data.payload?.headers || [];
      const fromHeaderBasic = basicHeaders.find(h => h.name?.toLowerCase() === "from")?.value || "";
      const subjectHeaderBasic = basicHeaders.find(h => h.name?.toLowerCase() === "subject")?.value || "";
      
      if (fromHeaderBasic && fromHeaderBasic.toLowerCase().includes("secretmedia@feverup.com")) {
        await releaseMessageLock(id);
        continue;
      }
      
      if (subjectHeaderBasic && subjectHeaderBasic.toLowerCase().trim() === "test") {
        await releaseMessageLock(id);
        continue;
      }
      
      if (fromHeaderBasic && fromHeaderBasic.toLowerCase().includes("jongarnicaizco@gmail.com")) {
        await releaseMessageLock(id);
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
        await releaseMessageLock(id);
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
      const existingRecord = await airtableFindByEmailId(id);
      if (existingRecord) {
        try {
          await applyProcessedLabel(gmail, id);
        } catch (labelError) {
          // Continue
        }
        results.push({ id, airtableId: existingRecord.id, intent: null, confidence: null, skipped: true });
        await releaseMessageLock(id);
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

      const airtableRecord = await createAirtableRecord({
        id, from, to, cc, subject, body, bodySummary, timestamp,
        intent: finalIntent, confidence: finalConfidence, reasoning: finalReasoning,
        meddicMetrics, meddicEconomicBuyer, meddicDecisionCriteria, meddicDecisionProcess,
        meddicIdentifyPain, meddicChampion, isFreeCoverage, isBarter, isPricing,
        senderName, senderFirstName, language, location,
      });

      results.push({
        id,
        airtableId: airtableRecord?.id || null,
        intent: finalIntent,
        confidence: finalConfidence,
      });

      try {
        await applyProcessedLabel(gmail, id);
        const rateLimitUpdate = await incrementRateLimit();
        
        if (!rateLimitUpdate.allowed && rateLimitUpdate.shouldSendNotification) {
          try {
            await sendRateLimitNotificationEmail(rateLimitUpdate.currentCount, rateLimitUpdate.limit, rateLimitUpdate.windowMinutes);
          } catch (notificationError) {
            // Continue
          }
        }
      } catch (labelError) {
        // Continue
      }

      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      logErr("[mfs] Error en el bucle de processMessageIds:", e);
    } finally {
      if (lockAcquired) {
        await releaseMessageLock(id);
      }
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
