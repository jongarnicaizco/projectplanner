/**
 * Utilidades y funciones auxiliares
 */
import { htmlToText } from "html-to-text";
import { CFG } from "../config.js";

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

/**
 * Extrae el email limpio de un header (From/To)
 * Formato esperado: "Name <email@domain.com>" o "email@domain.com" o múltiples emails separados por comas
 */
export function extractCleanEmail(headerValue) {
  if (!headerValue) return "";
  
  // Limpiar el valor primero
  const cleaned = String(headerValue).trim();
  if (!cleaned) return "";
  
  // Si contiene < >, extraer TODOS los emails de dentro
  const bracketMatches = cleaned.matchAll(/<([^>]+)>/g);
  const emailsFromBrackets = [];
  for (const match of bracketMatches) {
    const email = match[1].trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailsFromBrackets.push(email);
    }
  }
  
  // Si encontramos emails en brackets, usar el primero (o el único)
  if (emailsFromBrackets.length > 0) {
    return emailsFromBrackets[0];
  }
  
  // Si no tiene < >, buscar patrón de email directamente
  // Buscar el primer email válido en el string
  const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const emailMatches = cleaned.matchAll(emailPattern);
  
  for (const match of emailMatches) {
    const email = match[1].trim().toLowerCase();
    // Validar que es un email válido
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return email;
    }
  }
  
  // Si no encontramos un email válido, intentar limpiar y usar el valor completo
  // pero solo si parece un email
  const trimmed = cleaned.toLowerCase().trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return trimmed;
  }
  
  // Si nada funciona, retornar vacío
  return "";
}

/**
 * Extrae el email "From" correcto (debe ser DISTINTO a secretmedianetwork.com o feverup.com)
 * Si el From tiene uno de esos dominios, busca en Reply-To, CC, BCC para encontrar el email real del remitente
 */
export function extractFromEmail(fromHeader, ccHeader, bccHeader, replyToHeader) {
  const INVALID_DOMAINS = ["secretmedianetwork.com", "feverup.com"];
  
  // Función helper para extraer todos los emails de un header
  const extractAllEmails = (headerValue) => {
    if (!headerValue) return [];
    // Primero intentar extraer emails de brackets <email@domain.com>
    const bracketMatches = Array.from(headerValue.matchAll(/<([^>]+)>/g));
    if (bracketMatches.length > 0) {
      const emails = bracketMatches.map(m => {
        const email = m[1].trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return email;
        }
        return null;
      }).filter(e => e !== null);
      if (emails.length > 0) return emails;
    }
    // Si no hay brackets, buscar emails directamente
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    const matches = Array.from(headerValue.matchAll(emailPattern));
    return matches.map(m => m[1].trim().toLowerCase()).filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  };
  
  // Función helper para verificar si un email tiene un dominio inválido (nuestros dominios)
  const hasInvalidDomain = (email) => {
    if (!email) return false;
    const domain = email.split("@")[1];
    const isInvalid = domain && INVALID_DOMAINS.includes(domain);
    if (isInvalid) {
    }
    return isInvalid;
  };
  
  // Función helper para encontrar el primer email válido (sin dominio inválido) en una lista
  const findValidEmail = (emails) => {
    for (const email of emails) {
      if (!hasInvalidDomain(email)) {
        return email;
      }
    }
    return null;
  };
  
  // 1. Verificar el From original
  const fromEmail = extractCleanEmail(fromHeader);
  
  // Si el From tiene dominio inválido, buscar en Reply-To PRIMERO (antes de verificar si el From es válido)
  // Esto es importante porque si el From tiene dominio inválido, el Reply-To probablemente tiene el email real
  if (fromEmail && hasInvalidDomain(fromEmail)) {
    if (replyToHeader && replyToHeader.trim()) {
      const replyToEmails = extractAllEmails(replyToHeader);
      if (replyToEmails.length === 0) {
        // Intentar usar extractCleanEmail como fallback
        const fallbackEmail = extractCleanEmail(replyToHeader);
        if (fallbackEmail && !hasInvalidDomain(fallbackEmail)) {
          return fallbackEmail;
        }
      } else {
        const validReplyTo = findValidEmail(replyToEmails);
        if (validReplyTo) {
          return validReplyTo;
        }
      }
    }
  }
  
  // 2. Si el From no tiene dominio inválido, usarlo directamente
  if (fromEmail && !hasInvalidDomain(fromEmail)) {
    return fromEmail;
  }
  
  // 3. Si el From tiene dominio inválido y no encontramos Reply-To válido, buscar en CC
  if (ccHeader) {
    const ccEmails = extractAllEmails(ccHeader);
    const validCC = findValidEmail(ccEmails);
    if (validCC) {
      return validCC;
    }
  }
  
  // 4. Buscar en BCC
  if (bccHeader) {
    const bccEmails = extractAllEmails(bccHeader);
    const validBCC = findValidEmail(bccEmails);
    if (validBCC) {
      return validBCC;
    }
  }
  
  // 5. Si no encontramos nada válido, usar el From por defecto (aunque tenga dominio inválido)
  if (fromEmail) {
    console.warn("[mfs] No se encontró email 'From' válido en otros campos, usando From por defecto:", fromEmail);
    return fromEmail;
  }
  
  // 6. Si no hay nada, retornar vacío
  console.warn("[mfs] No se pudo extraer email 'From' de ningún header");
  return "";
}

