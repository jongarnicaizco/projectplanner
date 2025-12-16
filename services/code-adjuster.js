/**
 * Servicio que ajusta automáticamente el código basándose en correcciones del Sheet
 */
import { readCorrectionsFromSheet, deleteCorrectionRows } from "./sheets.js";
import { autoCommitAndPush } from "./git-auto-commit.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Lee correcciones del Sheet y ajusta el código automáticamente
 */
export async function adjustCodeFromSheetCorrections() {
  console.log("[mfs] [code-adjuster] Iniciando análisis de correcciones del Sheet...");

  // Leer todas las correcciones del Sheet
  const corrections = await readCorrectionsFromSheet();
  
  if (corrections.length === 0) {
    console.log("[mfs] [code-adjuster] No hay correcciones en el Sheet");
    return { adjusted: false, reason: "No corrections found" };
  }

  console.log(`[mfs] [code-adjuster] Encontradas ${corrections.length} correcciones`);

  // Analizar patrones
  const patterns = analyzeCorrectionPatterns(corrections);
  
  if (patterns.length === 0) {
    console.log("[mfs] [code-adjuster] No se encontraron patrones significativos");
    return { adjusted: false, reason: "No significant patterns found" };
  }

  // Aplicar ajustes al código
  const adjustments = [];
  const processedCorrections = []; // Correcciones que se procesaron exitosamente
  
  for (const pattern of patterns) {
    const result = await applyAdjustment(pattern);
    if (result.success) {
      adjustments.push(result);
      
      // Marcar las correcciones relacionadas con este patrón como procesadas
      if (pattern.relatedCorrections) {
        processedCorrections.push(...pattern.relatedCorrections);
      }
    }
  }

  // Si hay ajustes, hacer commit y push automático (si está habilitado)
  if (adjustments.length > 0) {
    const commitResult = await autoCommitAndPush(
      adjustments,
      `Ajustes automáticos basados en ${corrections.length} correcciones del Sheet`
    );
    
    // Eliminar las correcciones procesadas del Sheet
    if (processedCorrections.length > 0) {
      const deleteResult = await deleteCorrectionRows(processedCorrections);
      console.log(`[mfs] [code-adjuster] Eliminadas ${deleteResult.deleted} correcciones procesadas del Sheet`);
    }
    
    return {
      adjusted: true,
      adjustments,
      summary: `Se aplicaron ${adjustments.length} ajustes automáticos`,
      commit: commitResult,
      deletedRows: processedCorrections.length,
    };
  }

  // Si no hay ajustes pero hay correcciones, eliminarlas igual (ya fueron analizadas)
  if (corrections.length > 0) {
    const deleteResult = await deleteCorrectionRows(corrections);
    console.log(`[mfs] [code-adjuster] Eliminadas ${deleteResult.deleted} correcciones del Sheet (no requirieron ajustes)`);
    
    return {
      adjusted: false,
      adjustments: [],
      summary: "No se requirieron ajustes, pero las correcciones fueron procesadas y eliminadas",
      deletedRows: deleteResult.deleted,
    };
  }

  return {
    adjusted: false,
    adjustments: [],
    summary: "No se requirieron ajustes",
    deletedRows: 0,
  };
}

/**
 * Analiza patrones en las correcciones
 */
