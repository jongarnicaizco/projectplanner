/**
 * mfs-lead-generation-ai
 * 
 * Procesa correos de INBOX usando Gmail History + locks en GCS
 * Clasifica con Vertex AI 2.x y envía email con los datos del lead
 * 
 * CI/CD: GitHub -> Cloud Build -> Cloud Run (solo contenedores)
 */
import express from "express";
import functions from "@google-cloud/functions-framework";
import { CFG } from "./config.js";
import { getGmailClient, getGmailSenderClient, setupWatch, setupWatchSender } from "./services/gmail.js";
import { clearHistoryState, writeHistoryState, clearHistoryStateSender, readServiceStatus, writeServiceStatus } from "./services/storage.js";
import { backoff, logErr } from "./utils/helpers.js";
import { handlePubSub } from "./handlers/pubsub.js";
import {
  handleLabels,
  handleMessage,
  handleScan,
} from "./handlers/debug.js";
import {
  handleDailyMetrics,
  handleAnalyzeMetrics,
  handleCorrection,
  handleAutoAdjustCode,
} from "./handlers/metrics.js";

/* ───────────────────────────── App ───────────────────────────── */
const app = express();
app.use(express.json());

/* ───────────────────────────── Endpoints ───────────────────────────── */

app.get("/healthz", (_req, res) => res.send("ok"));

// ───────────────────────────── Control del Servicio (START/STOP) ─────────────────────────────

/**
 * Obtiene el estado actual del servicio
 */
app.get("/control/status", async (_req, res) => {
  try {
    const { readServiceStatus, readSalesforceStatus, readEmailSendingStatus } = await import("./services/storage.js");
    const serviceStatus = await readServiceStatus();
    const salesforceStatus = await readSalesforceStatus();
    const emailStatus = await readEmailSendingStatus();
    
    res.json({
      ok: true,
      status: serviceStatus.status,
      salesforce: salesforceStatus.status,
      emailSending: emailStatus.status,
      updatedAt: serviceStatus.updatedAt,
    });
  } catch (e) {
    logErr("control/status error:", e);
    res.status(500).json({ error: e?.message });
  }
});

/**
 * Activa el servicio (START)
 * Al activar, actualiza el historyId para solo procesar mensajes nuevos
 */
app.post("/control/start", async (_req, res) => {
  try {
    console.log("[mfs] /control/start → Activando servicio - DESCARTANDO TODO LO PENDIENTE");
    
    // CRÍTICO: Actualizar historyId de ambas cuentas al MÁS RECIENTE para solo procesar mensajes nuevos
    // Esto descarta cualquier mensaje pendiente y empieza desde 0
    try {
      const gmail = await getGmailClient();
      const prof = await gmail.users.getProfile({ userId: "me" });
      const currentHistoryId = String(prof.data.historyId || "");
      if (currentHistoryId) {
        await writeHistoryState(currentHistoryId);
        console.log("[mfs] /control/start → ✓ historyId principal actualizado a:", currentHistoryId, "(TODO LO ANTERIOR DEScartado)");
      }
    } catch (e) {
      console.warn("[mfs] /control/start → No se pudo actualizar historyId principal:", e.message);
    }
    
    try {
      const gmailSender = await getGmailSenderClient();
      const profSender = await gmailSender.users.getProfile({ userId: "me" });
      const currentHistoryIdSender = String(profSender.data.historyId || "");
      if (currentHistoryIdSender) {
        await writeHistoryStateSender(currentHistoryIdSender);
        console.log("[mfs] /control/start → ✓ historyId SENDER actualizado a:", currentHistoryIdSender, "(TODO LO ANTERIOR DEScartado)");
      }
    } catch (e) {
      console.warn("[mfs] /control/start → No se pudo actualizar historyId SENDER:", e.message);
    }
    
    // Resetear contador de rate limit antes de activar
    try {
      const { resetRateLimitCounter } = await import("./services/processor.js");
      resetRateLimitCounter();
      console.log("[mfs] /control/start → ✓ Contador de rate limit reseteado");
    } catch (resetError) {
      console.warn("[mfs] /control/start → No se pudo resetear contador de rate limit:", resetError?.message);
    }
    
    // Activar servicio
    await writeServiceStatus("active");
    
    res.json({
      ok: true,
      message: "Servicio activado. TODO LO PENDIENTE DEScartado. Solo se procesarán mensajes NUEVOS a partir de ahora.",
      status: "active",
    });
  } catch (e) {
    logErr("control/start error:", e);
    res.status(500).json({ error: e?.message });
  }
});

/**
 * Detiene el servicio (STOP)
 */
app.post("/control/stop", async (_req, res) => {
  try {
    console.log("[mfs] /control/stop → Deteniendo servicio");
    await writeServiceStatus("stopped");
    
    res.json({
      ok: true,
      message: "Servicio detenido. No se procesarán mensajes hasta que se reactive.",
      status: "stopped",
    });
  } catch (e) {
    logErr("control/stop error:", e);
    res.status(500).json({ error: e?.message });
  }
});

/**
 * Obtiene el estado de todos los servicios
 */
app.get("/control/status", async (_req, res) => {
  try {
    const { readServiceStatus, readSalesforceStatus, readEmailSendingStatus } = await import("./services/storage.js");
    const serviceStatus = await readServiceStatus();
    const salesforceStatus = await readSalesforceStatus();
    const emailStatus = await readEmailSendingStatus();
    
    res.json({
      ok: true,
      status: serviceStatus.status,
      salesforce: salesforceStatus.status,
      emailSending: emailStatus.status,
      updatedAt: serviceStatus.updatedAt,
    });
  } catch (e) {
    logErr("control/status error:", e);
    res.status(500).json({ error: e?.message });
  }
});

