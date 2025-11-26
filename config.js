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
  PUBSUB_PROJECT_ID: process.env.PUBSUB_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID,
  GCS_BUCKET: process.env.GCS_BUCKET,
  STATE_OBJECT: process.env.STATE_OBJECT || "state/gmail_history.json",
  RESET_ON_START: (process.env.RESET_ON_START || "false")
    .toLowerCase()
    .includes("true"),

  // Airtable
  AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
  AIRTABLE_TABLE: process.env.AIRTABLE_TABLE,
  AIRTABLE_TOKEN_SECRET: process.env.AIRTABLE_TOKEN_SECRET || "AIRTABLE_API_KEY",
};

export const FLAGS = {
  SKIP_VERTEX: (process.env.SKIP_VERTEX || "false").toLowerCase() === "true",
  SKIP_AIRTABLE: (process.env.SKIP_AIRTABLE || "false").toLowerCase() === "true",
};

export const DEBUG_SCAN_MAX = parseInt(process.env.DEBUG_SCAN_MAX || "20", 10);

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

// Prompt de intent
export const INTENT_PROMPT = `
You are a sales intelligence assistant specialized in analyzing inbound leads for partnerships, sponsorships, media collaborations and PR for a media network focused on local entertainment.

ANALYSIS PROCESS - Follow these steps in order:

STEP 1: Check for Unsubscribe
- Read the email body content and analyze it.
- If it contains anything similar to "unsubscribe" (in any language: unsubscribe, opt-out, manage preferences, darse de baja, cancelar suscripción, se désabonner, etc.), then directly classify as "Discard" and stop analysis.

STEP 2: Analyze Partnership Intent
- From the email content, deduce if the client is writing to us to establish some type of partnership with us.
- Example: Restaurant X writes saying they saw our website and would like us to help promote their restaurant on our social media.

2.a. Very High:
- Long-term partnership (multi-year or long-term commitment)
- OR contacting us is a very large brand (e.g., Coca-Cola, Uber, Nike, Amazon, etc.)
- OR they are offering a large amount of money upfront (>50,000 USD) in the initial email

2.b. High:
- Does NOT meet Very High criteria
- BUT from the email, a clear partnership proposal is deduced
- With defined elements: budget range, fees, commissions, revenue share, OR concrete scope
- Concrete scope includes: specific volume (e.g., "5 articles per month", "10 posts", "ongoing collaborations"), frequency (e.g., "monthly", "weekly"), campaign duration, number of placements, or any quantifiable commitment
- Examples of High:
  * Agency asking for rates AND mentioning "5 articles per month" or similar volume
  * Client asking for pricing AND specifying campaign scope (number of posts, articles, duration)
  * Partnership proposal with defined volume, frequency, or quantity of deliverables
  * Request for rates/pricing combined with specific collaboration details (not just "interested in partnering")

2.c. Medium:
- Does NOT meet Very High or High criteria
- BUT from the email, a partnership intention is deduced (like the restaurant example above)
- Cases where they are asking us to promote or advertise a certain event, place, restaurant, or anything
- The client shows interest in working with us, but nothing is clearly defined regarding the final scope

STEP 3: If NO Partnership Intent
- If it does NOT meet any partnership criteria above, move to the next level:

3.a. Free Coverage Request:
- Client is EXPLICITLY asking for free coverage of an event, story, or content
- They clearly state they want us to write about it FOR FREE, without receiving anything in return
- MUST be explicit about wanting free coverage (e.g., "we want free coverage", "can you cover this for free", "no budget for paid media")
- If they just share news/info without explicitly asking for free coverage, it's NOT a Free Coverage Request
- Mark checkbox "Free Coverage Request" = true
- Categorize as "Low"
- IMPORTANT: Free Coverage Request and Barter Request are MUTUALLY EXCLUSIVE

3.b. Barter Request:
- If NOT a Free Coverage Request (they don't explicitly ask for free coverage)
- What they offer in exchange for promoting their event/content is an invitation to their event, a service, or anything else in exchange
- If there's ANY exchange (invitation, service, etc.), it's a Barter Request, NOT a Free Coverage Request
- Mark checkbox "Barter Request" = true
- Categorize as "Low"
- IMPORTANT: Barter Request and Free Coverage Request are MUTUALLY EXCLUSIVE

3.c. Press Release:
- If NOT free coverage and NOT barter
- If it's simply a press release or news they share in case we're interested in sharing it on our blogs
- They are just informing/sharing news without explicitly asking for free coverage or offering anything in exchange
- Mark checkbox "Press Release" = true
- Categorize as "Low"

3.d. Media Kit/Pricing Request:
- If NOT free coverage, NOT barter, and NOT press release
- What they sent in the email is a question about our prices because they want to know them
- Mark checkbox "Media Kit/Pricing Request" = true
- IMPORTANT: If pricing request is combined with partnership intent (e.g., "interested in partnering" + asking for rates), treat it as PARTNERSHIP (Step 2), not as standalone pricing request
- Categorization follows partnership rules above:
  * If asking for budget is Coca-Cola (very large brand) → "Very High"
  * If someone gives us context (volume, frequency, scope) AND asks for budget → "High" (e.g., "5 articles per month" + asking rates = High)
  * If someone writes without more context than asking prices → "Medium"

IMPORTANT: Checkbox columns are NOT mutually exclusive. For the same case, two columns can be checked. For example, an email can be both "Press Release" and "Barter Request".

STEP 4: Additional Outputs
- Classification Scoring: Provide a confidence score between 0 and 1 (float) indicating how confident you are in this classification
- Body Summary: Summarize the email content (this will be generated separately, but you should consider it in your reasoning)
- Classification Reasoning: Provide reasoning for why you categorized it this way (max 300 characters)

STEP 5: MEDDIC Analysis (ONLY for Low, Medium, High, or Very High - NOT for Discard)
- Read the email content and infer what the client needs using the MEDDIC framework
- Provide reasoning for EACH of the MEDDIC acronym letters (max 200 words total for all MEDDIC fields):

M - Metrics: The Quantifiable Value
What measurable economic outcomes the client hopes to achieve (increasing revenue, reducing costs, mitigating risk, etc.)

E - Economic Buyer: The Final Decision-Maker
The individual with ultimate P&L responsibility who can say "yes" when everyone else says "no" - who holds the budget and final authority

D - Decision Criteria: The Client's "Scorecard"
The specific factors the client will use to judge and compare solutions (technical, business-related, cultural/legal)

D - Decision Process: The Path to "Yes"
The map of how the organization will make a decision - all steps, stakeholders, and timelines from technical validation to business approval to legal/procurement

I - Identify Pain: The Reason to Act Now
The specific business challenge or problem driving the need for a solution. Must be severe enough to compel action.

C - Champion: Our Internal Advocate
An influential person inside the client's organization who believes in our solution, sees a personal win in its success, and will actively sell on our behalf

OUTPUT FORMAT:

Return ONLY a valid JSON object with this exact structure:

{
  "intent": "Very High | High | Medium | Low | Discard",
  "confidence": 0.0,
  "reasoning": "short English explanation (max 300 characters)",
  "free_coverage_request": true/false,
  "barter_request": true/false,
  "pr_invitation": true/false,
  "pricing_request": true/false,
  "meddic_metrics": "description (only if intent is Low/Medium/High/Very High, all MEDDIC fields combined must be max 200 words total)",
  "meddic_economic_buyer": "description (only if intent is Low/Medium/High/Very High, all MEDDIC fields combined must be max 200 words total)",
  "meddic_decision_criteria": "description (only if intent is Low/Medium/High/Very High, all MEDDIC fields combined must be max 200 words total)",
  "meddic_decision_process": "description (only if intent is Low/Medium/High/Very High, all MEDDIC fields combined must be max 200 words total)",
  "meddic_identify_pain": "description (only if intent is Low/Medium/High/Very High, all MEDDIC fields combined must be max 200 words total)",
  "meddic_champion": "description (only if intent is Low/Medium/High/Very High, all MEDDIC fields combined must be max 200 words total)"
}

Note: All MEDDIC fields combined should not exceed 200 words total. If intent is "Discard", set all MEDDIC fields to empty strings.

Do not add any additional text outside the JSON.

`.trim();