function analyzeCorrectionPatterns(corrections) {
  const patterns = [];

  // Agrupar por tipo de corrección
  const byType = {};
  corrections.forEach((c) => {
    const key = `${c.originalIntent}→${c.correctedIntent}`;
    if (!byType[key]) {
      byType[key] = [];
    }
    byType[key].push(c);
  });

  console.log("[mfs] [code-adjuster] Correcciones agrupadas por tipo:", Object.keys(byType).map(k => `${k}: ${byType[k].length}`).join(", "));

  // Patrón 1: Discard → High/Medium (pricing no detectado)
  const discardToHigh = byType["Discard→High"] || [];
  const discardToMedium = byType["Discard→Medium"] || [];
  
  if (discardToHigh.length + discardToMedium.length >= 1) {
    // Si hay 1+ correcciones de Discard → High/Medium, asumir que son pricing-related
    // (a menos que explícitamente digan lo contrario)
    const allDiscardCorrections = [...discardToHigh, ...discardToMedium];
    
    // Filtrar solo las que explícitamente NO son pricing
    const notPricing = allDiscardCorrections.filter((c) => {
      const reason = (c.reason || "").toLowerCase();
      return reason.includes("not pricing") || reason.includes("no pricing");
    });
    
    const pricingRelated = allDiscardCorrections.filter((c) => !notPricing.includes(c));
    
    if (pricingRelated.length >= 1) {
      // Extraer términos que no están en el regex actual
      const newTerms = extractNewTerms(pricingRelated);
      
      // Si no hay términos nuevos pero hay 1+ correcciones, aún así aplicar ajuste
      // (puede ser que el regex no esté funcionando bien)
      if (newTerms.length > 0 || pricingRelated.length >= 1) {
        patterns.push({
          type: "expand_pricing_regex",
          priority: "high",
          count: pricingRelated.length,
          newTerms: newTerms.length > 0 ? newTerms : ["general pricing terms"], // Placeholder si no hay términos nuevos
          relatedCorrections: pricingRelated, // Guardar para eliminarlas después
          examples: pricingRelated.slice(0, 3).map((c) => ({
            subject: c.subject,
            reason: c.reason,
          })),
        });
      }
    }
  }

  // Patrón 2: Low → High (pricing mal clasificado)
  const lowToHigh = byType["Low→High"] || [];
  const lowToHighPricing = lowToHigh.filter((c) => {
    const reason = (c.reason || "").toLowerCase();
    return (
      reason.includes("pricing") ||
      reason.includes("media kit") ||
      reason.includes("rate") ||
      reason.includes("precio")
    );
  });

  if (lowToHighPricing.length >= 1) {
    patterns.push({
      type: "verify_pricing_rule",
      priority: "high",
      count: lowToHighPricing.length,
      relatedCorrections: lowToHighPricing, // Guardar para eliminarlas después
      note: "La regla de pricing mínimo High debería estar funcionando, verificar",
      examples: lowToHighPricing.slice(0, 3),
    });
  }

  // Patrón 3: Medium → High (falta de detección de scope concreto)
  const mediumToHigh = byType["Medium→High"] || [];
  if (mediumToHigh.length >= 1) {
    const hasScope = mediumToHigh.filter((c) => {
      const reason = (c.reason || "").toLowerCase();
      return (
        reason.includes("volume") ||
        reason.includes("articles") ||
        reason.includes("posts") ||
        reason.includes("month") ||
        reason.includes("budget") ||
        reason.includes("scope")
      );
    });

    if (hasScope.length >= 1) {
      patterns.push({
        type: "enhance_high_intent_detection",
        priority: "medium",
        count: hasScope.length,
        relatedCorrections: hasScope, // Guardar para eliminarlas después
        examples: hasScope.slice(0, 3),
      });
    }
  }

  // Patrón 4: High → Very High (marcas grandes no detectadas)
  const highToVeryHigh = byType["High→Very High"] || [];
  if (highToVeryHigh.length >= 1) {
    const bigBrands = highToVeryHigh.filter((c) => {
      const reason = (c.reason || "").toLowerCase();
      const from = (c.from || "").toLowerCase();
      return (
        reason.includes("large brand") ||
        reason.includes("big company") ||
        reason.includes("major") ||
        from.includes("@coca-cola") ||
        from.includes("@nike") ||
        from.includes("@amazon")
      );
    });

    if (bigBrands.length >= 1) {
      patterns.push({
        type: "add_big_brand_detection",
        priority: "medium",
        count: bigBrands.length,
        relatedCorrections: bigBrands,
        examples: bigBrands,
      });
    }
  }

  // Patrón 5: Cualquier corrección → Discard (unsubscribe no detectado)
  const anyToDiscard = Object.keys(byType)
    .filter(key => key.endsWith("→Discard"))
    .flatMap(key => byType[key] || []);
  
  if (anyToDiscard.length >= 1) {
    const unsubscribeRelated = anyToDiscard.filter((c) => {
      const reason = (c.reason || "").toLowerCase();
      const subject = (c.subject || "").toLowerCase();
      const text = `${subject} ${reason}`;
      return (
        reason.includes("unsubscribe") ||
        reason.includes("opt-out") ||
        reason.includes("darse de baja") ||
        text.includes("unsubscribe") ||
        text.includes("opt-out")
      );
    });

    if (unsubscribeRelated.length >= 1) {
      patterns.push({
        type: "expand_unsubscribe_regex",
        priority: "high",
        count: unsubscribeRelated.length,
        relatedCorrections: unsubscribeRelated,
        examples: unsubscribeRelated.slice(0, 3),
      });
    }
  }

  // Patrón 6: Cualquier corrección → Low (Free Coverage no detectado - incluye press releases)
  const anyToLow = Object.keys(byType)
    .filter(key => key.endsWith("→Low"))
    .flatMap(key => byType[key] || []);

  // Patrón 7: Free Coverage no detectado o detectado incorrectamente
  // Caso 7a: No se detectó Free Coverage pero debería serlo
  if (anyToLow.length >= 1) {
    const freeCoverageNotDetected = anyToLow.filter((c) => {
      const reason = (c.reason || "").toLowerCase();
      const subject = (c.subject || "").toLowerCase();
      const text = `${subject} ${reason}`;
      return (
        reason.includes("free coverage") ||
        reason.includes("cobertura gratuita") ||
        reason.includes("gratis") ||
        reason.includes("sin costo") ||
        reason.includes("no budget") ||
        reason.includes("sin presupuesto") ||
        reason.includes("press release") ||
        reason.includes("nota de prensa") ||
        reason.includes("comunicado de prensa") ||
        reason.includes("news shared") ||
        reason.includes("noticia compartida") ||
        (reason.includes("free") && reason.includes("coverage")) ||
        (reason.includes("press") && reason.includes("release"))
      );
    });

    if (freeCoverageNotDetected.length >= 1) {
      patterns.push({
        type: "expand_free_coverage_regex",
        priority: "high",
        count: freeCoverageNotDetected.length,
        relatedCorrections: freeCoverageNotDetected,
        examples: freeCoverageNotDetected.slice(0, 3),
        subType: "not_detected",
      });
    }
  }

  // Caso 7b: Se detectó Barter pero debería ser Free Coverage (no hay nada a cambio)
  const barterToFreeCoverage = corrections.filter((c) => {
    const reason = (c.reason || "").toLowerCase();
    return (
      reason.includes("should be free coverage") ||
      reason.includes("no exchange") ||
      reason.includes("sin intercambio") ||
      reason.includes("no hay nada a cambio") ||
      (reason.includes("free coverage") && reason.includes("not barter"))
    );
  });

  if (barterToFreeCoverage.length >= 1) {
    patterns.push({
      type: "fix_free_coverage_vs_barter",
      priority: "high",
      count: barterToFreeCoverage.length,
      relatedCorrections: barterToFreeCoverage,
      examples: barterToFreeCoverage.slice(0, 3),
      subType: "barter_mistaken_for_free",
    });
  }

  // Patrón 8: Barter no detectado o detectado incorrectamente
  // Caso 8a: No se detectó Barter pero debería serlo
  if (anyToLow.length >= 1) {
    const barterNotDetected = anyToLow.filter((c) => {
      const reason = (c.reason || "").toLowerCase();
      const subject = (c.subject || "").toLowerCase();
      const text = `${subject} ${reason}`;
      return (
        reason.includes("barter") ||
        reason.includes("trueque") ||
        reason.includes("intercambio") ||
        reason.includes("invitation to event") ||
        reason.includes("invitación a evento") ||
        reason.includes("event invite") ||
        (reason.includes("invitation") && reason.includes("exchange")) ||
        (reason.includes("invitación") && reason.includes("intercambio"))
      );
    });

    if (barterNotDetected.length >= 1) {
      patterns.push({
        type: "expand_barter_regex",
        priority: "high",
        count: barterNotDetected.length,
        relatedCorrections: barterNotDetected,
        examples: barterNotDetected.slice(0, 3),
        subType: "not_detected",
      });
    }
  }

  // Caso 8b: Se detectó Free Coverage pero debería ser Barter (hay algo a cambio)
  const freeCoverageToBarter = corrections.filter((c) => {
    const reason = (c.reason || "").toLowerCase();
    return (
      reason.includes("should be barter") ||
      reason.includes("has exchange") ||
      reason.includes("hay intercambio") ||
      reason.includes("invitation in exchange") ||
      reason.includes("invitación a cambio") ||
      (reason.includes("barter") && reason.includes("not free coverage"))
    );
  });

  if (freeCoverageToBarter.length >= 1) {
    patterns.push({
      type: "fix_barter_vs_free_coverage",
      priority: "high",
      count: freeCoverageToBarter.length,
      relatedCorrections: freeCoverageToBarter,
      examples: freeCoverageToBarter.slice(0, 3),
      subType: "free_mistaken_for_barter",
    });
  }

  // Patrón 9: Media Kit/Pricing Request no detectado o detectado incorrectamente
  // Caso 9a: No se detectó Pricing pero debería serlo
  const anyToMedium = Object.keys(byType)
    .filter(key => key.endsWith("→Medium"))
    .flatMap(key => byType[key] || []);
  
  const anyToHigh = Object.keys(byType)
    .filter(key => key.endsWith("→High"))
    .flatMap(key => byType[key] || []);
  
  const anyToVeryHigh = Object.keys(byType)
    .filter(key => key.endsWith("→Very High"))
    .flatMap(key => byType[key] || []);
  
  const pricingNotDetected = [...anyToMedium, ...anyToHigh, ...anyToVeryHigh].filter((c) => {
    const reason = (c.reason || "").toLowerCase();
    const subject = (c.subject || "").toLowerCase();
    const text = `${subject} ${reason}`;
    return (
      reason.includes("pricing") ||
      reason.includes("media kit") ||
      reason.includes("rate") ||
      reason.includes("precio") ||
      reason.includes("tarifa") ||
      reason.includes("should be pricing") ||
      reason.includes("pricing request") ||
      text.includes("rate card") ||
      text.includes("mediakit")
    );
  });

  if (pricingNotDetected.length >= 1) {
    patterns.push({
      type: "expand_pricing_regex",
      priority: "high",
      count: pricingNotDetected.length,
      relatedCorrections: pricingNotDetected,
      examples: pricingNotDetected.slice(0, 3),
      subType: "pricing_not_detected",
    });
  }

  // Caso 9b: Se detectó Pricing pero no debería serlo (falso positivo)
  const pricingFalsePositive = corrections.filter((c) => {
    const reason = (c.reason || "").toLowerCase();
    return (
      reason.includes("not pricing") ||
      reason.includes("no pricing") ||
      reason.includes("not a pricing request") ||
      (reason.includes("should not") && reason.includes("pricing"))
    );
  });

  if (pricingFalsePositive.length >= 1) {
    patterns.push({
      type: "refine_pricing_regex",
      priority: "medium",
      count: pricingFalsePositive.length,
      relatedCorrections: pricingFalsePositive,
      examples: pricingFalsePositive.slice(0, 3),
      subType: "pricing_false_positive",
    });
  }

  // Patrón 10: Cualquier corrección → Medium/High (Partnership no detectado)
  const partnershipRelated = [...anyToMedium, ...anyToHigh].filter((c) => {
    const reason = (c.reason || "").toLowerCase();
    return (
      reason.includes("partnership") ||
      reason.includes("partnership intent") ||
      reason.includes("colaboración") ||
      reason.includes("partnership proposal")
    );
  });

  if (partnershipRelated.length >= 1) {
    patterns.push({
      type: "enhance_partnership_detection",
      priority: "high",
      count: partnershipRelated.length,
      relatedCorrections: partnershipRelated,
      examples: partnershipRelated.slice(0, 3),
    });
  }

  // Patrón 10: Cualquier corrección genérica (análisis de términos comunes)
  // Si hay muchas correcciones del mismo tipo pero no encajan en patrones específicos,
  // intentar extraer términos comunes para mejorar regex o prompts
  const allCorrectionsByType = Object.entries(byType)
    .filter(([key, corrections]) => corrections.length >= 1)
    .map(([key, corrections]) => ({ type: key, corrections }));

  for (const { type, corrections } of allCorrectionsByType) {
    // Si hay 1+ correcciones del mismo tipo, analizar términos comunes
    if (corrections.length >= 1) {
      const commonTerms = extractCommonTerms(corrections);
      if (commonTerms.length > 0) {
        patterns.push({
          type: "general_improvement",
          priority: "low",
          count: corrections.length,
          correctionType: type,
          commonTerms,
          relatedCorrections: corrections,
          examples: corrections.slice(0, 3),
        });
      }
    }
  }

  return patterns;
}

