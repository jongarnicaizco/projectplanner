/**
 * Servicio para hacer commit y push automático de cambios
 * Solo se usa en desarrollo/testing, en producción se desactiva
 */
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

const REPO_ROOT = path.join(__dirname, "..");

/**
 * Hace commit y push de los cambios automáticamente
 */
export async function autoCommitAndPush(changes, reason) {
  // Solo en desarrollo/testing - en producción esto debería estar desactivado
  const AUTO_COMMIT_ENABLED = process.env.AUTO_COMMIT_ENABLED === "true";
  
  if (!AUTO_COMMIT_ENABLED) {
    console.log("[mfs] [git] Auto-commit deshabilitado (AUTO_COMMIT_ENABLED=false)");
    return {
      committed: false,
      reason: "Auto-commit disabled",
      note: "Set AUTO_COMMIT_ENABLED=true to enable automatic commits",
    };
  }

  try {
    // Cambiar al directorio del repo
    process.chdir(REPO_ROOT);

    // Verificar si hay cambios
    const { stdout: status } = await execAsync("git status --porcelain");
    if (!status.trim()) {
      return {
        committed: false,
        reason: "No changes to commit",
      };
    }

    // Agregar todos los cambios
    await execAsync("git add -A");

    // Crear mensaje de commit
    const commitMessage = `Auto-adjust: ${reason}\n\nChanges:\n${changes.map((c) => `- ${c.type}: ${c.file || c.note}`).join("\n")}`;

    // Commit
    await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);

    // Push
    await execAsync("git push");

    console.log("[mfs] [git] Cambios commiteados y pusheados automáticamente");

    return {
      committed: true,
      commitMessage,
    };
  } catch (error) {
    console.error("[mfs] [git] Error en auto-commit:", error);
    return {
      committed: false,
      error: error.message,
    };
  }
}