/**
 * Activa/Detiene la integración con Salesforce
 */
app.post("/control/salesforce", async (req, res) => {
  try {
    const { action } = req.body;
    const { writeSalesforceStatus } = await import("./services/storage.js");
    
    if (action === "start") {
      await writeSalesforceStatus("active");
      res.json({
        ok: true,
        message: "Integración con Salesforce activada. Se crearán leads para Medium, High y Very High.",
        status: "active",
      });
    } else if (action === "stop") {
      await writeSalesforceStatus("stopped");
      res.json({
        ok: true,
        message: "Integración con Salesforce detenida. No se crearán leads, pero se seguirán procesando emails en Airtable.",
        status: "stopped",
      });
    } else {
      res.status(400).json({ error: "Action debe ser 'start' o 'stop'" });
    }
  } catch (e) {
    logErr("control/salesforce error:", e);
    res.status(500).json({ error: e?.message });
  }
});

/**
 * Activa/Detiene el envío de emails automáticos
 */
app.post("/control/email-sending", async (req, res) => {
  try {
    const { action } = req.body;
    const { writeEmailSendingStatus } = await import("./services/storage.js");
    
    if (action === "start") {
      await writeEmailSendingStatus("active");
      res.json({
        ok: true,
        message: "Envío de emails automáticos activado.",
        status: "active",
      });
    } else if (action === "stop") {
      await writeEmailSendingStatus("stopped");
      res.json({
        ok: true,
        message: "Envío de emails automáticos detenido. Se seguirán procesando emails en Airtable y creando leads en Salesforce.",
        status: "stopped",
      });
    } else {
      res.status(400).json({ error: "Action debe ser 'start' o 'stop'" });
    }
  } catch (e) {
    logErr("control/email-sending error:", e);
    res.status(500).json({ error: e?.message });
  }
});

/**
 * Endpoint para procesar correos sin etiqueta "processed" (fallback automático cada 15 minutos)
 * Procesa correos de los últimos 30 minutos que no tengan la etiqueta "processed"
 * Usa fallback sin query si la query falla (para tokens con scope limitado)
 */
