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
  ];

  const REGIONS = Array.from(
    new Set([CFG.VERTEX_LOCATION || "us-central1", "us-central1", "europe-west1"])
  );

  console.log("[mfs] Llamando a Vertex para clasificación de intent...");

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
        if (isNotFound(e)) {
          console.warn("[mfs] Vertex NOT_FOUND → pruebo siguiente combinación", {
            location: loc,
            model: mdl,
          });
          continue;
        }
        console.error("[mfs] Error en Vertex:", e);
        return "";
      }
    }
  }

  return "";
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
  let meddic = "";

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
      if (parsed.meddic_pain_hypothesis) {
        meddic = String(parsed.meddic_pain_hypothesis).trim().slice(0, 250);
      } else if (parsed.meddic) {
        meddic = String(parsed.meddic).trim().slice(0, 250);
      }
      if (parsed.intent) {
        modelIntentRaw = String(parsed.intent).trim();
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
    meddic,
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
  meddic,
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

  const pricingRegex =
    /(rate card|ratecard|media kit\b|mediakit|pricing|price list|tariff|tarifs|tarifa|price (catalog|catalogue)|cat[aá]logo de precios|c[oó]mo (cobr[aá]is|factur[aá]is)|how much (do you charge|would it cost)|cost of (a )?(campaign|post|article|placement)|what are your (rates|fees)|precios de (publicidad|campañas|anuncios)|cu[aá]nto cuesta (anunciarse|una campa[nñ]a))/;

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
    /(budget|fee\b|fees\b|commission|rev[-\s]?share|revenue share|flat fee|cpm\b|cpc\b|media spend|media budget|sponsorship package|amount of|per month|per year|contract value|minimum guarantee|minimum spend)/.test(
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

  const largeBudgetRegex =
    /(200k|250k|300k|400k|500k|\b200\,000\b|\b250\,000\b|\b300\,000\b|\b200\.000\b|\b250\.000\b|\b300\.000\b|\€\s?200 ?000|\$200,000|£200,000)/;

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

  // Intent comercial / PR hacia nosotros
  if (!intent) {
    if (hasPartnershipCollabAsk) {
      if (
        bigBrand ||
        largeBudgetMention ||
        multiYearRegex.test(mailText) ||
        multiMarketRegex.test(mailText)
      ) {
        intent = "Very High";
        confidence = 0.86;
      } else if (hasBudgetKeywords || isMediaKitPricingRequest) {
        intent = "High";
        confidence = 0.8;
      } else {
        intent = "Medium";
        confidence = 0.72;
      }
    } else if (isMediaKitPricingRequest) {
      if (bigBrand || largeBudgetMention) {
        intent = "High";
        confidence = 0.82;
      } else {
        intent = "Medium";
        confidence = 0.78;
      }
    } else if (isBarterRequest) {
      if (bigBrand) {
        intent = "Medium";
        confidence = 0.72;
      } else {
        intent = "Low";
        confidence = 0.68;
      }
    } else if (isFreeCoverageRequest) {
      if (bigBrand) {
        intent = "Medium";
        confidence = 0.7;
      } else {
        intent = "Low";
        confidence = 0.65;
      }
    } else if (isPrInvitationCase || hasCallOrMeetingInvite) {
      intent = "Low";
      confidence = 0.65;
    } else if (hasAnyCommercialSignalForUs) {
      if (bigBrand || largeBudgetMention) {
        intent = "Medium";
        confidence = 0.75;
      } else {
        intent = "Low";
        confidence = 0.6;
      }
    }
  }

  // Fallback con intent del modelo
  const normalizedModelIntent = normalizeModelIntent(modelIntentRaw);

  if (!intent && normalizedModelIntent) {
    if (
      normalizedModelIntent === "Very High" &&
      !hasPartnershipCollabAsk &&
      !isMediaKitPricingRequest &&
      !largeBudgetMention &&
      !multiYearRegex.test(mailText) &&
      !multiMarketRegex.test(mailText)
    ) {
      intent = "High";
      confidence = 0.75;
    } else {
      intent = normalizedModelIntent;
      confidence = confidence || 0.7;
    }

    if (intent === "Low" && hasPartnershipCollabAsk) {
      intent = "Medium";
      confidence = 0.72;
    }
  }

  // Fallback final
  if (!intent) {
    if (!hasAnyCommercialSignalForUs) {
      intent = "Discard";
      confidence = 0.9;
      reasoning =
        "Email does not fit PR, barter, pricing, free coverage or partnership patterns, so it is discarded.";
    } else if (hasPartnershipCollabAsk || isMediaKitPricingRequest) {
      intent = "Medium";
      confidence = 0.7;
    } else {
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

  // MEDDIC fallback
  if (!meddic) {
    if (intent === "Discard") {
      meddic =
        "No clear PR, barter, pricing, free coverage or partnership challenge involving us is expressed; outreach is not actionable for our media network.";
    } else if (isBarterRequest) {
      meddic =
        "Limited cash marketing budget is pushing them to trade invitations or experiences for exposure and coverage.";
    } else if (isFreeCoverageRequest || isPrInvitationCase) {
      meddic =
        "They rely on earned media and editorial exposure to boost awareness and attendance without strong paid media investment.";
    } else if (isMediaKitPricingRequest) {
      meddic =
        "Unclear media costs are blocking planning of campaigns, creating risk of delayed or suboptimal investment.";
    } else if (hasPartnershipCollabAsk) {
      meddic =
        "They lack a strong media or distribution partner to scale reach and engagement for their events, artists or experiences.";
    } else if (mailText.includes("ticket") || mailText.includes("event")) {
      meddic =
        "Insufficient reach is limiting event attendance and ticket revenue, prompting the search for stronger promotional partners.";
    } else if (mailText.includes("sponsor")) {
      meddic =
        "Brand visibility is lagging in key markets, prompting them to explore sponsorships and high-impact placements.";
    } else {
      meddic =
        "They are seeking partners to improve reach, engagement and efficiency of their marketing and commercial efforts.";
    }
  }

  meddic = meddic.slice(0, 250);

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
    isFreeCoverageRequest,
    isBarterRequest,
    isPrInvitationCase,
    isMediaKitPricingRequest,
    hasPartnershipCollabAsk,
  });

  return {
    intent,
    confidence,
    reasoning,
    meddic,
    isFreeCoverage: isFreeCoverageRequest,
    isBarter: isBarterRequest,
    isPrInvitation: isPrInvitationCase,
    isPricing: isMediaKitPricingRequest,
  };
}

