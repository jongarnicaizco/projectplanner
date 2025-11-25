/**
 * Procesador de mensajes de Gmail
 */
import { getGmailClient } from "./gmail.js";
import { backoff, logErr, bodyFromMessage } from "../utils/helpers.js";
import {
  acquireMessageLock,
  releaseMessageLock,
  saveToGCS,
} from "./storage.js";
import { classifyIntent } from "./vertex.js";
import {
  airtableFindByEmailId,
  createAirtableRecord,
} from "./airtable.js";

/**
 * Procesa una lista de IDs de mensajes
 */
export async function processMessageIds(gmail, ids) {
  const results = [];

  for (const id of ids) {
    let lockAcquired = false;

    try {
      console.log("––––––––––––––––––––––––––––––––––––––––––");
      console.log("[mfs] Empiezo a procesar mensaje:", id);

      // Lock por messageId para evitar duplicados
      lockAcquired = await acquireMessageLock(id);
      if (!lockAcquired) {
        console.log(
          "[mfs] Mensaje saltado porque otra instancia ya lo está tratando:",
          id
        );
        continue;
      }

      let msg;
      try {
        msg = await backoff(
          () => gmail.users.messages.get({ userId: "me", id, format: "full" }),
          "messages.get"
        );
      } catch (e) {
        const code = e?.response?.status || e?.code || e?.status;
        if (String(code) === "404") {
          console.warn(
            "[mfs] Gmail devolvió 404 para este mensaje, lo salto:",
            id
          );
          continue;
        }
        logErr("[mfs] Error al leer mensaje de Gmail:", e);
        continue;
      }

      const msgLabelIds = msg.data.labelIds || [];
      if (!msgLabelIds.includes("INBOX")) {
        console.log(
          "[mfs] Mensaje no está en INBOX, lo ignoro:",
          id,
          msgLabelIds
        );
        continue;
      }

      // Verificar si ya existe en Airtable
      const existing = await airtableFindByEmailId(id);
      if (existing) {
        console.log("[mfs] Ya existe registro en Airtable, no duplico fila:", {
          emailId: id,
          airtableId: existing.id,
        });
        continue;
      }

      const headersArr = msg.data.payload.headers || [];
      const headers = Object.fromEntries(
        headersArr.map((h) => [h.name.toLowerCase(), h.value])
      );

      const subject = headers["subject"] || "";
      const from = headers["from"] || "";
      const to = headers["to"] || process.env.GMAIL_ADDRESS || "";
      const cc = headers["cc"] || "";
      const body = bodyFromMessage(msg.data);

      console.log("[mfs] Mensaje listo para clasificar:", {
        id,
        from,
        to,
        subject: subject.slice(0, 120),
      });

      // Guardar en GCS
      const baseName = `${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}_${id}`;

      await saveToGCS(
        `${baseName}_meta.json`,
        JSON.stringify({ headers }, null, 2),
        "application/json"
      );

      await saveToGCS(`${baseName}_body.txt`, body, "text/plain");

      // Clasificar el lead
      const {
        intent,
        confidence,
        reasoning,
        meddic,
        isFreeCoverage,
        isBarter,
        isPrInvitation,
        isPricing,
      } = await classifyIntent({
        subject,
        from,
        to,
        body,
      });

      // Crear registro en Airtable
      const rec = await createAirtableRecord({
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
      });

      results.push({ id, airtableId: rec?.id, intent, confidence });

      console.log("[mfs] Fin de procesado para mensaje:", {
        id,
        airtableId: rec?.id,
        intent,
        confidence,
      });

      // Pequeño delay para evitar picos
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      logErr("[mfs] Error en el bucle de processMessageIds:", e);
    } finally {
      if (lockAcquired) {
        await releaseMessageLock(id);
      }
    }
  }

  console.log("[mfs] Fin de lote de mensajes. Resumen:", results);
  return results;
}