app.post("/control/process-unprocessed", async (_req, res) => {
  try {
    console.log(`[mfs] /control/process-unprocessed → Procesando correos sin etiqueta "processed" (fallback automático - últimos 30 minutos)`);
    
    const MAX_MESSAGES_TO_CHECK = 20; // Límite para evitar excesivas transacciones
    const thirtyMinutesAgo = Math.floor(Date.now() / 1000) - (30 * 60); // Últimos 30 minutos
    const thirtyMinutesAgoMs = Date.now() - (30 * 60 * 1000); // Para comparar internalDate
    
    let totalProcesados = 0;
    let totalFallidos = 0;
    let totalSaltados = 0;
    let totalEncontrados = 0;
    
    // Función auxiliar para obtener mensajes sin processed usando query (método preferido)
    async function getUnprocessedWithQuery(gmail, accountName) {
      try {
        const query = `in:inbox -label:processed after:${thirtyMinutesAgo}`;
        console.log(`[mfs] /control/process-unprocessed → Query ${accountName}: ${query}`);
        
        const list = await gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: MAX_MESSAGES_TO_CHECK,
        });
        
        return (list.data.messages || []).map(m => m.id);
      } catch (queryError) {
        const errorMsg = queryError?.message || String(queryError);
        if (errorMsg.includes("Metadata scope") || errorMsg.includes("does not support 'q' parameter")) {
          console.warn(`[mfs] /control/process-unprocessed → Query no disponible para ${accountName} (scope limitado), usando fallback sin query`);
          return null; // Indicar que se debe usar fallback
        }
        throw queryError; // Re-lanzar otros errores
      }
    }
    
    // Función auxiliar para obtener mensajes sin processed usando fallback (sin query)
    async function getUnprocessedWithFallback(gmail, accountName) {
      try {
        console.log(`[mfs] /control/process-unprocessed → Fallback sin query para ${accountName} (últimos ${MAX_MESSAGES_TO_CHECK} mensajes del INBOX)`);
        
        // Obtener mensajes del INBOX sin query (funciona con scope limitado)
        const list = await gmail.users.messages.list({
          userId: "me",
          labelIds: ["INBOX"],
          maxResults: MAX_MESSAGES_TO_CHECK,
        });
        
        const messages = list.data.messages || [];
        console.log(`[mfs] /control/process-unprocessed → Fallback ${accountName}: encontrados ${messages.length} mensajes en INBOX`);
        
        // Verificar cada mensaje para ver si tiene "processed" y es reciente
        const unprocessedIds = [];
        let processedCount = 0;
        let tooOldCount = 0;
        
        for (const msg of messages) {
          if (!msg.id) continue;
          if (unprocessedIds.length >= MAX_MESSAGES_TO_CHECK) break;
          
          try {
            // Obtener metadata del mensaje (solo labels e internalDate)
            const msgDetail = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "metadata",
              metadataHeaders: [],
            });
            
            const labels = msgDetail.data.labelIds || [];
            const internalDate = parseInt(msgDetail.data.internalDate || "0", 10);
            
            // Verificar si tiene "processed"
            if (labels.includes("processed")) {
              processedCount++;
              continue;
            }
            
            // Verificar si es reciente (últimos 30 minutos)
            if (internalDate < thirtyMinutesAgoMs) {
              tooOldCount++;
              continue;
            }
            
            // Agregar el mensaje
            unprocessedIds.push(msg.id);
          } catch (msgError) {
            console.warn(`[mfs] /control/process-unprocessed → Error obteniendo metadata de mensaje ${msg.id} (${accountName}):`, msgError?.message);
            continue;
          }
        }
        
        console.log(`[mfs] /control/process-unprocessed → Fallback ${accountName}: ${unprocessedIds.length} sin processed, ${processedCount} ya procesados, ${tooOldCount} muy antiguos`);
        return unprocessedIds;
      } catch (fallbackError) {
        console.error(`[mfs] /control/process-unprocessed → Error en fallback para ${accountName}:`, fallbackError?.message || fallbackError);
        return [];
      }
    }
    
    // Procesar cuenta principal (media.manager@feverup.com)
    try {
      const gmail = await getGmailClient();
      
      // Intentar primero con query
      let messageIds = await getUnprocessedWithQuery(gmail, "cuenta principal");
      
      // Si la query falló (null), usar fallback
      if (messageIds === null) {
        messageIds = await getUnprocessedWithFallback(gmail, "cuenta principal");
      }
      
      totalEncontrados += messageIds.length;
      console.log(`[mfs] /control/process-unprocessed → Encontrados ${messageIds.length} mensajes sin processed (cuenta principal)`);
      
      if (messageIds.length > 0) {
        const { processMessageIds } = await import("./services/processor.js");
        const results = await processMessageIds(gmail, messageIds, "Cloud Scheduler (Fallback automático cada 15 minutos - cuenta principal)");
        totalProcesados += results.exitosos || 0;
        totalFallidos += results.fallidos || 0;
        totalSaltados += results.saltados || 0;
        console.log(`[mfs] /control/process-unprocessed → Cuenta principal: ${results.exitosos} procesados, ${results.fallidos} fallidos, ${results.saltados} saltados`);
      }
    } catch (e) {
      console.error(`[mfs] /control/process-unprocessed → Error procesando cuenta principal:`, e?.message || e);
      logErr("control/process-unprocessed error (cuenta principal):", e);
    }
    
    // Procesar cuenta SENDER (secretmedia@feverup.com)
    try {
      const gmailSender = await getGmailSenderClient();
      
      // Intentar primero con query
      let senderMessageIds = await getUnprocessedWithQuery(gmailSender, "cuenta SENDER");
      
      // Si la query falló (null), usar fallback
      if (senderMessageIds === null) {
        senderMessageIds = await getUnprocessedWithFallback(gmailSender, "cuenta SENDER");
      }
      
      totalEncontrados += senderMessageIds.length;
      console.log(`[mfs] /control/process-unprocessed → Encontrados ${senderMessageIds.length} mensajes sin processed (cuenta SENDER)`);
      
      if (senderMessageIds.length > 0) {
        const { processMessageIds } = await import("./services/processor.js");
        const senderResults = await processMessageIds(gmailSender, senderMessageIds, "Cloud Scheduler (Fallback automático cada 15 minutos - cuenta SENDER)");
        totalProcesados += senderResults.exitosos || 0;
        totalFallidos += senderResults.fallidos || 0;
        totalSaltados += senderResults.saltados || 0;
        console.log(`[mfs] /control/process-unprocessed → Cuenta SENDER: ${senderResults.exitosos} procesados, ${senderResults.fallidos} fallidos, ${senderResults.saltados} saltados`);
      }
    } catch (e) {
      console.error(`[mfs] /control/process-unprocessed → Error procesando cuenta SENDER:`, e?.message || e);
      logErr("control/process-unprocessed error (cuenta SENDER):", e);
    }
    
    res.json({
      ok: true,
      message: `Fallback completado: ${totalProcesados} procesados, ${totalFallidos} fallidos, ${totalSaltados} saltados`,
      totalEncontrados,
      procesados: totalProcesados,
      fallidos: totalFallidos,
      saltados: totalSaltados,
    });
  } catch (e) {
    logErr("control/process-unprocessed error:", e);
    res.status(500).json({ error: e?.message });
  }
});

/**
 * Webhook de Airtable para detener el servicio automáticamente
 * Este endpoint recibe llamadas del webhook de Airtable y ejecuta lo mismo que el botón de "Detener" del webapp
 * CRÍTICO: Este webhook debe detener el servicio COMPLETAMENTE y verificar que el estado se guardó correctamente
 */
