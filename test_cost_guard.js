import { checkCostGuard, trackUsage } from "./services/cost-guard.js";
import { CFG, FLAGS } from "./config.js";

// Mock CFG for testing purposes if needed, though we import real one
console.log("Testing Cost Guard...");
console.log(`Max Hourly Cost: $${CFG.COST_GUARD_MAX_HOURLY_COST_USD}`);

async function test() {
    // Simulate a check
    console.log("Checking cost for 4000 chars...");
    const result = await checkCostGuard("gemini-2.5-flash", 4000);
    console.log("Check result:", result);

    if (result.allowed) {
        console.log("Tracking usage...");
        // Simulate tracking
        await trackUsage("gemini-2.5-flash", 4000, 500);
        console.log("Usage tracked.");
    }

    // Check again to see increase
    const result2 = await checkCostGuard("gemini-2.5-flash", 4000);
    console.log("Check result 2:", result2);
}

// Note: This test might fail locally if GCS creds aren't set up, 
// but it verifies syntax and imports.
test().catch(console.error);
