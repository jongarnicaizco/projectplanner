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
import { clearHistoryState, writeHistoryState, clearHistoryStateSender } from "./services/storage.js";
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
    console.log("[mfs] /force-process → Procesando mensajes directamente de INBOX");
    const allResults = [];
    
    // Procesar cuenta principal (media.manager@feverup.com)
    try {
      const gmail = await getGmailClient();
      
      // Obtener mensajes recientes de INBOX (últimas 2 horas)
      const twoHoursAgo = Math.floor(Date.now() / 1000) - (2 * 60 * 60);
      const query = `in:inbox after:${twoHoursAgo}`;
      
      const list = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 100,
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
    try {
      console.log("[mfs] /force-process → Procesando mensajes de secretmedia@feverup.com");
      const gmailSender = await getGmailSenderClient();
      
      const twoHoursAgo = Math.floor(Date.now() / 1000) - (2 * 60 * 60);
      const query = `in:inbox after:${twoHoursAgo}`;
      
      const list = await gmailSender.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 100,
      });
      
      const senderMessageIds = (list.data.messages || []).map(m => m.id);
      console.log(`[mfs] /force-process → Encontrados ${senderMessageIds.length} mensajes en INBOX (cuenta SENDER)`);
      
      if (senderMessageIds.length > 0) {
        const { processMessageIds } = await import("./services/processor.js");
        const senderResults = await processMessageIds(gmailSender, senderMessageIds);
        allResults.push(...senderResults);
      }
    } catch (e) {
      console.error("[mfs] /force-process → Error procesando cuenta SENDER:", e?.message || e);
      // Continuar aunque falle la cuenta SENDER
    }
    
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


