/**
 * Configuración centralizada de la aplicación
 */
export const CFG = {
  PROJECT_ID:
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.PROJECT_ID,

  // Vertex 2.x
  VERTEX_LOCATION: process.env.VERTEX_LOCATION || "us-central1",
  VERTEX_MODEL: process.env.VERTEX_MODEL || "gemini-2.5-flash",
  VERTEX_INTENT_MODEL: process.env.VERTEX_INTENT_MODEL || "gemini-2.5-flash",

  // Gmail
  GMAIL_ADDRESS: process.env.GMAIL_ADDRESS,
  AUTH_MODE: (process.env.AUTH_MODE || "oauth").toLowerCase(),

  // Pub/Sub + estado
  PUBSUB_TOPIC: process.env.PUBSUB_TOPIC || "mfs-gmail-leads",
  PUBSUB_TOPIC_SENDER: process.env.PUBSUB_TOPIC_SENDER || "mfs-gmail-leads-sender",
  PUBSUB_PROJECT_ID: process.env.PUBSUB_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID,
  GCS_BUCKET: process.env.GCS_BUCKET,
  STATE_OBJECT: process.env.STATE_OBJECT || "state/gmail_history.json",
  STATE_OBJECT_SENDER: process.env.STATE_OBJECT_SENDER || "state/gmail_history_sender.json",
  RESET_ON_START: (process.env.RESET_ON_START || "false")
    .toLowerCase()
    .includes("true"),

  // Airtable
  AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
  AIRTABLE_TABLE: process.env.AIRTABLE_TABLE,
  AIRTABLE_TOKEN_SECRET: process.env.AIRTABLE_TOKEN_SECRET || "AIRTABLE_TOKEN",
};

export const FLAGS = {
  SKIP_VERTEX: (process.env.SKIP_VERTEX || "false").toLowerCase() === "true",
};

export const DEBUG_SCAN_MAX = parseInt(process.env.DEBUG_SCAN_MAX || "20", 10);

// Mapeo de ciudades a IDs para Airtable
export const CITY_ID_MAP = {
  "Buenos Aires": 31,
  "Brisbane": 74,
  "Melbourne": 72,
  "Perth": 71,
  "Adelaide": 75,
  "Sydney": 32,
  "Canberra": 150,
  "Gold Coast": 73,
  "Newcastle": 158,
  "Brussels": 24,
  "Ghent": 200,
  "Rio de Janeiro": 47,
  "São Paulo": 28,
  "Fortaleza": 216,
  "Belo Horizonte": 151,
  "Calgary": 79,
  "Ottawa": 78,
  "Edmonton": 103,
  "Toronto": 40,
  "Montreal": 48,
  "Santiago": 144,
  "Toulouse": 23,
  "Marseille": 42,
  "Paris": 15,
  "Lyon": 22,
  "Nîmes": 215,
  "Bordeaux": 25,
  "Lille": 26,
  "La Rochelle": 202,
  "Berlin": 56,
  "Frankfurt": 62,
  "Cologne": 61,
  "Dublin": 43,
  "Bologna": 153,
  "Milan": 36,
  "Genoa": 165,
  "Palermo": 172,
  "Bari": 211,
  "Catania": 210,
  "Venice": 209,
  "Rome": 59,
  "Tijuana": 116,
  "Guadalajara": 101,
  "Mexico City": 29,
  "Monterrey": 102,
  "Toluca": 111,
  "Albuquerque": 127,
  "Cincinnati": 114,
  "Denver": 52,
  "Kansas City": 105,
  "Minneapolis": 88,
  "New Orleans": 86,
  "Orlando": 92,
  "Phoenix": 84,
  "Sacramento": 119,
  "San Antonio": 93,
  "Quebec": 77,
  "Stuttgart": 63,
  "The Hague": 159,
  "Rotterdam": 163,
  "Eindhoven": 162,
  "Utrecht": 231,
  "Lisbon": 17,
  "Porto": 27,
  "Singapore": 49,
  "Daegu": 221,
  "Seoul": 140,
  "Suwon": 223,
  "Busan": 214,
  "Valencia": 8,
  "Madrid": 5,
  "Barcelona": 7,
  "Bilbao": 13,
  "Malaga": 9,
  "Zaragoza": 130,
  "Gijón": 136,
  "Cádiz": 232,
  "Santander": 190,
  "Geneva": 82,
  "London": 11,
  "Glasgow": 44,
  "Manchester": 19,
  "Nottingham": 152,
  "Bristol": 68,
  "Brighton": 224,
  "Belfast": 128,
  "Leeds": 117,
  "Sheffield": 164,
  "Plymouth": 196,
  "Liverpool": 53,
  "Birmingham": 45,
  "Derry": 181,
  "Edinburgh": 129,
  "Indianapolis": 123,
  "New York": 6,
  "Miami": 30,
  "Houston": 38,
  "Washington DC": 41,
  "Dallas": 54,
  "Tampa": 98,
  "Charlotte": 107,
  "San Diego": 51,
  "St. Louis": 99,
  "Nantes": 113,
  "Hamburg": 57,
  "Firenze": 169,
  "Napoli": null, // No tiene ID en la lista
  "Torino": 81,
  "Alicante": 138,
  "Ibiza": 18,
  "Sevilla": 10,
  "Los Angeles": 16,
  "San Francisco": 37,
  "Tulsa": 235,
  "Raleigh": 115,
  "Seattle": 50,
  "Atlanta": 55,
  "Chicago": 21,
  "Boston": 39,
  "Philadelphia": 70,
  "Detroit": 89,
  "Austin": 85,
  "Baltimore": 95,
  "Portland": 94,
  "Nashville": 97,
  "Richmond": 126,
  "Wellington": 67,
  "Munich": 58,
  "Nice": 46,
  "Las Vegas": 69,
  "Jacksonville": 125,
  "Cleveland": 87,
  "Amsterdam": 60,
  "Porto Alegre": 173,
  "Vancouver": 76,
};

