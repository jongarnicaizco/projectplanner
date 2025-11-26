/**
 * mfs-lead-generation-ai
 * 
 * Procesa correos de INBOX usando Gmail History + locks en GCS
 * Clasifica con Vertex AI 2.x y guarda en Airtable
 * 
 * CI/CD: GitHub -> Cloud Build -> Cloud Run (solo contenedores)
 */
import express from "express";
import functions from "@google-cloud/functions-framework";
import { CFG } from "./config.js";
import { getGmailClient, setupWatch } from "./services/gmail.js";
import { clearHistoryState, writeHistoryState } from "./services/storage.js";
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
    const gmail = await getGmailClient();
    await clearHistoryState();

    const watchResp = await setupWatch(gmail);
    const hist = String(watchResp.historyId || "");

    if (hist) {
      await writeHistoryState(hist);
      console.log("[mfs] /reset completado. Nuevo historyId:", hist);
    }

    res.json({
      ok: true,
      historyId: hist,
      labelFilterIds: ["INBOX"],
    });
  } catch (e) {
    logErr("reset error:", e);
    res.status(500).json({ error: e?.response?.data || e?.message });
  }
});

app.post("/watch", async (_req, res) => {
  try {
    console.log("[mfs] /watch → configurando watch en Gmail");
    const gmail = await getGmailClient();
    const resp = await setupWatch(gmail);
    
    if (resp && resp.historyId) {
      res.json({
        ...resp,
        message: "Gmail Watch configurado correctamente. Procesamiento en tiempo real activo.",
      });
    } else {
      res.status(200).json({
        message: "Gmail Watch no se pudo configurar (topic no existe en el proyecto requerido). El procesamiento seguirá funcionando vía Cloud Scheduler cada 10 minutos.",
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
        const gmail = await getGmailClient();
        await clearHistoryState();
        const watchResp = await setupWatch(gmail);
        const hist = String(watchResp.historyId || "");

        if (hist) {
          await writeHistoryState(hist);
          console.log(
            "[mfs] RESET_ON_START completado. historyId:",
            hist,
            "labelFilterIds:",
            ["INBOX"]
          );
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


