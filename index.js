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
    console.log(`[mfs] /control/process-unprocessed → Procesando correos sin etiqueta "processed" (fallback automático - últimos 60 minutos)`);

    const MAX_MESSAGES_TO_CHECK = 100; // Aumentado para capturar más correos perdidos
    const sixtyMinutesAgo = Math.floor(Date.now() / 1000) - (60 * 60); // Últimos 60 minutos (aumentado de 30)
    const sixtyMinutesAgoMs = Date.now() - (60 * 60 * 1000); // Para comparar internalDate

    let totalProcesados = 0;
    let totalFallidos = 0;
    let totalSaltados = 0;
    let totalEncontrados = 0;

    // Función auxiliar para obtener mensajes sin processed usando query (método preferido)
    async function getUnprocessedWithQuery(gmail, accountName) {
      try {
        const query = `in:inbox -label:processed after:${sixtyMinutesAgo}`;
        console.log(`[mfs] /control/process-unprocessed → Query ${accountName}: ${query}`);

        const list = await gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: MAX_MESSAGES_TO_CHECK,
        });

        const messageIds = (list.data.messages || []).map(m => m.id);
        console.log(`[mfs] /control/process-unprocessed → Query ${accountName}: encontrados ${messageIds.length} mensajes sin processed`);
        return messageIds;
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

            // Verificar si es reciente (últimos 60 minutos)
            if (internalDate < sixtyMinutesAgoMs) {
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
    const {
      readServiceStatus,
      readSalesforceStatus,
      readEmailSendingStatus,
      readSystemState,
      writeSystemState
    } = await import("./services/storage.js");

    // Read System State (Flags)
    const systemState = await readSystemState();

    // Read Hourly Cost (Counter)
    // We read directly from GCS to avoid importing internal function from cost-guard.js
    let currentCost = 0.0;
    let currentDayCost = 0.0;
    let yesterdayCost = 0.0;
    try {
      const storage = new Storage();
      const bucket = storage.bucket(CFG.GCS_BUCKET);
      const file = bucket.file(CFG.COST_GUARD_STATE_FILE || "state/cost_guard.json");
      const [exists] = await file.exists();
      if (exists) {
        const [content] = await file.download();
        const data = JSON.parse(content.toString());

        // Always read daily stats if available
        currentDayCost = data.current_day_cost_usd || 0.0;
        yesterdayCost = data.yesterday_cost_usd || 0.0;

        // Verify it's current hour
        const now = new Date();
        const currentHourKey = `${now.toISOString().slice(0, 13)}`;
        if (data.hourKey === currentHourKey) {
          currentCost = data.current_hour_cost_usd || 0.0;
        }
      }
    } catch (e) {
      console.warn("Error reading cost state:", e.message);
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MFS AI Cost Guard Control</title>
  <style>
    :root {
      --primary: #6366f1;
      --bg: #f3f4f6;
      --card: #ffffff;
      --text: #1f2937;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); display: flex; justify-content: center; padding: 20px; line-height: 1.5; }
    .container { background: var(--card); border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); width: 100%; max-width: 600px; padding: 32px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; text-align: center; }
    .subtitle { color: #6b7280; text-align: center; margin-bottom: 32px; font-size: 14px; }
    
    .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
    .status-card { background: #f9fafb; padding: 16px; border-radius: 12px; border: 1px solid #e5e7eb; }
    .status-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; font-weight: 600; text-transform: uppercase; }
    .status-value { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    
    .cost-display { text-align: center; margin-bottom: 32px; padding: 24px; background: #eef2ff; border-radius: 16px; border: 1px solid #c7d2fe; }
    .cost-label { color: #4338ca; font-weight: 600; font-size: 14px; margin-bottom: 8px; text-transform: uppercase; }
    .cost-value { font-size: 36px; font-weight: 800; color: #312e81; }
    .cost-limit { font-size: 14px; color: #6366f1; margin-top: 4px; }
    
    .stats-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 20px; text-align: left; background: white; padding: 12px; border-radius: 8px; }
    .stat-item h4 { font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
    .stat-item p { font-size: 14px; font-weight: 700; color: #1f2937; }

    .tier-badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; }
    .tier-normal { background: #d1fae5; color: #065f46; }
    .tier-warning { background: #fef3c7; color: #92400e; }
    .tier-danger { background: #fee2e2; color: #991b1b; }
    
    .controls { display: flex; flex-direction: column; gap: 12px; }
    .btn { width: 100%; padding: 16px; border: none; border-radius: 12px; font-weight: 600; font-size: 16px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .btn:active { transform: scale(0.98); }
    
    .btn-primary { background: var(--primary); color: white; }
    .btn-success { background: var(--success); color: white; }
    .btn-danger { background: var(--danger); color: white; }
    .btn-warning { background: var(--warning); color: white; }
    .btn-outline { background: white; border: 2px solid #e5e7eb; color: var(--text); }
    
    .pulse { animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>MFS Lead Gen AI</h1>
    <p class="subtitle">Cloud Run Instance: ${process.env.K_SERVICE || 'local'}</p>

    <div class="cost-display">
        <div class="cost-label">Current Hourly Cost (USD)</div>
        <div class="cost-value">$${currentCost.toFixed(4)}</div>
        <div class="cost-limit">Limit: $2.00 (Tier 1) / $8.00 (Tier 2)</div>
        
        <div>
            ${currentCost > 8.00 ? '<span class="tier-badge tier-danger">TIER 2 EXCEEDED</span>' :
        currentCost > 2.00 ? '<span class="tier-badge tier-warning">TIER 1 EXCEEDED</span>' :
          '<span class="tier-badge tier-normal">NORMAL COST FLOW</span>'}
        </div>

        <div class="stats-row">
            <div class="stat-item">
                <h4>Consumed Today</h4>
                <p>$${currentDayCost.toFixed(3)}</p>
            </div>
            <div class="stat-item">
                <h4>Yesterday Total</h4>
                <p>$${yesterdayCost.toFixed(3)}</p>
            </div>
            <div class="stat-item">
                <h4>Yesterday Hourly Avg</h4>
                <p>$${avgYesterday.toFixed(3)}/h</p>
            </div>
        </div>
    </div>

    <div class="status-grid">
        <div class="status-card">
            <div class="status-label">Service Status</div>
            <div class="status-value">
                <span style="color: ${systemState.service_status === 'active' ? 'var(--success)' : 'var(--danger)'}">
                    ${systemState.service_status === 'active' ? '● ACTIVE' : '● STOPPED'}
                </span>
            </div>
        </div>
        <div class="status-card">
            <div class="status-label">AI Mode</div>
            <div class="status-value">
                <span style="color: ${systemState.low_power_mode ? 'var(--warning)' : 'var(--success)'}">
                    ${systemState.low_power_mode ? '⚡ LOW POWER' : '🚀 PRECISION'}
                </span>
            </div>
        </div>
        <div class="status-card">
            <div class="status-label">Salesforce Sync</div>
            <div class="status-value">
                <span style="color: ${systemState.salesforce_status === 'active' ? 'var(--success)' : 'var(--danger)'}">
                    ${systemState.salesforce_status === 'active' ? '✓ ON' : '✕ OFF'}
                </span>
            </div>
        </div>
        <div class="status-card">
            <div class="status-label">Email Sending</div>
            <div class="status-value">
                <span style="color: ${systemState.email_sending_status === 'active' ? 'var(--success)' : 'var(--danger)'}">
                    ${systemState.email_sending_status === 'active' ? '✓ ON' : '✕ OFF'}
                </span>
            </div>
        </div>
    </div>

    <div class="controls">
        <button onclick="toggleService()" class="btn ${systemState.service_status === 'active' ? 'btn-danger' : 'btn-success'}">
            ${systemState.service_status === 'active' ? 'STOP GLOBAL SERVICE' : 'START GLOBAL SERVICE'}
        </button>
        
        <button onclick="resetNormalFlow()" class="btn btn-primary">
            🔄 RESET NORMAL FLOW <small>(Clear Flags & Re-enable)</small>
        </button>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <button onclick="toggleSalesforce()" class="btn btn-outline">
                SF: ${systemState.salesforce_status === 'active' ? 'DISABLE' : 'ENABLE'}
            </button>
            <button onclick="toggleEmail()" class="btn btn-outline">
                EMAIL: ${systemState.email_sending_status === 'active' ? 'DISABLE' : 'ENABLE'}
            </button>
        </div>
        
        <button onclick="toggleLowPower()" class="btn btn-outline" style="margin-top:8px; font-size: 14px;">
            Force Low Power Mode: ${systemState.low_power_mode ? 'OFF' : 'ON'}
        </button>
    </div>

    <script>
        async function apiCall(endpoint) {
            document.body.style.opacity = '0.5';
            try {
                const res = await fetch(endpoint, { method: 'POST' });
                if (res.ok) window.location.reload();
                else alert('Error: ' + await res.text());
            } catch (e) {
                alert('Connection error');
            }
            document.body.style.opacity = '1';
        }

        function toggleService() { apiCall('/control/toggle'); }
        function toggleSalesforce() { apiCall('/control/toggle-salesforce'); }
        function toggleEmail() { apiCall('/control/toggle-email'); }
        function toggleLowPower() { apiCall('/control/toggle-low-power'); }
        function resetNormalFlow() { 
            if(confirm('This will re-enable Salesforce, Emails, and switch AI to Precision mode. Continue?')) {
                apiCall('/control/reset-cost-guard'); 
            }
        }
    </script>
  </div>
</body>
</html>`;
    res.send(html);
  } catch (e) {
    console.error("control error:", e);
    res.status(500).send("Error loading control panel.");
  }
});

app.post("/control/reset-cost-guard", async (_req, res) => {
  try {
    const { writeSystemState } = await import("./services/storage.js");
    await writeSystemState({
      tier1_triggered: false,
      tier2_triggered: false,
      low_power_mode: false,
      salesforce_status: "active",
      email_sending_status: "active"
    });
    console.log("[mfs] Manual Reset: Normal Flow Restored");
    res.send("OK");
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.post("/control/toggle-low-power", async (_req, res) => {
  try {
    const { readSystemState, writeSystemState } = await import("./services/storage.js");
    const current = await readSystemState();
    await writeSystemState({ low_power_mode: !current.low_power_mode });
    console.log("[mfs] Manual Toggle: Low Power Mode -> " + !current.low_power_mode);
    res.send("OK");
  } catch (e) {
    res.status(500).send(e.message);
  }
});
app.post("/control/toggle", async (_req, res) => {
  try {
    const { readSystemState, writeSystemState } = await import("./services/storage.js");
    const current = await readSystemState();
    const newState = current.service_status === "active" ? "stopped" : "active";
    await writeSystemState({ service_status: newState });
    console.log(`[mfs] Manual Toggle: Service ${newState}`);
    res.send("OK");
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.post("/control/toggle-salesforce", async (_req, res) => {
  try {
    const { readSystemState, writeSystemState } = await import("./services/storage.js");
    const current = await readSystemState();
    const newState = current.salesforce_status === "active" ? "stopped" : "active";
    await writeSystemState({ salesforce_status: newState });
    console.log(`[mfs] Manual Toggle: Salesforce ${newState}`);
    res.send("OK");
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.post("/control/toggle-email", async (_req, res) => {
  try {
    const { readSystemState, writeSystemState } = await import("./services/storage.js");
    const current = await readSystemState();
    const newState = current.email_sending_status === "active" ? "stopped" : "active";
    await writeSystemState({ email_sending_status: newState });
    console.log(`[mfs] Manual Toggle: Email Sending ${newState}`);
    res.send("OK");
  } catch (e) {
    res.status(500).send(e.message);
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
      const query = `in: inbox - label:processed after:${oneDayAgo} `;

      const list = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: MAX_MESSAGES_PER_EXECUTION,
      });

      const messageIds = (list.data.messages || []).map(m => m.id);
      console.log(`[mfs] / force - process → Encontrados ${messageIds.length} mensajes en INBOX(cuenta principal)`);

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
      const query = `in: inbox - label:processed after:${oneDayAgo} `;
      console.log("[mfs] /force-process → Buscando mensajes con query:", query);

      const list = await gmailSender.users.messages.list({
        userId: "me",
        q: query,
        maxResults: MAX_MESSAGES_PER_EXECUTION,
      });

      const senderMessageIds = (list.data.messages || []).map(m => m.id);
      console.log(`[mfs] / force - process → Encontrados ${senderMessageIds.length} mensajes en INBOX(cuenta SENDER)`);

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
    console.log(`[mfs] HTTP server escuchando en puerto ${PORT} `);
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


