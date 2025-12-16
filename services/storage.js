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
 * Obtiene el estado consolidado del sistema (service, salesforce, email, tiers)
 */
export async function readSystemState() {
  if (!CFG.GCS_BUCKET) {
    return {
      service_status: "active",
      salesforce_status: "active",
      email_sending_status: "active",
      low_power_mode: false,
      tier1_triggered: false,
      tier2_triggered: false,
      updatedAt: new Date().toISOString()
    };
  }

  try {
    const file = storage.bucket(CFG.GCS_BUCKET).file(CFG.STATE_OBJECT.replace("gmail_history.json", "system_state.json"));
    const [exists] = await file.exists();
    if (!exists) {
      return {
        service_status: "active",
        salesforce_status: "active",
        email_sending_status: "active",
        low_power_mode: false,
        tier1_triggered: false,
        tier2_triggered: false,
        updatedAt: new Date().toISOString()
      };
    }
    const [content] = await file.download();
    const data = JSON.parse(content.toString());
    return {
      service_status: data.service_status || "active",
      salesforce_status: data.salesforce_status || "active",
      email_sending_status: data.email_sending_status || "active",
      low_power_mode: !!data.low_power_mode,
      tier1_triggered: !!data.tier1_triggered,
      tier2_triggered: !!data.tier2_triggered,
      updatedAt: data.updatedAt
    };
  } catch (e) {
    console.warn("[mfs] Error reading system state, returning default:", e.message);
    return {
      service_status: "active",
      salesforce_status: "active",
      email_sending_status: "active",
      low_power_mode: false,
      tier1_triggered: false,
      tier2_triggered: false
    };
  }
}

/**
 * Guarda el estado consolidado del sistema
 */
export async function writeSystemState(newState) {
  if (!CFG.GCS_BUCKET) return;

  const currentState = await readSystemState();
  const updatedState = { ...currentState, ...newState, updatedAt: new Date().toISOString() };

  const file = storage.bucket(CFG.GCS_BUCKET).file(CFG.STATE_OBJECT.replace("gmail_history.json", "system_state.json"));
  await file.save(JSON.stringify(updatedState), {
    contentType: "application/json",
    metadata: { cacheControl: "no-cache" },
  });
  console.log("[mfs] System State updated:", JSON.stringify(newState));
  return updatedState;
}

// WRAPPERS PARA COMPATIBILIDAD CON CÓDIGO EXISTENTE
export async function readServiceStatus() {
  const state = await readSystemState();
  return { status: state.service_status, updatedAt: state.updatedAt };
}

export async function writeServiceStatus(status) {
  await writeSystemState({ service_status: status });
  return { status, updatedAt: new Date().toISOString() };
}

export async function readSalesforceStatus() {
  const state = await readSystemState();
  return { status: state.salesforce_status };
}

export async function writeSalesforceStatus(status) {
  await writeSystemState({ salesforce_status: status });
  return { status };
}

export async function readEmailSendingStatus() {
  const state = await readSystemState();
  return { status: state.email_sending_status };
}

export async function writeEmailSendingStatus(status) {
  await writeSystemState({ email_sending_status: status });
  return { status };
}


