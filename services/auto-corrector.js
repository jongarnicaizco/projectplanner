/**
 * Servicio de auto-corrección basado en métricas
 * Analiza correcciones y ajusta parámetros automáticamente
 */
import { readHistoricalMetrics } from "./sheets.js";
import { CFG } from "../config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Analiza correcciones y genera ajustes automáticos
 */
export async function analyzeAndAdjust() {
  const metrics = await readHistoricalMetrics(30);
  
  if (metrics.length === 0) {
    console.log("[mfs] [auto-corrector] No hay métricas para analizar");
    return { adjusted: false, reason: "No metrics available" };
  }

  // Extraer todas las correcciones
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

  if (allCorrections.length === 0) {
    return { adjusted: false, reason: "No corrections found" };
  }

  // Analizar patrones de corrección
  const adjustments = [];

  // Patrón 1: Muchos Discard → High/Medium (pricing no detectado)
  const discardToHigh = allCorrections.filter(
    (c) => c.originalIntent === "Discard" && c.correctedIntent === "High"
  );
  const discardToMedium = allCorrections.filter(
    (c) => c.originalIntent === "Discard" && c.correctedIntent === "Medium"
  );

  if (discardToHigh.length + discardToMedium.length > 5) {
    // Verificar si las correcciones mencionan pricing
    const pricingRelated = [...discardToHigh, ...discardToMedium].filter((c) =>
      c.reason.toLowerCase().includes("pricing") ||
      c.reason.toLowerCase().includes("media kit") ||
      c.reason.toLowerCase().includes("rate")
    );

    if (pricingRelated.length > 3) {
      adjustments.push({
        type: "regex_enhancement",
        file: "services/vertex.js",
        action: "expand_pricing_regex",
        reason: `${pricingRelated.length} correos de pricing fueron marcados como Discard`,
        priority: "high",
      });
    }
  }

  // Patrón 2: Low → High para pricing (ya está implementado, pero podemos verificar)
  const lowToHigh = allCorrections.filter(
    (c) => c.originalIntent === "Low" && c.correctedIntent === "High"
  );
  const lowToHighPricing = lowToHigh.filter((c) =>
    c.reason.toLowerCase().includes("pricing") ||
    c.reason.toLowerCase().includes("media kit")
  );

  if (lowToHighPricing.length > 2) {
    adjustments.push({
      type: "rule_verification",
      file: "services/vertex.js",
      action: "verify_pricing_minimum_high_rule",
      reason: `${lowToHighPricing.length} correos de pricing fueron Low pero deberían ser High`,
      priority: "medium",
      note: "La regla de pricing mínimo High ya está implementada, verificar que funcione correctamente",
    });
  }

  // Patrón 3: Medium → High (falta de contexto específico)
  const mediumToHigh = allCorrections.filter(
    (c) => c.originalIntent === "Medium" && c.correctedIntent === "High"
  );
  
  if (mediumToHigh.length > 5) {
    // Analizar razones comunes
    const reasons = mediumToHigh.map((c) => c.reason.toLowerCase());
    const hasVolume = reasons.some((r) => 
      r.includes("volume") || r.includes("articles") || r.includes("posts") || r.includes("month")
    );
    const hasBudget = reasons.some((r) => 
      r.includes("budget") || r.includes("rate") || r.includes("pricing")
    );

    if (hasVolume || hasBudget) {
      adjustments.push({
        type: "prompt_enhancement",
        file: "config.js",
        action: "enhance_high_intent_examples",
        reason: `${mediumToHigh.length} correos con scope concreto fueron Medium pero deberían ser High`,
        priority: "medium",
        suggestion: "Añadir más ejemplos de 'High' intent con scope concreto (volumen, frecuencia, presupuesto)",
      });
    }
  }

  // Si hay ajustes, generar reporte
  if (adjustments.length > 0) {
    return {
      adjusted: true,
      adjustments,
      summary: `Se encontraron ${adjustments.length} ajustes sugeridos basados en ${allCorrections.length} correcciones`,
    };
  }

  return {
    adjusted: false,
    reason: "No significant patterns found for auto-adjustment",
    correctionsAnalyzed: allCorrections.length,
  };
}

/**
 * Genera un reporte de ajustes sugeridos
 */
export async function generateAdjustmentReport() {
  const analysis = await analyzeAndAdjust();
  
  if (!analysis.adjusted) {
    return {
      report: "No se requieren ajustes automáticos en este momento.",
      details: analysis,
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: analysis.summary,
    adjustments: analysis.adjustments,
    recommendations: analysis.adjustments.map((adj) => ({
      priority: adj.priority,
      action: adj.action,
      reason: adj.reason,
      file: adj.file,
      note: adj.note || adj.suggestion || "",
    })),
  };

  return report;
}




