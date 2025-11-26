/**
 * Handlers para métricas y análisis
 */
import { writeDailyMetrics, readHistoricalMetrics, writeCorrection } from "../services/sheets.js";
import { analyzeMetricsAndSuggestAdjustments } from "../services/metrics.js";
import { getAirtableRecords } from "../services/airtable.js";
import { logErr } from "../utils/helpers.js";

/**
 * Recopila métricas del día desde Airtable y las escribe a Google Sheets
 */
export async function handleDailyMetrics(req, res) {
  try {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    
    console.log("[mfs] [metrics] Recopilando métricas del día:", date);

    // Obtener todos los registros de Airtable del día
    const records = await getAirtableRecords(date);
    
    // Calcular métricas
    const metrics = {
      date,
      totalLeads: records.length,
      discarded: 0,
      veryHigh: 0,
      high: 0,
      medium: 0,
      low: 0,
      pricingRequests: 0,
      prInvitations: 0,
      barterRequests: 0,
      freeCoverageRequests: 0,
      confidences: [],
      corrections: [],
    };

    records.forEach((record) => {
      const intent = record.fields["Intent"] || "";
      const confidence = parseFloat(record.fields["Classification Scoring"] || 0);
      
      if (intent === "Discard") metrics.discarded++;
      else if (intent === "Very High") metrics.veryHigh++;
      else if (intent === "High") metrics.high++;
      else if (intent === "Medium") metrics.medium++;
      else if (intent === "Low") metrics.low++;

      // Flags
      if (record.fields["Media Kit/Pricing Request"]) metrics.pricingRequests++;
      if (record.fields["PR Invitation"]) metrics.prInvitations++;
      if (record.fields["Barter Request"]) metrics.barterRequests++;
      if (record.fields["Free Coverage Request"]) metrics.freeCoverageRequests++;

      if (confidence > 0) metrics.confidences.push(confidence);
    });

    metrics.avgConfidence = metrics.confidences.length > 0
      ? metrics.confidences.reduce((a, b) => a + b, 0) / metrics.confidences.length
      : 0;

    // Escribir a Google Sheets
    await writeDailyMetrics(metrics);

    res.json({
      ok: true,
      metrics,
      message: `Métricas del ${date} escritas a Google Sheets`,
    });
  } catch (error) {
    logErr("[mfs] [metrics] Error en handleDailyMetrics:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Ajusta el código automáticamente basándose en correcciones del Sheet
 */
export async function handleAutoAdjustCode(req, res) {
  try {
    console.log("[mfs] [metrics] Iniciando auto-ajuste de código desde Sheet");

    const { adjustCodeFromSheetCorrections } = await import("../services/code-adjuster.js");
    const result = await adjustCodeFromSheetCorrections();

    if (result.adjusted) {
      res.json({
        ok: true,
        message: "Código ajustado automáticamente",
        result,
      });
    } else {
      res.json({
        ok: true,
        message: "No se requirieron ajustes",
        result,
      });
    }
  } catch (error) {
    logErr("[mfs] [metrics] Error en handleAutoAdjustCode:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Analiza métricas históricas y sugiere ajustes
 */
export async function handleAnalyzeMetrics(req, res) {
  try {
    console.log("[mfs] [metrics] Analizando métricas históricas");

    const analysis = await analyzeMetricsAndSuggestAdjustments();

    if (!analysis) {
      return res.json({
        ok: true,
        message: "No hay métricas suficientes para analizar",
        analysis: null,
      });
    }

    res.json({
      ok: true,
      analysis,
      message: "Análisis completado",
    });
  } catch (error) {
    logErr("[mfs] [metrics] Error en handleAnalyzeMetrics:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Registra una corrección manual desde Airtable
 */
export async function handleCorrection(req, res) {
  try {
    const { emailId, originalIntent, correctedIntent, reason, emailSubject, emailFrom } = req.body;

    if (!emailId || !originalIntent || !correctedIntent) {
      return res.status(400).json({
        error: "emailId, originalIntent y correctedIntent son requeridos",
      });
    }

    await writeCorrection({
      emailId,
      originalIntent,
      correctedIntent,
      reason: reason || "Manual correction",
      emailSubject: emailSubject || "",
      emailFrom: emailFrom || "",
    });

    res.json({
      ok: true,
      message: "Corrección registrada",
    });
  } catch (error) {
    logErr("[mfs] [metrics] Error en handleCorrection:", error);
    res.status(500).json({ error: error.message });
  }
}

