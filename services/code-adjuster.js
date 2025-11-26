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

  // Patrón 1: Discard → High/Medium (pricing no detectado)
  const discardToHigh = byType["Discard→High"] || [];
  const discardToMedium = byType["Discard→Medium"] || [];
  
  if (discardToHigh.length + discardToMedium.length >= 2) {
    // Verificar si son pricing requests
    const pricingRelated = [...discardToHigh, ...discardToMedium].filter((c) => {
      const reason = (c.reason || "").toLowerCase();
      const subject = (c.subject || "").toLowerCase();
      const from = (c.from || "").toLowerCase();
      
      return (
        reason.includes("pricing") ||
        reason.includes("media kit") ||
        reason.includes("rate") ||
        reason.includes("precio") ||
        reason.includes("tarifa") ||
        subject.includes("pricing") ||
        subject.includes("rate") ||
        subject.includes("media kit")
      );
    });

    if (pricingRelated.length >= 1) {
      // Extraer términos que no están en el regex actual
      const newTerms = extractNewTerms(pricingRelated);
      
      if (newTerms.length > 0) {
        patterns.push({
          type: "expand_pricing_regex",
          priority: "high",
          count: pricingRelated.length,
          newTerms,
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
  if (mediumToHigh.length >= 2) {
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
  if (highToVeryHigh.length >= 2) {
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
        relatedCorrections: bigBrands, // Guardar para eliminarlas después
        examples: bigBrands,
      });
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