/**
 * Extrae el email "To" correcto (debe ser secretmedianetwork.com o feverup.com)
 * Si el To no tiene uno de esos dominios, busca en CC, BCC, Reply-To para encontrar el email con esos dominios
 */
export function extractToEmail(toHeader, ccHeader, bccHeader, replyToHeader, mailingListEmail = "") {
  const VALID_DOMAINS = ["secretmedianetwork.com", "feverup.com", "secretldn.com"];
  
  // Función helper para extraer todos los emails de un header
  const extractAllEmails = (headerValue) => {
    if (!headerValue) return [];
    // Primero intentar extraer emails de brackets <email@domain.com>
    const bracketMatches = Array.from(headerValue.matchAll(/<([^>]+)>/g));
    if (bracketMatches.length > 0) {
      const emails = bracketMatches.map(m => {
        const email = m[1].trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return email;
        }
        return null;
      }).filter(e => e !== null);
      if (emails.length > 0) return emails;
    }
    // Si no hay brackets, buscar emails directamente
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    const matches = Array.from(headerValue.matchAll(emailPattern));
    return matches.map(m => m[1].trim().toLowerCase()).filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  };
  
  // Función helper para verificar si un email tiene un dominio válido (nuestros dominios)
  const hasValidDomain = (email) => {
    if (!email) return false;
    const domain = email.split("@")[1];
    return domain && VALID_DOMAINS.includes(domain);
  };
  
  // Función helper para encontrar el primer email válido (con dominio válido) en una lista
  const findValidEmail = (emails) => {
    for (const email of emails) {
      if (hasValidDomain(email)) {
        return email;
      }
    }
    return null;
  };
  
  // 0. Si hay un email de mailing list, usarlo primero (prioridad más alta)
  if (mailingListEmail && hasValidDomain(mailingListEmail)) {
    return mailingListEmail;
  }
  
  // 1. Verificar el To original
  const toEmail = extractCleanEmail(toHeader);
  
  // Si el To tiene un email válido con dominio válido, usarlo
  if (toEmail && hasValidDomain(toEmail)) {
    return toEmail;
  }
  
  // IMPORTANTE: Si el To tiene un email válido pero NO tiene dominio válido, buscar en otros campos
  // PRIORIDAD: Mailing List > BCC > CC > Reply-To > To original
  if (toEmail && toEmail.trim() !== "" && !hasValidDomain(toEmail)) {
    // PRIORIDAD 1: Buscar en mailing list si tiene dominio válido
    if (mailingListEmail && hasValidDomain(mailingListEmail)) {
      return mailingListEmail;
    }
    
    // PRIORIDAD 2: Buscar en BCC (antes que CC)
    if (bccHeader) {
      const bccEmails = extractAllEmails(bccHeader);
      const validBCC = findValidEmail(bccEmails);
      if (validBCC) {
        return validBCC;
      }
    }
    
    // PRIORIDAD 3: Buscar en CC
    if (ccHeader) {
      const ccEmails = extractAllEmails(ccHeader);
      const validCC = findValidEmail(ccEmails);
      if (validCC) {
        return validCC;
      }
    }
    
    // PRIORIDAD 4: Buscar en Reply-To
    if (replyToHeader) {
      const replyToEmails = extractAllEmails(replyToHeader);
      const validReplyTo = findValidEmail(replyToEmails);
      if (validReplyTo) {
        return validReplyTo;
      }
    }
    
    // PRIORIDAD 5: Si no encontramos nada válido, usar el To por defecto (aunque no tenga dominio válido)
    return toEmail;
  }
  
  // Si el To está vacío, buscar en otros campos (prioridad: BCC > CC > Reply-To)
  if (!toEmail || toEmail.trim() === "") {
    // PRIORIDAD 1: Buscar en BCC primero cuando To está vacío
    if (bccHeader) {
      const bccEmails = extractAllEmails(bccHeader);
      const validBCC = findValidEmail(bccEmails);
      if (validBCC) {
        return validBCC;
      }
    }
    
    // PRIORIDAD 2: Buscar en CC
    if (ccHeader) {
      const ccEmails = extractAllEmails(ccHeader);
      const validCC = findValidEmail(ccEmails);
      if (validCC) {
        return validCC;
      }
    }
    
    // PRIORIDAD 3: Buscar en Reply-To
    if (replyToHeader) {
      const replyToEmails = extractAllEmails(replyToHeader);
      const validReplyTo = findValidEmail(replyToEmails);
      if (validReplyTo) {
        return validReplyTo;
      }
    }
    
    // Si To estaba vacío y no encontramos nada, retornar vacío
    return "";
  }
  
  // Si llegamos aquí, retornar vacío
  return "";
}

/**
 * Limpia un nombre de caracteres no deseados, comillas, espacios extra, etc.
 * Versión mejorada para Client Name: solo permite letras, números, espacios y algunos caracteres especiales básicos
 */
