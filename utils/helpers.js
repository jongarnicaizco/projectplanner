/**
 * Utilidades y funciones auxiliares
 */
import { htmlToText } from "html-to-text";

/**
 * Decodifica base64
 */
export function b64decode(b) {
  return Buffer.from(
    b.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
}

/**
 * Extrae el cuerpo del mensaje sin duplicados
 */
export function bodyFromMessage(msg) {
  const plainParts = [];
  const htmlParts = [];

  const walk = (p) => {
    if (!p) return;
    const mime = p.mimeType || "";
    
    if (mime === "text/plain" && p.body?.data) {
      plainParts.push(b64decode(p.body.data));
    } else if (mime === "text/html" && p.body?.data) {
      htmlParts.push(b64decode(p.body.data));
    }
    
    (p.parts || []).forEach(walk);
  };

  walk(msg.payload);

  if (plainParts.length) {
    const txt = plainParts.join("\n").trim();
    if (txt) return txt;
  }

  if (htmlParts.length) {
    const txt = htmlParts
      .map((html) => htmlToText(html, { wordwrap: false }))
      .join("\n")
      .trim();
    if (txt) return txt;
  }

  return msg.snippet || "";
}

/**
 * Backoff anti-429 con retry exponencial
 */
export async function backoff(fn, label = "call", max = 6) {
  let delay = 500; // ms

  for (let i = 0; i < max; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = String(e?.response?.status || e?.code || e?.status || "");
      if (code !== "429") throw e;

      const wait = delay + Math.floor(Math.random() * 250);
      console.warn(`[mfs] 429 ${label} → retry in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      delay = Math.min(delay * 2, 10000);
    }
  }
  throw new Error(`Too many 429 for ${label}`);
}

/**
 * Log de errores estructurado
 */
export function logErr(prefix, e) {
  try {
    const out = {
      name: e?.name,
      code: e?.response?.status || e?.code || e?.status,
      status: e?.response?.data?.error?.status,
      message: e?.response?.data?.error?.message || e?.message,
      data: e?.response?.data,
      stack: e?.stack,
    };
    console.error(prefix, JSON.stringify(out));
  } catch {
    console.error(prefix, e);
  }
}

/**
 * Normaliza el intent del modelo
 */
export function normalizeModelIntent(val) {
  if (!val) return null;
  const v = String(val).trim().toLowerCase();
  
  if (v.includes("very") && v.includes("high")) return "Very High";
  if (v.includes("high")) return "High";
  if (v.includes("medium")) return "Medium";
  if (v.includes("low")) return "Low";
  if (v.includes("discard") || v.includes("no lead") || v.includes("not a lead")) {
    return "Discard";
  }
  return null;
}

/**
 * Reasoning por defecto según intent
 */
export function defaultReasoningForIntent(intent) {
  switch (intent) {
    case "Very High":
      return "Lead clearly proposes a long-term or multi-market partnership with strong upside and explicit intent to work with us.";
    case "High":
      return "Lead proposes a concrete commercial partnership or sponsorship with clear buying intent, budget or strong scope signals.";
    case "Medium":
      return "Lead shows real interest in partnering or buying from us but lacks important details like budget, scope or timing.";
    case "Low":
      return "Email carries PR/news, free coverage, barter or pricing signals that are relevant but small or early-stage, so it is kept as a low-priority opportunity instead of being discarded.";
    case "Discard":
    default:
      return "Email does not represent PR/news, barter, pricing, free coverage or partnership intent towards us, so it is discarded.";
  }
}

/**
 * Verifica si un error es NOT_FOUND
 */
export function isNotFound(err) {
  const c = String(err?.code || err?.response?.status || err?.status || "");
  const s = String(err?.response?.data?.error?.status || "");
  return c === "404" || s === "NOT_FOUND";
}


