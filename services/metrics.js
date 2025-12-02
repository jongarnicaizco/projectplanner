/**
 * Servicio para recopilar y analizar métricas de clasificación
 */
import { readHistoricalMetrics, writeDailyMetrics } from "./sheets.js";
import { CFG } from "../config.js";

/**
 * Recopila métricas del día actual (ya no usa Airtable, se envía por email)
 */
export async function collectDailyMetrics() {
  // Esta función se llamará desde un endpoint o scheduler
  // Por ahora retornamos estructura básica
  return {
    date: new Date().toISOString().split("T")[0],
    totalLeads: 0,
    discarded: 0,
    veryHigh: 0,
    high: 0,
    medium: 0,
    low: 0,
    pricingRequests: 0,
    barterRequests: 0,
    freeCoverageRequests: 0,
    avgConfidence: 0,
    corrections: [],
  };
}

/**
 * Analiza métricas históricas y sugiere ajustes
 */
export async function analyzeMetricsAndSuggestAdjustments() {
  const metrics = await readHistoricalMetrics(30);
  
  if (metrics.length === 0) {
    console.log("[mfs] [metrics] No hay métricas históricas para analizar");
    return null;
  }

  // Calcular promedios y tendencias
  const totalLeads = metrics.reduce((sum, m) => sum + m.totalLeads, 0);
  const totalDiscarded = metrics.reduce((sum, m) => sum + m.discarded, 0);
  const discardRate = totalLeads > 0 ? totalDiscarded / totalLeads : 0;

  const totalPricing = metrics.reduce((sum, m) => sum + m.pricingRequests, 0);
  const totalBarter = metrics.reduce((sum, m) => sum + m.barterRequests, 0);
  const totalFreeCoverage = metrics.reduce((sum, m) => sum + m.freeCoverageRequests, 0);

  const totalVeryHigh = metrics.reduce((sum, m) => sum + m.veryHigh, 0);
  const totalHigh = metrics.reduce((sum, m) => sum + m.high, 0);
  const totalMedium = metrics.reduce((sum, m) => sum + m.medium, 0);
  const totalLow = metrics.reduce((sum, m) => sum + m.low, 0);

  const avgConfidence = metrics.reduce((sum, m) => sum + m.avgConfidence, 0) / metrics.length;

  // Analizar correcciones
  const allCorrections = metrics
    .filter((m) => m.correctionsCount > 0)
    .flatMap((m) => {
      if (!m.correctionsDetails) return [];
      return m.correctionsDetails.split(";").map((c) => {
        const match = c.match(/(.+):\s*(.+?)→(.+?)\s*\((.+)\)/);
        if (match) {
          return {
            emailId: match[1].trim(),
            originalIntent: match[2].trim(),
            correctedIntent: match[3].trim(),
            reason: match[4].trim(),
          };
        }
        return null;
      }).filter(Boolean);
    });

  // Agrupar correcciones por patrón
  const correctionPatterns = {};
  allCorrections.forEach((c) => {
    const key = `${c.originalIntent}→${c.correctedIntent}`;
    if (!correctionPatterns[key]) {
      correctionPatterns[key] = { count: 0, reasons: [] };
    }
    correctionPatterns[key].count++;
    correctionPatterns[key].reasons.push(c.reason);
  });

  // Generar sugerencias
  const suggestions = [];

  // Si hay muchas correcciones de Discard → High/Medium, ajustar heurísticas
  if (correctionPatterns["Discard→High"] || correctionPatterns["Discard→Medium"]) {
    const discardToHigh = correctionPatterns["Discard→High"]?.count || 0;
    const discardToMedium = correctionPatterns["Discard→Medium"]?.count || 0;
    if (discardToHigh + discardToMedium > 5) {
      suggestions.push({
        type: "adjust_heuristic",
        action: "make_discard_stricter",
        reason: `${discardToHigh + discardToMedium} correos fueron marcados como Discard pero deberían ser High/Medium`,
        priority: "high",
      });
    }
  }

  // Si hay muchas correcciones de Low → High/Medium para pricing, ya está cubierto con la regla
  if (correctionPatterns["Low→High"] && totalPricing > 0) {
    const lowToHigh = correctionPatterns["Low→High"].count || 0;
    if (lowToHigh > 3) {
      suggestions.push({
        type: "adjust_heuristic",
        action: "pricing_minimum_high_already_implemented",
        reason: `${lowToHigh} correos de pricing fueron Low pero deberían ser High (ya implementado)`,
        priority: "info",
      });
    }
  }

  // Si el discard rate es muy alto, puede que estemos descartando demasiado
  if (discardRate > 0.5) {
    suggestions.push({
      type: "warning",
      action: "high_discard_rate",
      reason: `Tasa de descarte muy alta: ${(discardRate * 100).toFixed(1)}%`,
      priority: "medium",
    });
  }

  // Si la confianza promedio es muy baja, puede que necesitemos mejorar el prompt
  if (avgConfidence < 0.7) {
    suggestions.push({
      type: "improve_prompt",
      action: "low_confidence",
      reason: `Confianza promedio baja: ${avgConfidence.toFixed(2)}`,
      priority: "medium",
    });
  }

  return {
    summary: {
      totalLeads,
      totalDiscarded,
      discardRate: discardRate.toFixed(2),
      totalPricing,
      totalPR,
      totalBarter,
      totalFreeCoverage,
      totalVeryHigh,
      totalHigh,
      totalMedium,
      totalLow,
      avgConfidence: avgConfidence.toFixed(2),
      totalCorrections: allCorrections.length,
    },
    correctionPatterns,
    suggestions,
  };
}

