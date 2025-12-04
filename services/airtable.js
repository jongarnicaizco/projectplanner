/**
 * Servicio de Airtable
 */
import axios from "axios";
import { CFG, FLAGS, FIDS } from "../config.js";
import { accessSecret } from "./secrets.js";

let airtableMetaCache = null;

/**
 * Limpia el cache de campos de Airtable (útil cuando se agregan nuevos campos)
 */
export function clearAirtableFieldCache() {
  airtableMetaCache = null;
  console.log("[mfs] Airtable: cache de campos limpiado");
}

/**
 * Obtiene los mapas de campos de Airtable
 */
export async function getAirtableFieldMaps(forceRefresh = false) {
  if (airtableMetaCache && !forceRefresh) return airtableMetaCache;

  try {
    if (!CFG.AIRTABLE_BASE_ID) {
      console.error("[mfs] Airtable: AIRTABLE_BASE_ID no está configurado");
      return { nameSet: new Set(), idSet: new Set(), nameToIdMap: new Map() };
    }

    const token = await getAirtableToken();
    if (!token) {
      console.error("[mfs] Airtable: No se pudo obtener el token");
      return { nameSet: new Set(), idSet: new Set(), nameToIdMap: new Map() };
    }

    const metaUrl = `https://api.airtable.com/v0/meta/bases/${CFG.AIRTABLE_BASE_ID}/tables`;

    const r = await axios.get(metaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const tables = r.data?.tables || [];
    const table =
      (CFG.AIRTABLE_TABLE?.startsWith("tbl")
        ? tables.find((t) => t.id === CFG.AIRTABLE_TABLE)
        : tables.find((t) => t.name === CFG.AIRTABLE_TABLE)) || null;

    if (!table) {
      console.error("[mfs] Airtable: Tabla no encontrada", {
        baseId: CFG.AIRTABLE_BASE_ID,
        tableId: CFG.AIRTABLE_TABLE,
        availableTables: tables.map(t => ({ id: t.id, name: t.name })),
      });
      return { nameSet: new Set(), idSet: new Set(), nameToIdMap: new Map() };
    }

    const nameSet = new Set();
    const idSet = new Set();
    const nameToIdMap = new Map();

    (table?.fields || []).forEach((f) => {
      nameSet.add(f.name);
      idSet.add(f.id);
      nameToIdMap.set(f.name, f.id);
    });

    airtableMetaCache = { nameSet, idSet, nameToIdMap };

    console.log("[mfs] Airtable: campos cargados para la tabla:", {
      table: table?.name || table?.id,
      fieldCount: nameSet.size,
      hasBodySummary: nameSet.has("Body Summary"),
    });

    return airtableMetaCache;
  } catch (e) {
    const status = e?.response?.status;
    const errorCode = e?.response?.data?.error?.code;
    console.error("[mfs] Airtable: Error obteniendo campos de la tabla", {
      status: status,
      errorCode: errorCode,
      message: e?.message,
      baseId: CFG.AIRTABLE_BASE_ID,
      tableId: CFG.AIRTABLE_TABLE,
    });
    // Retornar estructura vacía para que el código pueda continuar
    return { nameSet: new Set(), idSet: new Set(), nameToIdMap: new Map() };
  }
}

/**
 * Obtiene el token de Airtable
 */
export async function getAirtableToken() {
  return accessSecret(CFG.AIRTABLE_TOKEN_SECRET || "AIRTABLE_API_KEY");
}

/**
 * Busca un registro por Email ID
 */
/**
 * Obtiene registros de Airtable filtrados por fecha
 */
export async function getAirtableRecords(date) {
  const token = await getAirtableToken();
  const baseUrl = `https://api.airtable.com/v0/${CFG.AIRTABLE_BASE_ID}/${CFG.AIRTABLE_TABLE}`;
  
  try {
    // Construir filtro para la fecha (formato ISO: YYYY-MM-DD)
    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;
    
    // Airtable usa formato de fecha específico, pero podemos filtrar por Timestamp
    const filterFormula = `AND(IS_AFTER({Timestamp}, "${startOfDay}"), IS_BEFORE({Timestamp}, "${endOfDay}"))`;
    
    const records = [];
    let offset = null;
    
    do {
      const params = {
        filterByFormula: filterFormula,
        maxRecords: 100,
      };
      if (offset) params.offset = offset;
      
      const response = await axios.get(baseUrl, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      records.push(...(response.data.records || []));
      offset = response.data.offset || null;
    } while (offset);
    
    return records;
  } catch (error) {
    console.error("[mfs] Error obteniendo registros de Airtable:", error);
    return [];
  }
}

/**
 * Verifica múltiples Email IDs en batch (una sola llamada a Airtable)
 * Retorna un Map<emailId, record> con los registros encontrados
 */
export async function airtableFindByEmailIdsBatch(emailIds) {
  if (!emailIds || emailIds.length === 0) {
    return new Map();
  }

  try {
    const token = await getAirtableToken();
    if (!token) {
      console.warn("[mfs] Airtable: No se pudo obtener el token de Airtable. Continuando sin verificar duplicados.");
      return new Map();
    }

    if (!CFG.AIRTABLE_BASE_ID || !CFG.AIRTABLE_TABLE) {
      console.warn("[mfs] Airtable: Base ID o Table ID no configurados. Continuando sin verificar duplicados.", {
        baseId: CFG.AIRTABLE_BASE_ID,
        table: CFG.AIRTABLE_TABLE,
      });
      return new Map();
    }

    const url = `https://api.airtable.com/v0/${CFG.AIRTABLE_BASE_ID}/${encodeURIComponent(
      CFG.AIRTABLE_TABLE
    )}`;

    // Dividir en chunks para evitar fórmulas muy largas (límite ~10,000 caracteres)
    // Cada condición OR es aproximadamente: ({Email ID} = "id") = ~25 caracteres
    // Con seguridad, usar chunks de 200 IDs (5000 caracteres aprox)
    const CHUNK_SIZE = 200;
    const resultMap = new Map();

    for (let i = 0; i < emailIds.length; i += CHUNK_SIZE) {
      const chunk = emailIds.slice(i, i + CHUNK_SIZE);
      
      // Construir fórmula OR: OR({Email ID} = "id1", {Email ID} = "id2", ...)
      const conditions = chunk.map(id => 
        `({Email ID} = "${String(id).replace(/"/g, '\\"')}")`
      );
      const formula = `OR(${conditions.join(",")})`;

      try {
        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { 
            maxRecords: chunk.length, 
            filterByFormula: formula 
          },
        });

        // Mapear resultados por Email ID
        (res.data.records || []).forEach(record => {
          const emailId = record.fields?.["Email ID"];
          if (emailId) {
            resultMap.set(emailId, record);
          }
        });
      } catch (e) {
        // Si falla un chunk, continuar con los demás
        console.warn("[mfs] Airtable: Error verificando chunk de Email IDs", {
          chunkSize: chunk.length,
          status: e?.response?.status,
          message: e?.message?.substring(0, 100),
        });
      }
    }

    console.log(`[mfs] Airtable: Batch verification completada: ${resultMap.size} de ${emailIds.length} encontrados`);
    return resultMap;
  } catch (e) {
    console.warn("[mfs] Airtable: Error en batch verification. Continuando sin verificar duplicados.", {
      status: e?.response?.status,
      message: e?.message?.substring(0, 100),
    });
    return new Map();
  }
}

