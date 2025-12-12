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

  // Detección de agencias de SEO - debe ejecutarse temprano para forzar Discard
  const seoAgencyKeywords = [
    // Términos en el dominio/email
    /(seo|search engine optimization|search engine marketing|sem\b)/i,
    // Términos comunes en nombres de agencias SEO
    /(seo agency|seo company|seo services|seo firm|seo consultant|seo expert|seo specialist|seo marketing|digital marketing agency|search marketing)/i,
    // Términos en español
    /(agencia seo|agencia de seo|empresa seo|servicios seo|consultor[íi]a seo|especialista seo|marketing digital|posicionamiento web|posicionamiento seo)/i,
    // Términos en otros idiomas
    /(agence seo|agence de seo|soci[ée]t[ée] seo|services seo|consultant seo|expert seo|sp[ée]cialiste seo)/i,
  ];
  
  // Verificar si el email viene de una agencia de SEO
  // Buscar en: dominio del email, nombre del remitente (si está disponible), subject, y body
  const isSeoAgency = seoAgencyKeywords.some(regex => 
    regex.test(fromLc) || 
    regex.test(subjectLc) || 
    regex.test(normalizedBody)
  );
  
  // También verificar patrones específicos de agencias SEO en el cuerpo
  const seoAgencyPatterns = [
    /(we are (an|a) (seo|search engine) (agency|company|firm|specialist))/i,
    /(our (seo|search engine) (services|agency|company))/i,
    /(specializ(e|ing) in (seo|search engine optimization|search marketing))/i,
    /(especializ(amos|ados) en (seo|posicionamiento web|posicionamiento seo))/i,
    /(nos especializamos en (seo|posicionamiento web|posicionamiento seo))/i,
    /(we help (businesses|companies|clients) (with|improve) (seo|search engine|ranking))/i,
    /(ayudamos (a empresas|empresas|clientes) (con|a mejorar) (seo|posicionamiento|ranking))/i,
  ];
  
  const hasSeoAgencyPattern = seoAgencyPatterns.some(regex => regex.test(mailText));
  
  const isSeoAgencyEmail = isSeoAgency || hasSeoAgencyPattern;

  // Detección de programas de afiliados/influencer marketing - debe ejecutarse temprano para forzar Discard
  const affiliateKeywords = [
    // Términos en el dominio/email
    /(affiliate|influencer|influator|noxinfluencermgmt|influencermgmt)/i,
    // Términos comunes en programas de afiliados
    /(affiliate program|affiliate marketing|influencer program|influencer marketing|brand ambassador|creator program|creator partnership)/i,
    // Términos en español
    /(programa de afiliados|afiliados|influencer|embajador de marca|programa de creadores|colaboraci[oó]n con creadores)/i,
  ];
  
  // Verificar si el email viene de un programa de afiliados/influencer
  const isAffiliateProgram = affiliateKeywords.some(regex => 
    regex.test(fromLc) || 
    regex.test(subjectLc) || 
    regex.test(normalizedBody)
  );
  
  // Detectar tracking links de programas de afiliados/influencer
  const affiliateTrackingLinks = [
    /(url\d+\.app\.influeator\.com|track\.noxinfluencermgmt\.com|influeator\.com|influencermgmt\.com)/i,
    /(affiliate.*tracking|influencer.*tracking|commission.*tracking)/i,
  ];
  
  const hasAffiliateTrackingLinks = affiliateTrackingLinks.some(regex => regex.test(mailText));
  
  // Patrones específicos de programas de afiliados/influencer en el cuerpo
  const affiliatePatterns = [
    /(we'd love to invite you to join (in|our) (campaign|program|partnership))/i,
    /(commission a (short|video|post|content))/i,
    /(paid (collab|collaboration|partnership|video|post|content))/i,
    /(brand ambassador (program|partnership|opportunity))/i,
    /(creator (program|partnership|collaboration|opportunity))/i,
    /(influencer (program|partnership|collaboration|opportunity|campaign))/i,
    /(we're reaching out to (influencers|creators|content creators|brand ambassadors))/i,
    /(we work with (influencers|creators|content creators|brand ambassadors))/i,
    /(invite you to join (our|in) (affiliate|influencer|creator) (program|campaign|partnership))/i,
    /(te invitamos a (unirte|participar) en (nuestro|nuestra) (programa|campana|colaboraci[oó]n) (de afiliados|de influencers|de creadores))/i,
    /(colaboraci[oó]n (pagada|remunerada|con pago))/i,
    /(comisi[oó]n (por|de|del))/i,
  ];
  
  const hasAffiliatePattern = affiliatePatterns.some(regex => regex.test(mailText));
  
  const isAffiliateEmail = isAffiliateProgram || hasAffiliateTrackingLinks || hasAffiliatePattern;

  // Detección de ofertas donde NOSOTROS seríamos los creadores/influencers (deben descartarse)
  // CRÍTICO: Si están OFRECIENDO que seamos influencers/creators para su marca, NO están pidiendo que hagamos algo para ellos
  const offeringUsToBeInfluencerPatterns = [
    // Ofertas directas para que seamos influencers/creators
    /(convertirte en (un|una) (influencer|creator|creador|creadora) (de|para|of))/i,
    /(become (an|a) (influencer|creator) (for|of|with) (us|our brand|our company))/i,
    /(si te gustar[ií]a (convertirte|ser) (en|un|una) (influencer|creator|creador|creadora))/i,
    /(if you'd like to become (an|a) (influencer|creator))/i,
    /(te gustar[ií]a (convertirte|ser) (en|un|una) (influencer|creator|creador|creadora))/i,
    /(would you like to become (an|a) (influencer|creator))/i,
    /(colaboraciones pagadas.*para ti|paid collaborations.*for you)/i,
    /(colaboraciones.*donde.*t[uú] (ser[ií]as|eres)|collaborations.*where.*you (would be|are))/i,
    // Ofertas de códigos de promoción para nosotros (significa que seríamos los influencers)
    /(c[oó]digo de promoci[oó]n (exclusivo|para ti|para tus seguidores)|promo code (exclusive|for you|for your followers))/i,
    /(c[oó]digo (exclusivo|personalizado) (para ti|para tus seguidores)|exclusive code (for you|for your followers))/i,
    // Ofertas de promociones de nuestros canales (a cambio de ser influencers)
    /(promociones de (tus|nuestros) canales|promotions of (your|our) channels)/i,
    /(promote (your|our) channels|promocionar (tus|nuestros) canales)/i,
    // Contexto: "trabajar contigo" pero ofreciendo que seamos influencers
    /(trabajar contigo.*(influencer|creator|creador)|work with you.*(influencer|creator))/i,
    /(colaborar contigo.*(influencer|creator|creador)|collaborate with you.*(influencer|creator))/i,
    // Ofertas de colaboraciones donde nosotros crearíamos contenido para ellos (como influencers)
    /(colaboraciones.*(video dedicado|video integrado|cortos|cuadro de descripci[oó]n)|collaborations.*(dedicated video|integrated video|shorts|description box))/i,
    /(crear contenido (para nosotros|para nuestra marca)|create content (for us|for our brand))/i,
    // Patrones específicos de marcas que buscan influencers
    /(muchos creadores de contenido colaboran con nosotros|many content creators collaborate with us)/i,
    /(sus visualizaciones son m[aá]s altas cuando publican para|their views are higher when they post for)/i,
    /(si te gustar[ií]a.*colaborar.*env[ií]anos.*tarifas|if you'd like.*collaborate.*send us.*rates)/i,
  ];
  
  const isOfferingUsToBeInfluencer = offeringUsToBeInfluencerPatterns.some(regex => regex.test(mailText));
  
  // También detectar cuando el contexto general es "queremos que seas nuestro influencer" vs "queremos que promociones algo"
  // Si mencionan "influencer", "creator", "colaboraciones pagadas" Y "trabajar contigo" pero NO piden que promocionemos algo específico
  const hasInfluencerOfferContext = (
    /(influencer|creator|creador|creadora|colaboraciones pagadas|paid collaborations)/i.test(mailText) &&
    /(trabajar contigo|work with you|colaborar contigo|collaborate with you)/i.test(mailText) &&
    !/(promocionar|promote|anunciar|advertise|publicitar|publicize) (nuestro|nuestra|our|my) (producto|product|servicio|service|marca|brand|evento|event)/i.test(mailText)
  );
  
  const isOfferingUsSomething = isOfferingUsToBeInfluencer || hasInfluencerOfferContext;

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
  
  // Detectar ofertas de comida/comida gratis o servicios junto con solicitudes de compartir
  const hasComplimentaryOffer = /(complimentary|free (lunch|dinner|meal|food|drink|drinks|tasting|experience|event|visit|stay|accommodation|ticket|tickets|pass|passes)|gratis|gratuito|invitaci[oó]n (a|para)|invited to|welcome you to|we'?d love to (welcome|host|invite))/i.test(mailText);
  const hasSocialMediaShareRequest = /(share (your|the) (experience|visit|thoughts|review|photos?|videos?|content)|post (about|on)|tag (us|the venue|@)|instagram (stories?|posts?|reels?|carousel)|tiktok|social media|share with (your|the) (audience|followers|readers)|in return|in exchange)/i.test(mailText);
  const hasInReturnLanguage = /(in return|in exchange|a cambio|en cambio|en retorno|en agradecimiento|as thanks|como agradecimiento)/i.test(mailText);
  
  // Detectar invitaciones a eventos con comida/comida gratis
  const hasEventWithComplimentary = hasEventInvite && hasComplimentaryOffer;
  
  // Detectar ofertas de comida/comida gratis junto con solicitudes de compartir en redes sociales
  const hasComplimentaryWithShare = hasComplimentaryOffer && hasSocialMediaShareRequest;
  
  // Detectar "Best of" awards/rankings (ofrecen reconocimiento a cambio de publicidad) - BARTER REQUEST
  const hasBestOfAward = /(best of|readers'? choice|readers choice|award|certificate|recognition|recognized as|be recognized|nominated|nomination)/i.test(mailText);
  const hasAwardWithAdvertising = hasBestOfAward && /(advertising|advertise|publicidad|anunciar|promote|promocionar|sponsor|sponsorship|patrocinio)/i.test(mailText);
  
  const isBarterRequest =
    (isCoverageRequest && hasEventInvite) ||
    (hasEventInvite && (isPressStyle || isCoverageRequest || mentionsEvent)) ||
    (hasPressPassOrAccreditation && (isPressStyle || mentionsEvent || isCoverageRequest)) ||
    (hasMediaInviteLanguage && (isPressStyle || mentionsEvent)) ||
    hasEventWithComplimentary ||
    hasComplimentaryWithShare ||
    hasInReturnLanguage ||
    hasAwardWithAdvertising ||
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

  // Detección de respuestas genéricas de agradecimiento que deben descartarse
  // Si es una respuesta muy corta con solo agradecimiento y ya hubo una respuesta previa, descartar
  const genericThankYouPatterns = [
    /^(thank you|thanks|gracias|merci|danke|obrigado)[\s.,!]*$/i,
    /^(thank you|thanks|gracias|merci|danke|obrigado)[\s.,!]*\s*(very much|so much|a lot|muchas|mucho|muito)[\s.,!]*$/i,
    /^(thank you|thanks|gracias|merci|danke|obrigado)[\s.,!]*\s*(for|por|pour|f[üu]r)[\s.,!]*$/i,
  ];
  
  // Verificar si es una respuesta genérica de agradecimiento
  const isGenericThankYou = genericThankYouPatterns.some(regex => regex.test(normalizedBody.trim())) && 
    normalizedBody.trim().length < 100; // Solo si es muy corto
  
  // Detectar si el email es una respuesta (Re:, Fwd:, etc.) con solo agradecimiento
  const isReplyWithOnlyThanks = (
    /^(re|fwd?|fw):/i.test(subjectLc) && 
    isGenericThankYou
  );

  // Detección de solicitudes de soporte al usuario (user support requests) - deben descartarse
  // Estas son preguntas de clientes sobre tickets, horarios, ubicación, etc., no solicitudes de negocio
  const userSupportKeywords = [
    // Tickets/entradas
    /(ticket|billet|entr[ée]e|admission|admission ticket|ticket price|precio.*ticket|prix.*billet)/i,
    // Preguntas sobre compra/regalo de tickets
    /(acheter.*ticket|buy.*ticket|purchase.*ticket|offrir.*ticket|give.*ticket|gift.*ticket|regalar.*ticket)/i,
    // Preguntas sobre tickets digitales/sin fecha
    /(ticket.*num[ée]rique|digital.*ticket|ticket.*sans.*date|ticket.*without.*date|ticket.*no.*date)/i,
    // Horarios
    /(horaires?|opening.*hours?|opening.*times?|hours?.*open|quand.*ouvert|when.*open|schedule|horario)/i,
    // Ubicación/direcciones
    /(adresse|address|location|o[ùu].*est|where.*is|directions?|c[oó]mo.*llegar|how.*get.*there)/i,
    // Preguntas sobre servicios básicos
    /(visite|visit|tour|acc[èe]s|access|entrance|entrada|acceso)/i,
    // Preguntas sobre información básica
    /(information|informaci[oó]n|info|renseignements?|contact.*info)/i,
  ];
  
  // Patrones de preguntas de soporte al usuario
  const userSupportQuestionPatterns = [
    // Preguntas que empiezan con "Existe-t-il", "Do you have", "Can I", etc.
    /(existe-t-il|existe.*il|do you have|do you offer|can i (buy|purchase|get|obtain)|puis-je (acheter|obtenir|avoir))/i,
    // Preguntas sobre cómo hacer algo básico
    /(how can i (buy|purchase|get|obtain|visit)|comment (acheter|obtenir|visiter|r[ée]server))/i,
    // Preguntas sobre disponibilidad
    /(are.*available|sont.*disponibles|est.*disponible|available.*ticket|ticket.*available)/i,
    // Preguntas sobre regalar/comprar para otros
    /(offrir.*[àa]|give.*to|gift.*to|buy.*for|acheter.*pour|regalar.*a)/i,
  ];
  
  // Verificar si es una solicitud de soporte al usuario
  const hasUserSupportKeywords = userSupportKeywords.some(regex => 
    regex.test(subjectLc) || 
    regex.test(normalizedBody)
  );
  
  const hasUserSupportQuestionPattern = userSupportQuestionPatterns.some(regex => 
    regex.test(normalizedBody)
  );
  
  // Si tiene keywords de soporte Y pregunta sobre tickets/horarios/ubicación, es user support
  // PERO excluir si menciona partnership, collaboration, advertising, sponsorship (esas son solicitudes de negocio)
  const hasBusinessContext = /(partnership|collaboration|advertising|advertise|sponsorship|sponsor|publicidad|colaboraci[oó]n|partenariat|partenariado|media kit|rate card|pricing|budget|fee|tarif)/i.test(mailText);
  
  const isUserSupportRequest = (hasUserSupportKeywords || hasUserSupportQuestionPattern) && !hasBusinessContext;

  // Detección de respuestas de cuentas internas en el hilo del correo
  // Si hay una respuesta de alguna de estas cuentas o de @feverup.com en el cuerpo, descartar automáticamente
  const internalSecretMediaAccounts = [
    'abudhabi@secretmedianetwork.com',
    'dubai@secretmedianetwork.com',
    'abudhabi+managers@secretmedianetwork.com',
    'baires@secretmedianetwork.com',
    'buenosaires@secretmedianetwork.com',
    'wien@secretmedianetwork.com',
    'brisbane@secretmedianetwork.com',
    'melbourne@secretmedianetwork.com',
    'perth@secretmedianetwork.com',
    'adelaide@secretmedianetwork.com',
    'sydney@secretmedianetwork.com',
    'canberra@secretmedianetwork.com',
    'goldcoast@secretmedianetwork.com',
    'newcastle.au@secretmedianetwork.com',
    'bruxelles@secretmedianetwork.com',
    'ghent@secretmedianetwork.com',
    'riodejaneiro@secretmedianetwork.com',
    'saopaulo@secretmedianetwork.com',
    'fortaleza@secretmedianetwork.com',
    'belohorizonte@secretmedianetwork.com',
    'saopaulo+noreply@secretmedianetwork.com',
    'portoalegre@secretmedianetwork.com',
    'calgary@secretmedianetwork.com',
    'ottawa@secretmedianetwork.com',
    'edmonton@secretmedianetwork.com',
    'toronto@secretmedianetwork.com',
    'montreal@secretmedianetwork.com',
    'vancouver@secretmedianetwork.com',
    'geneve@secretmedianetwork.com',
    'santiago@secretmedianetwork.com',
    'berlin@secretmedianetwork.com',
    'frankfurt@secretmedianetwork.com',
    'koeln@secretmedianetwork.com',
    'muenchen@secretmedianetwork.com',
    'hamburg@secretmedianetwork.com',
    'kobenhavn@secretmedianetwork.com',
    'hola@valenciasecreta.com',
    'madrid@secretmedianetwork.com',
    'hola@barcelonasecreta.com',
    'bilbao@secretmedianetwork.com',
    'malaga@secretmedianetwork.com',
    'zaragoza@secretmedianetwork.com',
    'gijon@secretmedianetwork.com',
    'cadiz@secretmedianetwork.com',
    'santander@secretmedianetwork.com',
    'barcelona@secretmedianetwork.com',
    'ibiza@secretmedianetwork.com',
    'sevilla@secretmedianetwork.com',
    'alicante@secretmedianetwork.com',
    'toulouse@secretmedianetwork.com',
    'marseille@secretmedianetwork.com',
    'paris@secretmedianetwork.com',
    'lyon@secretmedianetwork.com',
    'nimes@secretmedianetwork.com',
    'bordeaux@secretmedianetwork.com',
    'lille@secretmedianetwork.com',
    'larochelle@secretmedianetwork.com',
    'nice@secretmedianetwork.com',
    'nantes@secretmedianetwork.com',
    'hello@secretldn.com',
    'glasgow@secretmedianetwork.com',
    'manchester@secretmedianetwork.com',
    'nottingham@secretmedianetwork.com',
    'bristol@secretmedianetwork.com',
    'brighton@secretmedianetwork.com',
    'belfast@secretmedianetwork.com',
    'leeds@secretmedianetwork.com',
    'sheffield@secretmedianetwork.com',
    'plymouth@secretmedianetwork.com',
    'liverpool@secretmedianetwork.com',
    'birmingham@secretmedianetwork.com',
    'derry+managers@secretmedianetwork.com',
    'edinburgh@secretmedianetwork.com',
    'editor@secretldn.com',
    'london@secretmedianetwork.com',
    'dublin@secretmedianetwork.com',
    'bhopal@secretmedianetwork.com',
    'mumbai@secretmedianetwork.com',
    'newdelhi@secretmedianetwork.com',
    'bologna@secretmedianetwork.com',
    'milano@secretmedianetwork.com',
    'genova@secretmedianetwork.com',
    'palermo@secretmedianetwork.com',
    'bari@secretmedianetwork.com',
    'catania@secretmedianetwork.com',
    'venezia@secretmedianetwork.com',
    'roma@secretmedianetwork.com',
    'napoli@secretmedianetwork.com',
    'torino@secretmedianetwork.com',
    'firenze@secretmedianetwork.com',
    'tokyo@secretmedianetwork.com',
    'daegu@secretmedianetwork.com',
    'seoul@secretmedianetwork.com',
    'suwon@secretmedianetwork.com',
    'busan@secretmedianetwork.com',
    'tijuana@secretmedianetwork.com',
    'guadalajara@secretmedianetwork.com',
    'cdmx@secretmedianetwork.com',
    'monterrey@secretmedianetwork.com',
    'toluca@secretmedianetwork.com',
    'thehague@secretmedianetwork.com',
    'rotterdam@secretmedianetwork.com',
    'eindhoven@secretmedianetwork.com',
    'utrecht@secretmedianetwork.com',
    'amsterdam@secretmedianetwork.com',
    'auckland@secretmedianetwork.com',
    'wellington@secretmedianetwork.com',
    'lisboa@secretmedianetwork.com',
    'porto@secretmedianetwork.com',
    'Lisboa@secretmedianetwork.com',
    'stockholm@secretmedianetwork.com',
    'singapore@secretmedianetwork.com',
    'indianapolis@secretmedianetwork.com',
    'hello@secretnyc.co',
    'miami@secretmedianetwork.com',
    'houston@secretmedianetwork.com',
    'dc@secretmedianetwork.com',
    'dallas@secretmedianetwork.com',
    'tampa@secretmedianetwork.com',
    'charlotte@secretmedianetwork.com',
    'sandiego@secretmedianetwork.com',
    'stlouis@secretmedianetwork.com',
    'la@secretmedianetwork.com',
    'sanfrancisco@secretmedianetwork.com',
    'charleston@secretmedianetwork.com',
    'tulsa@secretmedianetwork.com',
    'raleigh@secretmedianetwork.com',
    'seattle@secretmedianetwork.com',
    'atlanta@secretmedianetwork.com',
    'chicago@secretmedianetwork.com',
    'boston@secretmedianetwork.com',
    'philadelphia@secretmedianetwork.com',
    'detroit@secretmedianetwork.com',
    'austin@secretmedianetwork.com',
    'baltimore@secretmedianetwork.com',
    'portland@secretmedianetwork.com',
    'nashville@secretmedianetwork.com',
    'richmond@secretmedianetwork.com',
    'lasvegas@secretmedianetwork.com',
    'jacksonville@secretmedianetwork.com',
    'cleveland@secretmedianetwork.com',
    'neworleans@secretmedianetwork.com',
    'cincinnati@secretmedianetwork.com',
    'phoenix@secretmedianetwork.com',
    'minneapolis@secretmedianetwork.com',
    'denver@secretmedianetwork.com',
    'sacramento@secretmedianetwork.com',
    'kansascity@secretmedianetwork.com',
    'orlando@secretmedianetwork.com',
    'albuquerque@secretmedianetwork.com',
    'london-editorial@feverup.com',
    'sanantonio@secretmedianetwork.com',
    'quebec@secretmedianetwork.com',
    'stuttgart@secretmedianetwork.com',
  ];
  
  // Patrones para detectar respuestas en hilos de correo
  // Buscar patrones típicos de respuestas: "From:", "De:", "On [date] wrote:", etc.
  const replyPatterns = [
    // Patrón inglés: "From: email@domain.com" o "From: Name <email@domain.com>"
    /from:\s*([^\n<]*<)?([a-zA-Z0-9._%+-]+@(?:secretmedianetwork\.com|feverup\.com|secretldn\.com|barcelonasecreta\.com|valenciasecreta\.com|secretnyc\.co))([^\n>]*>)?/i,
    // Patrón español: "De: email@domain.com" o "De: Nombre <email@domain.com>"
    /de:\s*([^\n<]*<)?([a-zA-Z0-9._%+-]+@(?:secretmedianetwork\.com|feverup\.com|secretldn\.com|barcelonasecreta\.com|valenciasecreta\.com|secretnyc\.co))([^\n>]*>)?/i,
    // Patrón francés: "De : email@domain.com"
    /de\s*:\s*([^\n<]*<)?([a-zA-Z0-9._%+-]+@(?:secretmedianetwork\.com|feverup\.com|secretldn\.com|barcelonasecreta\.com|valenciasecreta\.com|secretnyc\.co))([^\n>]*>)?/i,
    // Patrón "On [date], [email] wrote:" o "Le [date], [email] a écrit :"
    /(on|le|el)\s+[^\n]+\s+([a-zA-Z0-9._%+-]+@(?:secretmedianetwork\.com|feverup\.com|secretldn\.com|barcelonasecreta\.com|valenciasecreta\.com|secretnyc\.co))[^\n]*wrote|a écrit|escribió/i,
    // Patrón "Sent from" o "Enviado desde" seguido de email
    /(sent from|enviado desde|envoyé depuis)\s+([a-zA-Z0-9._%+-]+@(?:secretmedianetwork\.com|feverup\.com|secretldn\.com|barcelonasecreta\.com|valenciasecreta\.com|secretnyc\.co))/i,
    // Patrón de bloque de respuesta con email en líneas separadas
    /(from|de|von|da|van)\s*:\s*[^\n]*\n\s*([a-zA-Z0-9._%+-]+@(?:secretmedianetwork\.com|feverup\.com|secretldn\.com|barcelonasecreta\.com|valenciasecreta\.com|secretnyc\.co))/i,
  ];
  
  // Verificar si hay una respuesta de alguna cuenta interna en el cuerpo
  // Buscar bloques de respuesta de email que contengan estas direcciones
  let hasInternalReply = false;
  
  // Crear un regex que busque cualquier email de los dominios internos
  // Incluir caracteres especiales como + para capturar variantes como "abudhabi+managers@..."
  const internalEmailRegex = /([a-zA-Z0-9._%+\-]+@(?:secretmedianetwork\.com|feverup\.com|secretldn\.com|barcelonasecreta\.com|valenciasecreta\.com|secretnyc\.co))/gi;
  
  // Buscar todos los emails internos en el cuerpo
  const internalEmailsInBody = [];
  let match;
  while ((match = internalEmailRegex.exec(body)) !== null) {
    const foundEmail = match[1].toLowerCase().trim();
    if (foundEmail && !internalEmailsInBody.includes(foundEmail)) {
      internalEmailsInBody.push(foundEmail);
    }
  }
  
  // Si hay emails internos, verificar si están en un contexto de respuesta
  if (internalEmailsInBody.length > 0) {
    // Verificar si alguno de estos emails está en un contexto de respuesta
    // Buscar patrones típicos de respuestas de email alrededor de estos emails
    
    for (const email of internalEmailsInBody) {
      // Verificar si es una de las cuentas específicas de la lista (comparación exacta, case-insensitive)
      // O si es cualquier cuenta de @feverup.com
      const normalizedEmail = email.toLowerCase().trim();
      const isInternalAccount = internalSecretMediaAccounts.some(acc => acc.toLowerCase().trim() === normalizedEmail) || 
                                 normalizedEmail.includes('@feverup.com');
      
      if (isInternalAccount) {
        // Buscar contexto de respuesta alrededor de este email
        // Buscar en un rango de 200 caracteres antes y después del email
        const emailIndex = body.toLowerCase().indexOf(email);
        if (emailIndex !== -1) {
          const contextStart = Math.max(0, emailIndex - 200);
          const contextEnd = Math.min(body.length, emailIndex + email.length + 200);
          const context = body.substring(contextStart, contextEnd).toLowerCase();
          
          // Verificar si hay indicadores de respuesta en el contexto
          const hasReplyIndicators = [
            /from\s*:/i,
            /de\s*:/i,
            /von\s*:/i,
            /da\s*:/i,
            /van\s*:/i,
            /sent\s+from/i,
            /enviado\s+desde/i,
            /envoyé\s+depuis/i,
            /on\s+[^\n]+\s+wrote/i,
            /le\s+[^\n]+\s+a\s+écrit/i,
            /el\s+[^\n]+\s+escribió/i,
            /original\s+message/i,
            /mensaje\s+original/i,
            /message\s+original/i,
            /---\s*original\s+message/i,
            /---\s*mensaje\s+original/i,
            /^>\s+/m, // Líneas que empiezan con ">" (típico de respuestas)
            /^on\s+/m, // Líneas que empiezan con "On" (típico de respuestas en inglés)
            /^le\s+/m, // Líneas que empiezan con "Le" (típico de respuestas en francés)
            /^el\s+/m, // Líneas que empiezan con "El" (típico de respuestas en español)
          ].some(pattern => pattern.test(context));
          
          if (hasReplyIndicators) {
            hasInternalReply = true;
            break;
          }
        }
      }
    }
  }

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
  // REGLA DURA: Agencias de SEO SIEMPRE Discard (verificación temprana, máxima prioridad)
  else if (isSeoAgencyEmail) {
    intent = "Discard";
    confidence = 0.99;
    reasoning = "Email is from an SEO agency. SEO agency requests are always categorized as Discard, regardless of pricing or partnership mentions.";
  }
  // REGLA DURA: Programas de afiliados/influencer marketing SIEMPRE Discard (verificación temprana, máxima prioridad)
  else if (isAffiliateEmail) {
    intent = "Discard";
    confidence = 0.99;
    reasoning = "Email is from an affiliate/influencer marketing program. Affiliate program requests are always categorized as Discard, regardless of pricing or partnership mentions.";
  }
  // REGLA DURA: Ofertas donde NOSOTROS seríamos los influencers/creators SIEMPRE Discard (verificación temprana, máxima prioridad)
  else if (isOfferingUsSomething) {
    intent = "Discard";
    confidence = 0.99;
    reasoning = "Email is offering us to become influencers/creators for their brand, rather than asking us to do something for them. These offers are always categorized as Discard.";
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
  }
  // REGLA DURA: Respuestas genéricas de agradecimiento SIEMPRE Discard (verificación temprana, máxima prioridad)
  else if (isReplyWithOnlyThanks || (isGenericThankYou && normalizedBody.trim().length < 50)) {
    intent = "Discard";
    confidence = 0.99;
    reasoning = "Email is a generic thank you response with no meaningful business content, so it is discarded.";
  }
  // REGLA DURA: Solicitudes de soporte al usuario SIEMPRE Discard (verificación temprana, máxima prioridad)
  else if (isUserSupportRequest) {
    intent = "Discard";
    confidence = 0.99;
    reasoning = "Email is a user support request (questions about tickets, hours, location, etc.) with no business/partnership intent, so it is discarded.";
  }
  // REGLA DURA: Si hay una respuesta de cuenta interna en el hilo, SIEMPRE Discard (verificación temprana, máxima prioridad)
  else if (hasInternalReply) {
    intent = "Discard";
    confidence = 0.99;
    reasoning = "Email contains a reply from an internal account (secretmedianetwork.com, feverup.com, etc.) in the thread, so it is discarded.";
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