function cleanName(name) {
  if (!name) return "";
  
  // Eliminar comillas simples y dobles al inicio y final
  let cleaned = name.replace(/^["'`]+|["'`]+$/g, "");
  
  // Eliminar paréntesis y su contenido (ej: "John (CEO)" -> "John")
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, "");
  
  // Eliminar corchetes y su contenido
  cleaned = cleaned.replace(/\s*\[[^\]]*\]/g, "");
  
  // Eliminar caracteres especiales comunes que no deberían estar en nombres
  cleaned = cleaned.replace(/[<>{}|\\]/g, "");
  
  // Eliminar múltiples espacios y espacios al inicio/final
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  // Eliminar prefijos comunes no deseados
  cleaned = cleaned.replace(/^(via|from|re|fwd|fw):\s*/i, "");
  
  // Eliminar sufijos comunes no deseados
  cleaned = cleaned.replace(/\s*(via|from|re|fwd|fw)$/i, "");
  
  // Eliminar caracteres especiales que no son letras, números, espacios o guiones
  // Permitir: letras (incluyendo acentos), números, espacios, guiones, puntos, comas, y apóstrofes
  cleaned = cleaned.replace(/[^a-zA-ZÀ-ÿ0-9\s\-.,']/g, "");
  
  // Limpiar espacios nuevamente después de las eliminaciones
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  // Eliminar puntos y comas al inicio/final (no deberían estar ahí)
  cleaned = cleaned.replace(/^[.,]+|[.,]+$/g, "");
  
  // Si después de limpiar queda vacío o solo tiene caracteres especiales, retornar vacío
  if (!cleaned || cleaned.length < 1 || /^[^a-zA-ZÀ-ÿ]+$/.test(cleaned)) {
    return "";
  }
  
  return cleaned;
}

/**
 * Extrae el nombre del remitente de un header From
 * Formato esperado: "Name <email@domain.com>" o "Name email@domain.com"
 */
export function extractSenderName(headerValue) {
  if (!headerValue) return "";
  
  let namePart = "";
  
  // Si tiene formato "Name <email@domain.com>"
  const matchWithBrackets = headerValue.match(/^([^<]+)</);
  if (matchWithBrackets) {
    namePart = matchWithBrackets[1].trim();
  } else {
    // Si tiene formato "Name email@domain.com" (sin < >)
    const emailMatch = headerValue.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      const emailIndex = headerValue.indexOf(emailMatch[1]);
      if (emailIndex > 0) {
        namePart = headerValue.substring(0, emailIndex).trim();
      }
    } else {
      // Si no hay email, puede ser solo nombre
      namePart = headerValue.trim();
    }
  }
  
  // Limpiar el nombre extraído
  return cleanName(namePart);
}

/**
 * Usa IA para determinar si un nombre es de una empresa o de una persona
 * Retorna: "company" si es empresa, "person" si es persona, null si no se puede determinar
 */
export async function detectNameTypeWithAI(fullName, vertexCallFn) {
  if (!fullName || !vertexCallFn) return null;
  
  try {
    const prompt = `Analiza el siguiente nombre y determina si es una EMPRESA/ORGANIZACIÓN o una PERSONA.

Nombre: "${fullName}"

Responde SOLO con una de estas opciones:
- "company" si es una empresa, organización, marca, o entidad comercial
- "person" si es el nombre de una persona
- "unknown" si no puedes determinarlo

Ejemplos:
- "John Smith" -> "person"
- "Acme Corporation" -> "company"
- "Maria Garcia" -> "person"
- "Tech Solutions Inc." -> "company"
- "noreply@example.com" -> "company"
- "Marketing Team" -> "company"

Responde SOLO con: company, person, o unknown`;

    const response = await vertexCallFn(CFG.VERTEX_MODEL || "gemini-2.5-flash", prompt);
    const result = (response || "").trim().toLowerCase();
    
    if (result === "company" || result === "person") {
      return result;
    }
    
    return null;
  } catch (e) {
    console.warn("[mfs] Error usando IA para detectar tipo de nombre:", e?.message);
    return null;
  }
}

/**
 * Extrae el primer nombre de un nombre completo
 * Si es una empresa, devuelve el nombre completo
 * Si es una persona, devuelve solo el primer nombre
 * Usa IA para determinar si es empresa o persona
 */
export async function extractFirstName(fullName, vertexCallFn = null) {
  if (!fullName) return "";
  
  // Limpiar primero el nombre completo
  const cleaned = cleanName(fullName);
  if (!cleaned) return "";
  
  // Si no hay función de IA, usar lógica básica (asumir persona)
  if (!vertexCallFn) {
    const parts = cleaned.split(/\s+/);
    return cleanName(parts[0] || "");
  }
  
  // Usar IA para determinar si es empresa o persona
  const nameType = await detectNameTypeWithAI(cleaned, vertexCallFn);
  
  if (nameType === "company") {
    // Si es empresa, devolver el nombre completo
    console.log("[mfs] Nombre detectado como empresa, usando nombre completo:", cleaned);
    return cleaned;
  } else if (nameType === "person") {
    // Si es persona, devolver solo el primer nombre
    const parts = cleaned.split(/\s+/);
    const firstName = parts[0] || "";
    console.log("[mfs] Nombre detectado como persona, usando primer nombre:", firstName);
    return cleanName(firstName);
  } else {
    // Si no se puede determinar, usar lógica básica (asumir persona y tomar primer nombre)
    const parts = cleaned.split(/\s+/);
    const firstName = parts[0] || "";
    console.log("[mfs] Tipo de nombre no determinado, usando primer nombre por defecto:", firstName);
    return cleanName(firstName);
  }
}

/**
 * Usa IA (Gemini) para extraer y limpiar el nombre de un header From complejo
 * Solo se usa si el nombre después de la limpieza básica sigue siendo problemático
 */
export async function extractSenderNameWithAI(headerValue, vertexCallFn) {
  if (!headerValue || !vertexCallFn) return null;
  
  try {
    const prompt = `Extrae el nombre de la persona del siguiente header de email. 
Solo devuelve el nombre limpio, sin comillas, sin caracteres especiales, sin títulos, sin información adicional.
Si no puedes identificar un nombre claro, devuelve "NONE".

Header: "${headerValue}"

Responde SOLO con el nombre limpio o "NONE" si no hay nombre válido.`;

    const response = await vertexCallFn(CFG.VERTEX_MODEL || "gemini-2.5-flash", prompt);
    const aiName = (response || "").trim();
    
    // Si la IA devolvió "NONE" o algo vacío, retornar null
    if (!aiName || aiName.toLowerCase() === "none" || aiName.length < 2) {
      return null;
    }
    
    // Limpiar el resultado de la IA también
    return cleanName(aiName);
  } catch (e) {
    console.warn("[mfs] Error usando IA para extraer nombre:", e?.message);
    return null;
  }
}

/**
 * Detecta el idioma del texto y devuelve código ISO 2
 * Analiza TODO el texto, no solo las primeras palabras
 * Limpia URLs, links, emails antes de analizar
 */
export function detectLanguage(text) {
  if (!text || text.trim().length < 10) return "en"; // Default si es muy corto
  
  // Limpiar el texto: remover URLs, emails, links, etc.
  let cleanText = text
    // Remover URLs completas
    .replace(/https?:\/\/[^\s]+/gi, " ")
    // Remover emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, " ")
    // Remover links HTML
    .replace(/<a[^>]*>.*?<\/a>/gi, " ")
    // Remover tags HTML
    .replace(/<[^>]+>/g, " ")
    // Remover caracteres especiales de encoding
    .replace(/&[a-z]+;/gi, " ")
    // Normalizar espacios
    .replace(/\s+/g, " ")
    .trim();
  
  // Si después de limpiar queda muy poco texto, usar el original
  if (cleanText.length < 20) {
    cleanText = text.replace(/\s+/g, " ").trim();
  }
  
  // Analizar TODO el texto, no solo una muestra
  const textToAnalyze = cleanText.toLowerCase();
  
  // Palabras comunes en español
  const spanishWords = /\b(el|la|los|las|de|del|que|y|a|en|un|una|es|son|con|por|para|como|más|muy|este|esta|estos|estas|también|pero|o|si|no|se|le|les|nos|te|me|su|sus|nuestro|nuestra|vuestro|vuestra|hacer|hace|hizo|ser|fue|fueron|estar|está|están|tener|tiene|tienen|poder|puede|pueden|querer|quiere|quieren|decir|dice|dar|da|dan|ver|ve|ven|ir|va|van|venir|viene|vienen|saber|sabe|saben|salir|sale|salen|haber|ha|han|hay|había|habían|gracias|por favor|hola|adiós|buenos|días|tardes|noches)\b/gi;
  const spanishCount = (textToAnalyze.match(spanishWords) || []).length;
  
  // Palabras comunes en francés
  const frenchWords = /\b(le|la|les|de|du|des|que|et|à|en|un|une|est|sont|avec|pour|comme|plus|très|ce|ces|cette|cet|aussi|mais|ou|si|non|se|il|elle|ils|elles|nous|vous|son|sa|ses|notre|votre|leur|leurs|faire|fait|être|était|étaient|avoir|a|ont|peut|peuvent|vouloir|veut|veulent|dire|dit|donner|donne|voir|voit|aller|va|vont|venir|vient|savoir|sait|sortir|sort|il y a|il y avait|merci|bonjour|bonsoir|au revoir)\b/gi;
  const frenchCount = (textToAnalyze.match(frenchWords) || []).length;
  
  // Palabras comunes en italiano
  const italianWords = /\b(il|la|lo|gli|le|di|del|della|dei|delle|che|e|a|in|un|una|è|sono|con|per|come|più|molto|questo|questa|questi|queste|anche|ma|o|se|non|si|noi|voi|loro|suo|sua|suoi|sue|nostro|nostra|fare|fa|essere|era|avere|ha|potere|può|volere|vuole|dire|dice|dare|da|vedere|vede|andare|va|venire|viene|sapere|sa|uscire|esce|ci sono|grazie|ciao|buongiorno|buonasera)\b/gi;
  const italianCount = (textToAnalyze.match(italianWords) || []).length;
  
  // Palabras comunes en portugués
  const portugueseWords = /\b(o|a|os|as|de|do|da|dos|das|que|e|a|em|um|uma|é|são|com|por|para|como|mais|muito|este|esta|estes|estas|também|mas|ou|se|não|nos|vos|seu|sua|seus|suas|nosso|nossa|fazer|faz|ser|era|estar|está|ter|tem|poder|pode|querer|quer|dizer|diz|dar|dá|ver|vê|ir|vai|vir|vem|saber|sabe|sair|sai|haver|há|existe|obrigado|obrigada|olá|tchau)\b/gi;
  const portugueseCount = (textToAnalyze.match(portugueseWords) || []).length;
  
  // Palabras comunes en alemán
  const germanWords = /\b(der|die|das|den|dem|des|ein|eine|und|oder|aber|nicht|kein|ist|sind|war|waren|hat|haben|wird|werden|kann|können|muss|müssen|soll|sollen|will|wollen|darf|dürfen|möchte|sein|seine|ihr|ihre|unser|unsere|machen|macht|tun|gehen|kommt|sehen|wissen|weiß|sagen|geben|nehmen|finden|bleiben|stehen|liegen|sitzen|fahren|essen|trinken|schlafen|arbeiten|spielen|lesen|schreiben|hören|denken|glauben|verstehen|sprechen|fragen|antworten|erklären|zeigen|bringen|holen|bekommen|kaufen|verkaufen|bezahlen|kosten|öffnen|schließen|beginnen|enden|starten|stoppen|warten|helfen|brauchen|mögen|lieben|hassen|fühlen|erinnern|vergessen|hoffen|fürchten|sorgen|freuen|ärgern|wundern|überraschen|enttäuschen|danke|hallo|tschüss)\b/gi;
  const germanCount = (textToAnalyze.match(germanWords) || []).length;
  
  // Detectar japonés: caracteres hiragana, katakana, kanji
  const japaneseChars = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;
  const japaneseCount = (textToAnalyze.match(japaneseChars) || []).length;
  
  // Detectar coreano: caracteres hangul
  const koreanChars = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g;
  const koreanCount = (textToAnalyze.match(koreanChars) || []).length;
  
  // Palabras comunes en inglés (para comparar)
  const englishWords = /\b(the|be|to|of|and|a|in|that|have|i|it|for|not|on|with|he|as|you|do|at|this|but|his|by|from|they|we|say|her|she|or|an|will|my|one|all|would|there|their|what|so|up|out|if|about|who|get|which|go|me|when|make|can|like|time|no|just|him|know|take|people|into|year|your|good|some|could|them|see|other|than|then|now|look|only|come|its|over|think|also|back|after|use|two|how|our|work|first|well|way|even|new|want|because|any|these|give|day|most|us)\b/gi;
  const englishCount = (textToAnalyze.match(englishWords) || []).length;
  
  // Contar palabras totales en el texto completo
  const words = textToAnalyze.split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;
  
  // Si hay caracteres japoneses o coreanos, tienen prioridad
  if (japaneseCount > 10) {
    return "jp";
  }
  if (koreanCount > 10) {
    return "kr";
  }
  
  // Calcular porcentajes basados en palabras encontradas vs total de palabras
  const spanishRatio = totalWords > 0 ? spanishCount / totalWords : 0;
  const frenchRatio = totalWords > 0 ? frenchCount / totalWords : 0;
  const italianRatio = totalWords > 0 ? italianCount / totalWords : 0;
  const portugueseRatio = totalWords > 0 ? portugueseCount / totalWords : 0;
  const germanRatio = totalWords > 0 ? germanCount / totalWords : 0;
  const englishRatio = totalWords > 0 ? englishCount / totalWords : 0;
  
  // Determinar idioma basado en el mayor ratio
  const ratios = [
    { lang: "es", ratio: spanishRatio },
    { lang: "fr", ratio: frenchRatio },
    { lang: "it", ratio: italianRatio },
    { lang: "pt", ratio: portugueseRatio },
    { lang: "de", ratio: germanRatio },
    { lang: "en", ratio: englishRatio },
  ];
  
  ratios.sort((a, b) => b.ratio - a.ratio);
  
  // Si el ratio más alto es significativo (>0.03), usar ese idioma
  if (ratios[0].ratio > 0.03) {
    return ratios[0].lang;
  }
  
  // Si no hay suficiente evidencia, usar inglés como default
  return "en";
}

/**
 * Mapeo de emails a ubicación (City, Country, Country Code)
 * Basado en el email del destinatario (To)
 */
const EMAIL_LOCATION_MAP = {
  "abudhabi@secretmedianetwork.com": { country: "UAE", countryCode: "AE", city: "Abu Dhabi" },
  "dubai@secretmedianetwork.com": { country: "UAE", countryCode: "AE", city: "Dubai" },
  "abudhabi+managers@secretmedianetwork.com": { country: "UAE", countryCode: "AE", city: "Abu Dhabi" },
  "baires@secretmedianetwork.com": { country: "Argentina", countryCode: "AR", city: "Buenos Aires" },
  "buenosaires@secretmedianetwork.com": { country: "Argentina", countryCode: "AR", city: "Buenos Aires" },
  "wien@secretmedianetwork.com": { country: "Austria", countryCode: "AT", city: "Wien" },
  "brisbane@secretmedianetwork.com": { country: "Australia", countryCode: "AU", city: "Brisbane" },
  "melbourne@secretmedianetwork.com": { country: "Australia", countryCode: "AU", city: "Melbourne" },
  "perth@secretmedianetwork.com": { country: "Australia", countryCode: "AU", city: "Perth" },
  "adelaide@secretmedianetwork.com": { country: "Australia", countryCode: "AU", city: "Adelaide" },
  "sydney@secretmedianetwork.com": { country: "Australia", countryCode: "AU", city: "Sydney" },
  "canberra@secretmedianetwork.com": { country: "Australia", countryCode: "AU", city: "Canberra" },
  "goldcoast@secretmedianetwork.com": { country: "Australia", countryCode: "AU", city: "Gold Coast" },
  "newcastle.au@secretmedianetwork.com": { country: "Australia", countryCode: "AU", city: "Newcastle" },
  "bruxelles@secretmedianetwork.com": { country: "Belgium", countryCode: "BE", city: "Brussels" },
  "ghent@secretmedianetwork.com": { country: "Belgium", countryCode: "BE", city: "Ghent" },
  "riodejaneiro@secretmedianetwork.com": { country: "Brazil", countryCode: "BR", city: "Rio de Janeiro" },
  "saopaulo@secretmedianetwork.com": { country: "Brazil", countryCode: "BR", city: "São Paulo" },
  "fortaleza@secretmedianetwork.com": { country: "Brazil", countryCode: "BR", city: "Fortaleza" },
  "belohorizonte@secretmedianetwork.com": { country: "Brazil", countryCode: "BR", city: "Belo Horizonte" },
  "saopaulo+noreply@secretmedianetwork.com": { country: "Brazil", countryCode: "BR", city: "São Paulo" },
  "portoalegre@secretmedianetwork.com": { country: "Brazil", countryCode: "BR", city: "Porto Alegre" },
  "calgary@secretmedianetwork.com": { country: "Canada", countryCode: "CA", city: "Calgary" },
  "ottawa@secretmedianetwork.com": { country: "Canada", countryCode: "CA", city: "Ottawa" },
  "edmonton@secretmedianetwork.com": { country: "Canada", countryCode: "CA", city: "Edmonton" },
  "toronto@secretmedianetwork.com": { country: "Canada", countryCode: "CA", city: "Toronto" },
  "montreal@secretmedianetwork.com": { country: "Canada", countryCode: "CA", city: "Montreal" },
  "vancouver@secretmedianetwork.com": { country: "Canada", countryCode: "CA", city: "Vancouver" },
  "geneve@secretmedianetwork.com": { country: "Switzerland", countryCode: "CH", city: "Geneva" },
  "santiago@secretmedianetwork.com": { country: "Chile", countryCode: "CL", city: "Santiago" },
  "berlin@secretmedianetwork.com": { country: "Germany", countryCode: "DE", city: "Berlin" },
  "frankfurt@secretmedianetwork.com": { country: "Germany", countryCode: "DE", city: "Frankfurt" },
  "koeln@secretmedianetwork.com": { country: "Germany", countryCode: "DE", city: "Cologne" },
  "muenchen@secretmedianetwork.com": { country: "Germany", countryCode: "DE", city: "Munich" },
  "hamburg@secretmedianetwork.com": { country: "Germany", countryCode: "DE", city: "Hamburg" },
  "stuttgart@secretmedianetwork.com": { country: "Germany", countryCode: "DE", city: "Stuttgart" },
  "kobenhavn@secretmedianetwork.com": { country: "Denmark", countryCode: "DK", city: "København" },
  "hola@valenciasecreta.com": { country: "Spain", countryCode: "ES", city: "Valencia" },
  "madrid@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Madrid" },
  "hola@barcelonasecreta.com": { country: "Spain", countryCode: "ES", city: "Barcelona" },
  "bilbao@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Bilbao" },
  "malaga@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Malaga" },
  "zaragoza@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Zaragoza" },
  "gijon@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Gijón" },
  "cadiz@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Cádiz" },
  "santander@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Santander" },
  "barcelona@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Barcelona" },
  "ibiza@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Ibiza" },
  "sevilla@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Sevilla" },
  "alicante@secretmedianetwork.com": { country: "Spain", countryCode: "ES", city: "Alicante" },
  "toulouse@secretmedianetwork.com": { country: "France", countryCode: "FR", city: "Toulouse" },
  "marseille@secretmedianetwork.com": { country: "France", countryCode: "FR", city: "Marseille" },
  "paris@secretmedianetwork.com": { country: "France", countryCode: "FR", city: "Paris" },
  "lyon@secretmedianetwork.com": { country: "France", countryCode: "FR", city: "Lyon" },
  "nimes@secretmedianetwork.com": { country: "France", countryCode: "FR", city: "Nîmes" },
  "bordeaux@secretmedianetwork.com": { country: "France", countryCode: "FR", city: "Bordeaux" },
  "lille@secretmedianetwork.com": { country: "France", countryCode: "FR", city: "Lille" },
  "larochelle@secretmedianetwork.com": { country: "France", countryCode: "FR", city: "La Rochelle" },
  "nice@secretmedianetwork.com": { country: "France", countryCode: "FR", city: "Nice" },
  "nantes@secretmedianetwork.com": { country: "France", countryCode: "FR", city: "Nantes" },
  "hello@secretldn.com": { country: "United Kingdom", countryCode: "GB", city: "London" },
  "glasgow@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Glasgow" },
  "manchester@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Manchester" },
  "nottingham@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Nottingham" },
  "bristol@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Bristol" },
  "brighton@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Brighton" },
  "belfast@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Belfast" },
  "leeds@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Leeds" },
  "sheffield@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Sheffield" },
  "plymouth@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Plymouth" },
  "liverpool@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Liverpool" },
  "birmingham@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Birmingham" },
  "derry+managers@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Derry" },
  "edinburgh@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "Edinburgh" },
  "editor@secretldn.com": { country: "United Kingdom", countryCode: "GB", city: "London" },
  "london@secretmedianetwork.com": { country: "United Kingdom", countryCode: "GB", city: "London" },
  "dublin@secretmedianetwork.com": { country: "Ireland", countryCode: "IE", city: "Dublin" },
  "bhopal@secretmedianetwork.com": { country: "India", countryCode: "IN", city: "Bhopal" },
  "mumbai@secretmedianetwork.com": { country: "India", countryCode: "IN", city: "Mumbai" },
  "newdelhi@secretmedianetwork.com": { country: "India", countryCode: "IN", city: "New Delhi" },
  "bologna@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Bologna" },
  "milano@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Milan" },
  "genova@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Genoa" },
  "palermo@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Palermo" },
  "bari@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Bari" },
  "catania@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Catania" },
  "venezia@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Venice" },
  "roma@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Rome" },
  "napoli@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Napoli" },
  "torino@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Torino" },
  "firenze@secretmedianetwork.com": { country: "Italy", countryCode: "IT", city: "Firenze" },
  "tokyo@secretmedianetwork.com": { country: "Japan", countryCode: "JP", city: "Tokyo" },
  "daegu@secretmedianetwork.com": { country: "South Korea", countryCode: "KR", city: "Daegu" },
  "seoul@secretmedianetwork.com": { country: "South Korea", countryCode: "KR", city: "Seoul" },
  "suwon@secretmedianetwork.com": { country: "South Korea", countryCode: "KR", city: "Suwon" },
  "busan@secretmedianetwork.com": { country: "South Korea", countryCode: "KR", city: "Busan" },
  "tijuana@secretmedianetwork.com": { country: "Mexico", countryCode: "MX", city: "Tijuana" },
  "guadalajara@secretmedianetwork.com": { country: "Mexico", countryCode: "MX", city: "Guadalajara" },
  "cdmx@secretmedianetwork.com": { country: "Mexico", countryCode: "MX", city: "Mexico City" },
  "monterrey@secretmedianetwork.com": { country: "Mexico", countryCode: "MX", city: "Monterrey" },
  "toluca@secretmedianetwork.com": { country: "Mexico", countryCode: "MX", city: "Toluca" },
  "thehague@secretmedianetwork.com": { country: "Netherlands", countryCode: "NL", city: "The Hague" },
  "rotterdam@secretmedianetwork.com": { country: "Netherlands", countryCode: "NL", city: "Rotterdam" },
  "eindhoven@secretmedianetwork.com": { country: "Netherlands", countryCode: "NL", city: "Eindhoven" },
  "utrecht@secretmedianetwork.com": { country: "Netherlands", countryCode: "NL", city: "Utrecht" },
  "amsterdam@secretmedianetwork.com": { country: "Netherlands", countryCode: "NL", city: "Amsterdam" },
  "auckland@secretmedianetwork.com": { country: "New Zealand", countryCode: "NZ", city: "Auckland" },
  "wellington@secretmedianetwork.com": { country: "New Zealand", countryCode: "NZ", city: "Wellington" },
  "lisboa@secretmedianetwork.com": { country: "Portugal", countryCode: "PT", city: "Lisbon" },
  "porto@secretmedianetwork.com": { country: "Portugal", countryCode: "PT", city: "Porto" },
  "Lisboa@secretmedianetwork.com": { country: "Portugal", countryCode: "PT", city: "Lisbon" },
  "stockholm@secretmedianetwork.com": { country: "Sweden", countryCode: "SE", city: "Stockholm" },
  "singapore@secretmedianetwork.com": { country: "Singapore", countryCode: "SG", city: "Singapore" },
  "indianapolis@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Indianapolis" },
  "hello@secretnyc.co": { country: "United States", countryCode: "US", city: "New York" },
  "miami@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Miami" },
  "houston@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Houston" },
  "dc@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Washington DC" },
  "dallas@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Dallas" },
  "tampa@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Tampa" },
  "charlotte@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Charlotte" },
  "sandiego@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "San Diego" },
  "stlouis@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "St. Louis" },
  "la@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Los Angeles" },
  "sanfrancisco@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "San Francisco" },
  "charleston@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Charleston" },
  "tulsa@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Tulsa" },
  "raleigh@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Raleigh" },
  "seattle@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Seattle" },
  "atlanta@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Atlanta" },
  "chicago@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Chicago" },
  "boston@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Boston" },
  "philadelphia@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Philadelphia" },
  "detroit@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Detroit" },
  "austin@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Austin" },
  "baltimore@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Baltimore" },
  "portland@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Portland" },
  "nashville@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Nashville" },
  "richmond@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Richmond" },
  "lasvegas@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Las Vegas" },
  "jacksonville@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Jacksonville" },
  "cleveland@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Cleveland" },
  "neworleans@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "New Orleans" },
  "cincinnati@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Cincinnati" },
  "phoenix@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Phoenix" },
  "minneapolis@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Minneapolis" },
  "denver@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Denver" },
  "sacramento@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Sacramento" },
  "kansascity@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Kansas City" },
  "orlando@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Orlando" },
  "albuquerque@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "Albuquerque" },
  "london-editorial@feverup.com": { country: "United Kingdom", countryCode: "GB", city: "London" },
  "sanantonio@secretmedianetwork.com": { country: "United States", countryCode: "US", city: "San Antonio" },
  "quebec@secretmedianetwork.com": { country: "Canada", countryCode: "CA", city: "Quebec" },
};

