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
    const status = await readServiceStatus();
    res.json({
      ok: true,
      status: status.status,
      updatedAt: status.updatedAt,
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
    console.log("[mfs] /control/start → Activando servicio");
    
    // Actualizar historyId de ambas cuentas para solo procesar mensajes nuevos
    try {
      const gmail = await getGmailClient();
      const prof = await gmail.users.getProfile({ userId: "me" });
      const currentHistoryId = String(prof.data.historyId || "");
      if (currentHistoryId) {
        await writeHistoryState(currentHistoryId);
        console.log("[mfs] /control/start → historyId principal actualizado a:", currentHistoryId);
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
        console.log("[mfs] /control/start → historyId SENDER actualizado a:", currentHistoryIdSender);
      }
    } catch (e) {
      console.warn("[mfs] /control/start → No se pudo actualizar historyId SENDER:", e.message);
    }
    
    // Activar servicio
    await writeServiceStatus("active");
    
    res.json({
      ok: true,
      message: "Servicio activado. Solo se procesarán mensajes nuevos a partir de ahora.",
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
 * Procesa mensajes no procesados en un intervalo de tiempo específico (en minutos)
 * Activa el watch y procesa todos los mensajes SIN etiqueta "processed" en el intervalo
 */
app.post("/control/process-interval", async (req, res) => {
  try {
    const { minutes } = req.body;
    
    if (!minutes || isNaN(minutes) || minutes <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Debes proporcionar un número de minutos válido (mayor que 0)",
      });
    }
    
    const minutesNum = parseInt(minutes, 10);
    const secondsAgo = minutesNum * 60;
    const timestampAgo = Math.floor(Date.now() / 1000) - secondsAgo;
    
    console.log(`[mfs] /control/process-interval → Procesando mensajes de los últimos ${minutesNum} minutos`);
    console.log(`[mfs] /control/process-interval → Timestamp desde: ${timestampAgo} (hace ${minutesNum} minutos)`);
    
    let totalProcesados = 0;
    let totalFallidos = 0;
    let totalSaltados = 0;
    let totalEncontrados = 0;
    
    // Procesar cuenta principal (media.manager@feverup.com)
    try {
      const gmail = await getGmailClient();
      
      // Actualizar historyId PRIMERO para solo procesar mensajes nuevos a partir de ahora
      try {
        const { writeHistoryState } = await import("./services/storage.js");
        const prof = await gmail.users.getProfile({ userId: "me" });
        const currentHistoryId = String(prof.data.historyId || "");
        if (currentHistoryId) {
          await writeHistoryState(currentHistoryId);
          console.log(`[mfs] /control/process-interval → historyId principal actualizado: ${currentHistoryId} (solo procesará mensajes nuevos)`);
        }
      } catch (historyError) {
        console.warn(`[mfs] /control/process-interval → No se pudo actualizar historyId principal:`, historyError?.message);
      }
      
      // Activar watch después de actualizar historyId
      try {
        const { setupWatch } = await import("./services/gmail.js");
        await setupWatch(gmail);
      } catch (watchError) {
        console.warn(`[mfs] /control/process-interval → No se pudo activar watch (puede ser normal):`, watchError?.message);
      }
      
      // NO procesar mensajes antiguos - solo los que lleguen después de actualizar historyId
      // Por lo tanto, no hacemos query de mensajes antiguos
      const messageIds = [];
      
      console.log(`[mfs] /control/process-interval → Query cuenta principal: ${query}`);
      
      const list = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: MAX_MESSAGES_PER_EXECUTION,
      });
      
      console.log(`[mfs] /control/process-interval → Cuenta principal: historyId actualizado, solo se procesarán mensajes nuevos (no antiguos)`);
    } catch (e) {
      console.error(`[mfs] /control/process-interval → Error procesando cuenta principal:`, e?.message || e);
      logErr("control/process-interval error (cuenta principal):", e);
    }
    
    // Procesar cuenta SENDER (secretmedia@feverup.com)
    try {
      const gmailSender = await getGmailSenderClient();
      
      // Actualizar historyId PRIMERO para solo procesar mensajes nuevos a partir de ahora
      try {
        const { writeHistoryStateSender } = await import("./services/storage.js");
        const profSender = await gmailSender.users.getProfile({ userId: "me" });
        const currentHistoryIdSender = String(profSender.data.historyId || "");
        if (currentHistoryIdSender) {
          await writeHistoryStateSender(currentHistoryIdSender);
          console.log(`[mfs] /control/process-interval → historyId SENDER actualizado: ${currentHistoryIdSender} (solo procesará mensajes nuevos)`);
        }
      } catch (historyError) {
        console.warn(`[mfs] /control/process-interval → No se pudo actualizar historyId SENDER:`, historyError?.message);
      }
      
      // Activar watch después de actualizar historyId
      try {
        const { setupWatchSender } = await import("./services/gmail.js");
        await setupWatchSender(gmailSender);
      } catch (watchError) {
        console.warn(`[mfs] /control/process-interval → No se pudo activar watch SENDER (puede ser normal):`, watchError?.message);
      }
      
      console.log(`[mfs] /control/process-interval → Cuenta SENDER: historyId actualizado, solo se procesarán mensajes nuevos (no antiguos)`);
    } catch (e) {
      console.error(`[mfs] /control/process-interval → Error procesando cuenta SENDER:`, e?.message || e);
      logErr("control/process-interval error (cuenta SENDER):", e);
    }
    
    res.json({
      ok: true,
      message: `Watch activado y historyId actualizado. Solo se procesarán mensajes nuevos a partir de ahora (no mensajes antiguos).`,
      minutos: minutesNum,
      totalEncontrados: 0,
      procesados: 0,
      fallidos: 0,
      saltados: 0,
    });
  } catch (e) {
    logErr("control/process-interval error:", e);
    res.status(500).json({ error: e?.message });
  }
});