app.post("/webhook/airtable-stop", async (_req, res) => {
  try {
    console.log("[mfs] 🚨 /webhook/airtable-stop → Webhook recibido de sistema de alerting, DETENIENDO SERVICIO COMPLETAMENTE");
    
    // Escribir estado "stopped" en GCS
    await writeServiceStatus("stopped");
    console.log("[mfs] 🚨 /webhook/airtable-stop → Estado 'stopped' escrito en GCS");
    
    // VERIFICAR que el estado se guardó correctamente (lectura inmediata)
    const { readServiceStatus } = await import("./services/storage.js");
    const verificationStatus = await readServiceStatus();
    
    if (verificationStatus.status !== "stopped") {
      console.error(`[mfs] 🚨 ERROR CRÍTICO: El estado no se guardó correctamente. Estado esperado: 'stopped', Estado actual: '${verificationStatus.status}'`);
      // Intentar escribir de nuevo
      await writeServiceStatus("stopped");
      const secondVerification = await readServiceStatus();
      if (secondVerification.status !== "stopped") {
        throw new Error(`No se pudo guardar el estado 'stopped'. Estado actual: '${secondVerification.status}'`);
      }
    }
    
    console.log(`[mfs] 🚨 /webhook/airtable-stop → ✓ VERIFICACIÓN EXITOSA: Servicio detenido completamente. Estado verificado: '${verificationStatus.status}'. NO se procesarán mensajes hasta que se reactive manualmente desde el webapp.`);
    
    res.json({
      ok: true,
      message: "Servicio detenido completamente desde webhook de alerting. No se procesarán mensajes hasta que se reactive desde el webapp.",
      status: "stopped",
      verified: true,
      source: "airtable-webhook",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[mfs] 🚨 ERROR CRÍTICO en /webhook/airtable-stop:", e?.message || e);
    logErr("webhook/airtable-stop error:", e);
    res.status(500).json({ 
      ok: false,
      error: e?.message || "Error desconocido al detener el servicio",
      status: "unknown",
    });
  }
});

/**
 * Web app simple para controlar el servicio
 */
app.get("/control", async (_req, res) => {
  try {
    const { readServiceStatus, readSalesforceStatus, readEmailSendingStatus } = await import("./services/storage.js");
    const status = await readServiceStatus();
    const salesforceStatus = await readSalesforceStatus();
    const emailStatus = await readEmailSendingStatus();
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Control del Servicio - MFS Lead Generation</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
      max-width: 500px;
      width: 100%;
      text-align: center;
    }
    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 28px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 30px;
      font-size: 14px;
    }
    .status {
      display: inline-block;
      padding: 12px 24px;
      border-radius: 50px;
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 30px;
      transition: all 0.3s;
    }
    .status.active {
      background: #10b981;
      color: white;
    }
    .status.stopped {
      background: #ef4444;
      color: white;
    }
    .buttons {
      display: flex;
      gap: 15px;
      margin-bottom: 30px;
    }
    button {
      flex: 1;
      padding: 15px 30px;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    }
    button:active {
      transform: translateY(0);
    }
    .btn-start {
      background: #10b981;
      color: white;
    }
    .btn-start:hover {
      background: #059669;
    }
    .btn-start:disabled {
      background: #d1d5db;
      cursor: not-allowed;
      transform: none;
    }
    .btn-stop {
      background: #ef4444;
      color: white;
    }
    .btn-stop:hover {
      background: #dc2626;
    }
    .btn-stop:disabled {
      background: #d1d5db;
      cursor: not-allowed;
      transform: none;
    }
    .info {
      background: #f3f4f6;
      border-radius: 10px;
      padding: 20px;
      margin-top: 20px;
      text-align: left;
    }
    .info h3 {
      color: #333;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .info p {
      color: #666;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 8px;
    }
    .info ul {
      color: #666;
      font-size: 13px;
      line-height: 1.6;
      margin-left: 20px;
    }
    .loading {
      display: none;
      color: #666;
      font-size: 14px;
      margin-top: 10px;
    }
    .loading.show {
      display: block;
    }
    .updated-at {
      color: #999;
      font-size: 12px;
      margin-top: 20px;
    }
    .control-section {
      background: #f9fafb;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
      margin-top: 20px;
      text-align: left;
    }
    .control-section h3 {
      color: #1f2937;
      margin-bottom: 12px;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .control-section .description {
      color: #6b7280;
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 15px;
    }
    .control-section .status-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 15px;
    }
    .control-section .status-badge.active {
      background: #d1fae5;
      color: #065f46;
    }
    .control-section .status-badge.stopped {
      background: #fee2e2;
      color: #991b1b;
    }
    @media (max-width: 640px) {
      .container {
        padding: 20px;
        border-radius: 16px;
      }
      h1 {
        font-size: 24px;
      }
      .subtitle {
        font-size: 13px;
      }
      .status {
        font-size: 14px;
        padding: 10px 20px;
      }
      button {
        padding: 12px 20px;
        font-size: 14px;
      }
      .control-section {
        padding: 16px;
      }
      .control-section h3 {
        font-size: 15px;
      }
      .info {
        padding: 16px;
      }
      .info p {
        font-size: 12px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Control del Servicio</h1>
    <p class="subtitle">MFS Lead Generation AI</p>
    
    <div class="status ${status.status}" id="status">
      ${status.status === "active" ? "🟢 ACTIVO" : "🔴 DETENIDO"}
    </div>
    
    <div class="buttons">
      <button class="btn-start" id="btnStart" ${status.status === "active" ? "disabled" : ""}>
        ▶ Iniciar
      </button>
      <button class="btn-stop" id="btnStop" ${status.status === "stopped" ? "disabled" : ""}>
        ⏸ Detener
      </button>
    </div>
    
    <div class="control-section">
      <h3>☁️ Integración con Salesforce</h3>
      <div class="status-badge ${salesforceStatus.status}" id="salesforceStatus">
        ${salesforceStatus.status === "active" ? "🟢 ACTIVO" : "🔴 DETENIDO"}
      </div>
      <p class="description">Controla la creación de leads en Salesforce. Si está detenido, los emails se seguirán procesando en Airtable pero no se crearán leads.</p>
      <div class="buttons">
        <button class="btn-start" id="btnSalesforceStart" ${salesforceStatus.status === "active" ? "disabled" : ""}>
          ▶ Activar
        </button>
        <button class="btn-stop" id="btnSalesforceStop" ${salesforceStatus.status === "stopped" ? "disabled" : ""}>
          ⏸ Detener
        </button>
      </div>
    </div>
    
    <div class="control-section">
      <h3>📧 Envío de Emails Automáticos</h3>
      <div class="status-badge ${emailStatus.status}" id="emailStatus">
        ${emailStatus.status === "active" ? "🟢 ACTIVO" : "🔴 DETENIDO"}
      </div>
      <p class="description">Controla el envío de emails automáticos de respuesta. Si está detenido, los emails se seguirán procesando en Airtable y se crearán leads, pero no se enviarán respuestas automáticas.</p>
      <div class="buttons">
        <button class="btn-start" id="btnEmailStart" ${emailStatus.status === "active" ? "disabled" : ""}>
          ▶ Activar
        </button>
        <button class="btn-stop" id="btnEmailStop" ${emailStatus.status === "stopped" ? "disabled" : ""}>
          ⏸ Detener
        </button>
      </div>
    </div>
    
    <div class="loading" id="loading">Procesando...</div>
    
    <div class="info">
      <h3>ℹ️ Información</h3>
      <p><strong>Estado actual:</strong> ${status.status === "active" ? "El servicio está procesando mensajes nuevos" : "El servicio está detenido y no procesa mensajes"}</p>
      <p><strong>Al iniciar:</strong> Se actualiza el historyId para solo procesar mensajes nuevos a partir de ahora. Los mensajes antiguos NO se procesarán.</p>
      <p><strong>Al detener:</strong> El servicio deja de procesar mensajes completamente. Las notificaciones de Pub/Sub se ignoran.</p>
      <p><strong>Importante:</strong> Los mensajes con etiqueta "processed" NUNCA se procesarán, sin importar el estado del servicio.</p>
    </div>
    
    ${status.updatedAt ? `<div class="updated-at">Última actualización: ${new Date(status.updatedAt).toLocaleString("es-ES")}</div>` : ""}
  </div>
  
  <script>
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const statusEl = document.getElementById('status');
    const loading = document.getElementById('loading');
    
    const btnSalesforceStart = document.getElementById('btnSalesforceStart');
    const btnSalesforceStop = document.getElementById('btnSalesforceStop');
    const salesforceStatusEl = document.getElementById('salesforceStatus');
    const btnEmailStart = document.getElementById('btnEmailStart');
    const btnEmailStop = document.getElementById('btnEmailStop');
    const emailStatusEl = document.getElementById('emailStatus');
    
    async function updateStatus() {
      try {
        const res = await fetch('/control/status');
        const data = await res.json();
        
        // El endpoint siempre devuelve data.ok: true y data.status, data.salesforce, data.emailSending
        if (data && (data.ok || data.status !== undefined)) {
          const serviceStatus = data.status || 'active';
          const salesforceStatus = data.salesforce || 'active';
          const emailSendingStatus = data.emailSending || 'active';
          
          // Actualizar estado del servicio principal
          statusEl.className = 'status ' + serviceStatus;
          statusEl.textContent = serviceStatus === 'active' ? '🟢 ACTIVO' : '🔴 DETENIDO';
          btnStart.disabled = serviceStatus === 'active';
          btnStop.disabled = serviceStatus === 'stopped';
          
          // Actualizar estado de Salesforce
          salesforceStatusEl.className = 'status-badge ' + salesforceStatus;
          salesforceStatusEl.textContent = salesforceStatus === 'active' ? '🟢 ACTIVO' : '🔴 DETENIDO';
          btnSalesforceStart.disabled = salesforceStatus === 'active';
          btnSalesforceStop.disabled = salesforceStatus === 'stopped';
          
          // Actualizar estado de envío de emails
          emailStatusEl.className = 'status-badge ' + emailSendingStatus;
          emailStatusEl.textContent = emailSendingStatus === 'active' ? '🟢 ACTIVO' : '🔴 DETENIDO';
          btnEmailStart.disabled = emailSendingStatus === 'active';
          btnEmailStop.disabled = emailSendingStatus === 'stopped';
        }
      } catch (e) {
        console.error('Error actualizando estado:', e);
      }
    }
    
    async function startService() {
      loading.classList.add('show');
      btnStart.disabled = true;
      btnStop.disabled = true;
      
      try {
        const res = await fetch('/control/start', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          await updateStatus();
          alert('✅ Servicio activado. Solo se procesarán mensajes nuevos.');
        } else {
          alert('❌ Error: ' + (data.error || 'No se pudo activar el servicio'));
        }
      } catch (e) {
        alert('❌ Error: ' + e.message);
      } finally {
        loading.classList.remove('show');
      }
    }
    
    async function stopService() {
      loading.classList.add('show');
      btnStart.disabled = true;
      btnStop.disabled = true;
      
      try {
        const res = await fetch('/control/stop', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          await updateStatus();
          alert('⏸ Servicio detenido. No se procesarán mensajes hasta que se reactive.');
        } else {
          alert('❌ Error: ' + (data.error || 'No se pudo detener el servicio'));
        }
      } catch (e) {
        alert('❌ Error: ' + e.message);
      } finally {
        loading.classList.remove('show');
      }
    }
    
    btnStart.addEventListener('click', startService);
    btnStop.addEventListener('click', stopService);
    
    // Control de Salesforce
    async function startSalesforce() {
      loading.classList.add('show');
      btnSalesforceStart.disabled = true;
      btnSalesforceStop.disabled = true;
      
      try {
        const res = await fetch('/control/salesforce', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' })
        });
        const data = await res.json();
        if (data.ok) {
          await updateStatus();
          alert('✅ Integración con Salesforce activada.');
        } else {
          alert('❌ Error: ' + (data.error || 'No se pudo activar Salesforce'));
        }
      } catch (e) {
        alert('❌ Error: ' + e.message);
      } finally {
        loading.classList.remove('show');
      }
    }
    
    async function stopSalesforce() {
      loading.classList.add('show');
      btnSalesforceStart.disabled = true;
      btnSalesforceStop.disabled = true;
      
      try {
        const res = await fetch('/control/salesforce', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop' })
        });
        const data = await res.json();
        if (data.ok) {
          await updateStatus();
          alert('⏸ Integración con Salesforce detenida.');
        } else {
          alert('❌ Error: ' + (data.error || 'No se pudo detener Salesforce'));
        }
      } catch (e) {
        alert('❌ Error: ' + e.message);
      } finally {
        loading.classList.remove('show');
      }
    }
    
    btnSalesforceStart.addEventListener('click', startSalesforce);
    btnSalesforceStop.addEventListener('click', stopSalesforce);
    
    // Control de envío de emails
    async function startEmailSending() {
      loading.classList.add('show');
      btnEmailStart.disabled = true;
      btnEmailStop.disabled = true;
      
      try {
        const res = await fetch('/control/email-sending', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' })
        });
        const data = await res.json();
        if (data.ok) {
          await updateStatus();
          alert('✅ Envío de emails automáticos activado.');
        } else {
          alert('❌ Error: ' + (data.error || 'No se pudo activar el envío de emails'));
        }
      } catch (e) {
        alert('❌ Error: ' + e.message);
      } finally {
        loading.classList.remove('show');
      }
    }
    
    async function stopEmailSending() {
      loading.classList.add('show');
      btnEmailStart.disabled = true;
      btnEmailStop.disabled = true;
      
      try {
        const res = await fetch('/control/email-sending', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop' })
        });
        const data = await res.json();
        if (data.ok) {
          await updateStatus();
          alert('⏸ Envío de emails automáticos detenido.');
        } else {
          alert('❌ Error: ' + (data.error || 'No se pudo detener el envío de emails'));
        }
      } catch (e) {
        alert('❌ Error: ' + e.message);
      } finally {
        loading.classList.remove('show');
      }
    }
    
    btnEmailStart.addEventListener('click', startEmailSending);
    btnEmailStop.addEventListener('click', stopEmailSending);
    
    // Actualizar estado cada 5 segundos
    setInterval(updateStatus, 5000);
  </script>
</body>
</html>`;
    res.send(html);
  } catch (e) {
    logErr("control web app error:", e);
    res.status(500).send("Error cargando la página de control");
  }
});

app.get("/vertex/status", (_req, res) => {
  res.json({
    active: true,
    config: {
      location: CFG.VERTEX_LOCATION,
      model: CFG.VERTEX_MODEL,
      skip: process.env.SKIP_VERTEX === "true",
    },
    tried_models: [
      CFG.VERTEX_MODEL,
      "gemini-2.5-flash",
      "gemini-2.5-flash-001",
      "gemini-2.0-flash",
      "gemini-2.0-flash-001",
    ],
    regions_order: [
      CFG.VERTEX_LOCATION || "us-central1",
      "us-central1",
      "europe-west1",
    ],
  });
});

app.post("/reset", async (_req, res) => {
  try {
    console.log("[mfs] /reset → reiniciando watch e historia de Gmail");
    const results = {};
    
    // Reset cuenta principal
    try {
      const gmail = await getGmailClient();
      await clearHistoryState();
      const watchResp = await setupWatch(gmail);
      const hist = String(watchResp.historyId || "");
      if (hist) {
        await writeHistoryState(hist);
        console.log("[mfs] /reset completado (cuenta principal). Nuevo historyId:", hist);
      }
      results.principal = {
        ok: true,
        historyId: hist,
        labelFilterIds: ["INBOX"],
      };
    } catch (e) {
      logErr("reset error (cuenta principal):", e);
      results.principal = { error: e?.response?.data || e?.message };
    }
    
    // Reset cuenta SENDER
    try {
      const gmailSender = await getGmailSenderClient();
      await clearHistoryStateSender();
      const watchRespSender = await setupWatchSender(gmailSender);
      const histSender = String(watchRespSender.historyId || "");
      if (histSender) {
        await writeHistoryStateSender(histSender);
        console.log("[mfs] /reset completado (cuenta SENDER). Nuevo historyId:", histSender);
      }
      results.sender = {
        ok: true,
        historyId: histSender,
        labelFilterIds: ["INBOX"],
      };
    } catch (e) {
      logErr("reset error (cuenta SENDER):", e);
      results.sender = { error: e?.response?.data || e?.message };
    }

    res.json({
      ok: results.principal?.ok && results.sender?.ok,
      ...results,
    });
  } catch (e) {
    logErr("reset error:", e);
    res.status(500).json({ error: e?.response?.data || e?.message });
  }
});

// Endpoint de diagnóstico rápido
app.get("/diagnostico", async (_req, res) => {
  try {
    const gmail = await getGmailClient();
    const historyId = await readHistoryState();
    
    // Verificar mensajes recientes en INBOX
    const list = await gmail.users.messages.list({
      userId: "me",
      q: "in:inbox",
      maxResults: 10,
    });
    
    const recentMessages = (list.data.messages || []).slice(0, 5);
    const messageDetails = [];
    
    for (const msg of recentMessages) {
      try {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const headers = full.data.payload?.headers || [];
        const getHeader = (name) => headers.find(h => h.name === name)?.value || "";
        messageDetails.push({
          id: msg.id,
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
        });
      } catch (e) {
        messageDetails.push({ id: msg.id, error: e.message });
      }
    }
    
    res.json({
      ok: true,
      historyId: historyId || "no configurado",
      mensajesRecientesEnINBOX: list.data.messages?.length || 0,
      detalles: messageDetails,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logErr("diagnostico error:", e);
    res.status(500).json({ error: e?.message });
  }
});

// Endpoint para forzar procesamiento directo de INBOX (ignora historyId)
app.post("/force-process", async (_req, res) => {
  try {
    // Verificar estado del servicio ANTES de procesar
    const serviceStatus = await readServiceStatus();
    if (serviceStatus.status === "stopped") {
      return res.status(403).json({
        ok: false,
        error: "Servicio detenido. Activa el servicio primero usando /control/start",
        status: "stopped",
      });
    }
    
    console.log("[mfs] /force-process → Procesando mensajes directamente de INBOX");
    const allResults = [];
    
    // Procesar cuenta principal (media.manager@feverup.com)
    try {
      const gmail = await getGmailClient();
      
      // Obtener mensajes recientes de INBOX (últimas 24 horas) excluyendo procesados
      // Límite máximo de seguridad: 100 mensajes
      const MAX_MESSAGES_PER_EXECUTION = 100;
      const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
      const query = `in:inbox -label:processed after:${oneDayAgo}`;
      
      const list = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: MAX_MESSAGES_PER_EXECUTION,
      });
      
      const messageIds = (list.data.messages || []).map(m => m.id);
      console.log(`[mfs] /force-process → Encontrados ${messageIds.length} mensajes en INBOX (cuenta principal)`);
      
      if (messageIds.length > 0) {
        const { processMessageIds } = await import("./services/processor.js");
        const results = await processMessageIds(gmail, messageIds, "Force Process Endpoint (Manual - cuenta principal)");
        allResults.push(...results);
      }
      
      // Actualizar historyId al actual para sincronizar
      try {
        const prof = await gmail.users.getProfile({ userId: "me" });
        const currentHistoryId = String(prof.data.historyId || "");
        if (currentHistoryId) {
          const { writeHistoryState } = await import("./services/storage.js");
          await writeHistoryState(currentHistoryId);
          console.log("[mfs] /force-process → historyId actualizado a:", currentHistoryId);
        }
      } catch (e) {
        console.warn("[mfs] /force-process → No se pudo actualizar historyId:", e.message);
      }
    } catch (e) {
      logErr("force-process error (cuenta principal):", e);
    }
    
    // Procesar cuenta SENDER (secretmedia@feverup.com)
    console.log("[mfs] ===== /force-process: INICIANDO PROCESAMIENTO CUENTA SENDER =====");
    try {
      console.log("[mfs] /force-process → Procesando mensajes de secretmedia@feverup.com");
      console.log("[mfs] /force-process → Obteniendo cliente Gmail SENDER...");
      const gmailSender = await getGmailSenderClient();
      console.log("[mfs] /force-process → ✓ Cliente Gmail SENDER obtenido exitosamente");
      
      // Límite máximo de seguridad: 100 mensajes
      const MAX_MESSAGES_PER_EXECUTION = 100;
      const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
      const query = `in:inbox -label:processed after:${oneDayAgo}`;
      console.log("[mfs] /force-process → Buscando mensajes con query:", query);
      
      const list = await gmailSender.users.messages.list({
        userId: "me",
        q: query,
        maxResults: MAX_MESSAGES_PER_EXECUTION,
      });
      
      const senderMessageIds = (list.data.messages || []).map(m => m.id);
      console.log(`[mfs] /force-process → Encontrados ${senderMessageIds.length} mensajes en INBOX (cuenta SENDER)`);
      
      if (senderMessageIds.length > 0) {
        console.log("[mfs] /force-process → Procesando", senderMessageIds.length, "mensajes de cuenta SENDER...");
        const { processMessageIds } = await import("./services/processor.js");
        const senderResults = await processMessageIds(gmailSender, senderMessageIds, "Force Process Endpoint (Manual - cuenta SENDER)");
        console.log("[mfs] /force-process → ✓ Procesamiento de cuenta SENDER completado:", senderResults.length, "resultados");
        allResults.push(...senderResults);
      } else {
        console.log("[mfs] /force-process → No hay mensajes nuevos en cuenta SENDER (últimas 2 horas)");
      }
    } catch (e) {
      console.error("[mfs] /force-process → ✗✗✗ ERROR procesando cuenta SENDER ✗✗✗");
      console.error("[mfs] /force-process → Error message:", e?.message || e);
      console.error("[mfs] /force-process → Error code:", e?.code || e?.response?.status || "unknown");
      console.error("[mfs] /force-process → Stack trace:", e?.stack);
      // Continuar aunque falle la cuenta SENDER
    }
    console.log("[mfs] ===== /force-process: FIN PROCESAMIENTO CUENTA SENDER =====");
    
    if (allResults.length === 0) {
      return res.json({
        ok: true,
        message: "No hay mensajes nuevos en INBOX (últimas 2 horas)",
        procesados: 0,
      });
    }
    
    res.json({
      ok: true,
      message: `Procesados ${allResults.length} mensajes`,
      totalEncontrados: allResults.length,
      procesados: allResults.filter(r => r.airtableId && !r.skipped).length,
      fallidos: allResults.filter(r => !r.airtableId && !r.skipped).length,
      resultados: allResults.slice(0, 10), // Primeros 10 resultados
    });
  } catch (e) {
    logErr("force-process error:", e);
    res.status(500).json({ error: e?.message });
  }
});

app.post("/watch", async (_req, res) => {
  try {
    console.log("[mfs] /watch → configurando watch en Gmail");
    const results = {};
    
    // Configurar watch para cuenta principal
    try {
      const gmail = await getGmailClient();
      const resp = await setupWatch(gmail);
      results.principal = resp && resp.historyId ? {
        ...resp,
        message: "Gmail Watch configurado correctamente para cuenta principal.",
      } : {
        message: "Gmail Watch no se pudo configurar para cuenta principal (topic no existe en el proyecto requerido).",
        warning: true,
      };
    } catch (e) {
      logErr("watch error (cuenta principal):", e);
      results.principal = { error: e?.response?.data || e?.message };
    }
    
    // Configurar watch para cuenta SENDER
    try {
      const gmailSender = await getGmailSenderClient();
      const respSender = await setupWatchSender(gmailSender);
      results.sender = respSender && respSender.historyId ? {
        ...respSender,
        message: "Gmail Watch configurado correctamente para cuenta SENDER.",
      } : {
        message: "Gmail Watch no se pudo configurar para cuenta SENDER (topic no existe en el proyecto requerido).",
        warning: true,
      };
    } catch (e) {
      logErr("watch error (cuenta SENDER):", e);
      results.sender = { error: e?.response?.data || e?.message };
    }
    
    const allSuccess = results.principal?.historyId && results.sender?.historyId;
    if (allSuccess) {
      res.json({
        ...results,
        message: "Gmail Watch configurado correctamente para ambas cuentas. Procesamiento en tiempo real activo.",
      });
    } else {
      res.status(200).json({
        ...results,
        message: "Gmail Watch configurado parcialmente. Verifica los detalles arriba.",
        warning: true,
      });
    }
  } catch (e) {
    logErr("watch error:", e);
    res.status(500).json({ error: e?.response?.data || e?.message });
  }
});

// Handler de Pub/Sub
app.post("/_pubsub", handlePubSub);

// Endpoints de debug
app.get("/debug/labels", handleLabels);
app.get("/debug/msg", handleMessage);
app.post("/debug/scan", handleScan);

// Endpoints de métricas
app.post("/metrics/daily", handleDailyMetrics);
app.get("/metrics/analyze", handleAnalyzeMetrics);
app.post("/metrics/correction", handleCorrection);

// Endpoint para auto-ajuste de código desde Sheet
app.post("/metrics/auto-adjust", handleAutoAdjustCode);

// Endpoint para auto-corrección (reporte)
app.get("/metrics/auto-correct", async (req, res) => {
  try {
    const { generateAdjustmentReport } = await import("./services/auto-corrector.js");
    const report = await generateAdjustmentReport();
    res.json(report);
  } catch (error) {
    logErr("[mfs] [metrics] Error en auto-correct:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ───────── Registro handler (Functions) + Express puro ───────── */
functions.http("handler", app);

if (
  !process.env.FUNCTION_TARGET &&
  !String(process.env.K_SERVICE || "").includes("functions")
) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, async () => {
    console.log(`[mfs] HTTP server escuchando en puerto ${PORT}`);
    console.log("[mfs] Boot →", {
      project: CFG.PROJECT_ID,
      location: CFG.VERTEX_LOCATION,
      model: CFG.VERTEX_MODEL,
      bucket: CFG.GCS_BUCKET,
    });

    if (CFG.RESET_ON_START) {
      try {
        console.log(
          "[mfs] RESET_ON_START activo → reseteo watch e historyId al arrancar"
        );
        
        // Reset cuenta principal
        try {
          const gmail = await getGmailClient();
          await clearHistoryState();
          const watchResp = await setupWatch(gmail);
          const hist = String(watchResp.historyId || "");
          if (hist) {
            await writeHistoryState(hist);
            console.log(
              "[mfs] RESET_ON_START completado (cuenta principal). historyId:",
              hist,
              "labelFilterIds:",
              ["INBOX"]
            );
          }
        } catch (e) {
          logErr("[mfs] RESET_ON_START error (cuenta principal):", e);
        }
        
        // Reset cuenta SENDER
        try {
          const gmailSender = await getGmailSenderClient();
          await clearHistoryStateSender();
          const watchRespSender = await setupWatchSender(gmailSender);
          const histSender = String(watchRespSender.historyId || "");
          if (histSender) {
            await writeHistoryStateSender(histSender);
            console.log(
              "[mfs] RESET_ON_START completado (cuenta SENDER). historyId:",
              histSender,
              "labelFilterIds:",
              ["INBOX"]
            );
          }
        } catch (e) {
          logErr("[mfs] RESET_ON_START error (cuenta SENDER):", e);
        }
      } catch (e) {
        logErr("[mfs] RESET_ON_START error:", e);
      }
    }
  });
}

// Manejo de errores globales
process.on("unhandledRejection", (e) =>
  console.error("[mfs] UnhandledRejection:", e)
);

process.on("uncaughtException", (e) =>
  console.error("[mfs] UncaughtException:", e)
);


