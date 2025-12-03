/**
 * Handler de Pub/Sub para notificaciones de Gmail
 */
import { getGmailClient, getGmailSenderClient, getNewInboxMessageIdsFromHistory } from "../services/gmail.js";
import { writeHistoryState, writeHistoryStateSender } from "../services/storage.js";
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
    // IMPORTANTE: Este código SIEMPRE se ejecuta, incluso si la cuenta principal falló
    console.log("[mfs] ===== INICIANDO PROCESAMIENTO DE CUENTA SENDER =====");
    console.log("[mfs] _pubsub: Llegué a la sección de procesamiento de cuenta SENDER");
    try {
      console.log("[mfs] _pubsub: Procesando emails de secretmedia@feverup.com...");
      console.log("[mfs] _pubsub: Obteniendo cliente Gmail SENDER...");
      
      const gmailSender = await getGmailSenderClient();
      console.log("[mfs] _pubsub: ✓ Cliente Gmail SENDER obtenido exitosamente");
      
      // Obtener mensajes nuevos de la cuenta SENDER (usando estado separado)
      console.log("[mfs] _pubsub: Obteniendo mensajes nuevos de cuenta SENDER...");
      const { ids: senderIds, newHistoryId: senderHistoryId, usedFallback: senderUsedFallback } =
        await getNewInboxMessageIdsFromHistory(gmailSender, notifHistoryId, true); // useSenderState = true

      console.log("[mfs] _pubsub: IDs que voy a procesar ahora (cuenta SENDER):", {
        count: senderIds.length,
        ids: senderIds.slice(0, 10),
        usedFallback: senderUsedFallback,
      });

      // Procesar mensajes de la cuenta SENDER
      if (senderIds.length) {
        console.log("[mfs] _pubsub: ✓ Hay", senderIds.length, "mensajes para procesar (cuenta SENDER)");
        try {
          await processMessageIds(gmailSender, senderIds);
          console.log("[mfs] _pubsub: ✓ Procesamiento de cuenta SENDER completado");
        } catch (e) {
          console.error("[mfs] _pubsub: ✗✗✗ ERROR en processMessageIds (cuenta SENDER) ✗✗✗");
          logErr("[mfs] processMessageIds error (cuenta SENDER):", e);
          console.error("[mfs] _pubsub: Stack trace:", e?.stack);
        }
      } else {
        console.log("[mfs] _pubsub: No hay mensajes nuevos que procesar (cuenta SENDER)");
      }
    } catch (senderError) {
      console.error("[mfs] _pubsub: ✗✗✗ ERROR CRÍTICO procesando cuenta SENDER ✗✗✗");
      console.error("[mfs] _pubsub: Error message:", senderError?.message || senderError);
      console.error("[mfs] _pubsub: Error code:", senderError?.code || senderError?.response?.status || "unknown");
      console.error("[mfs] _pubsub: Error type:", senderError?.name || "unknown");
      console.error("[mfs] _pubsub: Stack trace:", senderError?.stack);
      console.error("[mfs] _pubsub: Continuando con cuenta principal...");
      // Continuar aunque falle la cuenta SENDER
    }
    console.log("[mfs] ===== FIN PROCESAMIENTO DE CUENTA SENDER =====");

    // 3) Actualizamos historyId de la cuenta principal
    if (newHistoryId) {
      console.log("[mfs] _pubsub: actualizo historyId guardado (cuenta principal) →", newHistoryId);
      await writeHistoryState(newHistoryId);
    } else {
      console.log(
        "[mfs] _pubsub: no actualizo historyId (fallback o error de history)"
      );
    }

    // 4) Actualizamos historyId de la cuenta SENDER (si se procesó)
    if (senderHistoryId) {
      console.log("[mfs] _pubsub: actualizo historyId guardado (cuenta SENDER) →", senderHistoryId);
      await writeHistoryStateSender(senderHistoryId);
    }

    return res.status(204).send();
  } catch (err) {
    logErr("Pub/Sub handler error:", err);
    return res.status(204).send(); // no reintentos infinitos
  }
}