/**
 * Web app simple para controlar el servicio
 */
app.get("/control", async (_req, res) => {
  try {
    const status = await readServiceStatus();
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
    .process-interval {
      background: #f3f4f6;
      border-radius: 10px;
      padding: 20px;
      margin-top: 20px;
      text-align: left;
    }
    .process-interval h3 {
      color: #333;
      margin-bottom: 15px;
      font-size: 16px;
    }
    .process-interval-input-group {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
    }
    .process-interval input {
      flex: 1;
      padding: 12px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.3s;
    }
    .process-interval input:focus {
      outline: none;
      border-color: #667eea;
    }
    .btn-process {
      background: #667eea;
      color: white;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      white-space: nowrap;
    }
    .btn-process:hover {
      background: #5568d3;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
    }
    .btn-process:active {
      transform: translateY(0);
    }
    .btn-process:disabled {
      background: #d1d5db;
      cursor: not-allowed;
      transform: none;
    }
    .process-interval p {
      color: #666;
      font-size: 13px;
      line-height: 1.6;
      margin-top: 10px;
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
    
    <div class="process-interval">
      <h3>📧 Procesar Mensajes por Intervalo</h3>
      <div class="process-interval-input-group">
        <input type="number" id="minutesInput" placeholder="Minutos (ej: 60)" min="1" value="60">
        <button class="btn-process" id="btnProcessInterval">Procesar</button>
      </div>
      <p>Procesa todos los mensajes NO procesados recibidos en los últimos X minutos. Solo se procesarán mensajes sin etiqueta "processed".</p>
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
    
    async function updateStatus() {
      try {
        const res = await fetch('/control/status');
        const data = await res.json();
        if (data.ok) {
          statusEl.className = 'status ' + data.status;
          statusEl.textContent = data.status === 'active' ? '🟢 ACTIVO' : '🔴 DETENIDO';
          btnStart.disabled = data.status === 'active';
          btnStop.disabled = data.status === 'stopped';
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
    
    // Procesar intervalo de tiempo
    const btnProcessInterval = document.getElementById('btnProcessInterval');
    const minutesInput = document.getElementById('minutesInput');
    
    async function processInterval() {
      const minutes = parseInt(minutesInput.value, 10);
      
      if (!minutes || minutes <= 0) {
        alert('❌ Por favor, introduce un número de minutos válido (mayor que 0)');
        return;
      }
      
      loading.classList.add('show');
      btnProcessInterval.disabled = true;
      
      try {
        const res = await fetch('/control/process-interval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minutes }),
        });
        const data = await res.json();
        if (data.ok) {
          alert(\`✅ \${data.message}\`);
        } else {
          alert('❌ Error: ' + (data.error || 'No se pudo procesar el intervalo'));
        }
      } catch (e) {
        alert('❌ Error: ' + e.message);
      } finally {
        loading.classList.remove('show');
        btnProcessInterval.disabled = false;
      }
    }
    
    btnProcessInterval.addEventListener('click', processInterval);
    
    // Permitir Enter en el input
    minutesInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        processInterval();
      }
    });
    
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
        const results = await processMessageIds(gmail, messageIds);
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
        const senderResults = await processMessageIds(gmailSender, senderMessageIds);
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


