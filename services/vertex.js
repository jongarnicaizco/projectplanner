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
  // Detección mejorada de press release - incluye variantes en múltiples idiomas
  const pressReleaseRegex =
    /(nota de prensa|ndp[\s_:]|ndp\b|press release|news release|comunicado de prensa|press kit|communiqu[ée] de presse|communiqu[ée] de presse|media release|comunicado|press note|press statement)/i;

  const prAssetsRegex =
    /(descarga de im[aá]genes|download (the )?images|download photos|press photos|media assets|descarga de siluetas)/;

  const prFooterRegex =
    /(departamento de comunicaci[oó]n|dpto\. de comunicaci[oó]n|press office|press contact|pr agency|agencia de comunicaci[oó]n|gabinete de prensa|press@|media@|atendimento (à|a) imprensa|atendimento à imprensa|atendimento a imprensa|atendimento imprensa|atendimento à mídia|atendimento a mídia|atendimento mídia)/i;

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
    // Rate card / media kit requests - only when explicitly asking for ours
    // Exclude when they're sharing their own media kit (e.g., "Media Kit: https://drive.google.com")
    /(rate card|ratecard)/i,
    // Media kit/press kit only when in a request context (asking for ours, not sharing theirs)
    /(your (media kit|press kit|mediakit))/i,
    /((send|share|provide|give|need|want|request|solicitar|pedir).*?(media kit|press kit|mediakit))/i,
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
    /(advertise (with you|on your (site|app|platform|page))|run (a )?campaign with you|use your (platform|app|site) to (sell tickets|promote our events)|ticketing partner for our events|use your ticketing solution|use your services for (ticketing|marketing|promotion)|(solicitar|solicitamos|pedir|pedimos|queremos|quisi[ée]ramos) (informaci[oó]n|info) (para|sobre|acerca de) (publicitar|publicidad|advertise|advertising|anunciar|anuncio)|(informaci[oó]n|info) (para|sobre|acerca de) (publicitar|publicidad|advertise|advertising|anunciar|anuncio) (en|on) (su|vuestra|vuestro|your) (p[aá]gina|site|platform|app|medio|publicaci[oó]n)|publicitar (mi|nuestro|nuestra|my|our) (restaurante|negocio|empresa|business|brand|marca) (en|on) (su|vuestra|vuestro|your) (p[aá]gina|site|platform|app|medio|publicaci[oó]n))/;

  const contentCollabRegex =
    /(pitch (some )?content\b|creat(e|ing) (a )?post (for|on) your (site|blog|website|page)|guest post\b|write a guest post|guest article|creat(e|ing) (some )?content for your (site|blog|website|publication|magazine|channels|audience)|we('?d)? love [^.!?\n]{0,80} to create (some )?content\b|shoot (some )?content (together|with you)|content (collab|collaboration|partnership))/;

  // Detecciones
  // Detección mejorada de press release - múltiples indicadores
  const isPressStyle =
    pressReleaseRegex.test(mailText) ||
    prAssetsRegex.test(mailText) ||
    aboutBrandRegex.test(mailText) ||
    prFooterRegex.test(mailText) ||
    // Patrones adicionales comunes en press releases
    /(communiqu[ée] de presse|communiqu[ée] de presse)/i.test(mailText) ||
    // Si el subject o inicio del body contiene "Press Release" o equivalente
    /^(press release|communiqu[ée] de presse|nota de prensa|comunicado de prensa)/i.test(subjectLc) ||
    /^(press release|communiqu[ée] de presse|nota de prensa|comunicado de prensa)/i.test(bodyTextForSearch.slice(0, 200));
  
  // Log para debugging
  if (isPressStyle) {
    console.log("[mfs] [classify] Press release detectado:", {
      pressReleaseRegex: pressReleaseRegex.test(mailText),
      prAssetsRegex: prAssetsRegex.test(mailText),
      aboutBrandRegex: aboutBrandRegex.test(mailText),
      prFooterRegex: prFooterRegex.test(mailText),
    });
  }
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

  // Detect concrete scope: volume, frequency, quantity, specific deliverables, duration, revisions
  const hasConcreteScope =
    /(\d+\s+(articles?|posts?|pieces?|placements?|campaigns?|collaborations?|videos?|rounds?))\s+(per\s+(month|week|year)|monthly|weekly|annually|ongoing)|(up to|up to|minimum|at least|around|approximately)\s+\d+\s+(articles?|posts?|pieces?|placements?|videos?|rounds?)|(ongoing|regular|monthly|weekly)\s+(collaborations?|partnerships?|campaigns?)|(package|deal|discount)|(\d+[-\s]?\d+\s+(minute|min|hour|day|week|month|year)[-\s]?(video|draft|content|post|article))|(\d+[-\s]?\d+\s+rounds?\s+(of\s+)?(revisions?|edits?|changes?))|(\d+[-\s]?\d+[-\s]?day\s+(ad\s+)?code)|(specific\s+(deliverables?|requirements?|scope))/.test(
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

  // Free Coverage Request: Incluye press releases, noticias compartidas, guest articles/posts, y peticiones directas de cobertura gratis
  // Si hay algo a cambio (invitación, servicio), NO es Free Coverage, es Barter
  // IMPORTANTE: Guest articles/posts sin mencionar partnership/comercial son Free Coverage Request
  const isGuestArticleRequest = /(guest (post|article|content)|write a guest (post|article)|contribute a guest (post|article)|we'?d love to contribute|we'?d love to write|high-quality.*guest|original guest)/i.test(mailText) && 
    !hasPartnershipCollabAsk && 
    !isPricing && 
    !/(partnership|collaboration|advertising|sponsorship|paid|budget|fee|rate|pricing)/i.test(mailText);
  
  const isFreeCoverageRequest = 
    (isPressStyle || isCoverageRequest || isEventPrInfo || isGuestArticleRequest) && !isBarterRequest;
  
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

  // Updated to detect >20k EUR/USD (per new specification)
  const largeBudgetRegex =
    /(20k|25k|30k|35k|40k|45k|50k|60k|70k|80k|90k|100k|200k|250k|300k|400k|500k|\b20\,000\b|\b25\,000\b|\b30\,000\b|\b35\,000\b|\b40\,000\b|\b45\,000\b|\b50\,000\b|\b60\,000\b|\b70\,000\b|\b80\,000\b|\b90\,000\b|\b100\,000\b|\b200\,000\b|\b250\,000\b|\b300\,000\b|\b20\.000\b|\b25\.000\b|\b30\.000\b|\b35\.000\b|\b40\.000\b|\b45\.000\b|\b50\.000\b|\b60\.000\b|\b70\.000\b|\b80\.000\b|\b90\.000\b|\b100\.000\b|\b200\.000\b|\b250\.000\b|\b300\.000\b|\€\s?20 ?000|\€\s?25 ?000|\€\s?30 ?000|\€\s?35 ?000|\€\s?40 ?000|\€\s?45 ?000|\€\s?50 ?000|\€\s?60 ?000|\€\s?70 ?000|\€\s?80 ?000|\€\s?90 ?000|\€\s?100 ?000|\$20,000|\$25,000|\$30,000|\$35,000|\$40,000|\$45,000|\$50,000|\$60,000|\$70,000|\$80,000|\$90,000|\$100,000|£20,000|£25,000|£30,000|£35,000|£40,000|£45,000|£50,000|£60,000|£70,000|£80,000|£90,000|£100,000|more than 20|m[aá]s de 20|over 20|above 20)/;

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

  // Detección de apuestas, casinos y temas relacionados de gambling
  const gamblingKeywordsRegex = /(apuestas|betting|casino|casinos|sports betting|sportsbook|bookmaker|bookmakers|poker|póker|gambling|juegos de azar|juego de azar|ruleta|blackjack|baccarat|slots|tragamonedas|máquinas tragaperras|bet|bets|apostar|apuesta|apostamos|apostar en|betting platform|betting site|casino online|online casino|casino en línea|casino virtual|promoción de casino|promoción de apuestas|promo de casino|promo de apuestas|publicidad de casino|publicidad de apuestas|anunciar casino|anunciar apuestas|promover casino|promover apuestas|colaboración casino|colaboración apuestas|partnership casino|partnership apuestas|sponsorship casino|sponsorship apuestas|patrocinio casino|patrocinio apuestas)/i;
  
  const isGamblingRelated = gamblingKeywordsRegex.test(mailText);

  // Detección de firmas automáticas de email clients (Outlook, Gmail, etc.)
  // Estas firmas indican que el email es principalmente una firma automática sin contenido real
  const automaticEmailSignatureRegex = /(envoy[ée] (à partir de|depuis|from)|sent (from|via)|enviado (desde|desde)|enviado (a partir de|desde)|get outlook (for|para)|outlook (pour|for|para) (android|ios|iphone|ipad)|outlook (pour|for|para) (android|ios|iphone|ipad)|aka\.ms\/[a-zA-Z0-9]+|get (outlook|gmail) (for|para)|download (outlook|gmail)|obtener (outlook|gmail))/i;
  
  // Verificar si el email es principalmente una firma automática
  // Si el body contiene principalmente la firma automática (más del 50% del contenido es la firma)
  const hasAutomaticSignature = automaticEmailSignatureRegex.test(mailText);
  const bodyLength = normalizedBody.length;
  const signatureMatch = mailText.match(automaticEmailSignatureRegex);
  const signatureLength = signatureMatch ? signatureMatch[0].length : 0;
  // Si el email es muy corto (< 100 caracteres) y contiene una firma automática, es probable que sea solo la firma
  const isOnlyAutomaticSignature = hasAutomaticSignature && (bodyLength < 100 || (signatureLength / bodyLength) > 0.3);

  const isIgSender = /instagram\.com|facebookmail\.com/.test(fromLc);
  const notificationTextRegex =
    /(new login|we'?ve noticed a new login|security alert|unusual activity|password reset|verification code|your instagram post|is getting more comments than usual|more comments than usual|more likes than usual|view (updates|photos) on instagram|see what you'?ve missed on instagram|tienes \d+ notificaci[oó]n|tienes 1 notificaci[oó]n|ver las novedades de instagram)/;

  const isIgNotification = isIgSender && notificationTextRegex.test(mailText);

  // Detección de newsletters/emails de marketing que deben ser Discard
  // Características: unsubscribe links, tracking links, "updates & insights", contenido promocional sin solicitud directa
  const newsletterKeywordsRegex = /(unsubscribe|unsubscribe preferences|manage your preferences|update your preferences|email preferences|subscription preferences|you're receiving this because|you received this email|update email preferences|change email preferences|stop receiving|opt[-\s]?out|darse de baja|cancelar suscripci[oó]n)/i;
  const trackingLinkPattern = /(links\.|tracking|utm_source|utm_medium|utm_campaign|click tracking|email tracking)/i;
  const newsletterSubjectPattern = /(new activity|updates & insights|weekly update|monthly update|newsletter|news digest|roundup|summary|insights|updates)/i;
  const promotionalContentPattern = /(new buyers|businesses similar|valuation|indicative valuation|sell now|list your business|schedule a call|business advisor)/i;
  
  // Detectar si es newsletter/marketing: tiene unsubscribe Y (tracking links O subject/newsletter pattern O contenido promocional sin solicitud directa)
  const hasUnsubscribeLink = newsletterKeywordsRegex.test(mailText);
  const hasTrackingLinks = trackingLinkPattern.test(mailText);
  const hasNewsletterSubject = newsletterSubjectPattern.test(subjectLc);
  const hasPromotionalContent = promotionalContentPattern.test(mailText);
  
  // Es newsletter si tiene unsubscribe Y además tiene características de newsletter (tracking, subject pattern, o contenido promocional sin partnership/pricing request)
  const isNewsletterOrMarketing = hasUnsubscribeLink && 
    (hasTrackingLinks || hasNewsletterSubject || (hasPromotionalContent && !hasPartnershipCollabAsk && !isPricing && !isCoverageRequest));

  console.log("[mfs] [classify] Flags básicos:", {
    modelIntentRaw,
    isPressStyle,
    isEventPrInfo,
    isCoverageRequest,
    isExplicitFree,
    hasEventInvite,
    hasCallOrMeetingInvite,
    isBarterRequest,
    isFreeCoverageRequest,
    isGuestArticleRequest,
    isMediaKitPricingRequest: isExplicitPricingRequest,
    hasPartnershipCollabAsk,
    hasAnyCommercialSignalForUs,
    isTestEmail,
    isIgNotification,
    isNewsletterOrMarketing,
  });

  let intent = null;
  let confidence = null;

  // Casos "ruido" claros → Discard
  // REGLA: Solo descartar si NO tiene intención comercial (partnership/publicidad) Y además NO es barter, free coverage o pricing request
  // Email sin sentido o muy corto (solo saludo, sin contenido)
  const meaningfulContent = normalizedBody.replace(/^(bonjour|hello|hi|hola|buenos d[ií]as|buenas tardes|saludos|greetings|ciao|salut)[\s.,!]*$/i, "").trim();
  const isMeaninglessEmail = meaningfulContent.length < 20 && 
    !hasPartnershipCollabAsk && 
    !isPricing && 
    !isCoverageRequest && 
    !isPressStyle &&
    !hasEventInvite &&
    !isBarterRequest &&
    !isFreeCoverageRequest;
  
  // REGLA DURA: Firmas automáticas de email clients SIEMPRE Discard (verificación temprana, máxima prioridad)
  if (isOnlyAutomaticSignature || (hasAutomaticSignature && bodyLength < 150)) {
    intent = "Discard";
    confidence = 0.99;
    reasoning = "Email contains primarily an automatic email client signature (Outlook, Gmail, etc.) with no meaningful business content, so it is discarded.";
  } 
  // REGLA DURA: Gambling/Betting/Casino related requests SIEMPRE Discard (verificación temprana, máxima prioridad)
  else if (isGamblingRelated) {
    intent = "Discard";
    confidence = 0.99;
    reasoning = "Email is requesting promotions, partnerships, or advertising related to gambling, betting, or casinos. These requests are always categorized as Discard, regardless of pricing or partnership mentions.";
  } 
  // REGLA DURA: Newsletters/emails de marketing SIEMPRE Discard (verificación temprana, máxima prioridad)
  else if (isNewsletterOrMarketing) {
    intent = "Discard";
    confidence = 0.99;
    reasoning = "Email is a newsletter or marketing email (contains unsubscribe link and promotional content without direct business request), so it is discarded.";
  } else if (isBarterRequest) {
    intent = "Low";
    confidence = 0.8;
    reasoning = "Email is a barter request (invitation or service in exchange for coverage), categorized as Low intent (not Discard, Medium, High, or Very High).";
  } else if (isTestEmail) {
    intent = "Discard";
    confidence = 0.99;
    reasoning =
      "Internal or testing email with no business or partnership context, so it is discarded.";
  } else if (isIgNotification) {
    intent = "Discard";
    confidence = 0.99;
    reasoning =
      "Automated social network notification with no commercial or partnership intent, so it is discarded.";
  } else if (isMeaninglessEmail && !hasAnyCommercialSignalForUs) {
    // Solo descartar si es muy corto Y además no tiene señales comerciales (partnership, pricing, barter, free coverage)
    intent = "Discard";
    confidence = 0.95;
    reasoning = "Email contains no meaningful content (only greeting or very short message) and shows no commercial intent (partnership, advertising, pricing request, barter, or free coverage request).";
  } else if (saysNoCommercialIntent && !hasAnyCommercialSignalForUs) {
    // Solo descartar si el modelo dice que no hay intención comercial Y no hay señales que lo contradigan
    intent = "Discard";
    confidence = 0.96;
    reasoning =
      "Email shows no commercial intent (partnership, advertising, pricing request, barter, or free coverage request), so it is discarded.";
  }

  // REGLA DURA: Press Release, Free Coverage Request o Barter Request SIEMPRE Low (antes de analizar partnership)
  if (!intent && (isPressStyle || isFreeCoverageRequest || isBarterRequest)) {
    intent = "Low";
    confidence = 0.8;
    if (isPressStyle) {
      reasoning = "Email is a press release, so it is categorized as Low intent (not Medium or higher).";
    } else {
      reasoning = "Email is a free coverage request, so it is categorized as Low intent (not Medium or higher).";
    }
  }

  // STEP 2: Analyze Partnership Intent (per new specification)
  if (!intent) {
    // REGLA DURA: Si es press release, NO analizar partnership (ya es Low)
    if (isPressStyle) {
      intent = "Low";
      confidence = 0.8;
      reasoning = "Email is a press release, so it is categorized as Low intent (not Medium or higher).";
    } else if (hasPartnershipCollabAsk || (isMediaKitPricingRequest && hasPartnershipCollabAsk)) {
      // 2.a. Very High: long-term partnership OR very large brand OR >20k EUR/USD upfront
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
      // REGLA DURA: Si es press release, free coverage request o barter request, NO puede ser Medium
      else {
        if (isPressStyle || isFreeCoverageRequest || isBarterRequest) {
          intent = "Low";
          confidence = 0.8;
          if (isPressStyle) {
            reasoning = "Email is a press release, so it is categorized as Low intent (not Medium or higher).";
          } else if (isFreeCoverageRequest) {
            reasoning = "Email is a free coverage request, so it is categorized as Low intent (not Medium or higher).";
          } else {
            reasoning = "Email is a barter request, so it is categorized as Low intent (not Medium or higher).";
          }
        } else {
          intent = "Medium";
          confidence = 0.72;
        }
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
        // REGLA DURA: Si es barter request, NO puede ser Medium
        if (isBarterRequest) {
          intent = "Low";
          confidence = 0.75;
          reasoning = "Email is a barter request, so it is categorized as Low intent (not Medium or higher).";
        } else {
          intent = "Medium"; // Just asking prices without more context
          confidence = 0.75;
        }
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
      // REGLA DURA: Si es press release, free coverage request o barter request, SIEMPRE Low (nunca Medium)
      if (isPressStyle || isFreeCoverageRequest || isBarterRequest) {
        intent = "Low";
        confidence = 0.8;
        if (isPressStyle) {
          reasoning = "Email is a press release, so it is categorized as Low intent (not Medium or higher).";
        } else if (isFreeCoverageRequest) {
          reasoning = "Email is a free coverage request, so it is categorized as Low intent (not Medium or higher).";
        } else {
          reasoning = "Email is a barter request, so it is categorized as Low intent (not Medium or higher).";
        }
      } else if (hasPartnershipCollabAsk || isMediaKitPricingRequest || hasCallOrMeetingInvite) {
        // Solo aceptar Medium si hay señales claras de partnership/comercial Y NO es press release/free coverage/barter
        intent = "Medium";
        confidence = 0.7;
      } else if (isBarterRequest) {
        // Barter → Low, no Medium
        intent = "Low";
        confidence = 0.65;
      } else {
        // Sin señales claras → descartar solo si NO tiene intención comercial Y además NO es barter, free coverage o pricing request
        if (!hasAnyCommercialSignalForUs) {
          intent = "Discard";
          confidence = 0.85;
          reasoning = "Email shows no commercial intent (partnership, advertising, pricing request, barter, or free coverage request), so it is discarded.";
        } else {
          intent = "Low";
          confidence = 0.65;
        }
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
        // REGLA DURA: Si es press release, free coverage request o barter request, SIEMPRE Low (nunca Medium)
        if (isPressStyle || isFreeCoverageRequest || isBarterRequest) {
          intent = "Low";
          confidence = 0.8;
          if (isPressStyle) {
            reasoning = "Email is a press release, so it is categorized as Low intent (not Medium or higher).";
          } else if (isFreeCoverageRequest) {
            reasoning = "Email is a free coverage request, so it is categorized as Low intent (not Medium or higher).";
          } else {
            reasoning = "Email is a barter request, so it is categorized as Low intent (not Medium or higher).";
          }
        } else {
          intent = hasPartnershipCollabAsk || isMediaKitPricingRequest ? "Medium" : "Low";
          confidence = 0.7;
        }
      }
    } else {
      // High, Low, Very High: usar directamente pero validar
      intent = normalizedModelIntent;
      confidence = confidence || 0.7;
    }

    // REGLA DURA: Si es press release, Free Coverage Request o Barter Request, NUNCA cambiar a Medium aunque tenga partnership signals
    if (intent === "Low" && hasPartnershipCollabAsk && !isPressStyle && !isFreeCoverageRequest && !isBarterRequest) {
      intent = "Medium";
      confidence = 0.72;
    }
    
    // REGLA DURA: Si el modelo dice High/Very High/Medium pero es press release, Free Coverage Request o Barter Request, forzar Low
    if ((isPressStyle || isFreeCoverageRequest || isBarterRequest) && (intent === "High" || intent === "Very High" || intent === "Medium")) {
      console.log("[mfs] [classify] FORZANDO Low para press release/Free Coverage Request/Barter Request (modelo dijo:", intent, ")");
      intent = "Low";
      confidence = 0.8;
      if (isPressStyle) {
        reasoning = "Email is a press release, so it is categorized as Low intent (not Medium, High, or Very High).";
      } else if (isFreeCoverageRequest) {
        reasoning = "Email is a free coverage request, so it is categorized as Low intent (not Medium, High, or Very High).";
      } else {
        reasoning = "Email is a barter request, so it is categorized as Low intent (not Medium, High, or Very High).";
      }
    }
  }

  // Fallback final - ser más estricto
  if (!intent) {
    // REGLA DURA: Press Release, Free Coverage Request o Barter Request → SIEMPRE Low (verificación temprana en fallback)
    if (isPressStyle || isFreeCoverageRequest || isBarterRequest) {
      intent = "Low";
      confidence = 0.8;
      if (isPressStyle) {
        reasoning = "Email is a press release, so it is categorized as Low intent (not Medium or higher).";
      } else if (isFreeCoverageRequest) {
        reasoning = "Email is a free coverage request, so it is categorized as Low intent (not Medium or higher).";
      } else {
        reasoning = "Email is a barter request, so it is categorized as Low intent (not Medium or higher).";
      }
    } else if (hasPartnershipCollabAsk || isMediaKitPricingRequest) {
      // Solo Medium si hay señales CLARAS de partnership/comercial Y NO es barter request
      if (isBarterRequest) {
        intent = "Low";
        confidence = 0.75;
        reasoning = "Email is a barter request, so it is categorized as Low intent (not Medium or higher).";
      } else {
        intent = "Medium";
        confidence = 0.7;
      }
    } else if (isBarterRequest) {
      // Barter → Low, no Medium
      intent = "Low";
      confidence = 0.75;
    } else if (!hasAnyCommercialSignalForUs) {
      // REGLA: Discard solo si NO tiene intención comercial (partnership/publicidad) Y además NO es barter, free coverage o pricing request
      intent = "Discard";
      confidence = 0.9;
      reasoning =
        "Email shows no commercial intent (partnership, advertising, pricing request, barter, or free coverage request), so it is discarded.";
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
    // REGLA DURA: Si es press release, Free Coverage Request o Barter Request, SIEMPRE Low (no Medium)
    if (isPressStyle || isFreeCoverageRequest || isBarterRequest) {
      intent = "Low";
      confidence = Math.max(confidence || 0.8, 0.8);
      if (isPressStyle) {
        reasoning = "Email is a press release, so it is categorized as Low intent (not Medium or higher).";
      } else if (isFreeCoverageRequest) {
        reasoning = "Email is a free coverage request, so it is categorized as Low intent (not Medium or higher).";
      } else {
        reasoning = "Email is a barter request, so it is categorized as Low intent (not Medium or higher).";
      }
    } else if (hasPartnershipCollabAsk || isMediaKitPricingRequest) {
      // REGLA DURA: Si es barter request, NO puede ser Medium
      if (isBarterRequest) {
        intent = "Low";
        confidence = Math.max(confidence || 0.8, 0.8);
        reasoning = "Email is a barter request, so it is categorized as Low intent (not Medium or higher).";
      } else {
        intent = "Medium";
        confidence = Math.max(confidence || 0.7, 0.7);
        reasoning =
          "Email contains PR, coverage, barter, pricing, meeting or partnership signals, so it is treated as a real opportunity instead of being discarded.";
      }
    } else {
      intent = "Low";
      confidence = Math.max(confidence || 0.7, 0.7);
      reasoning =
        "Email contains PR, coverage, barter, pricing, meeting or partnership signals, so it is treated as a real opportunity instead of being discarded.";
    }
  }

  // REGLA DURA: Free Coverage Request (incluye press releases) SIEMPRE debe ser Low
  // Esta regla debe ejecutarse ANTES de cualquier otra lógica que pueda cambiar el intent
  if (isFreeCoverageRequest) {
    if (intent !== "Low" && intent !== "Discard") {
      console.log("[mfs] [classify] FORZANDO Low para Free Coverage Request (intent actual era:", intent, ")");
      intent = "Low";
      confidence = Math.max(confidence || 0.75, 0.75);
      reasoning = "Email is a free coverage request (press release or news shared), categorized as Low intent (not Medium or higher).";
    } else if (intent === "Low") {
      // Asegurar que el confidence sea alto para Free Coverage Request
      confidence = Math.max(confidence || 0.75, 0.75);
    }
  }

  // Low SOLO cuando haya alguna de las 4 columnas
  // REGLA DURA: Si es press release o Free Coverage Request, NUNCA cambiar a Medium aunque no tenga flags
  const hasAnyCheckboxFlag =
    isBarterRequest ||
    isMediaKitPricingRequest ||
    isFreeCoverageRequest ||
    isPressStyle; // Press release también cuenta como flag

  // REGLA DURA: NUNCA cambiar a Medium si es press release, free coverage request o barter request
  if (intent === "Low" && !hasAnyCheckboxFlag && !isPressStyle && !isFreeCoverageRequest && !isBarterRequest) {
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
  
  // REGLA DURA: Si finalFreeCoverage es true (modelo o heurística), SIEMPRE Low
  // Esta verificación debe ejecutarse DESPUÉS de combinar modelo + heurística
  if (finalFreeCoverage && intent !== "Low" && intent !== "Discard") {
    console.log("[mfs] [classify] FORZANDO Low para finalFreeCoverage (intent actual era:", intent, ", modelFreeCoverage:", modelFreeCoverage, ", isFreeCoverageRequest:", isFreeCoverageRequest, ")");
    intent = "Low";
    confidence = Math.max(confidence || 0.8, 0.8);
    reasoning = "Email is a free coverage request (press release or news shared), categorized as Low intent (not Medium, High, or Very High).";
  }
  
  // REGLA DURA: Si finalBarter es true (modelo o heurística), SIEMPRE Low
  // Esta verificación debe ejecutarse DESPUÉS de combinar modelo + heurística
  if (finalBarter && intent !== "Low" && intent !== "Discard") {
    console.log("[mfs] [classify] FORZANDO Low para finalBarter (intent actual era:", intent, ", modelBarter:", modelBarter, ", isBarterRequest:", isBarterRequest, ")");
    intent = "Low";
    confidence = Math.max(confidence || 0.8, 0.8);
    reasoning = "Email is a barter request (invitation or service in exchange for coverage), categorized as Low intent (not Medium, High, or Very High).";
  }
  
  const finalPricing = modelPricing || isMediaKitPricingRequest;
  
  // Regla dura: Pricing/Media Kit Request SIEMPRE debe ser como mínimo High
  // EXCEPCIÓN: Si es press release o Free Coverage Request, NO aplicar esta regla (siempre es Low)
  if (finalPricing && !isPressStyle && !isFreeCoverageRequest) {
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

  // REGLA DURA FINAL: Press Release, Free Coverage Request o Barter Request SIEMPRE Low (última verificación antes de retornar)
  // Esta es la verificación más importante - sobrescribe cualquier otra lógica, INCLUYENDO Discard
  // Usar finalFreeCoverage y finalBarter (combinación de modelo + heurística) para detectar
  // EXCEPCIÓN: Si el email es para secretmedia@feverup.com, NO aplicar esta regla (debe ser mínimo Medium)
  const toEmail = (to || "").toLowerCase().trim();
  const isSecretMediaEmail = toEmail.includes("secretmedia@feverup.com");
  
  if (isPressStyle || isFreeCoverageRequest || finalFreeCoverage || isBarterRequest || finalBarter) {
    // Si es para secretmedia@feverup.com, NO forzar a Low (se aplicará la regla de mínimo Medium después)
    if (!isSecretMediaEmail) {
      if (intent === "Discard" || intent !== "Low") {
        console.log("[mfs] [classify] FORZANDO Low para press release/Free Coverage Request/Barter Request (intent actual era:", intent, ", isPressStyle:", isPressStyle, ", isFreeCoverageRequest:", isFreeCoverageRequest, ", finalFreeCoverage:", finalFreeCoverage, ", isBarterRequest:", isBarterRequest, ", finalBarter:", finalBarter, ")");
        intent = "Low";
        confidence = Math.max(confidence || 0.8, 0.8);
        if (isPressStyle) {
          reasoning = "Email is a press release, so it is categorized as Low intent (not Discard, Medium, High, or Very High).";
        } else if (isFreeCoverageRequest || finalFreeCoverage) {
          reasoning = "Email is a free coverage request (press release or news shared), categorized as Low intent (not Discard, Medium, High, or Very High).";
        } else {
          reasoning = "Email is a barter request (invitation or service in exchange for coverage), categorized as Low intent (not Discard, Medium, High, or Very High).";
        }
      }
    } else {
      console.log("[mfs] [classify] Email a secretmedia@feverup.com detectado como Free Coverage/Barter, pero NO forzando a Low (se aplicará mínimo Medium)");
    }
  }

  // REGLA DURA FINAL: Emails enviados a secretmedia@feverup.com SIEMPRE deben ser como mínimo Medium
  // Esta regla se aplica AL FINAL, después de TODAS las demás reglas, para tener máxima prioridad
  // Incluso si es Free Coverage o Barter, si es para secretmedia@feverup.com, debe ser Medium como mínimo
  if (isSecretMediaEmail) {
    const intentLevels = { "Discard": 0, "Low": 1, "Medium": 2, "High": 3, "Very High": 4 };
    const currentLevel = intentLevels[intent] || 0;
    const minLevel = intentLevels["Medium"]; // 2
    
    if (currentLevel < minLevel) {
      console.log("[mfs] [classify] FORZANDO Medium para email a secretmedia@feverup.com (intent actual era:", intent, ", nivel:", currentLevel, ")");
      intent = "Medium";
      confidence = Math.max(confidence || 0.75, 0.75);
      if (!reasoning || reasoning.length === 0) {
        reasoning = "Email sent to secretmedia@feverup.com, minimum classification is Medium.";
      } else {
        reasoning = reasoning + " Email sent to secretmedia@feverup.com, minimum classification is Medium.";
      }
    } else {
      // Si ya es Medium o mayor, asegurar que el confidence sea alto
      console.log("[mfs] [classify] Email a secretmedia@feverup.com con intent:", intent, "(ya es Medium o mayor, nivel:", currentLevel, ")");
      confidence = Math.max(confidence || 0.75, 0.75);
    }
  }

  console.log("[mfs] [classify] Resultado final de clasificación:", {
    intent,
    confidence,
    finalFreeCoverage,
    finalBarter,
    finalPricing,
    hasPartnershipCollabAsk,
    isPressStyle,
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

