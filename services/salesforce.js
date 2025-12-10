/**
 * Servicio para crear leads en Salesforce
 */
import axios from "axios";
import { accessSecret } from "./secrets.js";

let salesforceAccessToken = null;
let salesforceInstanceUrl = null;
let tokenExpiryTime = null;

/**
 * Obtiene un access token de Salesforce usando OAuth2 Username-Password Flow
 */
async function getSalesforceAccessToken() {
  // Si tenemos un token válido, devolverlo
  if (salesforceAccessToken && salesforceInstanceUrl && tokenExpiryTime && Date.now() < tokenExpiryTime) {
    return { accessToken: salesforceAccessToken, instanceUrl: salesforceInstanceUrl };
  }

  try {
    const clientId = await accessSecret("SF_CLIENT_ID");
    const clientSecret = await accessSecret("SF_CLIENT_SECRET");
    const username = await accessSecret("SF_USERNAME");
    const password = await accessSecret("SF_PASSWORD");
    const securityToken = await accessSecret("SF_SECURITY_TOKEN");

    // URL de login de Salesforce (production o sandbox)
    const loginUrl = process.env.SF_LOGIN_URL || "https://login.salesforce.com";
    const tokenUrl = `${loginUrl}/services/oauth2/token`;

    // Username-Password OAuth Flow
    const params = new URLSearchParams({
      grant_type: "password",
      client_id: clientId,
      client_secret: clientSecret,
      username: username,
      password: password + securityToken, // Password + Security Token concatenados
    });

    const response = await axios.post(tokenUrl, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.data.access_token) {
      salesforceAccessToken = response.data.access_token;
      salesforceInstanceUrl = response.data.instance_url;
      // El token expira en response.data.expires_in segundos (típicamente 2 horas)
      // Guardamos con un margen de 5 minutos antes de la expiración
      const expiresIn = response.data.expires_in || 7200; // 2 horas por defecto
      tokenExpiryTime = Date.now() + (expiresIn - 300) * 1000; // 5 minutos antes
      
      console.log("[mfs] Salesforce: ✓ Access token obtenido exitosamente");
      return { accessToken: salesforceAccessToken, instanceUrl: salesforceInstanceUrl };
    }

    throw new Error("No se recibió access_token en la respuesta de Salesforce");
  } catch (error) {
    console.error("[mfs] Salesforce: ✗ Error obteniendo access token:", error?.response?.data || error?.message || error);
    throw error;
  }
}

/**
 * Crea un lead en Salesforce
 * @param {Object} leadData - Datos del lead
 * @returns {Object} - Lead creado con ID
 */
export async function createSalesforceLead({
  lastName,
  company,
  email,
  countryCode,
  city,
  cityId,
  subject,
  body,
  businessOppt,
  meddicAnalysis,
}) {
  try {
    // Verificar si la integración con Salesforce está activa
    const { readSalesforceStatus } = await import("./storage.js");
    const salesforceStatus = await readSalesforceStatus();
    console.log("[mfs] Salesforce: Estado de integración:", salesforceStatus.status);
    if (salesforceStatus.status === "stopped") {
      console.log("[mfs] Salesforce: Integración detenida, no se creará lead");
      return { id: null, skipped: true, reason: "salesforce_stopped" };
    }

    console.log("[mfs] Salesforce: Obteniendo access token...");
    const { accessToken, instanceUrl } = await getSalesforceAccessToken();
    console.log("[mfs] Salesforce: Access token obtenido, instanceUrl:", instanceUrl);

    // Normalizar businessOppt (trim y asegurar formato correcto)
    const normalizedBusinessOppt = businessOppt ? String(businessOppt).trim() : null;
    console.log("[mfs] Salesforce: DEBUG - businessOppt recibido:", businessOppt, "normalized:", normalizedBusinessOppt);

    // Mapeo de campos según especificación
    const leadFields = {
      LastName: lastName || "Unknown",
      Company: company || lastName || "Unknown",
      Status: "Qualified",
      OwnerId: "005Tt00000IQHXVIA5",
      Email: email || null,
      LeadSource: "Inbound - SMN",
      Type__c: "Marketplace - Media Fees",
      Country__c: countryCode || null,
      Description: subject ? `${subject}\n\n${body || ""}` : body || null,
      City__c: city || null,
      City_ID__c: cityId || null,
      Lead_AI_Scoring__c: normalizedBusinessOppt || null,
      MEDDIC_Analysis__c: meddicAnalysis || null,
      Inbound_ID__c: "ASMN", // Siempre "ASMN" para todos los leads
    };
    
    console.log("[mfs] Salesforce: DEBUG - leadFields antes de eliminar nulls:", JSON.stringify(leadFields, null, 2));

    // Eliminar campos null o undefined
    Object.keys(leadFields).forEach(key => {
      if (leadFields[key] === null || leadFields[key] === undefined) {
        delete leadFields[key];
      }
    });

    console.log("[mfs] Salesforce: DEBUG - leadFields después de eliminar nulls:", JSON.stringify(leadFields, null, 2));

    const apiUrl = `${instanceUrl}/services/data/v58.0/sobjects/Lead/`;
    console.log("[mfs] Salesforce: Enviando petición a:", apiUrl);

    const response = await axios.post(apiUrl, leadFields, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("[mfs] Salesforce: Respuesta de API:", JSON.stringify(response.data, null, 2));

    if (response.data.success && response.data.id) {
      console.log("[mfs] Salesforce: ✓ Lead creado exitosamente", {
        leadId: response.data.id,
        email: email,
        lastName: lastName,
      });
      return {
        id: response.data.id,
        success: true,
      };
    }

    console.error("[mfs] Salesforce: ✗ Lead no se creó correctamente - respuesta inesperada:", response.data);
    throw new Error("Lead no se creó correctamente en Salesforce - respuesta inesperada");
  } catch (error) {
    const errorData = error?.response?.data;
    const errorStatus = error?.response?.status;

    // Si el lead ya existe (duplicado por email), no es un error crítico
    if (errorStatus === 400 && errorData?.[0]?.errorCode === "DUPLICATES_DETECTED") {
      console.log("[mfs] Salesforce: Lead duplicado detectado (email ya existe), continuando normalmente", {
        email: email,
      });
      return { id: null, duplicate: true };
    }

    console.error("[mfs] Salesforce: ✗ ERROR creando lead", {
      errorMessage: error?.message,
      errorResponse: errorData,
      errorStatus: errorStatus,
      email: email,
    });

    // No lanzar error - continuar con el procesamiento aunque falle Salesforce
    return { id: null, error: error?.message || "Unknown error" };
  }
}

