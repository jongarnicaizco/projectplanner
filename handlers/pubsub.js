/**
 * Handler de Pub/Sub para notificaciones de Gmail
 */
import { getGmailClient, getNewInboxMessageIdsFromHistory } from "../services/gmail.js";
import { writeHistoryState } from "../services/storage.js";
import { processMessageIds } from "../services/processor.js";
import { logErr } from "../utils/helpers.js";

/**
 * Procesa notificaciones de Pub/Sub
 */
export async function handlePubSub(req, res) {
  try {
    const msg = req.body?.message;
    if (!msg?.data) {
      console.log("[mfs] _pubsub sin data → 204");
      return res.status(204).send();
    }

    let notif;
    try {
      const decoded = Buffer.from(msg.data, "base64").toString("utf8");
      notif = JSON.parse(decoded);
    } catch {
      console.warn(
        "[mfs] _pubsub: no he podido parsear el JSON del mensaje de Pub/Sub"
      );
      notif = null;
    }

    const notifHistoryId = notif?.historyId ? String(notif.historyId) : null;

    console.log("[mfs] _pubsub: notificación recibida de Gmail:", {
      historyId: notifHistoryId,
      emailAddress: notif?.emailAddress,
    });

    const gmail = await getGmailClient();

    // 1) Obtenemos TODOS los mensajes nuevos en INBOX
    const { ids, newHistoryId, usedFallback } =
      await getNewInboxMessageIdsFromHistory(gmail, notifHistoryId);

    console.log("[mfs] _pubsub: IDs que voy a procesar ahora:", {
      count: ids.length,
      ids: ids.slice(0, 10),
      usedFallback,
    });

    // 2) Procesamos secuencialmente cada mensaje
    if (ids.length) {
      try {
        await processMessageIds(gmail, ids);
      } catch (e) {
        logErr("[mfs] processMessageIds error:", e);
      }
    } else {
      console.log("[mfs] _pubsub: no hay mensajes nuevos que procesar");
    }

    // 3) Actualizamos historyId
    if (newHistoryId) {
      console.log("[mfs] _pubsub: actualizo historyId guardado →", newHistoryId);
      await writeHistoryState(newHistoryId);
    } else {
      console.log(
        "[mfs] _pubsub: no actualizo historyId (fallback o error de history)"
      );
    }

    return res.status(204).send();
  } catch (err) {
    logErr("Pub/Sub handler error:", err);
    return res.status(204).send(); // no reintentos infinitos
  }
}


