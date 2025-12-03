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
  readHistoryStateSender,
  writeHistoryStateSender,
} from "./storage.js";

/**
 * Crea y retorna el cliente de Gmail
 */
export async function getGmailClient() {
  console.log("[mfs] Creando cliente de Gmail con modo:", CFG.AUTH_MODE);

  if (CFG.AUTH_MODE === "oauth") {
    try {
      const clientId = await accessSecret("GMAIL_CLIENT_ID");
      const clientSecret = await accessSecret("GMAIL_CLIENT_SECRET");
      const refreshToken = await accessSecret("GMAIL_REFRESH_TOKEN");
      
      console.log("[mfs] OAuth secrets obtenidos:", {
        clientIdLength: clientId?.length || 0,
        clientSecretLength: clientSecret?.length || 0,
        refreshTokenLength: refreshToken?.length || 0,
        clientIdPrefix: clientId?.substring(0, 30) || "empty",
        clientIdSuffix: clientId?.substring(Math.max(0, clientId.length - 20)) || "empty",
      });
      
      // El redirect URI debe coincidir con el configurado en OAuth Client
      // NOTA: El OAuth Client está en check-in-sf
      // El redirect URI debe estar autorizado en el OAuth Client
      const redirectUri = process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/oauth2callback";
      console.log("[mfs] Usando redirect URI:", redirectUri);
      console.log("[mfs] NOTA: El OAuth Client debe estar en check-in-sf y tener este redirect URI autorizado");
      
      const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      oAuth2Client.setCredentials({ refresh_token: refreshToken });
      
      // Intentar refrescar el token para verificar que funciona
      try {
        const tokenResponse = await oAuth2Client.getAccessToken();
        console.log("[mfs] Token OAuth refrescado exitosamente");
        console.log("[mfs] Cliente Gmail OAuth listo y verificado");
        return google.gmail({ version: "v1", auth: oAuth2Client });
      } catch (oauthError) {
        const errorDetails = {
          message: oauthError?.message || "unknown",
          code: oauthError?.code || "unknown",
          error: oauthError?.response?.data?.error || oauthError?.data?.error || "unknown",
          errorDescription: oauthError?.response?.data?.error_description || oauthError?.data?.error_description || "unknown",
          status: oauthError?.response?.status || oauthError?.status || "unknown",
        };
        
        console.error("[mfs] Error verificando token OAuth:", JSON.stringify(errorDetails, null, 2));
        
        // Si es unauthorized_client, dar instrucciones específicas
        if (errorDetails.error === "unauthorized_client" || errorDetails.code === 401) {
          console.error("[mfs] ========================================");
          console.error("[mfs] ERROR: unauthorized_client");
          console.error("[mfs] Posibles causas:");
          console.error("[mfs] 1. El OAuth Client no está habilitado en Google Cloud Console");
          console.error("[mfs] 2. El redirect URI no está autorizado en el OAuth Client");
          console.error("[mfs] 3. El refresh token fue generado con un Client ID/Secret diferente");
          console.error("[mfs] 4. El refresh token ha expirado (regenerar con obtener_refresh_token_completo.js)");
          console.error("[mfs] ========================================");
        }
        
        console.error("[mfs] Intentando fallback a JWT...");
        // Continuar con JWT como fallback
      }
    } catch (secretError) {
      console.error("[mfs] Error obteniendo secrets de OAuth:", secretError?.message || secretError);
      console.error("[mfs] Intentando fallback a JWT...");
      // Continuar con JWT como fallback
    }
  }

  // Domain-wide delegation (JWT) - Fallback si OAuth falla
  console.log("[mfs] Usando autenticación JWT (Domain-wide delegation)");
  
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error(
      "No se puede autenticar: OAuth falló y JWT no está configurado. " +
      "Configura GOOGLE_CLIENT_EMAIL y GOOGLE_PRIVATE_KEY, o regenera el refresh token de OAuth."
    );
  }
  
  const jwt = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    [
      "https://www.googleapis.com/auth/gmail.modify"
      // gmail.modify permite leer, modificar (agregar/quitar labels) y enviar emails
    ],
    CFG.GMAIL_ADDRESS
  );
  
  try {
    await jwt.authorize();
    console.log("[mfs] Cliente Gmail JWT listo");
    return google.gmail({ version: "v1", auth: jwt });
  } catch (jwtError) {
    console.error("[mfs] Error con autenticación JWT:", jwtError?.message || jwtError);
    throw new Error(
      "No se puede autenticar con Gmail. " +
      "OAuth falló y JWT también falló. " +
      "Verifica las credenciales o regenera el refresh token de OAuth."
    );
  }
}

/**
 * Obtiene todos los mensajes nuevos en INBOX desde el último historyId
 * @param {Object} gmail - Cliente de Gmail
 * @param {string} notifHistoryId - HistoryId de la notificación de Pub/Sub
 * @param {boolean} useSenderState - Si es true, usa el estado de la cuenta SENDER
 */
