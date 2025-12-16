/**
 * Handlers de debug y utilidades
 */
import { getGmailClient } from "../services/gmail.js";
import { backoff, logErr } from "../utils/helpers.js";
import { processMessageIds } from "../services/processor.js";
import { DEBUG_SCAN_MAX } from "../config.js";
// Airtable removido - ahora se envía por email
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
// Función handleAirtableTest eliminada - ya no se usa Airtable

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


