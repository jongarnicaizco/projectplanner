import { Storage } from "@google-cloud/storage";
import { CFG, MODEL_PRICING, FLAGS } from "../config.js";
import { readSystemState, writeSystemState } from "./storage.js";
import { sendCostGuardAlert } from "./email-sender.js";

// Cache local simple para reducir lecturas a GCS (reset cada ejecución en Cloud Run)
let localStateCache = null;

/**
 * Verifica si podemos hacer una llamada a la AI basándonos en el coste acumulado
 * Maneja TIER 1 ($2) y TIER 2 ($8)
 */
export async function checkCostGuard(modelName, inputChars) {
    if (FLAGS.SKIP_VERTEX) return { allowed: true, currentCost: 0, estimatedCallCost: 0 };

    try {
        const costState = await getHourlyCostState(); // Estado de costes (contador)
        const systemState = await readSystemState(); // Estado de flags (Tier triggered?)

        const pricing = MODEL_PRICING[modelName] || MODEL_PRICING["default"];

        // Calcular coste estimado
        const inputCost = (inputChars / 1000000) * pricing.input;
        const outputCost = (500 / 1000000) * pricing.output;
        const estimatedCallCost = inputCost + outputCost;

        const newTotal = costState.current_hour_cost_usd + estimatedCallCost;

        // TIER 1 CHECK ($2.00)
        if (newTotal > CFG.COST_GUARD_TIER1_LIMIT && !systemState.tier1_triggered) {
            console.error(`[mfs] 🚨 TIER 1 TRIGGERED: $${newTotal.toFixed(4)} > ${CFG.COST_GUARD_TIER1_LIMIT}`);

            // Trigger Tier 1: Disable SF, Disable Email, Mark Tier 1 as triggered
            await writeSystemState({
                tier1_triggered: true,
                salesforce_status: "stopped",
                email_sending_status: "stopped"
            });

            // Send email asynchronously
            sendCostGuardAlert(1, newTotal, CFG.COST_GUARD_TIER1_LIMIT).catch(console.error);
        }

        // TIER 2 CHECK ($8.00)
        if (newTotal > CFG.COST_GUARD_TIER2_LIMIT && !systemState.tier2_triggered) {
            console.error(`[mfs] 🚨 TIER 2 TRIGGERED: $${newTotal.toFixed(4)} > ${CFG.COST_GUARD_TIER2_LIMIT}`);

            // Trigger Tier 2: Enable Low Power Mode, Mark Tier 2 as triggered
            await writeSystemState({
                tier2_triggered: true,
                low_power_mode: true
            });

            // Send email asynchronously
            sendCostGuardAlert(2, newTotal, CFG.COST_GUARD_TIER2_LIMIT).catch(console.error);
        }

        // Si estamos en Low Power Mode por Tier 2 u orden manual
        if (systemState.low_power_mode) {
            // Permitimos la llamada, pero Processor.js usará classifyIntentLowPower
            return {
                allowed: true,
                currentCost: costState.current_hour_cost_usd,
                estimatedCallCost,
                lowPowerMode: true
            };
        }

        return {
            allowed: true,
            currentCost: costState.current_hour_cost_usd,
            estimatedCallCost,
            lowPowerMode: false
        };

    } catch (error) {
        console.error("[mfs] Error en CostGuard, permitiendo llamada por seguridad:", error);
        return { allowed: true, currentCost: 0, estimatedCallCost: 0, lowPowerMode: false };
    }
}

/**
 * Registra el consumo real después de una llamada
 */
export async function trackUsage(modelName, inputChars, outputChars) {
    if (FLAGS.SKIP_VERTEX) return;

    try {
        const pricing = MODEL_PRICING[modelName] || MODEL_PRICING["default"];
        const inputCost = (inputChars / 1000000) * pricing.input;
        const outputCost = (outputChars / 1000000) * pricing.output;
        const actualCost = inputCost + outputCost;

        const state = await getHourlyCostState();
        state.current_hour_cost_usd += actualCost;
        if (state.current_day_cost_usd === undefined) state.current_day_cost_usd = 0;
        state.current_day_cost_usd += actualCost;

        await saveHourlyCostState(state);

    } catch (error) {
        console.error("[mfs] Error tracking usage in CostGuard:", error);
    }
}

// GESTIÓN DE ESTADO DE COSTES (CONTADOR HORARIO)
async function getHourlyCostState() {
    const now = new Date();
    const currentHourKey = `${now.toISOString().slice(0, 13)}`; // 2025-12-16T11

    if (localStateCache && localStateCache.hourKey === currentHourKey) {
        return localStateCache;
    }

    const storage = new Storage();
    const bucket = storage.bucket(CFG.GCS_BUCKET);
    const file = bucket.file(CFG.COST_GUARD_STATE_FILE);

    let state = {
        hourKey: currentHourKey,
        current_hour_cost_usd: 0
    };

    try {
        const [exists] = await file.exists();
        if (exists) {
            const [content] = await file.download();
            const loaded = JSON.parse(content.toString());

            if (loaded.hourKey === currentHourKey) {
                state = loaded;
            } else {
                console.log(`[mfs] Resetting Cost Guard Counter for new hour: ${currentHourKey}`);
                // Tiers reset logic
                // We do this asynchronously to not block
                const systemState = await readSystemState();
                if (systemState.tier1_triggered || systemState.tier2_triggered) {
                    console.log("[mfs] New hour detected, resetting Tier triggers automaticaly.");
                    await writeSystemState({
                        tier1_triggered: false,
                        tier2_triggered: false
                    });
                }
            }

            // CHECK DAY ROLLOVER
            const nowDayKey = now.toISOString().slice(0, 10); // 2025-12-16
            if (state.dayKey !== nowDayKey) {
                console.log(`[mfs] New Day detected: ${nowDayKey}. Archiving yesterday's cost.`);

                // Save yesterday's cost
                state.yesterday_cost_usd = state.current_day_cost_usd || 0;

                // Reset current day cost
                state.current_day_cost_usd = 0;

                // Update day key
                state.dayKey = nowDayKey;

                // Also reset hour cost just in case logic above didn't cover strict alignment
                state.current_hour_cost_usd = 0;
                state.hourKey = currentHourKey;
            }
        }
    } catch (e) {
        console.warn("[mfs] Cost Guard state read error (init new):", e.message);
    }

    localStateCache = state;
    return state;
}

async function saveHourlyCostState(state) {
    localStateCache = state;
    const storage = new Storage();
    const bucket = storage.bucket(CFG.GCS_BUCKET);
    const file = bucket.file(CFG.COST_GUARD_STATE_FILE);
    await file.save(JSON.stringify(state), {
        contentType: "application/json",
        metadata: { cacheControl: "no-cache" },
    });
}