export async function getNewInboxMessageIdsFromHistory(gmail, notifHistoryId, useSenderState = false) {
  let startHistoryId = useSenderState ? await readHistoryStateSender() : await readHistoryState();

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
        if (useSenderState) {
          await writeHistoryStateSender(String(profHist));
        } else {
          await writeHistoryState(String(profHist));
        }
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

  // Si la notificación trae historyId <= ya procesado, verificar si realmente no hay mensajes
  // o si el historyId está desincronizado (diferencia muy pequeña)
  if (notifHistoryId) {
    try {
      const last = BigInt(startHistoryId);
      const notif = BigInt(String(notifHistoryId));
      const diferencia = notif - last;
      
      console.log("[mfs] [history] Comparando historyId:", {
        startHistoryId: String(startHistoryId),
        notifHistoryId: String(notifHistoryId),
        diferencia: String(diferencia),
      });
      
      // Si la diferencia es muy pequeña (menos de 10), podría ser desincronización
      // En ese caso, hacer fallback para verificar si hay mensajes en INBOX
      if (diferencia <= 0) {
        console.log(
          "[mfs] [history] Notificación con historyId <= al ya procesado:",
          { startHistoryId, notifHistoryId, diferencia: String(diferencia) }
        );
        console.log("[mfs] [history] Aún así, haré fallback a INBOX para verificar si hay mensajes nuevos");
        // Hacer fallback inmediato si la diferencia es <= 0
        const list = await backoff(
          () =>
            gmail.users.messages.list({
              userId: "me",
              q: "in:inbox",
              maxResults: 50,
            }),
          "messages.list.fallback_negativo"
        );
        const fallbackIds = (list.data.messages || []).map((m) => m.id);
        console.log("[mfs] [history] Fallback (diferencia <= 0): mensajes encontrados en INBOX:", fallbackIds.length);
        
        if (fallbackIds.length > 0) {
          console.log("[mfs] [history] Usando mensajes de INBOX como fallback (historyId desincronizado)");
          const newHistoryId = notifHistoryId || startHistoryId;
          return { ids: fallbackIds, newHistoryId, usedFallback: true };
        }
        // Si no hay mensajes en el fallback, continuar con history.list por si acaso
      } else if (diferencia < 10n) {
        console.warn("[mfs] [history] Diferencia muy pequeña entre historyId. Podría haber desincronización. Continuando con consulta...");
      } else {
        console.log("[mfs] [history] Notificación tiene historyId mayor, hay mensajes nuevos potenciales");
      }
    } catch (e) {
      console.warn("[mfs] [history] Error comparando historyId con BigInt:", e);
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
    idsEncontrados: Array.from(idsSet).slice(0, 10),
  });
  
  // Si no encontramos mensajes en history.list, hacer fallback SIEMPRE para verificar
  // Esto es importante porque a veces history.list no detecta mensajes aunque existan
  if (idsSet.size === 0) {
    console.warn("[mfs] [history] No se encontraron mensajes en history.list. Haciendo fallback a INBOX para verificar...");
    try {
      const list = await backoff(
        () =>
          gmail.users.messages.list({
            userId: "me",
            q: "in:inbox",
            maxResults: 50,
          }),
        "messages.list.fallback_siempre"
      );
      const fallbackIds = (list.data.messages || []).map((m) => m.id);
      console.log("[mfs] [history] Fallback (sin mensajes en history): mensajes encontrados en INBOX:", fallbackIds.length);
      
      if (fallbackIds.length > 0) {
        console.warn("[mfs] [history] ADVERTENCIA: Desincronización detectada. Usando mensajes de INBOX como fallback.");
        const newHistoryId = notifHistoryId || startHistoryId;
        return { ids: fallbackIds, newHistoryId, usedFallback: true };
      } else {
        console.log("[mfs] [history] No hay mensajes nuevos en INBOX. Todo está sincronizado.");
      }
    } catch (e) {
      console.warn("[mfs] [history] Error en fallback automático:", e?.message);
    }
  }

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
}

/**
 * Configura el watch de Gmail para la cuenta SENDER (secretmedia@feverup.com)
 */
