/**
 * Handlers de debug y utilidades
 */
import { getGmailClient } from "../services/gmail.js";
import { backoff, logErr } from "../utils/helpers.js";
import { processMessageIds } from "../services/processor.js";
import { DEBUG_SCAN_MAX } from "../config.js";
import { getAirtableFieldMaps, getAirtableToken } from "../services/airtable.js";
import { CFG } from "../config.js";

/**
 * Lista las etiquetas de Gmail
 */
export async function handleLabels(req, res) {
  try {
    const gmail = await getGmailClient();
    const { data } = await gmail.users.labels.list({ userId: "me" });
    res.json((data.labels || []).map((l) => ({ id: l.id, name: l.name })));
  } catch (e) {
    logErr("[mfs] /debug/labels error:", e);
    res.status(500).json({ error: e?.message });
  }
}

/**
 * Obtiene información de un mensaje específico
 */
export async function handleMessage(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "provide ?id=" });

    const gmail = await getGmailClient();
    const m = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
    });

    res.json({ id, labelIds: m.data.labelIds || [] });
  } catch (e) {
    logErr("[mfs] /debug/msg error:", e);
    res.status(500).json({ error: e?.message });
  }
}

/**
 * Escanea INBOX y procesa mensajes (backup para Cloud Scheduler)
 */
/**
 * Verifica la conexión y configuración de Airtable
 */
export async function handleAirtableTest(req, res) {
  try {
    console.log("[mfs] /debug/airtable → verificando configuración de Airtable");
    
    const result = {
      baseId: CFG.AIRTABLE_BASE_ID,
      table: CFG.AIRTABLE_TABLE,
      tokenSecret: CFG.AIRTABLE_TOKEN_SECRET,
      hasToken: false,
      canConnect: false,
      fields: null,
      error: null,
    };

    // Verificar token
    try {
      const token = await getAirtableToken();
      result.hasToken = !!token;
    } catch (e) {
      result.error = `Error obteniendo token: ${e.message}`;
      return res.status(500).json(result);
    }

    // Obtener campos
    try {
      const meta = await getAirtableFieldMaps(true); // Forzar refresh
      result.canConnect = true;
      result.fields = {
        total: meta.nameSet.size,
        names: Array.from(meta.nameSet),
        hasBodySummary: meta.nameSet.has("Body Summary"),
        nameToIdMap: Object.fromEntries(meta.nameToIdMap),
      };
      
      // Verificar campos críticos
      const camposCriticos = [
        "Email ID",
        "From",
        "Subject",
        "Body",
        "Business Oppt",
        "Body Summary",
      ];
      
      result.missingFields = camposCriticos.filter(
        (name) => !meta.nameSet.has(name)
      );
      
      if (result.missingFields.length === 0) {
        result.status = "ok";
        result.message = "Airtable configurado correctamente. Todos los campos críticos están presentes.";
      } else {
        result.status = "warning";
        result.message = `Airtable configurado pero faltan campos: ${result.missingFields.join(", ")}`;
      }
    } catch (e) {
      result.error = `Error conectando a Airtable: ${e.message}`;
      if (e.response) {
        result.errorDetails = {
          status: e.response.status,
          data: e.response.data,
        };
      }
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (e) {
    logErr("[mfs] /debug/airtable error:", e);
    res.status(500).json({ error: e?.message });
  }
}

export async function handleScan(req, res) {
  try {
    const gmail = await getGmailClient();
    const bodyQ = (req.body && req.body.q) || "";
    let q = (bodyQ || `in:inbox newer_than:30d`).trim();

    console.log("[mfs] /debug/scan con query:", q);

    let list = await backoff(
      () =>
        gmail.users.messages.list({
          userId: "me",
          q,
          maxResults: DEBUG_SCAN_MAX,
        }),
      "messages.list"
    );

    let ids = (list.data.messages || []).map((m) => m.id);

    if (!ids.length) {
      q = `in:inbox`.trim();
      console.log(
        "[mfs] /debug/scan: sin resultados con query, pruebo INBOX sin filtro"
      );

      list = await backoff(
        () =>
          gmail.users.messages.list({
            userId: "me",
            q,
            maxResults: DEBUG_SCAN_MAX,
          }),
        "messages.list"
      );

      ids = (list.data.messages || []).map((m) => m.id);
    }

    const out = ids.length ? await processMessageIds(gmail, ids) : [];

    res.json({
      q,
      found: ids.length,
      processed: out.length,
      sample: out.slice(0, 5),
    });
  } catch (e) {
    logErr("[mfs] /debug/scan error:", e);
    res.status(500).json({ error: e?.message });
  }
}


