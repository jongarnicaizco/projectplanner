/**
 * Procesador de mensajes de Gmail
 */
import { getGmailClient } from "./gmail.js";
import {
  backoff,
  logErr,
  bodyFromMessage,
  extractCleanEmail,
  extractSenderName,
  extractFirstName,
  detectLanguage,
  getLocationFromEmail,
} from "../utils/helpers.js";
import {
  acquireMessageLock,
  releaseMessageLock,
  saveToGCS,
} from "./storage.js";
import { classifyIntent, generateBodySummary } from "./vertex.js";
import {
  airtableFindByEmailId,
  createAirtableRecord,
} from "./airtable.js";

/**
 * Procesa una lista de IDs de mensajes
 */
export async function processMessageIds(gmail, ids) {
  console.log("[mfs] ========================================");
  console.log("[mfs] INICIO: Procesando lote de mensajes", {
    totalMensajes: ids.length,
    ids: ids.slice(0, 5), // Mostrar primeros 5 IDs
  });
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
      // Nota: airtableFindByEmailId ya maneja todos los errores internamente y retorna null
      // No necesitamos try-catch aquí porque nunca lanzará excepciones
      let existing = null;
      existing = await airtableFindByEmailId(id);
      
      if (existing) {
        console.log("[mfs] Mensaje ya existe en Airtable, saltando:", {
          emailId: id,
          airtableId: existing.id,
        });
        continue;
      }
      console.log("[mfs] Mensaje no existe en Airtable, continuando con el procesamiento");

      const headersArr = msg.data.payload.headers || [];
      const headers = Object.fromEntries(
        headersArr.map((h) => [h.name.toLowerCase(), h.value])
      );

      const subject = headers["subject"] || "";
      const fromHeader = headers["from"] || "";
      const toHeader = headers["to"] || process.env.GMAIL_ADDRESS || "";
      const cc = headers["cc"] || "";
      const body = bodyFromMessage(msg.data);
      
      // Extraer emails limpios (sin nombres)
      const from = extractCleanEmail(fromHeader);
      const to = extractCleanEmail(toHeader);
      
      // Extraer nombre del remitente
      const senderName = extractSenderName(fromHeader);
      const senderFirstName = extractFirstName(senderName);
      
      // Detectar idioma
      const language = detectLanguage(subject + " " + body);
      
      // Obtener ubicación basada en el email To
      const location = getLocationFromEmail(toHeader);
      
      // Log detallado de extracción
      console.log("[mfs] Datos extraídos del email:", {
        fromHeader: fromHeader.slice(0, 100),
        toHeader: toHeader.slice(0, 100),
        from: from,
        to: to,
        senderName: senderName || "(vacío)",
        senderFirstName: senderFirstName || "(vacío)",
        language: language || "(no detectado)",
        location: location ? `${location.city}, ${location.country} (${location.countryCode})` : "(no encontrada)",
      });
      
      // Extraer timestamp del mensaje (internalDate está en milisegundos)
      const internalDate = msg.data.internalDate;
      const timestamp = internalDate 
        ? new Date(parseInt(internalDate, 10)).toISOString()
        : new Date().toISOString(); // Fallback a fecha actual si no hay internalDate

      console.log("[mfs] Mensaje listo para clasificar:", {
        id,
        from,
        to,
        subject: subject.slice(0, 120),
        senderName: senderName || "(no extraído)",
        senderFirstName: senderFirstName || "(no extraído)",
        language: language || "(no detectado)",
        location: location ? `${location.city}, ${location.country}` : "(no encontrada)",
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
        meddicMetrics,
        meddicEconomicBuyer,
        meddicDecisionCriteria,
        meddicDecisionProcess,
        meddicIdentifyPain,
        meddicChampion,
        isFreeCoverage,
        isBarter,
        isPricing,
      } = await classifyIntent({
        subject,
        from,
        to,
        body,
      });

      // Generar resumen del body con Gemini
      const bodySummary = await generateBodySummary(body);
      console.log("[mfs] Resumen del body generado:", {
        hasSummary: !!bodySummary,
        summaryLength: bodySummary?.length || 0,
        preview: bodySummary?.slice(0, 100) || "(vacío)",
      });

      // Crear registro en Airtable
      console.log("[mfs] Preparando datos para Airtable:", {
        id,
        intent,
        confidence,
        hasSenderName: !!senderName,
        hasLanguage: !!language,
        hasLocation: !!location,
      });
      
      const rec = await createAirtableRecord({
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
      });

      if (rec?.id) {
        console.log("[mfs] ✓ Registro creado exitosamente en Airtable:", {
          emailId: id,
          airtableId: rec.id,
          intent,
        });
      } else {
        console.error("[mfs] ✗ Error: No se pudo crear el registro en Airtable", {
          emailId: id,
          intent,
        });
      }

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
      console.error("[mfs] ✗ ERROR procesando mensaje:", id);
      logErr("[mfs] Error en el bucle de processMessageIds:", e);
      console.error("[mfs] Stack trace:", e?.stack);
    } finally {
      if (lockAcquired) {
        await releaseMessageLock(id);
      }
    }
  }

  console.log("[mfs] ========================================");
  console.log("[mfs] FIN: Resumen del lote procesado", {
    totalProcesados: results.length,
    exitosos: results.filter(r => r.airtableId).length,
    fallidos: results.filter(r => !r.airtableId).length,
    resultados: results.map(r => ({
      id: r.id,
      intent: r.intent,
      tieneAirtableId: !!r.airtableId,
    })),
  });
  return results;
}