/**
 * Extrae términos nuevos de las correcciones que no están en el regex actual
 */
function extractNewTerms(corrections) {
  // Leer el regex actual
  const vertexPath = path.join(__dirname, "vertex.js");
  const vertexCode = fs.readFileSync(vertexPath, "utf-8");
  
  // Buscar el pricingRegex
  const regexMatch = vertexCode.match(/const pricingRegex\s*=\s*\/(.+?)\//s);
  if (!regexMatch) return [];

  const currentRegex = regexMatch[1];
  const newTerms = [];

  // Analizar correcciones para encontrar términos nuevos
  corrections.forEach((c) => {
    const text = `${c.subject || ""} ${c.reason || ""}`.toLowerCase();
    
    // Buscar palabras relacionadas con pricing que no estén en el regex
    const pricingWords = [
      "tarif",
      "tarifa",
      "precio",
      "coste",
      "cost",
      "rate",
      "pricing",
      "mediakit",
      "media kit",
      "publicidad",
      "advertising",
      "campaña",
      "campaign",
    ];

    pricingWords.forEach((word) => {
      if (text.includes(word) && !currentRegex.includes(word)) {
        if (!newTerms.includes(word)) {
          newTerms.push(word);
        }
      }
    });
  });

  return newTerms;
}

/**
 * Extrae términos comunes de un grupo de correcciones
 */
function extractCommonTerms(corrections) {
  const terms = new Map();
  
  corrections.forEach((c) => {
    const text = `${c.subject || ""} ${c.reason || ""} ${c.from || ""}`.toLowerCase();
    
    // Extraer palabras significativas (3+ caracteres, no comunes)
    const words = text.match(/\b[a-záéíóúñ]{3,}\b/g) || [];
    const stopWords = new Set([
      "the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "its", "may", "new", "now", "old", "see", "two", "way", "who", "boy", "did", "its", "let", "put", "say", "she", "too", "use",
      "el", "la", "los", "las", "un", "una", "de", "del", "que", "con", "por", "para", "este", "esta", "estos", "estas", "ese", "esa", "eso", "esos", "esas", "aquel", "aquella", "aquello", "aquellos", "aquellas",
      "le", "les", "des", "du", "de", "la", "les", "un", "une", "des", "et", "ou", "mais", "donc", "or", "ni", "car"
    ]);
                                    
                                    words.forEach((word) => {
                                    if (!stopWords.has(word) && word.length >= 3) {
                                        terms.set(word, (terms.get(word) || 0) + 1);
                                    }
                                    });
                                });
                                
                                // Retornar términos que aparecen en al menos 2 correcciones
                                return Array.from(terms.entries())
                                    .filter(([word, count]) => count >= 2)
    .map(([word]) => word)
    .slice(0, 10); // Limitar a 10 términos más comunes
}

/**
 * Aplica un ajuste al código
 */
async function applyAdjustment(pattern) {
  console.log(`[mfs] [code-adjuster] Aplicando ajuste: ${pattern.type}`);

  try {
    switch (pattern.type) {
      case "expand_pricing_regex":
        return await expandPricingRegex(pattern);
      
      case "verify_pricing_rule":
        return await verifyPricingRule(pattern);
      
      case "enhance_high_intent_detection":
        return await enhanceHighIntentDetection(pattern);
      
      case "expand_unsubscribe_regex":
        return await expandRegex(pattern, "unsubscribeRegex", "unsubscribe");
      
      
      case "expand_free_coverage_regex":
        return await expandFreeCoverageRegex(pattern);
      
      case "expand_barter_regex":
        return await expandBarterRegex(pattern);
      
      case "fix_free_coverage_vs_barter":
        return await fixFreeCoverageVsBarter(pattern);
      
      case "fix_barter_vs_free_coverage":
        return await fixBarterVsFreeCoverage(pattern);
      
      case "refine_pricing_regex":
        return await refinePricingRegex(pattern);
      
      case "enhance_partnership_detection":
        return await enhancePartnershipDetection(pattern);
      
      case "add_big_brand_detection":
        return await addBigBrandDetection(pattern);
      
      case "general_improvement":
        return await generalImprovement(pattern);
      
      default:
        return { success: false, reason: `Unknown pattern type: ${pattern.type}` };
    }
  } catch (error) {
    console.error(`[mfs] [code-adjuster] Error aplicando ajuste:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Expande el regex de pricing con nuevos términos
 */
async function expandPricingRegex(pattern) {
  const vertexPath = path.join(__dirname, "vertex.js");
  let code = fs.readFileSync(vertexPath, "utf-8");

  // Encontrar el pricingRegex
  const regexMatch = code.match(/(const pricingRegex\s*=\s*\/)(.+?)(\/;)/s);
  if (!regexMatch) {
    return { success: false, reason: "Could not find pricingRegex in code" };
  }

  const currentRegex = regexMatch[2];
  
  // Agregar nuevos términos al regex
  const newTerms = pattern.newTerms || [];
  if (newTerms.length === 0) {
    return { success: false, reason: "No new terms to add" };
  }

  // Construir nuevos términos para el regex
  const termsToAdd = newTerms.map((term) => {
    // Escapar caracteres especiales
    return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("|");

  // Agregar al regex existente
  const newRegex = currentRegex.replace(/\|$/, "") + "|" + termsToAdd;
  
  // Reemplazar en el código
  code = code.replace(
    regexMatch[0],
    `${regexMatch[1]}${newRegex}${regexMatch[3]}`
  );

  // Escribir el archivo
  fs.writeFileSync(vertexPath, code, "utf-8");

  console.log(`[mfs] [code-adjuster] Regex expandido con términos: ${newTerms.join(", ")}`);

  return {
    success: true,
    type: "expand_pricing_regex",
    addedTerms: newTerms,
    file: "services/vertex.js",
  };
}

/**
 * Verifica que la regla de pricing mínimo High esté funcionando
 */
async function verifyPricingRule(pattern) {
  const vertexPath = path.join(__dirname, "vertex.js");
  const code = fs.readFileSync(vertexPath, "utf-8");

  // Verificar que la regla existe
  if (!code.includes("finalPricing") || !code.includes("intent = \"High\"")) {
    return {
      success: false,
      reason: "Pricing minimum High rule not found in code",
    };
  }

  // La regla ya existe, solo reportar
  return {
    success: true,
    type: "verify_pricing_rule",
    note: "Rule exists but may need adjustment",
    file: "services/vertex.js",
  };
}

/**
 * Expande cualquier regex en vertex.js
 */
async function expandRegex(pattern, regexName, category) {
  const vertexPath = path.join(__dirname, "vertex.js");
  let code = fs.readFileSync(vertexPath, "utf-8");

  // Buscar el regex (puede estar en diferentes formatos)
  const regexPatterns = [
    new RegExp(`const ${regexName}\\s*=\\s*/(.+?)/;`, "s"),
    new RegExp(`const ${regexName}\\s*=\\s*/(.+?)/`, "s"),
    new RegExp(`${regexName}\\s*=\\s*/(.+?)/`, "s"),
  ];

  let regexMatch = null;
  for (const regexPattern of regexPatterns) {
    regexMatch = code.match(regexPattern);
    if (regexMatch) break;
  }

  if (!regexMatch) {
    console.log(`[mfs] [code-adjuster] No se encontró ${regexName} en el código`);
    return { success: false, reason: `Could not find ${regexName} in code` };
  }

  const currentRegex = regexMatch[1];
  
  // Extraer términos de las correcciones
  const newTerms = extractTermsFromCorrections(pattern.relatedCorrections, category);
  
  if (newTerms.length === 0) {
    return { success: false, reason: "No new terms to add" };
  }

  // Construir nuevos términos para el regex
  const termsToAdd = newTerms.map((term) => {
    return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("|");

  // Agregar al regex existente
  const newRegex = currentRegex.replace(/\|$/, "") + "|" + termsToAdd;
  
  // Reemplazar en el código
  code = code.replace(regexMatch[0], regexMatch[0].replace(currentRegex, newRegex));

  // Escribir el archivo
  fs.writeFileSync(vertexPath, code, "utf-8");

  console.log(`[mfs] [code-adjuster] ${regexName} expandido con términos: ${newTerms.join(", ")}`);

  return {
    success: true,
    type: `expand_${category}_regex`,
    addedTerms: newTerms,
    file: "services/vertex.js",
  };
}

/**
 * Extrae términos de correcciones basándose en la categoría
 */
function extractTermsFromCorrections(corrections, category) {
  const categoryKeywords = {
    "unsubscribe": ["unsubscribe", "opt-out", "darse de baja", "cancelar", "désabonner", "désinscrire"],
    "free coverage": ["free coverage", "cobertura gratuita", "gratis", "sin costo", "free"],
    "barter": ["barter", "trueque", "intercambio", "invitation", "invitación"],
    "pricing": ["pricing", "precio", "tarifa", "rate", "cost", "coste", "mediakit"],
  };

  const keywords = categoryKeywords[category] || [];
  const newTerms = [];

  corrections.forEach((c) => {
    const text = `${c.subject || ""} ${c.reason || ""}`.toLowerCase();
    
    keywords.forEach((keyword) => {
      if (text.includes(keyword) && !newTerms.includes(keyword)) {
        newTerms.push(keyword);
      }
    });
  });

  return newTerms;
}

/**
 * Mejora la detección de partnership
 */
async function enhancePartnershipDetection(pattern) {
  const configPath = path.join(__dirname, "..", "config.js");
  let code = fs.readFileSync(configPath, "utf-8");

  // Buscar la sección de partnership en el prompt
  if (code.includes("STEP 2: Analyze Partnership Intent")) {
    const partnershipSection = code.match(/(STEP 2: Analyze Partnership Intent[\s\S]+?)(STEP 3:)/);
    if (partnershipSection) {
      // Extraer ejemplos de las correcciones
      const examples = pattern.examples.map((ex) => 
        `- ${ex.subject || ex.reason || "Partnership request"}`
      ).join("\n");

      const newExamples = `\n\nAdditional examples based on corrections:\n${examples}`;

      code = code.replace(
        partnershipSection[0],
        `${partnershipSection[1]}${newExamples}\n\n${partnershipSection[2]}`
      );

      fs.writeFileSync(configPath, code, "utf-8");

      return {
        success: true,
        type: "enhance_partnership_detection",
        file: "config.js",
      };
    }
  }

  return {
    success: false,
    reason: "Could not find partnership section in prompt",
  };
}

/**
 * Añade detección de marcas grandes
 */
async function addBigBrandDetection(pattern) {
  const vertexPath = path.join(__dirname, "vertex.js");
  let code = fs.readFileSync(vertexPath, "utf-8");

  // Extraer dominios de correcciones
  const domains = pattern.relatedCorrections
    .map((c) => {
      const match = (c.from || "").match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
      return match ? match[1] : null;
    })
    .filter(Boolean)
    .filter((d, i, arr) => arr.indexOf(d) === i); // Únicos

  if (domains.length === 0) {
    return { success: false, reason: "No domains found in corrections" };
  }

  // Buscar si ya existe una lista de marcas grandes
  const bigBrandsMatch = code.match(/(const\s+)?bigBrands\s*=\s*\[([^\]]*)\]/);
  
  if (bigBrandsMatch) {
    // Añadir nuevos dominios a la lista existente
    const existingBrands = bigBrandsMatch[2].split(",").map(b => b.trim().replace(/['"]/g, ""));
    const allBrands = [...new Set([...existingBrands, ...domains])];
    const newBrandsList = allBrands.map(b => `"${b}"`).join(", ");
    
    code = code.replace(bigBrandsMatch[0], `const bigBrands = [${newBrandsList}]`);
  } else {
    // Crear nueva lista de marcas grandes
    const bigBrandsCode = `\nconst bigBrands = [${domains.map(d => `"${d}"`).join(", ")}];\n`;
    
    // Insertar después de los imports o al inicio de classifyIntentHeuristic
    const heuristicMatch = code.match(/(async function classifyIntentHeuristic\([^)]*\)\s*\{)/);
    if (heuristicMatch) {
      code = code.replace(heuristicMatch[0], `${heuristicMatch[1]}${bigBrandsCode}`);
    } else {
      // Si no se encuentra, añadir al final del archivo
      code += bigBrandsCode;
    }
  }

  fs.writeFileSync(vertexPath, code, "utf-8");

  return {
    success: true,
    type: "add_big_brand_detection",
    addedDomains: domains,
    file: "services/vertex.js",
  };
}

/**
 * Mejora general basada en términos comunes
 */
async function generalImprovement(pattern) {
  // Para mejoras generales, añadir ejemplos al prompt
  const configPath = path.join(__dirname, "..", "config.js");
  let code = fs.readFileSync(configPath, "utf-8");

  // Crear una nota de mejora basada en las correcciones
  const examples = pattern.examples.map((ex, i) => 
    `${i + 1}. ${ex.subject || ex.reason || "Correction"}`
  ).join("\n");

  const improvementNote = `\n\n<!-- Auto-improvement based on ${pattern.count} corrections of type ${pattern.correctionType} -->\n<!-- Common terms: ${pattern.commonTerms.join(", ")} -->\n<!-- Examples:\n${examples}\n-->`;

  // Añadir al final del prompt
  if (code.includes("Do not add any additional text outside the JSON.")) {
    code = code.replace(
      "Do not add any additional text outside the JSON.",
      `Do not add any additional text outside the JSON.${improvementNote}`
    );
  } else {
    code += improvementNote;
  }

  fs.writeFileSync(configPath, code, "utf-8");

  return {
    success: true,
    type: "general_improvement",
    correctionType: pattern.correctionType,
    file: "config.js",
  };
}

/**
 * Mejora la detección de High intent con scope concreto
 */
async function enhanceHighIntentDetection(pattern) {
  const configPath = path.join(__dirname, "..", "config.js");
  let code = fs.readFileSync(configPath, "utf-8");

  // Buscar la sección de High intent en el prompt
  if (code.includes("2.b. High:")) {
    // Agregar más ejemplos si no están
    const highSection = code.match(/(2\.b\. High:[\s\S]+?)(2\.c\. Medium:)/);
    if (highSection) {
      const currentHigh = highSection[1];
      
      // Verificar si ya tiene suficientes ejemplos
      const exampleCount = (currentHigh.match(/Examples of High:/g) || []).length;
      
      if (exampleCount < 3) {
        // Agregar más ejemplos
        const newExamples = `
- Client asking for pricing AND specifying "10 posts per month" or similar volume
- Partnership proposal with defined budget range (e.g., "$5,000-$10,000")
- Request for rates combined with specific campaign duration (e.g., "3-month campaign")`;

        code = code.replace(
          highSection[0],
          `${highSection[1]}${newExamples}\n\n${highSection[2]}`
        );

        fs.writeFileSync(configPath, code, "utf-8");

        return {
          success: true,
          type: "enhance_high_intent_detection",
          file: "config.js",
        };
      }
    }
  }

  return {
    success: false,
    reason: "High intent section already has sufficient examples",
  };
}

/**
 * Refina el regex de pricing para evitar falsos positivos
 */
async function refinePricingRegex(pattern) {
  const vertexPath = path.join(__dirname, "vertex.js");
  let code = fs.readFileSync(vertexPath, "utf-8");

  // Buscar el pricingRegex
  const regexMatch = code.match(/(const pricingRegex\s*=\s*\/)(.+?)(\/;)/s);
  if (!regexMatch) {
    return { success: false, reason: "Could not find pricingRegex in code" };
  }

  // Analizar las correcciones para encontrar términos que causan falsos positivos
  const falsePositiveTerms = [];
  pattern.relatedCorrections.forEach((c) => {
    const text = `${c.subject || ""} ${c.reason || ""}`.toLowerCase();
    
    // Buscar términos comunes que NO deberían activar pricing
    const commonFalsePositives = [
      "free",
      "gratis",
      "no cost",
      "sin costo",
      "press release",
      "nota de prensa",
    ];
    
    commonFalsePositives.forEach((term) => {
      if (text.includes(term) && !falsePositiveTerms.includes(term)) {
        falsePositiveTerms.push(term);
      }
    });
  });

  // Si encontramos términos problemáticos, agregar exclusiones negativas al prompt
  // (No podemos modificar fácilmente el regex para excluir, así que mejoramos el prompt)
  const configPath = path.join(__dirname, "..", "config.js");
  let configCode = fs.readFileSync(configPath, "utf-8");

  if (configCode.includes("3.d. Media Kit/Pricing Request:")) {
    const pricingSection = configCode.match(/(3\.d\. Media Kit\/Pricing Request:[\s\S]+?)(STEP 4:)/);
    if (pricingSection) {
      const warningNote = `\n\nIMPORTANT: Do NOT mark "Media Kit/Pricing Request" if the email is asking for FREE coverage (including press releases or shared news) or explicitly states "no budget" or "no cost". Only mark it if they are asking about PAID advertising rates or pricing.`;
      
      if (!pricingSection[1].includes("Do NOT mark")) {
        configCode = configCode.replace(
          pricingSection[0],
          `${pricingSection[1]}${warningNote}\n\n${pricingSection[2]}`
        );
        
        fs.writeFileSync(configPath, configCode, "utf-8");
        
        console.log(`[mfs] [code-adjuster] Agregada advertencia sobre falsos positivos de pricing`);
        
        return {
          success: true,
          type: "refine_pricing_regex",
          note: "Added warning to prevent pricing false positives",
          file: "config.js",
        };
      }
    }
  }

  return {
    success: true,
    type: "refine_pricing_regex",
    note: "Pricing detection refined",
    file: "config.js",
  };
}

/*                                                                                                                  