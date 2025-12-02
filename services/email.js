/**
 * Servicio para enviar emails de notificación
 */
import { getGmailClient } from "./gmail.js";
import { CFG } from "../config.js";

const FROM_EMAIL = CFG.EMAIL_FROM || "media.manager@feverup.com";
const TO_EMAIL = CFG.EMAIL_TO || "jongarnicaizco@gmail.com";

/**
 * Envía un email con los datos del lead procesado
 */
export async function sendLeadEmail(data) {
  try {
    const gmail = await getGmailClient();
    
    // Formatear el cuerpo del email con todos los datos
    const emailBody = formatLeadEmail(data);
    
    // Crear el mensaje en formato raw
    const message = createEmailMessage(
      FROM_EMAIL,
      TO_EMAIL,
      `Nuevo Lead: ${data.subject || "Sin asunto"}`,
      emailBody
    );
    
    // Enviar el email
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: message,
      },
    });
    
    console.log("[mfs] Email: ✓ Email enviado exitosamente", {
      messageId: response.data.id,
      emailId: data.id,
    });
    
    return { success: true, messageId: response.data.id };
  } catch (e) {
    console.error("[mfs] Email: ✗ ERROR enviando email", {
      emailId: data.id,
      errorMessage: e?.message,
      errorCode: e?.code,
    });
    return { success: false, error: e?.message };
  }
}

/**
 * Formatea los datos del lead en un email legible
 */
function formatLeadEmail(data) {
  const lines = [];
  
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("                    NUEVO LEAD RECIBIDO");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("");
  
  // Información básica
  lines.push("📧 INFORMACIÓN DEL EMAIL");
  lines.push("───────────────────────────────────────────────────────");
  lines.push(`Email ID: ${data.id || "N/A"}`);
  lines.push(`From: ${data.from || "N/A"}`);
  lines.push(`To: ${data.to || "N/A"}`);
  if (data.cc) lines.push(`CC: ${data.cc}`);
  lines.push(`Subject: ${data.subject || "Sin asunto"}`);
  lines.push(`Timestamp: ${data.timestamp || "N/A"}`);
  lines.push("");
  
  // Información del cliente
  if (data.senderName || data.senderFirstName) {
    lines.push("👤 INFORMACIÓN DEL CLIENTE");
    lines.push("───────────────────────────────────────────────────────");
    if (data.senderName) lines.push(`Nombre completo: ${data.senderName}`);
    if (data.senderFirstName) lines.push(`Primer nombre: ${data.senderFirstName}`);
    lines.push("");
  }
  
  // Ubicación
  if (data.location) {
    lines.push("📍 UBICACIÓN");
    lines.push("───────────────────────────────────────────────────────");
    if (data.location.city) lines.push(`Ciudad: ${data.location.city}`);
    if (data.location.country) lines.push(`País: ${data.location.country}`);
    if (data.location.countryCode) lines.push(`Código de país: ${data.location.countryCode}`);
    lines.push("");
  }
  
  // Idioma
  if (data.language) {
    lines.push(`🌐 Idioma: ${data.language.toUpperCase()}`);
    lines.push("");
  }
  
  // Clasificación
  lines.push("🎯 CLASIFICACIÓN DEL LEAD");
  lines.push("───────────────────────────────────────────────────────");
  lines.push(`Intent: ${data.intent || "N/A"}`);
  if (data.confidence !== undefined) {
    lines.push(`Confidence: ${(data.confidence * 100).toFixed(1)}%`);
  }
  if (data.reasoning) {
    lines.push(`Reasoning: ${data.reasoning}`);
  }
  lines.push("");
  
  // Checkboxes
  const checkboxes = [];
  if (data.isFreeCoverage) checkboxes.push("✓ Free Coverage Request");
  if (data.isBarter) checkboxes.push("✓ Barter Request");
  if (data.isPricing) checkboxes.push("✓ Media Kits/Pricing Request");
  if (checkboxes.length > 0) {
    lines.push("☑️ CHECKBOXES");
    lines.push("───────────────────────────────────────────────────────");
    checkboxes.forEach(cb => lines.push(cb));
    lines.push("");
  }
  
  // MEDDIC Analysis
  if (data.meddicMetrics || data.meddicEconomicBuyer || data.meddicDecisionCriteria) {
    lines.push("📊 ANÁLISIS MEDDIC");
    lines.push("───────────────────────────────────────────────────────");
    if (data.meddicMetrics) {
      lines.push(`Metrics: ${data.meddicMetrics}`);
    }
    if (data.meddicEconomicBuyer) {
      lines.push(`Economic Buyer: ${data.meddicEconomicBuyer}`);
    }
    if (data.meddicDecisionCriteria) {
      lines.push(`Decision Criteria: ${data.meddicDecisionCriteria}`);
    }
    if (data.meddicDecisionProcess) {
      lines.push(`Decision Process: ${data.meddicDecisionProcess}`);
    }
    if (data.meddicIdentifyPain) {
      lines.push(`Identify Pain: ${data.meddicIdentifyPain}`);
    }
    if (data.meddicChampion) {
      lines.push(`Champion: ${data.meddicChampion}`);
    }
    lines.push("");
  }
  
  // Resumen del body
  if (data.bodySummary) {
    lines.push("📝 RESUMEN DEL EMAIL");
    lines.push("───────────────────────────────────────────────────────");
    lines.push(data.bodySummary);
    lines.push("");
  }
  
  // Body completo (truncado si es muy largo)
  if (data.body) {
    lines.push("📄 CONTENIDO COMPLETO DEL EMAIL");
    lines.push("───────────────────────────────────────────────────────");
    const bodyPreview = data.body.length > 2000 
      ? data.body.substring(0, 2000) + "\n\n[... contenido truncado ...]"
      : data.body;
    lines.push(bodyPreview);
    lines.push("");
  }
  
  lines.push("═══════════════════════════════════════════════════════");
  lines.push(`Generado automáticamente el ${new Date().toISOString()}`);
  lines.push("═══════════════════════════════════════════════════════");
  
  return lines.join("\n");
}

/**
 * Crea un mensaje de email en formato raw (base64url)
 */
function createEmailMessage(from, to, subject, body) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    body,
  ].join("\n");
  
  // Convertir a base64url
  const encoded = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  
  return encoded;
}

