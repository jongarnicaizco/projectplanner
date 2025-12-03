/**
 * Servicio para enviar emails de prueba usando Gmail API con OAuth2
 */
import { google } from "googleapis";

// Credenciales OAuth2 para secretmedia@feverup.com
const OAUTH2_CREDENTIALS = {
  client_id: "432377064948-lgt2cae0744lehvf9o2ejrdkd4rd3osu.apps.googleusercontent.com",
  client_secret: "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",
  refresh_token: "1//04MHr-4Z872t7CgYIARAAGAQSNwF-L9IrFU2uHdj8wGSaGCP1BT9HqHk4Vf7S8SYbCVQIpVPMkIeOab8oFc6r0gJWZ9sDJMSj_Jk",
  redirect_uri: "http://localhost:3000/oauth2callback",
  // Access token actual (se refrescará automáticamente cuando expire)
  access_token: "ya29.a0ATi6K2sswlPhTHpmUEAnf5OAwH0KWT4anefok2wTn4iazvnl4VvGghMPmTcxSQEFzIuO95ra44juImzSeUnnLzhtQT_rMQ4YqoPrcSvrizUG5dStrxvOBlItFU_n2tdvNIK5ryvGgpjJjuDT3TnJdEtWWcnBbsQwtgnkalLGVNLaduFASLj4jq9QzWs7IOiyJt7XoVcaCgYKAfESARESFQHGX2MiIj-osjTwVvuP94vdOfOCeQ0206",
};

/**
 * Crea un cliente de Gmail OAuth2 para secretmedia@feverup.com
 */
async function getEmailSenderClient() {
  const oAuth2Client = new google.auth.OAuth2(
    OAUTH2_CREDENTIALS.client_id,
    OAUTH2_CREDENTIALS.client_secret,
    OAUTH2_CREDENTIALS.redirect_uri
  );

  // Configurar credenciales iniciales
  oAuth2Client.setCredentials({
    refresh_token: OAUTH2_CREDENTIALS.refresh_token,
    access_token: OAUTH2_CREDENTIALS.access_token,
  });

  // Forzar la obtención de un nuevo access token (el token puede haber expirado)
  try {
    console.log("[mfs] Obteniendo access token para envío de email...");
    const tokenResponse = await oAuth2Client.getAccessToken();
    if (tokenResponse.token) {
      console.log("[mfs] Access token obtenido exitosamente");
      oAuth2Client.setCredentials({
        access_token: tokenResponse.token,
        refresh_token: OAUTH2_CREDENTIALS.refresh_token,
      });
    } else {
      console.warn("[mfs] No se obtuvo nuevo token, usando el existente");
    }
  } catch (error) {
    console.error("[mfs] Error obteniendo access token:", {
      message: error?.message,
      code: error?.code,
      details: error?.response?.data,
    });
    // Intentar usar el token existente de todas formas
    console.log("[mfs] Intentando usar access token existente...");
  }

  return google.gmail({ version: "v1", auth: oAuth2Client });
}

/**
 * Envía un email de prueba a jongarnicaizco@gmail.com
 * Por cada correo procesado, envía un email con el texto "test"
 * @param {string} subject - Asunto del email (opcional, por defecto "test")
 * @param {string} body - Cuerpo del email (opcional, por defecto "test")
 */
export async function sendTestEmail(subject = "test", body = "test") {
  try {
    console.log("[mfs] ===== INICIANDO ENVÍO DE EMAIL =====");
    console.log("[mfs] Destinatario: jongarnicaizco@gmail.com");
    console.log("[mfs] Remitente: secretmedia@feverup.com");
    console.log("[mfs] Asunto:", subject);
    console.log("[mfs] Cuerpo:", body);
    
    const gmail = await getEmailSenderClient();
    
    // Crear el mensaje en formato RFC 2822
    const to = "jongarnicaizco@gmail.com";
    const from = "secretmedia@feverup.com";
    
    const message = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      body,
    ].join("\n");

    console.log("[mfs] Mensaje creado, codificando en base64url...");

    // Codificar el mensaje en base64url
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    console.log("[mfs] Mensaje codificado, enviando a Gmail API...");

    // Enviar el email
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log("[mfs] ===== EMAIL ENVIADO EXITOSAMENTE =====");
    console.log("[mfs] Message ID:", response.data.id);
    console.log("[mfs] Thread ID:", response.data.threadId);
    console.log("[mfs] Destinatario:", to);
    console.log("[mfs] Asunto:", subject);

    return {
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    };
  } catch (error) {
    console.error("[mfs] ===== ERROR ENVIANDO EMAIL =====");
    console.error("[mfs] Error message:", error?.message);
    console.error("[mfs] Error code:", error?.code);
    console.error("[mfs] Error status:", error?.response?.status);
    console.error("[mfs] Error statusText:", error?.response?.statusText);
    console.error("[mfs] Error details:", JSON.stringify(error?.response?.data, null, 2));
    console.error("[mfs] Stack trace:", error?.stack);
    
    return {
      success: false,
      error: error?.message || "Unknown error",
      code: error?.code,
      status: error?.response?.status,
      details: error?.response?.data,
    };
  }
}

