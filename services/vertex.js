/**
 * Servicio de Vertex AI para clasificación
 */
import { VertexAI } from "@google-cloud/vertexai";
import { CFG, FLAGS, INTENT_PROMPT } from "../config.js";
import { isNotFound, normalizeModelIntent, defaultReasoningForIntent } from "../utils/helpers.js";

/**
 * Genera contenido una vez con Vertex AI
 */
async function genOnce(location, model, prompt) {
  const vertex = new VertexAI({ project: CFG.PROJECT_ID, location });
  const m = vertex.getGenerativeModel({
    model,
    generationConfig: { temperature: 0.1 },
  });

  const r = await m.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  return r?.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/**
 * Llama al modelo de texto con fallbacks
 */
export async function callModelText(modelName, prompt) {
  if (FLAGS.SKIP_VERTEX) {
    console.log("[mfs] SKIP_VERTEX activado → no llamo a Vertex");
    return "";
  }

  const MODEL_ALIASES = [
    modelName,
    "gemini-2.5-flash",
    "gemini-2.5-flash-001",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-1.5-pro",
  ];

  const REGIONS = Array.from(
    new Set([CFG.VERTEX_LOCATION || "us-central1", "us-central1", "europe-west1"])
  );

  console.log("[mfs] Llamando a Vertex con modelo:", modelName, "fallbacks:", MODEL_ALIASES.slice(1));

  for (const loc of REGIONS) {
    for (const mdl of MODEL_ALIASES) {
      try {
        const out = await genOnce(loc, mdl, prompt);
        if (out && out.trim()) {
          if (loc !== CFG.VERTEX_LOCATION || mdl !== modelName) {
            console.warn("[mfs] Vertex ha usado fallback →", {
              location: loc,
              model: mdl,
            });
          }
          return out.trim();
        }
      } catch (e) {
        // Detectar errores 404 o "not found" de diferentes formas
        const is404 = isNotFound(e) || 
          String(e?.message || "").includes("not found") ||
          String(e?.message || "").includes("NOT_FOUND") ||
          String(e?.code || "") === "404" ||
          String(e?.status || "") === "404";
        
        if (is404) {
          console.warn("[mfs] Vertex NOT_FOUND → pruebo siguiente combinación", {
            location: loc,
            model: mdl,
            error: e?.message?.slice(0, 100) || String(e).slice(0, 100),
          });
          continue;
        }
        // Para otros errores, también intentar siguiente modelo en lugar de fallar inmediatamente
        console.warn("[mfs] Vertex error → pruebo siguiente combinación", {
          location: loc,
          model: mdl,
          error: e?.message?.slice(0, 100) || String(e).slice(0, 100),
        });
        continue;
      }
    }
  }

  return "";
}

/**
 * Genera un resumen del cuerpo del correo usando Gemini
 */
export async function generateBodySummary(body) {
  if (FLAGS.SKIP_VERTEX) {
    console.log("[mfs] SKIP_VERTEX activado → no genero resumen del body");
    return "";
  }

  if (!body || body.trim().length === 0) {
    return "";
  }

  // Limitar el body a 100000 caracteres para evitar tokens excesivos
  const bodyToSummarize = body.slice(0, 100000);
  
  const summaryPrompt = `Summarize the following email in a concise and clear way. The summary must:
- Capture the main points and the sender's intention
- Be useful to quickly understand what the email is about
- Be approximately 150 words (be concise, avoid unnecessary details)
- Be written in English (regardless of the original email language)

Email:
${bodyToSummarize}

Summary:`;

  try {
    const modelToUse = CFG.VERTEX_MODEL || CFG.VERTEX_INTENT_MODEL;
    console.log("[mfs] Generando resumen del body con Gemini usando modelo:", modelToUse);
    const summary = await callModelText(modelToUse, summaryPrompt);
    
    if (summary && summary.trim()) {
      // Limitar a 1500 caracteres para mantener el resumen conciso (~150 palabras)
      const trimmedSummary = summary.trim().slice(0, 1500);
      console.log("[mfs] Resumen del body generado:", {
        originalLength: body.length,
        summaryLength: trimmedSummary.length
      });
      return trimmedSummary;
    }
    
    return "";
  } catch (e) {
    console.error("[mfs] Error generando resumen del body:", e);
    return "";
  }
}

/**
 * Clasifica el intent de un correo
 */
export async function classifyIntent({ subject, from, to, body }) {
  const subjectLog = (subject || "").slice(0, 120);
  console.log("[mfs] [classify] Empiezo clasificación de correo:", {
    from,
    to,
    subject: subjectLog,
  });

  const prompt = `${INTENT_PROMPT}

Lead:

From: ${from}

To: ${to}

Subject: ${subject}

Body:

${body}`.trim();

  let raw = "";
  let modelIntentRaw = null;
  let reasoning = "";
  let meddicMetrics = "";
  let meddicEconomicBuyer = "";
  let meddicDecisionCriteria = "";
  let meddicDecisionProcess = "";
  let meddicIdentifyPain = "";
  let meddicChampion = "";
  let modelFreeCoverage = false;
  let modelBarter = false;
  let modelPricing = false;

  try {
    raw = await callModelText(CFG.VERTEX_INTENT_MODEL, prompt);
  } catch {
    raw = "";
  }

  if (raw && raw.trim()) {
    try {
      const text = raw.trim();
      const jsonStr = text.includes("{")
        ? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
        : text;
      const parsed = JSON.parse(jsonStr);

      if (parsed.reasoning) {
        reasoning = String(parsed.reasoning).trim().slice(0, 1000);
      }
      if (parsed.intent) {
        modelIntentRaw = String(parsed.intent).trim();
      }
      
      // Extract checkbox flags
      if (parsed.free_coverage_request !== undefined) {
        modelFreeCoverage = Boolean(parsed.free_coverage_request);
      }
      if (parsed.barter_request !== undefined) {
        modelBarter = Boolean(parsed.barter_request);
      }
      if (parsed.pricing_request !== undefined) {
        modelPricing = Boolean(parsed.pricing_request);
      }
      
      // Extract MEDDIC fields (only if not Discard)
      if (modelIntentRaw && modelIntentRaw !== "Discard") {
        if (parsed.meddic_metrics) {
          meddicMetrics = String(parsed.meddic_metrics).trim();
        }
        if (parsed.meddic_economic_buyer) {
          meddicEconomicBuyer = String(parsed.meddic_economic_buyer).trim();
        }
        if (parsed.meddic_decision_criteria) {
          meddicDecisionCriteria = String(parsed.meddic_decision_criteria).trim();
        }
        if (parsed.meddic_decision_process) {
          meddicDecisionProcess = String(parsed.meddic_decision_process).trim();
        }
        if (parsed.meddic_identify_pain) {
          meddicIdentifyPain = String(parsed.meddic_identify_pain).trim();
        }
        if (parsed.meddic_champion) {
          meddicChampion = String(parsed.meddic_champion).trim();
        }
        
        // Legacy support: if old meddic_pain_hypothesis exists, use it for Identify Pain
        if (!meddicIdentifyPain && parsed.meddic_pain_hypothesis) {
          meddicIdentifyPain = String(parsed.meddic_pain_hypothesis).trim();
        }
      }
    } catch {
      console.warn(
        "[mfs] [classify] Respuesta de Vertex no es JSON limpio, sigo con heurísticas"
      );
    }
  } else {
    console.warn("[mfs] [classify] Vertex no devolvió texto, uso solo heurísticas");
  }

  // Análisis heurístico (código completo en classifyIntentHeuristic)
  const result = await classifyIntentHeuristic({
    subject,
    from,
    to,
    body,
    modelIntentRaw,
    reasoning,
    meddicMetrics,
    meddicEconomicBuyer,
    meddicDecisionCriteria,
    meddicDecisionProcess,
    meddicIdentifyPain,
    meddicChampion,
    modelFreeCoverage,
    modelBarter,
    modelPricing,
  });

  return result;
}

/**
 * Clasificación heurística (lógica de reglas)
 */
async function classifyIntentHeuristic({
  subject,
  from,
  to,
  body,
  modelIntentRaw,
  reasoning,
  meddicMetrics,
  meddicEconomicBuyer,
  meddicDecisionCriteria,
  meddicDecisionProcess,
  meddicIdentifyPain,
  meddicChampion,
  modelFreeCoverage,
  modelBarter,
  modelPrInvitation,
  modelPricing,
}) {
  // Crear texto completo para búsqueda (incluyendo HTML sin tags para mejor detección)
  // Extraer texto de HTML si es necesario
  let bodyTextForSearch = body || "";
  // Si el body contiene HTML, extraer el texto visible (sin tags)
  if (bodyTextForSearch.includes("<") && bodyTextForSearch.includes(">")) {
    // Remover tags HTML pero mantener el texto
    bodyTextForSearch = bodyTextForSearch.replace(/<[^>]+>/g, " ");
    // Normalizar espacios
    bodyTextForSearch = bodyTextForSearch.replace(/\s+/g, " ").trim();
  }
  const mailText = `${subject || ""}\n${bodyTextForSearch}`.toLowerCase();
  const fromLc = (from || "").toLowerCase();
  const subjectLc = (subject || "").toLowerCase();
  const normalizedBody = (body || "").toLowerCase().replace(/\s+/g, " ").trim();
  let reasoningLc = (reasoning || "").toLowerCase();

  // Regex patterns
  // Mejorado: detecta unsubscribe incluso en links y en cualquier parte del email
  // Incluye variantes en múltiples idiomas: inglés, español, francés
  const unsubscribeRegex =
    /(unsubscribe|opt[-\s]?out|manage preferences|update your preferences|leave this list|darse de baja|cancelar suscripci[oó]n|si no quieres recibir m[aá]s correos|no deseas recibir estos correos electr[oó]nicos|gestionar preferencias|(se )?d[ée]sabonner|(pour )?vous d[ée]sabonner|pour vous d[ée]sabonner|se d[ée]sinscrire|g[eé]rer vos pr[eé]f[eé]rences|desuscribirte|desuscribirse|(cliquez|click)[^<]*(d[ée]sabonner|unsubscribe)|(d[ée]sabonner|unsubscribe)[^<]*(cliquez|click|ici|here)|link.*unsubscribe|unsubscribe.*link|href.*unsubscribe|d[ée]sinscrire)/i;

  const pressReleaseRegex =
    /(nota de prensa|ndp[\s_:]|ndp\b|press release|news release|comunicado de prensa|press kit)/;

  const prAssetsRegex =
    /(descarga de im[aá]genes|download (the )?images|download photos|press photos|media assets|descarga de siluetas)/;

  const prFooterRegex =
    /(departamento de comunicaci[oó]n|dpto\. de comunicaci[oó]n|press office|press contact|pr agency|agencia de comunicaci[oó]n|gabinete de prensa|press@|media@)/;

  const aboutBrandRegex = /\b(sobre|about)\s+[a-z0-9&.\- ]{2,40}:/;

  const eventKeywordsRegex =
    /(evento\b|event\b|festival\b|festivales\b|concierto\b|concert\b|show\b|exhibici[oó]n\b|exhibition\b|opening\b|inauguraci[oó]n\b|performance\b|tour\b|gira\b|screening\b|premiere\b|func[ií]on\b|obra de teatro|play\b|exposici[oó]n\b|fair\b|feria\b)/;

  const coverageRequestRegex =
    /(we would love (you|you guys) to feature|we'd love (you|you guys) to feature|feature (us|our (event|show|brand|product))|write (about us|an article about)|article about our|cover our (event|story|brand|festival|concert|show|exhibition)|editorial (coverage|feature)|media coverage|blog post about|review our (event|product|show)|publicar (una noticia|un art[ií]culo) sobre|que habl[eé]is de (nuestro|nuestra)|nos gustar[ií]a salir en vuestro medio)/;

  const explicitFreeRegex =
    /(for free|free of charge|at no cost|sin coste|sin costo|gratuito\b|de forma gratuita|no budget for paid media|no tenemos presupuesto para (publicidad|paid)|no paid (media|budget))/;

  const eventInviteRegex =
    /(we would love to invite you|we'd love to invite you|we would like to invite you|we'd like to invite you|we invite you to|you're invited to|you are invited to|join us for (a )?(press|media|vip)?\s?(event|screening|tour|preview|opening|visit)|te invitamos a|nos gustar[ií]a invitarte|nos gustaria invitarte|invitaci[oó]n a (un|una) (evento|pase|proyecci[oó]n|func[ií]on)|private tour|guided tour|convite (à|a) imprensa|press invitation|media invitation|media (are )?invited|press (are )?invited|reporters.*invited|photographers.*invited|broadcast media.*invited|media invite|press invite|media\/press invite)/i;

  const callSlotsRegex =
    /(book a (call|meeting)|schedule (a )?(call|meeting)|pick a slot|choose a time|select a time|time slot|drop in anytime between\s+\d|from \d{1,2}(am|pm)\s+to\s+\d{1,2}(am|pm)|agenda (una|una) llamada|concertar una llamada)/;

  // Enhanced pricing detection - works in multiple languages
  // IMPORTANT: Only detects EXPLICIT pricing requests, NOT pricing mentioned in press releases or content
  // Detects: direct pricing requests, media kit requests, advertising cost inquiries, publication rates
  // Must be in a context where they are ASKING for pricing, not just mentioning it
  const pricingRequestPhrases = [
    // Direct requests
    /(can you (send|share|provide|give) (me|us) (your )?(rate|pricing|price|media kit|press kit))/i,
    /(could you (send|share|provide|give) (me|us) (your )?(rate|pricing|price|media kit|press kit))/i,
    /(would you (be able to )?(send|share|provide|give) (me|us) (your )?(rate|pricing|price|media kit|press kit))/i,
    /(please (send|share|provide|give) (me|us) (your )?(rate|pricing|price|media kit|press kit))/i,
    /(i (would like|need|want) (to know|to see|to get) (your )?(rate|pricing|price|media kit|press kit))/i,
    /(we (would like|need|want) (to know|to see|to get) (your )?(rate|pricing|price|media kit|press kit))/i,
    /(what (are|is) (your )?(rate|pricing|price|fees|costs?|tariff|tarifs|tarifa))/i,
    /(how much (do you charge|would it cost|does it cost))/i,
    /(cu[aá]nto (cobr[aá]is|factur[aá]is|costar[ií]a|cuesta))/i,
    /(qu[ée] (precio|tarifa|prezzo|prix) (tiene|tienen|have|hast|ha|hanno|avez|ont))/i,
    // Rate card / media kit requests
    /(rate card|ratecard|media kit\b|mediakit|press kit)/i,
    // Asking about advertising costs
    /(cost of (a )?(campaign|post|article|placement|advertising|publicidad))/i,
    /(precio|price|prezzo|prix|preis|tarifa|tariffa|tarif)\s+(de|di|do|du|der|for|por|para|per|pour)\s+(publicaci[oó]n|pubblicazione|publica[çc][aã]o|publication|anuncio|advertising|publicit[ée]|werbung)/i,
    /(solicitar|request|richiedere|demander|anfragen)\s+(precio|price|prezzo|preço|prix|preis|tarifa|tariffa|tarifa|tarif|rate card|media kit)/i,
    /(informaci[oó]n|information|informazione|informa[çc][aã]o)\s+(sobre|about|su|sur|über)\s+(precio|price|prezzo|preço|prix|preis|tarifa|tariffa|tarifa|tarif|rate|pricing)/i,
    // Budget/presupuesto inquiries
    /(presupuesto|budget|or[çc]amento)\s+(de|di|do|du|der|for|por|para|per|pour)\s+(publicidad|advertising|publicit[ée]|werbung|pubblicit[àa])/i,
    /(discutir|discuss|discutere|discuter|diskutieren)\s+(precio|price|prezzo|preço|prix|preis|tarifa|tariffa|tarifa|tarif|rate|pricing)/i,
  ];
  
  // Check if pricing is being REQUESTED (not just mentioned)
  const isPricing = pricingRequestPhrases.some(regex => regex.test(mailText)) &&
    // Exclude if it's clearly a press release or content sharing
    !/(press release|media release|nota de prensa|comunicado de prensa|story for|data study|report|offering.*story|sharing.*story)/i.test(mailText);

  const directPartnershipAskRegex =
    /(we (would like|want|are looking|are interested)( to)? (partner|collaborate|work together|explore a partnership|explore collaboration)|would you (like|be interested) (to )?(partner|collaborate)|are you interested in (a )?(partnership|collaboration|media partnership)|partnership proposal (for you|with you)|propuesta de colaboraci[oó]n (con vosotros|con ustedes|contigo)|queremos (colaborar|trabajar) (con vosotros|con ustedes|contigo)|buscamos (colaboradores|partners?|socios comerciales))/;

  const platformCollabRegex =
    /(advertise (with you|on your (site|app|platform))|run (a )?campaign with you|use your (platform|app|site) to (sell tickets|promote our events)|ticketing partner for our events|use your ticketing solution|use your services for (ticketing|marketing|promotion))/;

  const contentCollabRegex =
    /(pitch (some )?content\b|creat(e|ing) (a )?post (for|on) your (site|blog|website|page)|guest post\b|write a guest post|guest article|creat(e|ing) (some )?content for your (site|blog|website|publication|magazine|channels|audience)|we('?d)? love [^.!?\n]{0,80} to create (some )?content\b|shoot (some )?content (together|with you)|content (collab|collaboration|partnership))/;

  // Detecciones
  // PRIMERO: Buscar unsubscribe en todo el texto (incluyendo links HTML y en cualquier idioma)
  // Buscar en el texto completo y también en el body HTML
  const bodyText = body || "";
  const bodyTextLower = bodyText.toLowerCase();
  
  // Múltiples patrones para detectar unsubscribe en diferentes formatos
  const containsUnsubscribe = 
    unsubscribeRegex.test(mailText) || 
    unsubscribeRegex.test(bodyText) ||
    unsubscribeRegex.test(bodyTextLower) ||
    // Links HTML con unsubscribe
    /href[^>]*(unsubscribe|d[ée]sabonner|d[ée]sinscrire|darse de baja)/i.test(bodyText) ||
    /(unsubscribe|d[ée]sabonner|d[ée]sinscrire|darse de baja)[^<]*href/i.test(bodyText) ||
    // Patrones específicos: "Pour vous désabonner cliquez-ici" o "cliquez-ici pour désabonner"
    /(pour vous|para )?(d[ée]sabonner|unsubscribe|darse de baja)/i.test(bodyText) ||
    /(cliquez|click)[^<]*(d[ée]sabonner|unsubscribe|ici|here)/i.test(bodyText) ||
    /(d[ée]sabonner|unsubscribe)[^<]*(cliquez|click|ici|here)/i.test(bodyText) ||
    // Patrón específico: "Pour vous désabonner cliquez-ici"
    /pour vous d[ée]sabonner.*cliquez/i.test(bodyText) ||
    /cliquez.*d[ée]sabonner/i.test(bodyText);
  
  // REGLA DURA: Si hay unsubscribe, descartar INMEDIATAMENTE (antes de cualquier otra verificación)
  if (containsUnsubscribe) {
    console.log("[mfs] [classify] Unsubscribe detectado, descartando email inmediatamente");
    return {
      intent: "Discard",
      confidence: 0.99,
      reasoning:
        "Email includes unsubscribe/opt-out style language or links (e.g., 'désabonner', 'unsubscribe', 'darse de baja'), so it is treated as a generic mailing and discarded regardless of other content.",
      meddic:
        "This is an opt-out or mailing management email, not a PR, barter, pricing, free coverage or partnership opportunity for our media network.".slice(
          0,
          250
        ),
      isFreeCoverage: false,
      isBarter: false,
      isPricing: false,
    };
  }
  const isPressStyle =
    pressReleaseRegex.test(mailText) ||
    prAssetsRegex.test(mailText) ||
    aboutBrandRegex.test(mailText) ||
    prFooterRegex.test(mailText);
  const mentionsEvent = eventKeywordsRegex.test(mailText);
  const isEventPrInfo = isPressStyle && mentionsEvent;
  const isCoverageRequest = coverageRequestRegex.test(mailText);
  const isExplicitFree = explicitFreeRegex.test(mailText);
  const hasEventInvite = eventInviteRegex.test(mailText);
  const hasCallOrMeetingInvite = callSlotsRegex.test(mailText);
  // isPricing ya está definido arriba (línea 368)
  const hasPartnershipCollabAsk =
    directPartnershipAskRegex.test(mailText) ||
    platformCollabRegex.test(mailText) ||
    contentCollabRegex.test(mailText);

  const hasBudgetKeywords =
    /(budget|fee\b|fees\b|commission|rev[-\s]?share|revenue share|flat fee|cpm\b|cpc\b|media spend|media budget|sponsorship package|amount of|per month|per year|contract value|minimum guarantee|minimum spend|rates|pricing|package deal|agency discount|discount)/.test(
      mailText
    );

  // Detect concrete scope: volume, frequency, quantity
  const hasConcreteScope =
    /(\d+\s+(articles?|posts?|pieces?|placements?|campaigns?|collaborations?))\s+(per\s+(month|week|year)|monthly|weekly|annually|ongoing)|(up to|up to|minimum|at least|around|approximately)\s+\d+\s+(articles?|posts?|pieces?|placements?)|(ongoing|regular|monthly|weekly)\s+(collaborations?|partnerships?|campaigns?)|(package|deal|discount)/.test(
      mailText
    );

  // Barter Request: Si hay cobertura request Y hay algo a cambio (invitación, servicio, etc.)
  // IMPORTANTE: Si hay algo a cambio, es Barter, NO Free Coverage
  // También: Si hay invitación a evento/prensa, asumir que es Barter (invitación a cambio de cobertura)
  // Detecta: "media invite", "press invite", "press passes", "press accreditation", "media are invited"
  const hasPressPassOrAccreditation = /(press pass|press accreditation|media pass|media accreditation|press credential|media credential)/i.test(mailText);
  const hasMediaInviteLanguage = /(media (are )?invited|press (are )?invited|reporters.*invited|photographers.*invited|broadcast media.*invited|media invite|press invite|media\/press invite)/i.test(mailText);
  
  const isBarterRequest =
    (isCoverageRequest && hasEventInvite) ||
    (hasEventInvite && (isPressStyle || isCoverageRequest || mentionsEvent)) ||
    (hasPressPassOrAccreditation && (isPressStyle || mentionsEvent || isCoverageRequest)) ||
    (hasMediaInviteLanguage && (isPressStyle || mentionsEvent)) ||
    /(in exchange for|a cambio de|in return for|te invitamos|we invite you|invitaci[oó]n|convite (à|a) imprensa)/.test(mailText);

  // Free Coverage Request: Incluye press releases, noticias compartidas, y peticiones directas de cobertura gratis
  // Si hay algo a cambio (invitación, servicio), NO es Free Coverage, es Barter
  const isFreeCoverageRequest = 
    (isPressStyle || isCoverageRequest || isEventPrInfo) && !isBarterRequest;
  
  // IMPORTANTE: Si es un press release/media release sin pedir pricing explícitamente, NO es pricing request
  // También excluir si están ofreciendo una historia/estudio/datos sin pedir pricing
  const isExplicitPricingRequest = isPricing && 
    !isPressStyle && 
    !/(media release|press release|nota de prensa|comunicado de prensa|story for|data study|report|offering.*story|sharing.*story|of interest for|would be of interest)/i.test(mailText);
  const isMediaKitPricingRequest = isExplicitPricingRequest;

  const hasAnyCommercialSignalForUs =
    hasPartnershipCollabAsk ||
    isMediaKitPricingRequest ||
    isBarterRequest ||
    isFreeCoverageRequest ||
    isPressStyle ||
    hasCallOrMeetingInvite;

  const saysNoCommercialIntent =
    /(no (clear )?(commercial|business|revenue[-\s]?generating) intent|no (real|meaningful) business opportunity|not (a )?(business|commercial|potential) (lead|opportunity)|not a potential lead|no potential (business )?lead|does not look like (a )?(lead|opportunity)|doesn't look like (a )?(lead|opportunity)|does not represent (a )?(deal|business opportunity|partnership)|purely (informational|transactional|operational)|just a notification|just an? (info|information) (email|message)|no sales intent|no buying intent|no purchase intent|no partnership intent|no collaboration intent|test email with no business context|test message with no business context|not a (real )?lead\b|should be discarded|should be classified as discard)/.test(
      reasoningLc
    );

  const bigBrandsRegex =
    /(coca[-\s]?cola|pepsi|nike\b|adidas\b|uber\b|bolt\b|amazon\b|google\b|meta\b|facebook\b|instagram\b|tiktok\b|spotify\b|netflix\b|airbnb\b|booking\.com|apple\b|samsung\b|microsoft\b|paypal\b|visa\b|mastercard\b|ubereats|doordash|deliveroo)/;

  const bigBrand = bigBrandsRegex.test(mailText);

  // Updated to detect >50k USD (per new specification)
  const largeBudgetRegex =
    /(50k|60k|70k|80k|90k|100k|200k|250k|300k|400k|500k|\b50\,000\b|\b60\,000\b|\b70\,000\b|\b80\,000\b|\b90\,000\b|\b100\,000\b|\b200\,000\b|\b250\,000\b|\b300\,000\b|\b50\.000\b|\b60\.000\b|\b70\.000\b|\b80\.000\b|\b90\.000\b|\b100\.000\b|\b200\.000\b|\b250\.000\b|\b300\.000\b|\€\s?50 ?000|\€\s?60 ?000|\€\s?70 ?000|\€\s?80 ?000|\€\s?90 ?000|\€\s?100 ?000|\$50,000|\$60,000|\$70,000|\$80,000|\$90,000|\$100,000|£50,000|£60,000|£70,000|£80,000|£90,000|£100,000|more than 50|m[aá]s de 50|over 50|above 50)/;

  const largeBudgetMention = largeBudgetRegex.test(mailText);

  const multiYearRegex =
    /(multi[-\s]?year|multi[-\s]?annual|3[-\s]?year|3[-\s]?years|five[-\s]?year|5[-\s]?year|long[-\s]?term|3-year|five-year|5-year)/;

  const multiMarketRegex =
    /(nationwide|country-wide|multi[-\s]?market|multi[-\s]?country|global campaign|international campaign)/;

  const hasTestKeyword =
    subjectLc.includes("test") ||
    subjectLc.includes("prueba") ||
    normalizedBody === "test" ||
    normalizedBody === "prueba" ||
    normalizedBody.startsWith("test ") ||
    normalizedBody.startsWith("prueba ");

  const appearsAsTestText =
    /(test email|test message|correo de prueba|email de prueba|mensaje de prueba)/.test(
      mailText
    );

  const isTestEmail = hasTestKeyword || appearsAsTestText;

  const isIgSender = /instagram\.com|facebookmail\.com/.test(fromLc);
  const notificationTextRegex =
    /(new login|we'?ve noticed a new login|security alert|unusual activity|password reset|verification code|your instagram post|is getting more comments than usual|more comments than usual|more likes than usual|view (updates|photos) on instagram|see what you'?ve missed on instagram|tienes \d+ notificaci[oó]n|tienes 1 notificaci[oó]n|ver las novedades de instagram)/;

  const isIgNotification = isIgSender && notificationTextRegex.test(mailText);

  console.log("[mfs] [classify] Flags básicos:", {
    modelIntentRaw,
    containsUnsubscribe,
    isPressStyle,
    isEventPrInfo,
    isCoverageRequest,
    isExplicitFree,
    hasEventInvite,
    hasCallOrMeetingInvite,
    isBarterRequest,
    isFreeCoverageRequest,
    isMediaKitPricingRequest: isExplicitPricingRequest,
    hasPartnershipCollabAsk,
    hasAnyCommercialSignalForUs,
    isTestEmail,
    isIgNotification,
  });

  // Regla dura: unsubscribe → Discard
  if (containsUnsubscribe) {
    return {
      intent: "Discard",
      confidence: 0.99,
      reasoning:
        "Email includes unsubscribe/opt-out style language, so it is treated as a generic mailing and discarded regardless of other signals.",
      meddic:
        "This is an opt-out or mailing management email, not a PR, barter, pricing, free coverage or partnership opportunity for our media network.".slice(
          0,
          250
        ),
      isFreeCoverage: false,
      isBarter: false,
      isPricing: false,
    };
  }

  let intent = null;
  let confidence = null;

  // Casos "ruido" claros → Discard
  // Email sin sentido o muy corto (solo saludo, sin contenido)
  const meaningfulContent = normalizedBody.replace(/^(bonjour|hello|hi|hola|buenos d[ií]as|buenas tardes|saludos|greetings|ciao|salut)[\s.,!]*$/i, "").trim();
  const isMeaninglessEmail = meaningfulContent.length < 20 && 
    !hasPartnershipCollabAsk && 
    !isPricing && 
    !isCoverageRequest && 
    !isPressStyle &&
    !hasEventInvite;
  
  if (isTestEmail) {
    intent = "Discard";
    confidence = 0.99;
    reasoning =
      "Internal or testing email with no business or partnership context, so it is discarded.";
  } else if (isIgNotification) {
    intent = "Discard";
    confidence = 0.99;
    reasoning =
      "Automated social network notification with no commercial or partnership intent, so it is discarded.";
  } else if (isMeaninglessEmail) {
    intent = "Discard";
    confidence = 0.95;
    reasoning = "Email contains no meaningful content (only greeting or very short message without business context).";
  } else if (saysNoCommercialIntent && !hasAnyCommercialSignalForUs) {
    intent = "Discard";
    confidence = 0.96;
    reasoning =
      "Model reasoning indicates this is not a PR, barter, pricing, free coverage or partnership opportunity and no strong signals contradict that.";
  }

  // REGLA DURA: Press Release SIEMPRE Low (antes de analizar partnership)
  if (!intent && isPressStyle) {
    intent = "Low";
    confidence = 0.8;
    reasoning = "Email is a press release, so it is categorized as Low intent (not Medium or higher).";
  }

  // STEP 2: Analyze Partnership Intent (per new specification)
  if (!intent) {
    // REGLA DURA: Si es press release, NO analizar partnership (ya es Low)
    if (isPressStyle) {
      intent = "Low";
      confidence = 0.8;
      reasoning = "Email is a press release, so it is categorized as Low intent (not Medium or higher).";
    } else if (hasPartnershipCollabAsk || (isMediaKitPricingRequest && hasPartnershipCollabAsk)) {
      // 2.a. Very High: long-term partnership OR very large brand OR >50k USD upfront
      if (
        multiYearRegex.test(mailText) ||
        multiMarketRegex.test(mailText) ||
        bigBrand ||
        largeBudgetMention
      ) {
        intent = "Very High";
        confidence = 0.86;
      } 
      // 2.b. High: clear partnership proposal with defined elements (budget range, fees, commissions, OR concrete scope, OR asking for pricing)
      // Concrete scope: volume (e.g., "5 articles per month"), frequency, campaign duration, number of placements
      // IMPORTANT: Si están pidiendo pricing/rates/press kit Y hablando de partnership, es High
      else if (hasBudgetKeywords || isMediaKitPricingRequest || hasConcreteScope) {
        intent = "High";
        confidence = 0.8;
      } 
      // 2.c. Medium: partnership intention but nothing clearly defined regarding final scope
      else {
        intent = "Medium";
        confidence = 0.72;
      }
    } 
    // STEP 3: If NO Partnership Intent (standalone pricing request without partnership mention)
    else if (isExplicitPricingRequest && !hasPartnershipCollabAsk) {
      // Pricing request without partnership intent: categorize based on context
      if (bigBrand) {
        intent = "Very High"; // Very large brand asking for pricing
        confidence = 0.85;
      } else if (hasConcreteScope) {
        intent = "High"; // Scope defined (volume, frequency) + asking for pricing = High
        confidence = 0.8;
      } else if (hasBudgetKeywords) {
        intent = "High"; // Budget/fee context + asking for pricing = High
        confidence = 0.8;
      } else {
        intent = "Medium"; // Just asking prices without more context
        confidence = 0.75;
      }
    } else if (isBarterRequest) {
      // 3.b. Barter Request → Low (invitación a evento a cambio de cobertura)
      intent = "Low";
      confidence = 0.65;
    } else if (isFreeCoverageRequest || (mentionsEvent && isPressStyle)) {
      // 3.a. Free Coverage Request → Low (incluye press releases, noticias compartidas, anuncios de eventos)
      intent = "Low";
      confidence = 0.65;
    } else if (hasCallOrMeetingInvite) {
      intent = "Low";
      confidence = 0.65;
    } else if (hasAnyCommercialSignalForUs) {
      // Fallback for other commercial signals
        intent = "Low";
        confidence = 0.6;
    }
  }

  // Fallback con intent del modelo
  const normalizedModelIntent = normalizeModelIntent(modelIntentRaw);

  if (!intent && normalizedModelIntent) {
    // Ser más estricto con "Medium" del modelo - requiere señales claras
    if (normalizedModelIntent === "Medium") {
      // Solo aceptar Medium si hay señales claras de partnership/comercial
      if (hasPartnershipCollabAsk || isMediaKitPricingRequest || hasCallOrMeetingInvite) {
        intent = "Medium";
        confidence = 0.7;
      } else if (isPressStyle) {
        // REGLA DURA: Press Release → SIEMPRE Low, no Medium
        intent = "Low";
        confidence = 0.75;
      } else if (isBarterRequest || isFreeCoverageRequest) {
        // PR, barter, free coverage → Low, no Medium
        intent = "Low";
        confidence = 0.65;
      } else {
        // Sin señales claras → descartar o Low según contexto
        intent = hasAnyCommercialSignalForUs ? "Low" : "Discard";
        confidence = hasAnyCommercialSignalForUs ? 0.65 : 0.85;
      }
    } else if (
      normalizedModelIntent === "Very High" &&
      !hasPartnershipCollabAsk &&
      !isMediaKitPricingRequest &&
      !largeBudgetMention &&
      !multiYearRegex.test(mailText) &&
      !multiMarketRegex.test(mailText)
    ) {
      intent = "High";
      confidence = 0.75;
    } else if (normalizedModelIntent === "Discard") {
      // Confiar más en Discard del modelo si no hay señales claras
      if (!hasPartnershipCollabAsk && !isMediaKitPricingRequest && 
          !isBarterRequest && !isFreeCoverageRequest && !hasCallOrMeetingInvite) {
        intent = "Discard";
        confidence = 0.85;
      } else {
        // Hay señales, no descartar
        intent = hasPartnershipCollabAsk || isMediaKitPricingRequest ? "Medium" : "Low";
        confidence = 0.7;
      }
    } else {
      // High, Low, Very High: usar directamente pero validar
      intent = normalizedModelIntent;
      confidence = confidence || 0.7;
    }

    // REGLA DURA: Si es press release, NUNCA cambiar a Medium aunque tenga partnership signals
    if (intent === "Low" && hasPartnershipCollabAsk && !isPressStyle) {
      intent = "Medium";
      confidence = 0.72;
    }
  }

  // Fallback final - ser más estricto
  if (!intent) {
    if (!hasAnyCommercialSignalForUs) {
      intent = "Discard";
      confidence = 0.9;
      reasoning =
        "Email does not fit PR, barter, pricing, free coverage or partnership patterns, so it is discarded.";
    } else if (hasPartnershipCollabAsk || isMediaKitPricingRequest) {
      // Solo Medium si hay señales CLARAS de partnership/comercial
      intent = "Medium";
      confidence = 0.7;
    } else if (isPressStyle) {
      // REGLA DURA: Press Release → SIEMPRE Low, no Medium
      intent = "Low";
      confidence = 0.75;
    } else if (isBarterRequest || isFreeCoverageRequest) {
      // PR, barter, free coverage → Low, no Medium
      intent = "Low";
      confidence = 0.65;
    } else {
      // Otras señales comerciales débiles → Low, no Medium
      intent = "Low";
      confidence = 0.65;
    }
  }

  // NUNCA Discard para PR, Barter, pricing, free coverage, calls, partnerships
  const neverDiscard =
    isFreeCoverageRequest ||
    isBarterRequest ||
    isMediaKitPricingRequest ||
    hasEventInvite ||
    hasCallOrMeetingInvite ||
    hasPartnershipCollabAsk;

  if (intent === "Discard" && neverDiscard) {
    // REGLA DURA: Si es press release, SIEMPRE Low (no Medium)
    if (isPressStyle) {
      intent = "Low";
      confidence = Math.max(confidence || 0.75, 0.75);
      reasoning = "Email is a press release, so it is categorized as Low intent (not Medium or higher).";
    } else if (hasPartnershipCollabAsk || isMediaKitPricingRequest) {
      intent = "Medium";
      confidence = Math.max(confidence || 0.7, 0.7);
    } else {
      intent = "Low";
      confidence = Math.max(confidence || 0.7, 0.7);
    }
    if (!isPressStyle) {
      reasoning =
        "Email contains PR, coverage, barter, pricing, meeting or partnership signals, so it is treated as a real opportunity instead of being discarded.";
    }
  }

  // Free Coverage Request (incluye press releases) SIEMPRE debe ser Low
  if (isFreeCoverageRequest && intent !== "Low") {
    intent = "Low";
    confidence = 0.65;
    if (!reasoning) {
      reasoning = "Email is a free coverage request (press release or news shared), categorized as Low intent.";
    }
  }

  // Low SOLO cuando haya alguna de las 4 columnas
  // REGLA DURA: Si es press release, NUNCA cambiar a Medium aunque no tenga flags
  const hasAnyAirtableFlag =
    isBarterRequest ||
    isMediaKitPricingRequest ||
    isFreeCoverageRequest ||
    isPressStyle; // Press release también cuenta como flag

  if (intent === "Low" && !hasAnyAirtableFlag && !isPressStyle) {
    intent = "Medium";
    confidence = Math.max(confidence || 0.7, 0.7);
  }

  // Combine model checkboxes with heuristic detection
  // IMPORTANT: Free Coverage and Barter are MUTUALLY EXCLUSIVE
  let finalFreeCoverage = modelFreeCoverage || isFreeCoverageRequest;
  let finalBarter = modelBarter || isBarterRequest;
  
  // Si ambos están marcados, priorizar Barter (si hay algo a cambio, no es "free")
  if (finalFreeCoverage && finalBarter) {
    finalFreeCoverage = false; // Si hay algo a cambio, no es free coverage
    console.log("[mfs] [classify] Free Coverage y Barter ambos detectados, priorizando Barter (hay algo a cambio)");
  }
  
  const finalPricing = modelPricing || isMediaKitPricingRequest;
  
  // Regla dura: Pricing/Media Kit Request SIEMPRE debe ser como mínimo High
  if (finalPricing) {
    const intentLevels = { "Discard": 0, "Low": 1, "Medium": 2, "High": 3, "Very High": 4 };
    const currentLevel = intentLevels[intent] || 0;
    const minLevel = intentLevels["High"]; // 3
    
    if (currentLevel < minLevel) {
      // Si el intent actual es menor que High, subirlo a High
      intent = "High";
      confidence = Math.max(confidence || 0.75, 0.75);
      if (!reasoning || reasoning.includes("Low") || reasoning.includes("Medium") || reasoning.includes("Discard")) {
        reasoning = "Email contains media kit or pricing request, categorized as High intent (minimum level for pricing inquiries).";
      }
    }
  }
  

  // MEDDIC: Use model values if available, otherwise generate fallbacks (only for non-Discard)
  let finalMeddicMetrics = meddicMetrics;
  let finalMeddicEconomicBuyer = meddicEconomicBuyer;
  let finalMeddicDecisionCriteria = meddicDecisionCriteria;
  let finalMeddicDecisionProcess = meddicDecisionProcess;
  let finalMeddicIdentifyPain = meddicIdentifyPain;
  let finalMeddicChampion = meddicChampion;

  if (intent !== "Discard") {
    // Generate fallbacks only if model didn't provide them
    if (!finalMeddicIdentifyPain) {
      if (isBarterRequest) {
        finalMeddicIdentifyPain = "Limited cash marketing budget is pushing them to trade invitations or experiences for exposure and coverage.";
    } else if (isFreeCoverageRequest) {
        finalMeddicIdentifyPain = "They rely on earned media and editorial exposure to boost awareness and attendance without strong paid media investment.";
    } else if (isMediaKitPricingRequest) {
        finalMeddicIdentifyPain = "Unclear media costs are blocking planning of campaigns, creating risk of delayed or suboptimal investment.";
    } else if (hasPartnershipCollabAsk) {
        finalMeddicIdentifyPain = "They lack a strong media or distribution partner to scale reach and engagement for their events, artists or experiences.";
    } else if (mailText.includes("ticket") || mailText.includes("event")) {
        finalMeddicIdentifyPain = "Insufficient reach is limiting event attendance and ticket revenue, prompting the search for stronger promotional partners.";
    } else if (mailText.includes("sponsor")) {
        finalMeddicIdentifyPain = "Brand visibility is lagging in key markets, prompting them to explore sponsorships and high-impact placements.";
    } else {
        finalMeddicIdentifyPain = "They are seeking partners to improve reach, engagement and efficiency of their marketing and commercial efforts.";
    }
  }

    // Limit total MEDDIC to 200 words (~1200 characters total across all fields)
    // Calculate total length and trim proportionally if needed
    const allMeddicText = [
      finalMeddicMetrics,
      finalMeddicEconomicBuyer,
      finalMeddicDecisionCriteria,
      finalMeddicDecisionProcess,
      finalMeddicIdentifyPain,
      finalMeddicChampion
    ].filter(Boolean).join(" ");
    
    const maxTotalChars = 1200; // ~200 words
    if (allMeddicText.length > maxTotalChars) {
      // Trim proportionally - keep Identify Pain (I) as priority, then others
      const ratio = maxTotalChars / allMeddicText.length;
      const trimLength = (text) => Math.floor((text || "").length * ratio);
      
      finalMeddicMetrics = (finalMeddicMetrics || "").slice(0, trimLength(finalMeddicMetrics));
      finalMeddicEconomicBuyer = (finalMeddicEconomicBuyer || "").slice(0, trimLength(finalMeddicEconomicBuyer));
      finalMeddicDecisionCriteria = (finalMeddicDecisionCriteria || "").slice(0, trimLength(finalMeddicDecisionCriteria));
      finalMeddicDecisionProcess = (finalMeddicDecisionProcess || "").slice(0, trimLength(finalMeddicDecisionProcess));
      finalMeddicIdentifyPain = (finalMeddicIdentifyPain || "").slice(0, Math.min(trimLength(finalMeddicIdentifyPain) + 50, (finalMeddicIdentifyPain || "").length)); // Prioritize I
      finalMeddicChampion = (finalMeddicChampion || "").slice(0, trimLength(finalMeddicChampion));
    }
  } else {
    // Discard: empty all MEDDIC fields
    finalMeddicMetrics = "";
    finalMeddicEconomicBuyer = "";
    finalMeddicDecisionCriteria = "";
    finalMeddicDecisionProcess = "";
    finalMeddicIdentifyPain = "";
    finalMeddicChampion = "";
  }

  // Reasoning coherente
  if (!reasoning) {
    reasoning = defaultReasoningForIntent(intent);
  }

  reasoningLc = (reasoning || "").toLowerCase();
  const reasoningLooksDiscard =
    /(discard|not a (real )?lead|no (commercial|business) intent|purely informational|just a notification|no business opportunity|should be discarded)/.test(
      reasoningLc
    );

  if (intent === "Discard" && !reasoningLooksDiscard) {
    reasoning = defaultReasoningForIntent("Discard");
  } else if (intent !== "Discard" && reasoningLooksDiscard) {
    reasoning = defaultReasoningForIntent(intent);
  }

  console.log("[mfs] [classify] Resultado final de clasificación:", {
    intent,
    confidence,
    finalFreeCoverage,
    finalBarter,
    finalPricing,
    hasPartnershipCollabAsk,
  });

  return {
    intent,
    confidence,
    reasoning,
    meddicMetrics: finalMeddicMetrics,
    meddicEconomicBuyer: finalMeddicEconomicBuyer,
    meddicDecisionCriteria: finalMeddicDecisionCriteria,
    meddicDecisionProcess: finalMeddicDecisionProcess,
    meddicIdentifyPain: finalMeddicIdentifyPain,
    meddicChampion: finalMeddicChampion,
    isFreeCoverage: finalFreeCoverage,
    isBarter: finalBarter,
    isPricing: finalPricing,
  };
}

