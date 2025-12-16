/**
 * Script para verificar que el nuevo Airtable funciona correctamente
 * y obtener los IDs de los campos
 */
import { accessSecret } from "./services/secrets.js";

const AIRTABLE_BASE_ID = "appT0vQS4arJ3dQ6w";
const AIRTABLE_TABLE = "tblPIUeGJWqOtqage";

async function verificarAirtable() {
  try {
    console.log("=== Verificando nuevo Airtable ===");
    console.log(`Base ID: ${AIRTABLE_BASE_ID}`);
    console.log(`Table ID: ${AIRTABLE_TABLE}`);
    console.log("");

    // Obtener token
    const token = await accessSecret("AIRTABLE_API_KEY");
    console.log("✓ Token obtenido");

    // Obtener metadatos de la tabla
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;
    const axios = (await import("axios")).default;

    console.log("Obteniendo metadatos de la tabla...");
    const metaResponse = await axios.get(metaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const tables = metaResponse.data?.tables || [];
    const table = tables.find((t) => t.id === AIRTABLE_TABLE);

    if (!table) {
      console.error("✗ Tabla no encontrada!");
      return;
    }

    console.log(`✓ Tabla encontrada: ${table.name}`);
    console.log("");

    // Mostrar todos los campos con sus IDs
    console.log("=== Campos de la tabla ===");
    const camposEsperados = [
      "Email ID",
      "From",
      "To",
      "CC",
      "Subject",
      "Body",
      "Business Oppt",
      "Body Summary",
      "Timestamp",
      "Classification Scoring",
      "Classification Reasoning",
      "MEDDIC Analysis",
      "Free Coverage Request",
      "Barter Request",
      "Media Kits/Pricing Request",
    ];

    const camposEncontrados = {};
    const camposFaltantes = [];

    table.fields.forEach((field) => {
      console.log(`  ${field.name}: ${field.id} (${field.type})`);
      camposEncontrados[field.name] = field.id;
    });

    console.log("");
    console.log("=== Verificación de campos esperados ===");
    camposEsperados.forEach((nombre) => {
      if (camposEncontrados[nombre]) {
        console.log(`✓ ${nombre}: ${camposEncontrados[nombre]}`);
      } else {
        console.log(`✗ ${nombre}: NO ENCONTRADO`);
        camposFaltantes.push(nombre);
      }
    });

    if (camposFaltantes.length > 0) {
      console.log("");
      console.log("⚠️  Campos faltantes:", camposFaltantes.join(", "));
    } else {
      console.log("");
      console.log("✓ Todos los campos esperados están presentes");
    }

    // Mostrar los IDs que deberían actualizarse en FIDS
    console.log("");
    console.log("=== IDs para actualizar en config.js (FIDS) ===");
    console.log("export const FIDS = {");
    console.log(`  EMAIL_ID: "${camposEncontrados["Email ID"] || "NO ENCONTRADO"}",`);
    console.log(`  FROM: "${camposEncontrados["From"] || "NO ENCONTRADO"}",`);
    console.log(`  TO: "${camposEncontrados["To"] || "NO ENCONTRADO"}",`);
    console.log(`  CC: "${camposEncontrados["CC"] || "NO ENCONTRADO"}",`);
    console.log(`  SUBJECT: "${camposEncontrados["Subject"] || "NO ENCONTRADO"}",`);
    console.log(`  BODY: "${camposEncontrados["Body"] || "NO ENCONTRADO"}",`);
    console.log(`  BUSINESS_OPPT: "${camposEncontrados["Business Oppt"] || "NO ENCONTRADO"}",`);
    console.log("};");

    // Verificar Body Summary
    const bodySummaryId = camposEncontrados["Body Summary"];
    if (bodySummaryId) {
      console.log("");
      console.log("=== Body Summary Field ID ===");
      console.log(`Body Summary ID: ${bodySummaryId}`);
      console.log("(Este ID también se usa en airtable.js línea 220)");
    }

    console.log("");
    console.log("=== Verificación completada ===");
  } catch (error) {
    console.error("Error verificando Airtable:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

verificarAirtable();