export async function airtableFindByEmailId(emailId) {
  try {
    const token = await getAirtableToken();
    if (!token) {
      console.warn("[mfs] Airtable: No se pudo obtener el token de Airtable. Continuando sin verificar duplicados.");
      return null;
    }

    if (!CFG.AIRTABLE_BASE_ID || !CFG.AIRTABLE_TABLE) {
      console.warn("[mfs] Airtable: Base ID o Table ID no configurados. Continuando sin verificar duplicados.", {
        baseId: CFG.AIRTABLE_BASE_ID,
        table: CFG.AIRTABLE_TABLE,
      });
      return null;
    }

    const url = `https://api.airtable.com/v0/${CFG.AIRTABLE_BASE_ID}/${encodeURIComponent(
      CFG.AIRTABLE_TABLE
    )}`;

    const formula = `({Email ID} = "${emailId.replace(/"/g, '\\"')}")`;
    console.log("[mfs] Airtable: Verificando si existe registro para Email ID", emailId);

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { maxRecords: 1, filterByFormula: formula },
    });

    return res.data.records?.[0] || null;
  } catch (e) {
    // 404 significa que la tabla/base no existe o no hay acceso
    // Esto es un error de configuración, pero no debería detener el procesamiento
    const status = e?.response?.status;
    const errorCode = e?.response?.data?.error?.code;
    
    if (status === 404 || errorCode === "NOT_FOUND") {
      // No loguear como error, solo como warning. El procesamiento continúa normalmente.
      console.warn("[mfs] Airtable: No se pudo verificar duplicados (404). Continuando con el procesamiento.", {
        baseId: CFG.AIRTABLE_BASE_ID,
        table: CFG.AIRTABLE_TABLE,
        emailId: emailId,
        note: "Esto puede indicar que la base/tabla no existe o no hay acceso. El email se procesará de todas formas."
      });
      // Retornar null para continuar el procesamiento (asumir que no existe)
      return null;
    }
    
    // Para otros errores, loguear como warning (no error) y continuar
    console.warn("[mfs] Airtable: Error al verificar duplicados. Continuando con el procesamiento.", {
      emailId: emailId,
      status: status,
      errorCode: errorCode,
      message: e?.message?.substring(0, 100), // Limitar longitud del mensaje
    });
    return null;
  }
}

