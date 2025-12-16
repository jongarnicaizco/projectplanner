/**
 * Servicio de Secret Manager
 */
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { CFG } from "../config.js";

const secrets = new SecretManagerServiceClient();

/**
 * Accede a un secreto desde Secret Manager
 */
export async function accessSecret(name) {
  const [v] = await secrets.accessSecretVersion({
    name: `projects/${CFG.PROJECT_ID}/secrets/${name}/versions/latest`,
  });
  return v.payload.data.toString("utf8");
}


