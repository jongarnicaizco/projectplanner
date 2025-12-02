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

  const token = await getAirtableToken();
  const metaUrl = `https://api.airtable.com/v0/meta/bases/${CFG.AIRTABLE_BASE_ID}/tables`;

  const r = await axios.get(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const tables = r.data?.tables || [];
  const table =
    (CFG.AIRTABLE_TABLE?.startsWith("tbl")
      ? tables.find((t) => t.id === CFG.AIRTABLE_TABLE)
      : tables.find((t) => t.name === CFG.AIRTABLE_TABLE)) || null;

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

export async function airtableFindByEmailId(emailId) {
  const token = await getAirtableToken();
  const url = `https://api.airtable.com/v0/${CFG.AIRTABLE_BASE_ID}/${encodeURIComponent(
    CFG.AIRTABLE_TABLE
  )}`;

  const formula = `({Email ID} = "${emailId.replace(/"/g, '\\"')}")`;
  console.log("[mfs] Airtable: busco si ya existe registro para Email ID", emailId);

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params: { maxRecords: 1, filterByFormula: formula },
  });

  return res.data.records?.[0] || null;
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
  if (FLAGS.SKIP_AIRTABLE) {
    console.log("[mfs] SKIP_AIRTABLE activado → no escribo en Airtable");
    return { id: null };
  }

  try {
    const token = await getAirtableToken();
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

    // Obtener IDs de campos dinámicamente desde los metadatos
    const getFieldId = (fieldName) => {
      return meta.nameToIdMap.get(fieldName) || null;
    };

    // Intentar usar IDs hardcodeados primero (para compatibilidad), luego nombres
    const putId = (fid, val) => {
      if (fid && meta.idSet.has(fid)) {
        fields[fid] = val ?? "";
        return true;
      }
      return false;
    };

    // Intentar usar IDs hardcodeados, si no funcionan, usar nombres
    if (!putId(FIDS.EMAIL_ID, id)) {
      const emailIdFieldId = getFieldId("Email ID");
      if (emailIdFieldId) fields[emailIdFieldId] = id;
    }
    if (!putId(FIDS.FROM, from)) {
      const fromFieldId = getFieldId("From");
      if (fromFieldId) fields[fromFieldId] = from;
    }
    if (!putId(FIDS.TO, to)) {
      const toFieldId = getFieldId("To");
      if (toFieldId) fields[toFieldId] = to;
    }
    if (!putId(FIDS.CC, cc)) {
      const ccFieldId = getFieldId("CC");
      if (ccFieldId) fields[ccFieldId] = cc;
    }
    if (!putId(FIDS.SUBJECT, subject)) {
      const subjectFieldId = getFieldId("Subject");
      if (subjectFieldId) fields[subjectFieldId] = subject;
    }
    if (!putId(FIDS.BODY, SAFE_BODY)) {
      const bodyFieldId = getFieldId("Body");
      if (bodyFieldId) fields[bodyFieldId] = SAFE_BODY;
    }
    if (!putId(FIDS.BUSINESS_OPPT, intentCap)) {
      const businessOpptFieldId = getFieldId("Business Oppt");
      if (businessOpptFieldId) fields[businessOpptFieldId] = intentCap;
    }

    const putName = (name, val) => {
      if (!meta.nameSet.has(name)) {
        // Si el campo no está en el cache, intentar recargar el cache una vez
        if (!meta._reloadAttempted) {
          console.log(`[mfs] Airtable: campo "${name}" no encontrado en cache, recargando...`);
          meta._reloadAttempted = true;
          return; // Se reintentará en el siguiente intento
        }
        return;
      }
      if (val === undefined) return;
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

    putName("Email ID", id);
    putName("From", from);
    putName("To", to);
    putName("CC", cc);
    putName("Subject", subject);
    putName("Body", SAFE_BODY);
    putName("Timestamp", timestamp);
    putName("Business Oppt", intentCap);
    putName("Classification Scoring", scoreVal);
    putName("Classification Reasoning", reasoningStr);
    putName("MEDDIC Analysis", meddicStr);

    // checkboxes
    putName("Free Coverage Request", !!isFreeCoverage);
    putName("Barter Request", !!isBarter);
    putName("Media Kits/Pricing Request", !!isPricing);
    
    // Nuevos campos: nombre del cliente
    if (senderName) putName("Client Name", senderName);
    if (senderFirstName) putName("Client First Name", senderFirstName);
    
    // Idioma
    if (language) putName("Language", language);
    
    // Ubicación (basada en email To)
    if (location) {
      if (location.city) putName("City", location.city);
      if (location.country) putName("Country", location.country);
      if (location.countryCode) putName("Country Code", location.countryCode);
    }

    console.log("[mfs] Airtable: creo nuevo registro para email:", {
      id,
      businessOppt: intentCap,
      from,
      to,
      language,
      location: location ? `${location.city}, ${location.country}` : null,
    });

    const bodyReq = { records: [{ fields }], typecast: true };
    const res = await axios.post(baseUrl, bodyReq, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const created = res.data.records?.[0];
    console.log("[mfs] Airtable: registro creado correctamente", {
      emailId: id,
      airtableId: created?.id,
    });

    return created;
  } catch (e) {
    console.error("[mfs] Error creando registro en Airtable:", e);
    return { id: null };
  }
}