export async function setupWatchSender(gmailSender) {
  // Gmail Watch requiere que el topic esté en el proyecto asociado a la cuenta de Gmail
  // Para la cuenta SENDER, usamos check-in-sf
  const pubsubProjectId = CFG.PROJECT_ID; // check-in-sf
  const topicName = `projects/${pubsubProjectId}/topics/${CFG.PUBSUB_TOPIC_SENDER}`;
  
  console.log("[mfs] Configurando Gmail Watch SENDER con topic:", topicName);
  
  try {
    const watchResp = await backoff(
      () =>
        gmailSender.users.watch({
          userId: "me",
          requestBody: {
            topicName: topicName,
            labelIds: ["INBOX"],
            labelFilterAction: "include",
          },
        }),
      "users.watch.sender"
    );
    
    const hist = String(watchResp.data.historyId || "");
    if (hist) {
      await writeHistoryStateSender(hist);
      console.log("[mfs] Watch SENDER configurado. historyId:", hist);
    } else {
      // Fallback: obtener del perfil
      const prof = await backoff(
        () => gmailSender.users.getProfile({ userId: "me" }),
        "users.getProfile.sender"
      );
      const profHist = String(prof.data.historyId || "");
      if (profHist) {
        await writeHistoryStateSender(profHist);
        console.log("[mfs] historyId SENDER tomado de getProfile:", profHist);
      }
    }

    return watchResp.data;
  } catch (error) {
    // Si el topic no existe en el proyecto requerido, loguear el error pero no fallar
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes("Invalid topicName") || errorMsg.includes("does not match")) {
      console.warn(
        `[mfs] No se pudo configurar Gmail Watch SENDER: el topic ${topicName} no existe o no está en el proyecto correcto.`,
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
}

/**
 * Crea y retorna el cliente de Gmail usando los secrets de SENDER (para secretmedia@feverup.com)
 */
export async function getGmailSenderClient() {
  console.log("[mfs] ===== INICIANDO CREACIÓN DE CLIENTE GMAIL SENDER =====");
  console.log("[mfs] Creando cliente de Gmail SENDER con modo OAuth");
  
  try {
    console.log("[mfs] Obteniendo secrets de OAuth SENDER desde Secret Manager...");
    const clientId = await accessSecret("GMAIL_CLIENT_ID_SENDER");
    const clientSecret = await accessSecret("GMAIL_CLIENT_SECRET_SENDER");
    const refreshToken = await accessSecret("GMAIL_REFRESH_TOKEN_SENDER");
    
    console.log("[mfs] Secrets obtenidos:", {
      clientIdExists: !!clientId,
      clientSecretExists: !!clientSecret,
      refreshTokenExists: !!refreshToken,
      clientIdLength: clientId?.length || 0,
      clientSecretLength: clientSecret?.length || 0,
      refreshTokenLength: refreshToken?.length || 0,
    });
    
    if (!clientId || !clientSecret || !refreshToken) {
      const missing = [];
      if (!clientId) missing.push("GMAIL_CLIENT_ID_SENDER");
      if (!clientSecret) missing.push("GMAIL_CLIENT_SECRET_SENDER");
      if (!refreshToken) missing.push("GMAIL_REFRESH_TOKEN_SENDER");
      throw new Error(`Faltan credenciales OAuth SENDER en Secret Manager: ${missing.join(", ")}`);
    }
    
    console.log("[mfs] ✓ Todos los secrets OAuth SENDER obtenidos correctamente");
    
    const redirectUri = process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/oauth2callback";
    console.log("[mfs] Usando redirect URI:", redirectUri);
    
    console.log("[mfs] Creando cliente OAuth2...");
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    
    // Intentar refrescar el token para verificar que funciona
    console.log("[mfs] Verificando y refrescando access token...");
    try {
      const tokenResponse = await oAuth2Client.getAccessToken();
      console.log("[mfs] ✓ Token OAuth SENDER refrescado exitosamente");
      console.log("[mfs] ✓ Cliente Gmail OAuth SENDER listo y verificado");
      console.log("[mfs] ===== CLIENTE GMAIL SENDER CREADO EXITOSAMENTE =====");
      return google.gmail({ version: "v1", auth: oAuth2Client });
    } catch (oauthError) {
      const errorDetails = {
        message: oauthError?.message || "unknown",
        code: oauthError?.code || "unknown",
        error: oauthError?.response?.data?.error || oauthError?.data?.error || "unknown",
        errorDescription: oauthError?.response?.data?.error_description || oauthError?.data?.error_description || "unknown",
        status: oauthError?.response?.status || oauthError?.status || "unknown",
      };
      
      console.error("[mfs] ✗✗✗ ERROR verificando token OAuth SENDER ✗✗✗");
      console.error("[mfs] Error details:", JSON.stringify(errorDetails, null, 2));
      throw new Error(`Error de autenticación OAuth SENDER: ${errorDetails.error} - ${errorDetails.errorDescription}`);
    }
  } catch (secretError) {
    console.error("[mfs] ✗✗✗ ERROR obteniendo secrets de OAuth SENDER ✗✗✗");
    console.error("[mfs] Error message:", secretError?.message || secretError);
    console.error("[mfs] Error stack:", secretError?.stack);
    throw new Error(`No se pudieron obtener las credenciales OAuth SENDER: ${secretError?.message || secretError}`);
  }
}


