/**
 * Script para obtener los IDs de los campos del nuevo Airtable
 */
import axios from "axios";
import { accessSecret } from "./services/secrets.js";

const AIRTABLE_BASE_ID = "appT0vQS4arJ3dQ6w";
const AIRTABLE_TABLE = "tblPIUeGJWqOtqage";

async function obtenerIdsCampos() {
  try {
    console.log("=== Obteniendo IDs de campos del nuevo Airtable ===");
    console.log(`Base ID: ${AIRTABLE_BASE_ID}`);
    console.log(`Table ID: ${AIRTABLE_TABLE}`);
    console.log("");

    // Obtener token
    const token = await accessSecret("AIRTABLE_API_KEY");
    console.log("✓ Token obtenido");
    console.log("");

    // Obtener metadatos de la tabla
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;
    console.log("Obteniendo metadatos...");

    const metaResponse = await axios.get(metaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const tables = metaResponse.data?.tables || [];
    const table = tables.find((t) => t.id === AIRTABLE_TABLE);

    if (!table) {
      console.error("✗ Tabla no encontrada!");
      console.error("Tablas disponibles:", tables.map(t => `${t.name} (${t.id})`).join(", "));
      return;
    }

    console.log(`✓ Tabla encontrada: ${table.name}`);
    console.log("");

    // Campos esperados
    const camposEsperados = [
      "Email ID",
      "From",
      "To",
      "CC",
      "Subject",
      "Body",
      "Business Oppt",
      "Body Summary",
    ];

    console.log("=== IDs de campos encontrados ===");
    const camposMap = {};
    
    table.fields.forEach((field) => {
      camposMap[field.name] = field.id;
      console.log(`  ${field.name}: ${field.id}`);
    });

    console.log("");
    console.log("=== Código para actualizar en config.js ===");
    console.log("export const FIDS = {");
    console.log(`  EMAIL_ID: "${camposMap["Email ID"] || "NO_ENCONTRADO"},`);
    console.log(`  FROM: "${camposMap["From"] || "NO_ENCONTRADO"},`);
    console.log(`  TO: "${camposMap["To"] || "NO_ENCONTRADO"},`);
    console.log(`  CC: "${camposMap["CC"] || "NO_ENCONTRADO"},`);
    console.log(`  SUBJECT: "${camposMap["Subject"] || "NO_ENCONTRADO"},`);
    console.log(`  BODY: "${camposMap["Body"] || "NO_ENCONTRADO"},`);
    console.log(`  BUSINESS_OPPT: "${camposMap["Business Oppt"] || "NO_ENCONTRADO"},`);
    console.log("};");

    if (camposMap["Body Summary"]) {
      console.log("");
      console.log("=== ID para actualizar en airtable.js (línea 220) ===");
      console.log(`const BODY_SUMMARY_FIELD_ID = "${camposMap["Body Summary"]}";`);
    }

    console.log("");
    console.log("=== Verificación de campos esperados ===");
    let todosEncontrados = true;
    camposEsperados.forEach((nombre) => {
      if (camposMap[nombre]) {
        console.log(`✓ ${nombre}`);
      } else {
        console.log(`✗ ${nombre}: NO ENCONTRADO`);
        todosEncontrados = false;
      }
    });

    if (todosEncontrados) {
      console.log("");
      console.log("✓ Todos los campos esperados están presentes");
    }

  } catch (error) {
    console.error("Error:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Response:", JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error("Stack:", error.stack);
    }
  }
}

obtenerIdsCampos();

