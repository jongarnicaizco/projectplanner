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
    // Verificar si el servicio está activo
    const isActive = await readServiceStatus();
    if (!isActive) {
      console.log("[mfs] /force-process → ⏸️ Servicio PAUSADO - No se procesarán mensajes");
      return res.status(200).json({
        ok: false,
        message: "Servicio pausado. Activa el servicio primero para procesar mensajes.",
        active: false,
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

// Endpoints de control del servicio (start/stop)
app.get("/control/status", async (_req, res) => {
  try {
    const isActive = await readServiceStatus();
    res.json({
      active: isActive,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logErr("[mfs] [control] Error leyendo estado:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/control/stop", async (_req, res) => {
  try {
    await writeServiceStatus(false);
    console.log("[mfs] [control] ⏸️ SERVICIO PAUSADO - No se procesarán mensajes nuevos");
    res.json({
      ok: true,
      active: false,
      message: "Servicio pausado. No se procesarán mensajes nuevos.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logErr("[mfs] [control] Error pausando servicio:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/control/start", async (_req, res) => {
  try {
    // Activar servicio
    await writeServiceStatus(true);
    
    // Actualizar historyId para ambas cuentas para que solo procese mensajes nuevos desde ahora
    const results = {};
    
    // Actualizar historyId cuenta principal
    try {
      const gmail = await getGmailClient();
      const prof = await gmail.users.getProfile({ userId: "me" });
      const currentHistoryId = String(prof.data.historyId || "");
      if (currentHistoryId) {
        await writeHistoryState(currentHistoryId);
        console.log("[mfs] [control] ✓ historyId actualizado (cuenta principal):", currentHistoryId);
        results.principal = { historyId: currentHistoryId };
      }
    } catch (e) {
      logErr("[mfs] [control] Error actualizando historyId (cuenta principal):", e);
      results.principal = { error: e?.message };
    }
    
    // Actualizar historyId cuenta SENDER
    try {
      const gmailSender = await getGmailSenderClient();
      const profSender = await gmailSender.users.getProfile({ userId: "me" });
      const currentHistoryIdSender = String(profSender.data.historyId || "");
      if (currentHistoryIdSender) {
        await writeHistoryStateSender(currentHistoryIdSender);
        console.log("[mfs] [control] ✓ historyId actualizado (cuenta SENDER):", currentHistoryIdSender);
        results.sender = { historyId: currentHistoryIdSender };
      }
    } catch (e) {
      logErr("[mfs] [control] Error actualizando historyId (cuenta SENDER):", e);
      results.sender = { error: e?.message };
    }
    
    console.log("[mfs] [control] ▶️ SERVICIO ACTIVADO - Solo se procesarán mensajes nuevos desde ahora");
    res.json({
      ok: true,
      active: true,
      message: "Servicio activado. Solo se procesarán mensajes nuevos desde ahora.",
      timestamp: new Date().toISOString(),
      historyIds: results,
    });
  } catch (error) {
    logErr("[mfs] [control] Error activando servicio:", error);
    res.status(500).json({ error: error.message });
  }
});

// Página HTML simple para controlar el servicio
app.get("/control", (_req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Control de Servicio - MFS Lead Generation</title>
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
      justify-content: center;
      align-items: center;
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
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
      font-size: 18px;
      font-weight: 600;
      transition: all 0.3s;
    }
    .status.active {
      background: #d4edda;
      color: #155724;
      border: 2px solid #c3e6cb;
    }
    .status.inactive {
      background: #f8d7da;
      color: #721c24;
      border: 2px solid #f5c6cb;
    }
    .status.loading {
      background: #fff3cd;
      color: #856404;
      border: 2px solid #ffeaa7;
    }
    .buttons {
      display: flex;
      gap: 15px;
      flex-direction: column;
    }
    button {
      padding: 15px 30px;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    }
    button:active {
      transform: translateY(0);
    }
    .btn-start {
      background: #28a745;
      color: white;
    }
    .btn-start:hover {
      background: #218838;
    }
    .btn-stop {
      background: #dc3545;
      color: white;
    }
    .btn-stop:hover {
      background: #c82333;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .info {
      margin-top: 30px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
      font-size: 12px;
      color: #666;
      line-height: 1.6;
    }
    .timestamp {
      margin-top: 15px;
      font-size: 11px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Control de Servicio</h1>
    <p class="subtitle">MFS Lead Generation AI</p>
    
    <div id="status" class="status loading">Cargando estado...</div>
    
    <div class="buttons">
      <button id="btnStart" class="btn-start" onclick="startService()">▶️ Activar</button>
      <button id="btnStop" class="btn-stop" onclick="stopService()">⏸️ Pausar</button>
    </div>
    
    <div class="info">
      <strong>ℹ️ Información:</strong><br>
      • Al <strong>pausar</strong>: El servicio dejará de procesar mensajes nuevos.<br>
      • Al <strong>activar</strong>: Solo se procesarán mensajes nuevos que lleguen después de la activación.<br>
      • Los mensajes antiguos no se procesarán al reactivar.
    </div>
    
    <div id="timestamp" class="timestamp"></div>
  </div>

  <script>
    let currentStatus = null;

    async function loadStatus() {
      try {
        const res = await fetch('/control/status');
        const data = await res.json();
        currentStatus = data.active;
        updateUI();
      } catch (error) {
        console.error('Error cargando estado:', error);
        document.getElementById('status').textContent = 'Error cargando estado';
        document.getElementById('status').className = 'status inactive';
      }
    }

    function updateUI() {
      const statusEl = document.getElementById('status');
      const btnStart = document.getElementById('btnStart');
      const btnStop = document.getElementById('btnStop');
      const timestampEl = document.getElementById('timestamp');

      if (currentStatus === null) {
        statusEl.textContent = 'Cargando estado...';
        statusEl.className = 'status loading';
        btnStart.disabled = true;
        btnStop.disabled = true;
        return;
      }

      if (currentStatus) {
        statusEl.textContent = '✅ SERVICIO ACTIVO';
        statusEl.className = 'status active';
        btnStart.disabled = true;
        btnStop.disabled = false;
      } else {
        statusEl.textContent = '⏸️ SERVICIO PAUSADO';
        statusEl.className = 'status inactive';
        btnStart.disabled = false;
        btnStop.disabled = true;
      }

      timestampEl.textContent = 'Última actualización: ' + new Date().toLocaleString('es-ES');
    }

    async function startService() {
      if (!confirm('¿Activar el servicio? Solo se procesarán mensajes nuevos desde ahora.')) {
        return;
      }

      const btnStart = document.getElementById('btnStart');
      btnStart.disabled = true;
      btnStart.textContent = 'Activando...';

      try {
        const res = await fetch('/control/start', { method: 'POST' });
        const data = await res.json();
        
        if (data.ok) {
          currentStatus = true;
          updateUI();
          alert('✅ Servicio activado correctamente. Solo se procesarán mensajes nuevos.');
        } else {
          alert('Error: ' + (data.error || 'No se pudo activar el servicio'));
          loadStatus();
        }
      } catch (error) {
        console.error('Error activando servicio:', error);
        alert('Error al activar el servicio: ' + error.message);
        loadStatus();
      }
    }

    async function stopService() {
      if (!confirm('¿Pausar el servicio? No se procesarán mensajes nuevos hasta que lo reactives.')) {
        return;
      }

      const btnStop = document.getElementById('btnStop');
      btnStop.disabled = true;
      btnStop.textContent = 'Pausando...';

      try {
        const res = await fetch('/control/stop', { method: 'POST' });
        const data = await res.json();
        
        if (data.ok) {
          currentStatus = false;
          updateUI();
          alert('⏸️ Servicio pausado. No se procesarán mensajes nuevos.');
        } else {
          alert('Error: ' + (data.error || 'No se pudo pausar el servicio'));
          loadStatus();
        }
      } catch (error) {
        console.error('Error pausando servicio:', error);
        alert('Error al pausar el servicio: ' + error.message);
        loadStatus();
      }
    }

    // Cargar estado al iniciar
    loadStatus();
    
    // Actualizar estado cada 5 segundos
    setInterval(loadStatus, 5000);
  </script>
</body>
</html>
  `);
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


