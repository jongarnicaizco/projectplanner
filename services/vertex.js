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
  let modelPrInvitation = false;
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
      if (parsed.pr_invitation !== undefined) {
        modelPrInvitation = Boolean(parsed.pr_invitation);
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
    modelPrInvitation,
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
  const mailText = `${subject || ""}\n${body || ""}`.toLowerCase();
  const fromLc = (from || "").toLowerCase();
  const subjectLc = (subject || "").toLowerCase();
  const normalizedBody = (body || "").toLowerCase().replace(/\s+/g, " ").trim();
  let reasoningLc = (reasoning || "").toLowerCase();

  // Regex patterns
  const unsubscribeRegex =
    /(unsubscribe|opt[-\s]?out|manage preferences|update your preferences|leave this list|darse de baja|cancelar suscripci[oó]n|si no quieres recibir m[aá]s correos|no deseas recibir estos correos electr[oó]nicos|gestionar preferencias|se d[ée]sabonner|se d[ée]sinscrire|g[eé]rer vos pr[eé]f[eé]rences)/;

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
    /(we would love to invite you|we'd love to invite you|we would like to invite you|we'd like to invite you|we invite you to|you're invited to|you are invited to|join us for (a )?(press|media|vip)?\s?(event|screening|tour|preview|opening|visit)|te invitamos a|nos gustar[ií]a invitarte|nos gustaria invitarte|invitaci[oó]n a (un|una) (evento|pase|proyecci[oó]n|func[ií]on)|private tour|guided tour)/;

  const callSlotsRegex =
    /(book a (call|meeting)|schedule (a )?(call|meeting)|pick a slot|choose a time|select a time|time slot|drop in anytime between\s+\d|from \d{1,2}(am|pm)\s+to\s+\d{1,2}(am|pm)|agenda (una|una) llamada|concertar una llamada)/;

  // Enhanced pricing detection - works in multiple languages
  // Detects: pricing requests, media kit requests, advertising cost inquiries, publication rates
  const pricingRegex =
    /(rate card|ratecard|media kit\b|mediakit|pricing|price list|tariff|tarifs|tarifa|price (catalog|catalogue)|cat[aá]logo de precios|c[oó]mo (cobr[aá]is|factur[aá]is)|how much (do you charge|would it cost)|cost of (a )?(campaign|post|article|placement)|what are your (rates|fees)|precios de (publicidad|campañas|anuncios)|cu[aá]nto cuesta (anunciarse|una campa[nñ]a)|quel serait (le|un) prix|what would be the (price|cost)|discuss (the )?(possibility of )?advertising|article (publication|publications)|banner advertising|guest (post|article|publication)|publish (an|a) (article|guest post)|publication (price|cost|rate)|advertising (price|cost|rate|format)|discuss specifics|discuter (des )?(prix|tarifs)|publication (avec|sans) (lien|link)|dofollow (link|lien)|(precio|prezzo|preço|prix|preis)\s+(de|di|do|du|der|for|por|para|per|pour)\s+(publicaci[oó]n|pubblicazione|publica[çc][aã]o|publication|ver[öo]ffentlichung|anuncio|annuncio|an[úu]ncio|advertising|publicit[ée]|werbung)|(tarifa|tariffa|tarifa|tarif)\s+(de|di|do|du|der|for|por|para|per|pour)|(coste|cost|kosten|costo|custo|co[ûu]t)\s+(de|di|do|du|der|for|por|para|per|pour)\s+(publicaci[oó]n|pubblicazione|publica[çc][aã]o|publication|ver[öo]ffentlichung|anuncio|annuncio|an[úu]ncio|advertising|publicit[ée]|werbung)|(cu[aá]nto|quanto|combien|wie viel|how much)\s+(cuesta|costa|coute|kostet|costs?)\s+(publicar|pubblicare|publicar|publier|ver[öo]ffentlichen|publish)|(presupuesto|budget|or[çc]amento|budget)\s+(de|di|do|du|der|for|por|para|per|pour)\s+(publicidad|advertising|publicit[ée]|werbung|pubblicit[àa])|(solicitar|request|richiedere|solicitar|demander|anfragen)\s+(precio|price|prezzo|preço|prix|preis|tarifa|tariffa|tarifa|tarif)|(informaci[oó]n|information|informazione|informa[çc][aã]o|information)\s+(sobre|about|su|sobre|sur|über)\s+(precio|price|prezzo|preço|prix|preis|tarifa|tariffa|tarifa|tarif)|(qu[ée]|quanto|combien|wie|what)\s+(precio|price|prezzo|preço|prix|preis)\s+(tiene|ha|have|hat|a|hast)|(discutir|discuss|discutere|discuter|diskutieren)\s+(precio|price|prezzo|preço|prix|preis|tarifa|tariffa|tarifa|tarif)|(publicar|publish|pubblicare|publicar|publier|ver[öo]ffentlichen)\s+(art[ií]culo|article|articolo|artigo|article|artikel)\s+(invitado|guest|ospite|convidado|invit[ée]|gast)|(anuncio|ad|annuncio|an[úu]ncio|annonce|anzeige)\s+(en|on|su|no|sur|auf)\s+(tu|your|vostro|seu|votre|ihr)\s+(sitio|site|sito|site|site|website|seite))/i;

  const directPartnershipAskRegex =
    /(we (would like|want|are looking|are interested)( to)? (partner|collaborate|work together|explore a partnership|explore collaboration)|would you (like|be interested) (to )?(partner|collaborate)|are you interested in (a )?(partnership|collaboration|media partnership)|partnership proposal (for you|with you)|propuesta de colaboraci[oó]n (con vosotros|con ustedes|contigo)|queremos (colaborar|trabajar) (con vosotros|con ustedes|contigo)|buscamos (colaboradores|partners?|socios comerciales))/;

  const platformCollabRegex =
    /(advertise (with you|on your (site|app|platform))|run (a )?campaign with you|use your (platform|app|site) to (sell tickets|promote our events)|ticketing partner for our events|use your ticketing solution|use your services for (ticketing|marketing|promotion))/;

  const contentCollabRegex =
    /(pitch (some )?content\b|creat(e|ing) (a )?post (for|on) your (site|blog|website|page)|guest post\b|write a guest post|guest article|creat(e|ing) (some )?content for your (site|blog|website|publication|magazine|channels|audience)|we('?d)? love [^.!?\n]{0,80} to create (some )?content\b|shoot (some )?content (together|with you)|content (collab|collaboration|partnership))/;

  // Detecciones
  const containsUnsubscribe = unsubscribeRegex.test(mailText);
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
  const isPricing = pricingRegex.test(mailText);
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

  const isBarterRequest =
    (isCoverageRequest && hasEventInvite) ||
    /(in exchange for|a cambio de|in return for)/.test(mailText);

  const isFreeCoverageRequest = isCoverageRequest && isExplicitFree;
  const isPrCore =
    isPressStyle || isCoverageRequest || hasEventInvite || isEventPrInfo;
  const isPrInvitationCase = isPrCore;
  const isMediaKitPricingRequest = isPricing;

  const hasAnyCommercialSignalForUs =
    hasPartnershipCollabAsk ||
    isMediaKitPricingRequest ||
    isBarterRequest ||
    isFreeCoverageRequest ||
    isPrCore ||
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
    isPrInvitationCase,
    isMediaKitPricingRequest,
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
      isPrInvitation: false,
      isPricing: false,
    };
  }

  let intent = null;
  let confidence = null;

  // Casos "ruido" claros → Discard
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
  } else if (saysNoCommercialIntent && !hasAnyCommercialSignalForUs) {
    intent = "Discard";
    confidence = 0.96;
    reasoning =
      "Model reasoning indicates this is not a PR, barter, pricing, free coverage or partnership opportunity and no strong signals contradict that.";
  }

  // STEP 2: Analyze Partnership Intent (per new specification)
  if (!intent) {
    if (hasPartnershipCollabAsk || (isMediaKitPricingRequest && hasPartnershipCollabAsk)) {
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
      // 2.b. High: clear partnership proposal with defined elements (budget range, fees, commissions, OR concrete scope)
      // Concrete scope: volume (e.g., "5 articles per month"), frequency, campaign duration, number of placements
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
    else if (isMediaKitPricingRequest && !hasPartnershipCollabAsk) {
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
    } else if (isFreeCoverageRequest) {
      // 3.a. Free Coverage Request → Low
      intent = "Low";
      confidence = 0.65;
    } else if (isBarterRequest) {
      // 3.b. Barter Request → Low
      intent = "Low";
      confidence = 0.65;
    } else if (isPrInvitationCase) {
      // 3.c. PR Invitation → Low
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
      } else if (isPrInvitationCase || isBarterRequest || isFreeCoverageRequest) {
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
      if (!hasPartnershipCollabAsk && !isMediaKitPricingRequest && !isPrInvitationCase && 
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

    if (intent === "Low" && hasPartnershipCollabAsk) {
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
    } else if (isPrInvitationCase || isBarterRequest || isFreeCoverageRequest) {
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
    isPrInvitationCase ||
    isFreeCoverageRequest ||
    isBarterRequest ||
    isMediaKitPricingRequest ||
    hasEventInvite ||
    hasCallOrMeetingInvite ||
    hasPartnershipCollabAsk;

  if (intent === "Discard" && neverDiscard) {
    if (hasPartnershipCollabAsk || isMediaKitPricingRequest) {
      intent = "Medium";
      confidence = Math.max(confidence || 0.7, 0.7);
    } else {
      intent = "Low";
      confidence = Math.max(confidence || 0.7, 0.7);
    }
    reasoning =
      "Email contains PR, coverage, barter, pricing, meeting or partnership signals, so it is treated as a real opportunity instead of being discarded.";
  }

  // Press Release SIEMPRE debe ser Low (regla dura según especificación)
  if (isPrInvitationCase || modelPrInvitation) {
    intent = "Low";
    confidence = 0.65;
    if (!reasoning) {
      reasoning = "Email is a press release, categorized as Low intent.";
    }
  }

  // Low SOLO cuando haya alguna de las 4 columnas
  const hasAnyAirtableFlag =
    isPrInvitationCase ||
    isBarterRequest ||
    isMediaKitPricingRequest ||
    isFreeCoverageRequest;

  if (intent === "Low" && !hasAnyAirtableFlag) {
    intent = "Medium";
    confidence = Math.max(confidence || 0.7, 0.7);
  }

  // Combine model checkboxes with heuristic detection (NOT mutually exclusive)
  const finalFreeCoverage = modelFreeCoverage || isFreeCoverageRequest;
  const finalBarter = modelBarter || isBarterRequest;
  const finalPrInvitation = modelPrInvitation || isPrInvitationCase;
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
  
  // Asegurar que PR Invitation siempre sea Low (verificación final)
  if (finalPrInvitation && intent !== "Low") {
    intent = "Low";
    confidence = 0.65;
    if (!reasoning || reasoning.includes("Very High") || reasoning.includes("High") || reasoning.includes("Medium")) {
      reasoning = "Email is a press release, categorized as Low intent.";
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
    } else if (isFreeCoverageRequest || isPrInvitationCase) {
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
    finalPrInvitation,
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
    isPrInvitation: finalPrInvitation,
    isPricing: finalPricing,
  };
}

