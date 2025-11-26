/**
 * Servicio para escribir métricas a Google Sheets
 */
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { accessSecret } from "./secrets.js";
import { CFG } from "../config.js";

let sheetsClient = null;

/**
 * Obtiene el cliente de Google Sheets
 */
async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const credentialsStr = await accessSecret("GOOGLE_SHEETS_CREDENTIALS");
  if (!credentialsStr) {
    throw new Error("GOOGLE_SHEETS_CREDENTIALS not found in Secret Manager");
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsStr);
  } catch {
    // Si no es JSON, puede ser que esté en otro formato
    throw new Error("GOOGLE_SHEETS_CREDENTIALS must be valid JSON");
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "check-in-sf",
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

/**
 * Escribe métricas diarias a Google Sheets
 */
export async function writeDailyMetrics({
  date,
  totalLeads,
  discarded,
  veryHigh,
  high,
  medium,
  low,
  pricingRequests,
  prInvitations,
  barterRequests,
  freeCoverageRequests,
  avgConfidence,
  corrections = [], // Array de {emailId, originalIntent, correctedIntent, reason}
}) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || "Daily Metrics";

  if (!spreadsheetId) {
    console.warn("[mfs] [sheets] GOOGLE_SHEETS_SPREADSHEET_ID not configured, skipping metrics write");
    return;
  }

  try {
    const sheets = await getSheetsClient();

    // Verificar si la hoja existe, si no crearla
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1`,
      });
    } catch {
      // Crear la hoja si no existe
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });

      // Escribir headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:N1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [
            [
              "Date",
              "Total Leads",
              "Discarded",
              "Very High",
              "High",
              "Medium",
              "Low",
              "Pricing Requests",
              "PR Invitations",
              "Barter Requests",
              "Free Coverage",
              "Avg Confidence",
              "Corrections Count",
              "Corrections Details",
            ],
          ],
        },
      });
    }

    // Preparar fila de datos
    const correctionsDetails = corrections
      .map((c) => `${c.emailId}: ${c.originalIntent}→${c.correctedIntent} (${c.reason})`)
      .join("; ");

    const row = [
      date || new Date().toISOString().split("T")[0],
      totalLeads || 0,
      discarded || 0,
      veryHigh || 0,
      high || 0,
      medium || 0,
      low || 0,
      pricingRequests || 0,
      prInvitations || 0,
      barterRequests || 0,
      freeCoverageRequests || 0,
      avgConfidence ? avgConfidence.toFixed(2) : "0.00",
      corrections.length,
      correctionsDetails || "",
    ];

    // Añadir fila al final
    await sheets.spreadsheets.values.append({
      spreadsheetId,
        range: `${sheetName}!A:N`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row],
      },
    });

    console.log("[mfs] [sheets] Métricas diarias escritas:", {
      date,
      totalLeads,
      discarded,
    });
  } catch (error) {
    console.error("[mfs] [sheets] Error escribiendo métricas:", error);
    throw error;
  }
}

/**
 * Lee métricas históricas de Google Sheets
 */
export async function readHistoricalMetrics(days = 30) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || "Daily Metrics";

  if (!spreadsheetId) {
    return [];
  }

  try {
    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A2:N`, // Skip header
    });

    const rows = response.data.values || [];
    
    // Parsear datos
    const metrics = rows.map((row) => ({
      date: row[0],
      totalLeads: parseInt(row[1]) || 0,
      discarded: parseInt(row[2]) || 0,
      veryHigh: parseInt(row[3]) || 0,
      high: parseInt(row[4]) || 0,
      medium: parseInt(row[5]) || 0,
      low: parseInt(row[6]) || 0,
      pricingRequests: parseInt(row[7]) || 0,
      prInvitations: parseInt(row[8]) || 0,
      barterRequests: parseInt(row[9]) || 0,
      freeCoverageRequests: parseInt(row[10]) || 0,
      avgConfidence: parseFloat(row[11]) || 0,
      correctionsCount: parseInt(row[12]) || 0,
      correctionsDetails: row[13] || "",
    }));

    // Filtrar últimos N días
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return metrics.filter((m) => {
      const metricDate = new Date(m.date);
      return metricDate >= cutoffDate;
    });
  } catch (error) {
    console.error("[mfs] [sheets] Error leyendo métricas:", error);
    return [];
  }
}

/**
 * Lee todas las correcciones del Sheet de correcciones
 * Retorna las correcciones con su índice de fila (para poder eliminarlas después)
 */
