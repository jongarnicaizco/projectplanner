/**
 * Servicio de Google Cloud Storage
 */
import { Storage } from "@google-cloud/storage";
import { CFG } from "../config.js";

const storage = new Storage();

/**
 * Guarda contenido en GCS
 */
export async function saveToGCS(name, content, contentType = "text/plain") {
  if (!CFG.GCS_BUCKET) {
    console.log("[mfs] GCS_BUCKET no definido, no guardo en GCS:", name);
    return null;
  }

  try {
    const file = storage.bucket(CFG.GCS_BUCKET).file(name);
    await file.save(content, { resumable: false, contentType });
    return `gs://${CFG.GCS_BUCKET}/${name}`;
  } catch (e) {
    console.error("[mfs] Error guardando en GCS:", e);
    return null;
  }
}

/**
 * Lee el estado del historyId desde GCS
 */
export async function readHistoryState() {
  if (!CFG.GCS_BUCKET) return null;

  try {
    const [buf] = await storage
      .bucket(CFG.GCS_BUCKET)
      .file(CFG.STATE_OBJECT)
      .download();
    const j = JSON.parse(buf.toString("utf8"));
    return j.historyId || null;
  } catch {
    return null;
  }
}

/**
 * Escribe el estado del historyId en GCS
 */
export async function writeHistoryState(historyId) {
  if (!CFG.GCS_BUCKET) return;

  await saveToGCS(
    CFG.STATE_OBJECT,
    JSON.stringify({ historyId, updatedAt: new Date().toISOString() }, null, 2),
    "application/json"
  );
}

/**
 * Borra el estado del historyId
 */
export async function clearHistoryState() {
  if (!CFG.GCS_BUCKET) return;

  try {
    await storage
      .bucket(CFG.GCS_BUCKET)
      .file(CFG.STATE_OBJECT)
      .delete({ ignoreNotFound: true });
    console.log("[mfs] Estado de historyId borrado en GCS");
  } catch (e) {
    console.warn("[mfs] Aviso borrando estado de historyId:", e?.message || e);
  }
}

/**
 * Lee el estado del historyId de la cuenta SENDER desde GCS
 */
export async function readHistoryStateSender() {
  if (!CFG.GCS_BUCKET) return null;

  try {
    const [buf] = await storage
      .bucket(CFG.GCS_BUCKET)
      .file(CFG.STATE_OBJECT_SENDER)
      .download();
    const j = JSON.parse(buf.toString("utf8"));
    return j.historyId || null;
  } catch {
    return null;
  }
}

/**
 * Escribe el estado del historyId de la cuenta SENDER en GCS
 */
export async function writeHistoryStateSender(historyId) {
  if (!CFG.GCS_BUCKET) return;

  await saveToGCS(
    CFG.STATE_OBJECT_SENDER,
    JSON.stringify({ historyId, updatedAt: new Date().toISOString() }, null, 2),
    "application/json"
  );
}

/**
 * Borra el estado del historyId de la cuenta SENDER
 */
export async function clearHistoryStateSender() {
  if (!CFG.GCS_BUCKET) return;

  try {
    await storage
      .bucket(CFG.GCS_BUCKET)
      .file(CFG.STATE_OBJECT_SENDER)
      .delete({ ignoreNotFound: true });
    console.log("[mfs] Estado de historyId SENDER borrado en GCS");
  } catch (e) {
    console.warn("[mfs] Aviso borrando estado de historyId SENDER:", e?.message || e);
  }
}

/**
 * Adquiere un lock por messageId para evitar duplicados
 */
