/**
 * Servicio para leer precios de Google Sheets
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
    throw new Error("GOOGLE_SHEETS_CREDENTIALS must be valid JSON");
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    projectId: CFG.PROJECT_ID || "check-in-sf",
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

/**
 * Lee los datos de precios de la hoja _PRICES_RAW
 * Spreadsheet ID: 1rijN13pq1y75b33CVPPK4-ctTxf6FT-NonZU4M_Wfms
 */
export async function getPricingData() {
  const spreadsheetId = "1rijN13pq1y75b33CVPPK4-ctTxf6FT-NonZU4M_Wfms";
  const sheetName = "_PRICES_RAW";

  try {
    const sheets = await getSheetsClient();

    // Leer toda la hoja (asumiendo que tiene headers en la primera fila)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:G`, // Columnas A a G
    });

    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      return {
        cities: [],
        products: [],
        prices: {},
        cpmByCity: {},
      };
    }

    // Saltar la primera fila si es header
    const dataRows = rows.slice(1);
    
    const cities = new Set();
    const products = new Set();
    const prices = {}; // {city: {product: price}}
    const cpmByCity = {}; // {city: cpm}

    dataRows.forEach((row) => {
      const city = (row[1] || "").trim(); // Columna B (índice 1)
      const product = (row[3] || "").trim(); // Columna D (índice 3)
      // Buscar el precio en las columnas E, F o C (dependiendo de la estructura)
      const price = parseFloat(row[4] || row[5] || row[2] || 0);
      const cpm = parseFloat(row[6] || 0); // Columna G (índice 6)

      if (city) {
        cities.add(city);
        
        // CPM por ciudad (tomar el primero que encontremos o el último)
        if (cpm) {
          cpmByCity[city] = cpm;
        }

        if (product && price > 0) {
          if (!prices[city]) {
            prices[city] = {};
          }
          // Si hay múltiples precios para el mismo producto en la misma ciudad, tomar el último
          prices[city][product] = price;
          products.add(product);
        }
      }
    });

    return {
      cities: Array.from(cities).sort(),
      products: Array.from(products).sort(),
      prices,
      cpmByCity,
    };
  } catch (error) {
    console.error("[mfs] [pricing] Error leyendo precios:", error);
    throw error;
  }
}

/**
 * Obtiene el precio de un producto en una ciudad específica
 */
export async function getProductPrice(city, product) {
  const data = await getPricingData();
  return data.prices[city]?.[product] || 0;
}

/**
 * Obtiene el CPM para una ciudad
 */
export async function getCPMForCity(city) {
  const data = await getPricingData();
  return data.cpmByCity[city] || 0;
}

/**
 * Obtiene todas las ciudades únicas
 */
export async function getCities() {
  const data = await getPricingData();
  return data.cities;
}

/**
 * Obtiene todos los productos únicos
 */
export async function getProducts() {
  const data = await getPricingData();
  return data.products;
}

