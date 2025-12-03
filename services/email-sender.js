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

  oAuth2Client.setCredentials({
    refresh_token: OAUTH2_CREDENTIALS.refresh_token,
    access_token: OAUTH2_CREDENTIALS.access_token,
  });

  // Obtener un nuevo access token si es necesario
  try {
    const tokenResponse = await oAuth2Client.getAccessToken();
    if (tokenResponse.token) {
      oAuth2Client.setCredentials({
        access_token: tokenResponse.token,
        refresh_token: OAUTH2_CREDENTIALS.refresh_token,
      });
    }
  } catch (error) {
    console.error("[mfs] Error obteniendo access token:", error?.message);
    // Continuar de todas formas, puede que el token aún sea válido
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
    console.log("[mfs] Enviando email de prueba a jongarnicaizco@gmail.com...");
    
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

    // Codificar el mensaje en base64url
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Enviar el email
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log("[mfs] Email de prueba enviado exitosamente:", {
      messageId: response.data.id,
      to: to,
      subject: subject,
    });

    return {
      success: true,
      messageId: response.data.id,
    };
  } catch (error) {
    console.error("[mfs] Error enviando email de prueba:", {
      error: error?.message,
      code: error?.code,
      details: error?.response?.data,
    });
    
    return {
      success: false,
      error: error?.message || "Unknown error",
    };
  }
}

