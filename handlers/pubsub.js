/**
 * Handler de Pub/Sub para notificaciones de Gmail
 */
import { getGmailClient, getGmailSenderClient, getNewInboxMessageIdsFromHistory } from "../services/gmail.js";
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

    // Procesar emails de media.manager@feverup.com (cuenta principal)
    const gmail = await getGmailClient();

    // 1) Obtenemos TODOS los mensajes nuevos en INBOX de la cuenta principal
    const { ids, newHistoryId, usedFallback } =
      await getNewInboxMessageIdsFromHistory(gmail, notifHistoryId);

    console.log("[mfs] _pubsub: IDs que voy a procesar ahora (cuenta principal):", {
      count: ids.length,
      ids: ids.slice(0, 10),
      usedFallback,
    });

    // 2) Procesamos secuencialmente cada mensaje de la cuenta principal
    if (ids.length) {
      try {
        await processMessageIds(gmail, ids);
      } catch (e) {
        logErr("[mfs] processMessageIds error (cuenta principal):", e);
      }
    } else {
      console.log("[mfs] _pubsub: no hay mensajes nuevos que procesar (cuenta principal)");
    }

    // Procesar emails de secretmedia@feverup.com (cuenta SENDER)
    try {
      console.log("[mfs] _pubsub: Procesando emails de secretmedia@feverup.com...");
      const gmailSender = await getGmailSenderClient();
      
      // Obtener mensajes nuevos de la cuenta SENDER
      const { ids: senderIds, newHistoryId: senderHistoryId, usedFallback: senderUsedFallback } =
        await getNewInboxMessageIdsFromHistory(gmailSender, notifHistoryId);

      console.log("[mfs] _pubsub: IDs que voy a procesar ahora (cuenta SENDER):", {
        count: senderIds.length,
        ids: senderIds.slice(0, 10),
        usedFallback: senderUsedFallback,
      });

      // Procesar mensajes de la cuenta SENDER
      if (senderIds.length) {
        try {
          await processMessageIds(gmailSender, senderIds);
        } catch (e) {
          logErr("[mfs] processMessageIds error (cuenta SENDER):", e);
        }
      } else {
        console.log("[mfs] _pubsub: no hay mensajes nuevos que procesar (cuenta SENDER)");
      }
    } catch (senderError) {
      console.error("[mfs] _pubsub: Error procesando cuenta SENDER (continuando con cuenta principal):", senderError?.message || senderError);
      // Continuar aunque falle la cuenta SENDER
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