/**
 * Crea un nuevo registro en Airtable
 */
export async function createAirtableRecord({
  id,
  from,
  to,
  cc,
  subject,
  body,
  bodySummary,
  timestamp,
  intent,
  confidence,
  reasoning,
  meddicMetrics,
  meddicEconomicBuyer,
  meddicDecisionCriteria,
  meddicDecisionProcess,
  meddicIdentifyPain,
  meddicChampion,
  isFreeCoverage,
  isBarter,
  isPricing,
  senderName,
  senderFirstName,
  language,
  location,
}) {
  // Verificar configuración básica antes de intentar crear
  if (!CFG.AIRTABLE_BASE_ID || !CFG.AIRTABLE_TABLE) {
    console.error("[mfs] Airtable: Configuración incompleta - no se puede crear registro", {
      baseId: CFG.AIRTABLE_BASE_ID,
      table: CFG.AIRTABLE_TABLE,
      emailId: id,
    });
    return { id: null };
  }

  try {
    console.log("[mfs] Airtable: Iniciando creación de registro", {
      emailId: id,
      baseId: CFG.AIRTABLE_BASE_ID,
      table: CFG.AIRTABLE_TABLE,
      hasFrom: !!from,
      hasTo: !!to,
      hasSubject: !!subject,
      hasSenderName: !!senderName,
      hasLanguage: !!language,
      hasLocation: !!location,
    });
    const token = await getAirtableToken();
    if (!token) {
      console.error("[mfs] Airtable: No se pudo obtener el token de Airtable");
      return { id: null };
    }
    const baseUrl = `https://api.airtable.com/v0/${CFG.AIRTABLE_BASE_ID}/${encodeURIComponent(
      CFG.AIRTABLE_TABLE
    )}`;

    let meta = await getAirtableFieldMaps();

    const intentCap = intent || "Discard";
    const SAFE_BODY = (body || "").slice(0, 50000);
    const scoreVal =
      typeof confidence === "number" && !Number.isNaN(confidence)
        ? Number(confidence.toFixed(3))
        : undefined;
    const reasoningStr = (reasoning || "").toString().slice(0, 1000);
    
    // Combine all MEDDIC fields into a single string for the "MEDDIC Analysis" field
    // Format with line breaks:
    // M: XXXX
    // E: XXXXX
    // D: XXXXX
    // D: XXXXX
    // I: XXXXX
    // C: XXXXX
    const meddicParts = [];
    if (meddicMetrics) meddicParts.push(`M: ${meddicMetrics}`);
    if (meddicEconomicBuyer) meddicParts.push(`E: ${meddicEconomicBuyer}`);
    if (meddicDecisionCriteria) meddicParts.push(`D: ${meddicDecisionCriteria}`);
    if (meddicDecisionProcess) meddicParts.push(`D: ${meddicDecisionProcess}`);
    if (meddicIdentifyPain) meddicParts.push(`I: ${meddicIdentifyPain}`);
    if (meddicChampion) meddicParts.push(`C: ${meddicChampion}`);
    const meddicStr = meddicParts.join("\n\n").slice(0, 1000);

    const fields = {};

    // Función para guardar valores usando nombres de campos (más robusto que IDs hardcodeados)
    const putNameSync = (name, val) => {
      if (val === undefined || val === null || val === "") return;
      
      // Usar el nombre del campo directamente (Airtable acepta nombres)
      // Si el campo no existe, Airtable lo ignorará
      fields[name] = val;
    };

    // Log crítico antes de guardar From y To
    console.log("[mfs] ===== AIRTABLE: VALORES ANTES DE GUARDAR =====");
    console.log("[mfs] from (recibido):", JSON.stringify(from));
    console.log("[mfs] to (recibido):", JSON.stringify(to));
    console.log("[mfs] from type:", typeof from);
    console.log("[mfs] to type:", typeof to);
    console.log("[mfs] from !== to?", from !== to);
    
    // Guardar campos básicos usando nombres (más robusto)
    // Asegurar que from y to son strings y diferentes
    const fromValue = String(from || "").trim();
    const toValue = String(to || "").trim();
    
    console.log("[mfs] fromValue (limpio):", JSON.stringify(fromValue));
    console.log("[mfs] toValue (limpio):", JSON.stringify(toValue));
    console.log("[mfs] fromValue !== toValue?", fromValue !== toValue);
    
    putNameSync("Email ID", id);
    putNameSync("From", fromValue);
    putNameSync("To", toValue);
    putNameSync("CC", cc);
    putNameSync("Subject", subject);
    putNameSync("Body", SAFE_BODY);
    putNameSync("Business Oppt", intentCap);
    
    // Log después de guardar
    console.log("[mfs] ===== AIRTABLE: VALORES GUARDADOS EN FIELDS =====");
    console.log("[mfs] fields['From']:", JSON.stringify(fields["From"]));
    console.log("[mfs] fields['To']:", JSON.stringify(fields["To"]));

    const putName = async (name, val) => {
      if (val === undefined || val === null || val === "") return;
      
      // Si el campo no está en el cache, intentar recargar el cache
      if (!meta.nameSet.has(name)) {
        if (!meta._reloadAttempted) {
          console.log(`[mfs] Airtable: campo "${name}" no encontrado en cache, recargando...`);
          meta._reloadAttempted = true;
          meta = await getAirtableFieldMaps(true);
        }
        
        // Después de recargar, verificar de nuevo
        if (!meta.nameSet.has(name)) {
          // Intentar usar el ID directamente si está en el mapa
          const fieldId = meta.nameToIdMap.get(name);
          if (fieldId) {
            console.log(`[mfs] Airtable: usando ID directo para "${name}": ${fieldId}`);
            fields[fieldId] = val;
            return;
          }
          console.warn(`[mfs] Airtable: campo "${name}" no existe en la tabla. Valor: ${val}`);
          return;
        }
      }
      
      // Usar el nombre del campo directamente (Airtable acepta nombres)
      fields[name] = val;
    };

    // Body Summary: obtener ID dinámicamente
    const MAX_SUMMARY_LENGTH = 1500; // ~150 palabras
    if (bodySummary && bodySummary.trim()) {
      const trimmedSummary = bodySummary.trim().slice(0, MAX_SUMMARY_LENGTH);
      // Intentar usar por nombre primero (más robusto)
      if (meta.nameSet.has("Body Summary")) {
        fields["Body Summary"] = trimmedSummary;
      } else {
        // Si no funciona por nombre, obtener el ID dinámicamente
        const bodySummaryFieldId = meta.nameToIdMap.get("Body Summary");
        if (bodySummaryFieldId) {
          fields[bodySummaryFieldId] = trimmedSummary;
          console.log("[mfs] Airtable: usando ID dinámico del campo Body Summary:", bodySummaryFieldId);
        } else {
          // Último intento: recargar cache y buscar de nuevo
          console.warn("[mfs] Airtable: campo Body Summary no encontrado, recargando cache...");
          const refreshedMeta = await getAirtableFieldMaps(true);
          if (refreshedMeta.nameSet.has("Body Summary")) {
            fields["Body Summary"] = trimmedSummary;
          } else {
            const refreshedBodySummaryId = refreshedMeta.nameToIdMap.get("Body Summary");
            if (refreshedBodySummaryId) {
              fields[refreshedBodySummaryId] = trimmedSummary;
            } else {
              console.error("[mfs] Airtable: campo Body Summary no existe en la tabla");
            }
          }
        }
      }
    }

    // Log crítico antes de guardar en Airtable
    console.log("[mfs] Airtable: Valores que se van a guardar:", {
      from: from,
      to: to,
      fromLength: from?.length || 0,
      toLength: to?.length || 0,
      fromIsEmpty: !from || from === "",
      toIsEmpty: !to || to === "",
      fromEqualsTo: from === to,
    });
    
    // Verificación crítica: asegurar que from y to son diferentes
    if (from === to && from) {
      console.error("[mfs] Airtable: ERROR - from y to son iguales! No se guardará hasta corregir.", {
        from,
        to,
        emailId: id,
      });
      // No continuar si hay este error crítico
      return { id: null };
    }
    
    // Campos básicos ya guardados arriba con putNameSync
    // Solo guardar campos adicionales con putName (async)
    await putName("Timestamp", timestamp);
    await putName("Classification Scoring", scoreVal);
    await putName("Classification Reasoning", reasoningStr);
    await putName("MEDDIC Analysis", meddicStr);

    // checkboxes
    await putName("Free Coverage Request", !!isFreeCoverage);
    await putName("Barter Request", !!isBarter);
    await putName("Media Kits/Pricing Request", !!isPricing);
    
    // Nuevos campos: nombre del cliente
    console.log("[mfs] Airtable: valores extraídos:", {
      senderName: senderName || "(vacío)",
      senderFirstName: senderFirstName || "(vacío)",
      language: language || "(vacío)",
      location: location ? `${location.city}, ${location.country} (${location.countryCode})` : "(no encontrada)",
    });
    
    await putName("Client Name", senderName);
    await putName("Client First Name", senderFirstName);
    
    // Idioma
    await putName("Language", language);
    
    // Ubicación (basada en email To)
    if (location) {
      await putName("City", location.city);
      await putName("Country", location.country);
      await putName("Country Code", location.countryCode);
    }

    console.log("[mfs] Airtable: Preparando registro final:", {
      id,
      businessOppt: intentCap,
      from,
      to,
      language,
      location: location ? `${location.city}, ${location.country}` : null,
      camposCount: Object.keys(fields).length,
      campos: Object.keys(fields).slice(0, 10), // Primeros 10 campos
    });

    const bodyReq = { records: [{ fields }], typecast: true };
    
    console.log("[mfs] Airtable: Enviando request a Airtable API...");
    const res = await axios.post(baseUrl, bodyReq, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const created = res.data.records?.[0];
    if (created?.id) {
      console.log("[mfs] Airtable: ✓ Registro creado exitosamente", {
        emailId: id,
        airtableId: created.id,
        businessOppt: intentCap,
      });
    } else {
      console.warn("[mfs] Airtable: ⚠ Respuesta inesperada de Airtable", {
        emailId: id,
        responseData: res.data,
      });
    }

    return created;
  } catch (e) {
    console.error("[mfs] Airtable: ✗ ERROR creando registro", {
      emailId: id,
      errorMessage: e?.message,
      errorResponse: e?.response?.data,
      errorStatus: e?.response?.status,
      errorStatusText: e?.response?.statusText,
    });
    console.error("[mfs] Airtable: Stack trace:", e?.stack);
    return { id: null };
  }
}


