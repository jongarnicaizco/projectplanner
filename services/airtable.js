/**
 * Servicio de Airtable
 */
import axios from "axios";
import { CFG, FLAGS, FIDS } from "../config.js";
import { accessSecret } from "./secrets.js";

let airtableMetaCache = null;

/**
 * Obtiene los mapas de campos de Airtable
 */
export async function getAirtableFieldMaps() {
  if (airtableMetaCache) return airtableMetaCache;

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

  (table?.fields || []).forEach((f) => {
    nameSet.add(f.name);
    idSet.add(f.id);
  });

  airtableMetaCache = { nameSet, idSet };

  console.log("[mfs] Airtable: campos cargados para la tabla:", {
    table: table?.name || table?.id,
    fieldCount: nameSet.size,
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
  intent,
  confidence,
  reasoning,
  meddic,
  isFreeCoverage,
  isBarter,
  isPrInvitation,
  isPricing,
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

    const meta = await getAirtableFieldMaps();

    const intentCap = intent || "Discard";
    const SAFE_BODY = (body || "").slice(0, 50000);
    const scoreVal =
      typeof confidence === "number" && !Number.isNaN(confidence)
        ? Number(confidence.toFixed(3))
        : undefined;
    const reasoningStr = (reasoning || "").toString().slice(0, 1000);
    const meddicStr = (meddic || "").toString().slice(0, 1000);

    const fields = {};

    const putId = (fid, val) => {
      if (fid && meta.idSet.has(fid)) fields[fid] = val ?? "";
    };

    putId(FIDS.EMAIL_ID, id);
    putId(FIDS.FROM, from);
    putId(FIDS.TO, to);
    putId(FIDS.CC, cc);
    putId(FIDS.SUBJECT, subject);
    putId(FIDS.BODY, SAFE_BODY);
    putId(FIDS.BUSINESS_OPPT, intentCap);

    const putName = (name, val) => {
      if (!meta.nameSet.has(name)) return;
      if (val === undefined) return;
      fields[name] = val;
    };

    putName("Email ID", id);
    putName("From", from);
    putName("To", to);
    putName("CC", cc);
    putName("Subject", subject);
    putName("Body", SAFE_BODY);
    putName("Business Oppt", intentCap);
    putName("Classification Scoring", scoreVal);
    putName("Classification Reasoning", reasoningStr);
    putName("MEDDIC Analysis", meddicStr);

    // checkboxes
    putName("Free Coverage Request", !!isFreeCoverage);
    putName("Barter Request", !!isBarter);
    putName("PR invitation", !!isPrInvitation);
    putName("Media Kits/Pricing Request", !!isPricing);

    console.log("[mfs] Airtable: creo nuevo registro para email:", {
      id,
      businessOppt: intentCap,
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