/**
 * Obtiene el ID de una ciudad basándose en su nombre
 * @param {string} cityName - Nombre de la ciudad
 * @returns {number|null} - ID de la ciudad o null si no se encuentra
 */
export function getCityId(cityName) {
  if (!cityName) return null;
  
  // Normalizar el nombre de la ciudad (trim, lowercase para comparación)
  const normalizedCityName = String(cityName).trim();
  
  // Buscar coincidencia exacta (case-insensitive)
  for (const [city, id] of Object.entries(CITY_ID_MAP)) {
    if (city.toLowerCase() === normalizedCityName.toLowerCase()) {
      return id;
    }
  }
  
  // Si no hay coincidencia exacta, retornar null
  return null;
}

// Campos Airtable por ID
export const FIDS = {
  EMAIL_ID: "fldzmLo4J0PpFCUL4",
  FROM: "fldOweKPiSKQ8vW42",
  TO: "fldDDZvYdlCopczxK",
  CC: "fldk68GgLlbEKBttM",
  SUBJECT: "fldHHkrea243KuNbV",
  BODY: "fldKOjM5sSSJMIkqG",
  BUSINESS_OPPT: "fldSLDjBi7hlNxam8",
};

// Prompt de intent (optimizado)
export const INTENT_PROMPT = `
Analyze inbound leads for partnerships, sponsorships, and media collaborations. Follow steps in order:

DISCARD CHECKS (execute first, skip rest if match):
- Auto signatures: "Sent from Outlook/Gmail", "aka.ms" links, email client signatures → "Discard"
- Gambling: betting, casinos, sportsbooks, poker promotion requests → "Discard" (even with pricing mentions)
- Offers TO us: portfolios, UGC services, influencer services, products/services offered → "Discard" (key: are they ASKING us to promote FOR THEM? If not, it's an offer)

PARTNERSHIP ANALYSIS (if not Discard):
Very High: Multi-year commitment OR major brand (Coca-Cola, Uber, Nike, Amazon, etc.) OR >$50K upfront OR well-known person/corporation
High: Clear proposal with budget/fees/scope OR pricing request WITH partnership context OR defined volume/frequency (e.g., "5 articles/month")
Medium: Partnership intent but undefined scope (e.g., "help promote our restaurant")

NON-PARTNERSHIP (if no partnership):
- Press Release: "press release"/"nota de prensa" → "Low" (never Medium+)
- Free Coverage: press release shared OR explicit free coverage request → "Low", free_coverage_request=true
- Barter: event invites, press passes, services in exchange → "Low", barter_request=true (mutually exclusive with free coverage)
- Pricing Only: asking rates without partnership context → follow partnership rules (Coca-Cola=Very High, with scope=High, generic=Medium), pricing_request=true

MEDDIC (Medium/High/Very High only, use "no info" for Low/Discard, max 200 words total):
M-Metrics: Economic outcomes (revenue, costs, risk)
E-Economic Buyer: Final P&L decision-maker with budget authority
D-Decision Criteria: Factors for judging solutions
D-Decision Process: Steps/stakeholders/timeline to approval
I-Identify Pain: Business challenge driving action
C-Champion: Internal advocate who will sell for us

OUTPUT: JSON only, no extra text:
{
  "intent": "Very High|High|Medium|Low|Discard",
  "confidence": 0.0-1.0,
  "reasoning": "max 300 chars",
  "free_coverage_request": boolean,
  "barter_request": boolean,
  "pricing_request": boolean,
  "meddic_metrics": "description or 'no info'",
  "meddic_economic_buyer": "description or 'no info'",
  "meddic_decision_criteria": "description or 'no info'",
  "meddic_decision_process": "description or 'no info'",
  "meddic_identify_pain": "description or 'no info'",
  "meddic_champion": "description or 'no info'"
}

`.trim();