/**
 * Obtiene la ubicación basada en el email del destinatario (To)
 * Retorna { country, countryCode, city } o null si no se encuentra
 */
export function getLocationFromEmail(toEmail) {
  if (!toEmail) return null;
  
  // Limpiar el email (puede venir con formato "Name <email>" o múltiples emails separados por comas)
  const cleanEmail = extractCleanEmail(toEmail);
  
  // Si hay múltiples emails, tomar el primero
  const firstEmail = cleanEmail.split(",")[0].trim();
  
  // Buscar en el mapa (case-insensitive)
  const normalizedEmail = firstEmail.toLowerCase();
  
  const location = EMAIL_LOCATION_MAP[normalizedEmail] || null;
  
  if (!location) {
    console.log(`[mfs] No se encontró ubicación para email: ${normalizedEmail}`);
  }
  
  return location;
}

/**
 * Busca emails de ciudades en el cuerpo del mensaje y retorna la ubicación correspondiente
 * Útil cuando el correo viene de secretmedia@feverup.com y el To no tiene información de ciudad
 * Prioriza emails encontrados en headers de mensajes reenviados (To:, From:, etc.)
 * Retorna { country, countryCode, city } o null si no se encuentra
 */
export function getLocationFromEmailInBody(body) {
  if (!body || typeof body !== "string") return null;
  
  // Primero buscar en headers de mensajes reenviados (prioridad alta)
  // Buscar patrones como:
  // - "To: <email@domain.com>"
  // - "To: email@domain.com"
  // - "From: 'Name' via Something <email@domain.com>"
  // - "From: Name <email@domain.com>"
  
  // Patrón mejorado que busca emails dentro de < > en headers, incluso si hay texto antes
  const headerPatternWithBrackets = /(?:^|\n)(?:To|From|CC|BCC|Reply-To):[^<\n]*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/gim;
  const headerMatchesWithBrackets = Array.from(body.matchAll(headerPatternWithBrackets));
  
  // Buscar primero en headers con brackets (prioridad más alta)
  for (const match of headerMatchesWithBrackets) {
    const email = match[1].trim().toLowerCase();
    console.log(`[mfs] Email encontrado en header (con brackets): ${email}`);
    const location = EMAIL_LOCATION_MAP[email];
    
    if (location) {
      console.log(`[mfs] ✓ Ubicación encontrada en header del mensaje reenviado (con brackets): ${email} → ${location.city}, ${location.country}`);
      return location;
    } else {
      console.log(`[mfs] ⚠️ Email ${email} no está en EMAIL_LOCATION_MAP`);
    }
  }
  
  // También buscar en headers sin brackets (formato directo)
  const headerPatternWithoutBrackets = /(?:^|\n)(?:To|From|CC|BCC|Reply-To):\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\s|$|\n)/gim;
  const headerMatchesWithoutBrackets = Array.from(body.matchAll(headerPatternWithoutBrackets));
  
  for (const match of headerMatchesWithoutBrackets) {
    const email = match[1].trim().toLowerCase();
    console.log(`[mfs] Email encontrado en header (sin brackets): ${email}`);
    const location = EMAIL_LOCATION_MAP[email];
    
    if (location) {
      console.log(`[mfs] ✓ Ubicación encontrada en header del mensaje reenviado (sin brackets): ${email} → ${location.city}, ${location.country}`);
      return location;
    } else {
      console.log(`[mfs] ⚠️ Email ${email} no está en EMAIL_LOCATION_MAP`);
    }
  }
  
  // Si no se encontró en headers, buscar en todo el cuerpo del mensaje
  const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  const emailMatches = Array.from(body.matchAll(emailPattern));
  
  // Buscar el primer email que esté en el EMAIL_LOCATION_MAP
  console.log(`[mfs] Buscando ${emailMatches.length} emails encontrados en el cuerpo del mensaje...`);
  for (const match of emailMatches) {
    const email = match[1].trim().toLowerCase();
    const location = EMAIL_LOCATION_MAP[email];
    
    if (location) {
      console.log(`[mfs] ✓ Ubicación encontrada en cuerpo del mensaje: ${email} → ${location.city}, ${location.country}`);
      return location;
    }
  }
  
  // Si no se encontró ningún email de ciudad en el cuerpo
  console.log(`[mfs] No se encontró ningún email de ciudad en el cuerpo del mensaje`);
  return null;
}