export async function readCorrectionsFromSheet() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_CORRECTIONS_SHEET || "Corrections";

  if (!spreadsheetId) {
    console.warn("[mfs] [sheets] GOOGLE_SHEETS_SPREADSHEET_ID not configured");
    return [];
  }

  try {
    const sheets = await getSheetsClient();

    // Primero obtener el ID de la hoja
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets.find((s) => s.properties.title === sheetName);
    if (!sheet) {
      console.warn(`[mfs] [sheets] Hoja "${sheetName}" no encontrada`);
      return [];
    }

    const sheetId = sheet.properties.sheetId;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A2:G`, // Skip header
    });

    const rows = response.data.values || [];
    
    // Parsear datos con índice de fila (empezando desde 2 porque la fila 1 es el header)
    const corrections = rows
      .map((row, index) => ({
        rowIndex: index + 2, // +2 porque empezamos desde la fila 2 (después del header)
        sheetId,
        date: row[0] || "",
        emailId: row[1] || "",
        from: row[2] || "",
        subject: row[3] || "",
        originalIntent: row[4] || "",
        correctedIntent: row[5] || "",
        reason: row[6] || "",
      }))
      .filter((c) => c.emailId && c.originalIntent && c.correctedIntent); // Filtrar filas incompletas

    console.log(`[mfs] [sheets] Leídas ${corrections.length} correcciones del Sheet`);
    return corrections;
  } catch (error) {
    console.error("[mfs] [sheets] Error leyendo correcciones:", error);
    return [];
  }
}

/**
 * Elimina una fila del Sheet de correcciones
 */
export async function deleteCorrectionRow(rowIndex, sheetId) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_CORRECTIONS_SHEET || "Corrections";

  if (!spreadsheetId) {
    console.warn("[mfs] [sheets] GOOGLE_SHEETS_SPREADSHEET_ID not configured");
    return false;
  }

  try {
    const sheets = await getSheetsClient();

    // Eliminar la fila usando batchUpdate
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex: rowIndex - 1, // Google Sheets usa índice base 0
                endIndex: rowIndex, // Eliminar solo una fila
              },
            },
          },
        ],
      },
    });

    console.log(`[mfs] [sheets] Fila ${rowIndex} eliminada del Sheet`);
    return true;
  } catch (error) {
    console.error(`[mfs] [sheets] Error eliminando fila ${rowIndex}:`, error);
    return false;
  }
}

/**
 * Elimina múltiples filas del Sheet de correcciones
 */
export async function deleteCorrectionRows(corrections) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_CORRECTIONS_SHEET || "Corrections";

  if (!spreadsheetId || corrections.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  try {
    const sheets = await getSheetsClient();

    // Agrupar por sheetId y ordenar por rowIndex descendente (para eliminar de abajo hacia arriba)
    const bySheetId = {};
    corrections.forEach((c) => {
      if (!bySheetId[c.sheetId]) {
        bySheetId[c.sheetId] = [];
      }
      bySheetId[c.sheetId].push(c.rowIndex);
    });

    // Crear requests de eliminación (ordenar descendente para no afectar índices)
    const requests = [];
    Object.keys(bySheetId).forEach((sheetId) => {
      const rowIndices = [...new Set(bySheetId[sheetId])].sort((a, b) => b - a); // Ordenar descendente
      
      rowIndices.forEach((rowIndex) => {
        requests.push({
          deleteDimension: {
            range: {
              sheetId: parseInt(sheetId),
              dimension: "ROWS",
              startIndex: rowIndex - 1, // Google Sheets usa índice base 0
              endIndex: rowIndex,
            },
          },
        });
      });
    });

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });

      console.log(`[mfs] [sheets] ${requests.length} filas eliminadas del Sheet`);
      return { deleted: requests.length, failed: 0 };
    }

    return { deleted: 0, failed: 0 };
  } catch (error) {
    console.error("[mfs] [sheets] Error eliminando filas:", error);
    return { deleted: 0, failed: corrections.length };
  }
}

/**
 * Escribe correcciones manuales a una hoja separada
 */
export async function writeCorrection({
  emailId,
  originalIntent,
  correctedIntent,
  reason,
  emailSubject,
  emailFrom,
}) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_CORRECTIONS_SHEET || "Corrections";

  if (!spreadsheetId) {
    return;
  }

  try {
    const sheets = await getSheetsClient();

    // Verificar si la hoja existe
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1`,
      });
    } catch {
      // Crear la hoja si no existe
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });

      // Escribir headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:G1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [
            [
              "Date",
              "Email ID",
              "From",
              "Subject",
              "Original Intent",
              "Corrected Intent",
              "Reason",
            ],
          ],
        },
      });
    }

    // Añadir corrección
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:G`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            new Date().toISOString(),
            emailId,
            emailFrom,
            emailSubject,
            originalIntent,
            correctedIntent,
            reason,
          ],
        ],
      },
    });

    console.log("[mfs] [sheets] Corrección escrita:", {
      emailId,
      originalIntent,
      correctedIntent,
    });
  } catch (error) {
    console.error("[mfs] [sheets] Error escribiendo corrección:", error);
  }
}

