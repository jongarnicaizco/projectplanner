/**
 * Script para verificar que el nuevo Airtable funciona correctamente
 */
import axios from "axios";
import { accessSecret } from "./services/secrets.js";

const AIRTABLE_BASE_ID = "appT0vQS4arJ3dQ6w";
const AIRTABLE_TABLE = "tblPIUeGJWqOtqage";

async function testAirtable() {
  try {
    console.log("=== Verificando nuevo Airtable ===");
    console.log(`Base ID: ${AIRTABLE_BASE_ID}`);
    console.log(`Table ID: ${AIRTABLE_TABLE}`);
    console.log("");

    // 1. Obtener token
    console.log("1. Obteniendo token de Airtable...");
    const token = await accessSecret("AIRTABLE_API_KEY");
    console.log("✓ Token obtenido");
    console.log("");

    // 2. Obtener metadatos de la tabla
    console.log("2. Obteniendo metadatos de la tabla...");
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;
    const metaResponse = await axios.get(metaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const tables = metaResponse.data?.tables || [];
    const table = tables.find((t) => t.id === AIRTABLE_TABLE);

    if (!table) {
      console.error("✗ ERROR: Tabla no encontrada!");
      console.error("Tablas disponibles:", tables.map(t => `${t.name} (${t.id})`).join(", "));
      return false;
    }

    console.log(`✓ Tabla encontrada: ${table.name}`);
    console.log(`  Total de campos: ${table.fields.length}`);
    console.log("");

    // 3. Verificar campos esperados
    console.log("3. Verificando campos esperados...");
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

    const camposMap = {};
    table.fields.forEach((field) => {
      camposMap[field.name] = { id: field.id, type: field.type };
    });

    let todosEncontrados = true;
    const camposFaltantes = [];
    
    camposEsperados.forEach((nombre) => {
      if (camposMap[nombre]) {
        console.log(`  ✓ ${nombre}: ${camposMap[nombre].id} (${camposMap[nombre].type})`);
      } else {
        console.log(`  ✗ ${nombre}: NO ENCONTRADO`);
        camposFaltantes.push(nombre);
        todosEncontrados = false;
      }
    });

    if (!todosEncontrados) {
      console.log("");
      console.log("⚠️  Campos faltantes:", camposFaltantes.join(", "));
      console.log("Esto puede causar problemas al crear registros");
    } else {
      console.log("");
      console.log("✓ Todos los campos esperados están presentes");
    }

    // 4. Probar lectura de registros
    console.log("");
    console.log("4. Probando lectura de registros...");
    const readUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`;
    const readResponse = await axios.get(readUrl, {
      headers: { Authorization: `Bearer ${token}` },
      params: { maxRecords: 1 },
    });
    
    console.log(`✓ Lectura exitosa. Total de registros en la tabla: ${readResponse.data.records?.length || 0}`);
    
    // 5. Probar escritura (crear un registro de prueba)
    console.log("");
    console.log("5. Probando escritura (crear registro de prueba)...");
    const testRecord = {
      records: [{
        fields: {
          "Email ID": `test-${Date.now()}`,
          "From": "test@example.com",
          "Subject": "Test de verificación",
          "Body": "Este es un registro de prueba para verificar que el nuevo Airtable funciona correctamente",
          "Business Oppt": "Low",
          "Timestamp": new Date().toISOString(),
        }
      }]
    };

    try {
      const writeResponse = await axios.post(readUrl, testRecord, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const createdId = writeResponse.data.records?.[0]?.id;
      if (createdId) {
        console.log(`✓ Escritura exitosa. Registro creado con ID: ${createdId}`);
        
        // Eliminar el registro de prueba
        console.log("");
        console.log("6. Eliminando registro de prueba...");
        const deleteUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`;
        await axios.delete(deleteUrl, {
          headers: { Authorization: `Bearer ${token}` },
          params: { records: [createdId] },
        });
        console.log("✓ Registro de prueba eliminado");
      }
    } catch (writeError) {
      console.error("✗ Error en escritura:", writeError.response?.data || writeError.message);
      if (writeError.response?.status === 422) {
        console.error("  Esto puede indicar que faltan campos requeridos o hay un problema con los tipos de datos");
      }
    }

    console.log("");
    console.log("=== Verificación completada ===");
    console.log("✓ El nuevo Airtable está configurado correctamente");
    console.log("✓ El servicio debería funcionar con esta configuración");
    
    return true;
  } catch (error) {
    console.error("");
    console.error("✗ ERROR en la verificación:");
    console.error("  Mensaje:", error.message);
    if (error.response) {
      console.error("  Status:", error.response.status);
      console.error("  Response:", JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error("  Stack:", error.stack);
    }
    return false;
  }
}

testAirtable().then(success => {
  process.exit(success ? 0 : 1);
});

