/**
 * Servicio de Gmail
 */
import { google } from "googleapis";
import { CFG } from "../config.js";
import { accessSecret } from "./secrets.js";
import { backoff } from "../utils/helpers.js";
import {
  readHistoryState,
  writeHistoryState,
} from "./storage.js";

/**
 * Crea y retorna el cliente de Gmail
 */
export async function getGmailClient() {
  console.log("[mfs] Creando cliente de Gmail con modo:", CFG.AUTH_MODE);

  if (CFG.AUTH_MODE === "oauth") {
    const clientId = await accessSecret("GMAIL_CLIENT_ID");
    const clientSecret = await accessSecret("GMAIL_CLIENT_SECRET");
    const refreshToken = await accessSecret("GMAIL_REFRESH_TOKEN");
    
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    
    console.log("[mfs] Cliente Gmail OAuth listo");
    return google.gmail({ version: "v1", auth: oAuth2Client });
  }

  // Domain-wide delegation (JWT)
  const jwt = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/gmail.readonly"],
    CFG.GMAIL_ADDRESS
  );
  
  await jwt.authorize();
  console.log("[mfs] Cliente Gmail DWD listo");
  return google.gmail({ version: "v1", auth: jwt });
}

/**
 * Obtiene todos los mensajes nuevos en INBOX desde el último historyId
 */
export async function getNewInboxMessageIdsFromHistory(gmail, notifHistoryId) {
  let startHistoryId = await readHistoryState();

  // Si no hay historyId guardado, hacemos fallback inicial
  if (!startHistoryId) {
    console.log(
      "[mfs] [history] No hay historyId guardado todavía. Uso fallback de INBOX."
    );

    try {
      const prof = await backoff(
        () => gmail.users.getProfile({ userId: "me" }),
        "users.getProfile"
      );
      const profHist = prof.data.historyId;
      if (profHist) {
        await writeHistoryState(String(profHist));
        startHistoryId = String(profHist);
        console.log(
          "[mfs] [history] historyId inicial guardado desde getProfile:",
          profHist
        );
      }
    } catch (e) {
      console.error("[mfs] [history] Error obteniendo historyId de perfil:", e);
    }

    // Fallback: escaneo INBOX
    const list = await backoff(
      () =>
        gmail.users.messages.list({
          userId: "me",
          q: "in:inbox",
          maxResults: 100,
        }),
      "messages.list.fallback"
    );

    const ids = (list.data.messages || []).map((m) => m.id);
    console.log(
      "[mfs] [history] Fallback inicial: mensajes INBOX a procesar ahora:",
      ids.length
    );

    const newHistoryId =
      notifHistoryId || (startHistoryId ? String(startHistoryId) : null);
    return { ids, newHistoryId, usedFallback: true };
  }

  startHistoryId = String(startHistoryId);

  // Si la notificación trae historyId <= ya procesado, no hay nada nuevo
  if (notifHistoryId) {
    try {
      const last = BigInt(startHistoryId);
      const notif = BigInt(String(notifHistoryId));
      if (notif <= last) {
        console.log(
          "[mfs] [history] Notificación con historyId <= al ya procesado:",
          { startHistoryId, notifHistoryId }
        );
        return { ids: [], newHistoryId: startHistoryId, usedFallback: false };
      }
    } catch {
      // Si falla BigInt, seguimos la lógica normal
    }
  }

  let pageToken;
  const idsSet = new Set();

  console.log(
    "[mfs] [history] Pidiendo delta a Gmail.history.list desde historyId:",
    startHistoryId
  );

  while (true) {
    let resp;
    try {
      resp = await backoff(
        () =>
          gmail.users.history.list({
            userId: "me",
            startHistoryId,
            pageToken,
            historyTypes: ["messageAdded"],
            maxResults: 500,
          }),
        "history.list"
      );
    } catch (e) {
      const code = String(e?.response?.status || e?.code || e?.status || "");
      const status = String(e?.response?.data?.error?.status || "");

      if (code === "404" || status === "FAILED_PRECONDITION") {
        console.error(
          "[mfs] [history] startHistoryId demasiado antiguo. Hago fallback de INBOX."
        );

        const list = await backoff(
          () =>
            gmail.users.messages.list({
              userId: "me",
              q: "in:inbox",
              maxResults: 100,
            }),
          "messages.list.fallback404"
        );

        const ids = (list.data.messages || []).map((m) => m.id);
        return { ids, newHistoryId: notifHistoryId || null, usedFallback: true };
      }
      throw e;
    }

    const data = resp.data || {};
    const history = data.history || [];

    for (const h of history) {
      (h.messagesAdded || []).forEach((ma) => {
        const m = ma.message;
        if (!m) return;
        const labels = m.labelIds || [];
        if (labels.includes("INBOX") && m.id) {
          idsSet.add(m.id);
        }
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  console.log("[mfs] [history] Delta INBOX:", {
    nuevosMensajes: idsSet.size,
    startHistoryId,
    notifHistoryId,
  });

  const newHistoryId = notifHistoryId || startHistoryId;
  return { ids: [...idsSet], newHistoryId, usedFallback: false };
}

/**
 * Configura el watch de Gmail
 */
export async function setupWatch(gmail) {
  // Gmail Watch requiere que el topic esté en el proyecto asociado a la cuenta de Gmail
  // Por defecto usa el mismo proyecto, pero puede configurarse con PUBSUB_PROJECT_ID
  const pubsubProjectId = CFG.PUBSUB_PROJECT_ID || CFG.PROJECT_ID;
  const topicName = `projects/${pubsubProjectId}/topics/${CFG.PUBSUB_TOPIC}`;
  
  console.log("[mfs] Configurando Gmail Watch con topic:", topicName);
  
  try {
    const watchResp = await backoff(
      () =>
        gmail.users.watch({
          userId: "me",
          requestBody: {
            topicName: topicName,
            labelIds: ["INBOX"],
            labelFilterAction: "include",
          },
        }),
      "users.watch"
    );
    
    return watchResp.data;
  } catch (error) {
    // Si el topic no existe en el proyecto requerido, loguear el error pero no fallar
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes("Invalid topicName") || errorMsg.includes("does not match")) {
      console.warn(
        `[mfs] No se pudo configurar Gmail Watch: el topic ${topicName} no existe o no está en el proyecto correcto.`,
        "El procesamiento seguirá funcionando vía Cloud Scheduler cada 10 minutos."
      );
      console.warn(
        `[mfs] Para habilitar procesamiento en tiempo real, crea el topic en el proyecto: ${pubsubProjectId}`
      );
      // Retornar null para indicar que el watch no se configuró, pero no fallar
      return { historyId: null, expiration: null };
    }
    // Para otros errores, relanzar
    throw error;
  }

  const hist = String(watchResp.data.historyId || "");
  if (hist) {
    await writeHistoryState(hist);
    console.log("[mfs] Watch configurado. historyId:", hist);
  } else {
    // Fallback: obtener del perfil
    const prof = await backoff(
      () => gmail.users.getProfile({ userId: "me" }),
      "users.getProfile"
    );
    const profHist = String(prof.data.historyId || "");
    if (profHist) {
      await writeHistoryState(profHist);
      console.log("[mfs] historyId tomado de getProfile:", profHist);
    }
  }

  return watchResp.data;
}