export async function acquireMessageLock(messageId) {
  if (!CFG.GCS_BUCKET) return true;

  const file = storage
    .bucket(CFG.GCS_BUCKET)
    .file(`locks/gmail_${messageId}.lock`);

  try {
    await file.save("1", {
      resumable: false,
      contentType: "text/plain",
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    console.log("[mfs] Lock adquirido para mensaje", messageId);
    return true;
  } catch (e) {
    const code = e?.code || e?.response?.status;
    if (code === 412 || code === 409) {
      console.log(
        "[mfs] Lock ya existía, otra instancia procesa este mensaje, lo salto:",
        messageId
      );
      return false;
    }
    console.error("[mfs] Error al adquirir lock:", e);
    return false;
  }
}

/**
 * Libera el lock de un mensaje
 */
export async function releaseMessageLock(messageId) {
  if (!CFG.GCS_BUCKET) return;

  const file = storage
    .bucket(CFG.GCS_BUCKET)
    .file(`locks/gmail_${messageId}.lock`);

  try {
    await file.delete({ ignoreNotFound: true });
    console.log("[mfs] Lock liberado para mensaje", messageId);
  } catch (e) {
    console.warn("[mfs] Aviso al liberar lock:", e?.message || e?.code || e);
  }
}

/**
 * Verifica la edad de un lock (en milisegundos)
 * Retorna null si el lock no existe
 */
export async function checkLockAge(messageId) {
  if (!CFG.GCS_BUCKET) return null;

  const file = storage
    .bucket(CFG.GCS_BUCKET)
    .file(`locks/gmail_${messageId}.lock`);

  try {
    const [metadata] = await file.getMetadata();
    const created = new Date(metadata.timeCreated);
    const age = Date.now() - created.getTime();
    return age;
  } catch (e) {
    if (e?.code === 404) return null;
    console.warn("[mfs] Error verificando edad del lock:", e?.message || e);
    return null;
  }
}

/**
 * Lee el estado del rate limiting desde GCS
 * Retorna { count: número, windowStart: timestamp, notificationSent: boolean } o null si no existe
 */
export async function readRateLimitState() {
  if (!CFG.GCS_BUCKET) return null;

  try {
    const [buf] = await storage
      .bucket(CFG.GCS_BUCKET)
      .file("state/rate_limit.json")
      .download();
    const j = JSON.parse(buf.toString("utf8"));
    return {
      count: j.count || 0,
      windowStart: j.windowStart ? new Date(j.windowStart) : new Date(),
      notificationSent: j.notificationSent || false,
    };
  } catch {
    return null;
  }
}

/**
 * Escribe el estado del rate limiting en GCS
 */
export async function writeRateLimitState(count, windowStart, notificationSent = false) {
  if (!CFG.GCS_BUCKET) return;

  await saveToGCS(
    "state/rate_limit.json",
    JSON.stringify({
      count,
      windowStart: windowStart.toISOString(),
      notificationSent,
      updatedAt: new Date().toISOString(),
    }, null, 2),
    "application/json"
  );
}

/**
 * Resetea el estado del rate limiting (fuerza reset)
 */
export async function resetRateLimitState() {
  if (!CFG.GCS_BUCKET) return;

  const now = new Date();
  await saveToGCS(
    "state/rate_limit.json",
    JSON.stringify({
      count: 0,
      windowStart: now.toISOString(),
      notificationSent: false,
      updatedAt: now.toISOString(),
      resetAt: now.toISOString(),
      resetReason: "manual_reset",
    }, null, 2),
    "application/json"
  );
  console.log("[mfs] [rateLimit] ✓ Estado de rate limiting reseteado manualmente");
}

/**
 * Lee el estado del servicio (START/STOP)
 * Retorna { status: "active" | "stopped", updatedAt: string } o { status: "active", updatedAt: null } si no existe
 */
export async function readServiceStatus() {
  if (!CFG.GCS_BUCKET) return { status: "active", updatedAt: null };

  try {
    const [buf] = await storage
      .bucket(CFG.GCS_BUCKET)
      .file("state/service_status.json")
      .download();
    const j = JSON.parse(buf.toString("utf8"));
    return {
      status: j.status || "active",
      updatedAt: j.updatedAt || null,
    };
  } catch {
    // Si no existe, el servicio está activo por defecto
    return { status: "active", updatedAt: null };
  }
}

/**
 * Escribe el estado del servicio (START/STOP)
 */
export async function writeServiceStatus(status) {
  if (!CFG.GCS_BUCKET) return;

  if (status !== "active" && status !== "stopped") {
    throw new Error("Status debe ser 'active' o 'stopped'");
  }

  await saveToGCS(
    "state/service_status.json",
    JSON.stringify({
      status,
      updatedAt: new Date().toISOString(),
    }, null, 2),
    "application/json"
  );
  console.log(`[mfs] [service] ✓ Estado del servicio actualizado a: ${status}`);
}

/**
 * Lee el estado de la integración con Salesforce
 * Retorna { status: "active" | "stopped", updatedAt: string } o { status: "active", updatedAt: null } si no existe
 */
export async function readSalesforceStatus() {
  if (!CFG.GCS_BUCKET) return { status: "active", updatedAt: null };

  try {
    const [buf] = await storage
      .bucket(CFG.GCS_BUCKET)
      .file("state/salesforce_status.json")
      .download();
    const j = JSON.parse(buf.toString("utf8"));
    return {
      status: j.status || "active",
      updatedAt: j.updatedAt || null,
    };
  } catch {
    // Si no existe, la integración está activa por defecto
    return { status: "active", updatedAt: null };
  }
}

/**
 * Escribe el estado de la integración con Salesforce
 */
export async function writeSalesforceStatus(status) {
  if (!CFG.GCS_BUCKET) return;

  if (status !== "active" && status !== "stopped") {
    throw new Error("Status debe ser 'active' o 'stopped'");
  }

  await saveToGCS(
    "state/salesforce_status.json",
    JSON.stringify({
      status,
      updatedAt: new Date().toISOString(),
    }, null, 2),
    "application/json"
  );
  console.log(`[mfs] [salesforce] ✓ Estado de Salesforce actualizado a: ${status}`);
}

/**
 * Lee el estado del envío de emails automáticos
 * Retorna { status: "active" | "stopped", updatedAt: string } o { status: "active", updatedAt: null } si no existe
 */
export async function readEmailSendingStatus() {
  if (!CFG.GCS_BUCKET) return { status: "active", updatedAt: null };

  try {
    const [buf] = await storage
      .bucket(CFG.GCS_BUCKET)
      .file("state/email_sending_status.json")
      .download();
    const j = JSON.parse(buf.toString("utf8"));
    return {
      status: j.status || "active",
      updatedAt: j.updatedAt || null,
    };
  } catch {
    // Si no existe, el envío está activo por defecto
    return { status: "active", updatedAt: null };
  }
}

/**
 * Escribe el estado del envío de emails automáticos
 */
export async function writeEmailSendingStatus(status) {
  if (!CFG.GCS_BUCKET) return;

  if (status !== "active" && status !== "stopped") {
    throw new Error("Status debe ser 'active' o 'stopped'");
  }

  await saveToGCS(
    "state/email_sending_status.json",
    JSON.stringify({
      status,
      updatedAt: new Date().toISOString(),
    }, null, 2),
    "application/json"
  );
  console.log(`[mfs] [email] ✓ Estado de envío de emails actualizado a: ${status}`);
}


