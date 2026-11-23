/**
 * Swastya AI Blood Shortage Predictor Automated Verification Test Suite
 * 
 * Verifies:
 * 1. Database connectivity & tenant isolation (dev-sms-feature Neon branch).
 * 2. Multi-horizon forecasting (7-day, 14-day, 30-day).
 * 3. Component derivatives filtering (ALL, WHOLE_BLOOD, RBC, PLATELETS, PLASMA).
 * 4. 8-group ABO/Rh completeness & 4-tier risk classification (CRITICAL, HIGH, MODERATE, LOW).
 * 5. Shelf-life attrition & perishable stock modeling.
 * 6. Data sufficiency confidence scoring.
 * 7. AI insights generation & prioritized operational recommendations.
 * 8. Sub-resource API endpoints & tenant isolation.
 */

process.env.NODE_ENV = "development";
process.env.SWASTYA_DB_TARGET = "neon";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: Array<{ name: string; error: string }> = [];

function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${testName}`);
    } else {
        failedTests++;
        const err = detail ? `${testName} — ${detail}` : testName;
        failures.push({ name: testName, error: err });
        console.error(`  [FAIL] ${err}`);
        process.exitCode = 1;
    }
}

async function runTestSuite() {
    const { prisma } = await import("../src/config/prisma");
    const {
        BloodShortagePredictorService,
        ForecastPeriod,
        ShortageRiskLevel,
    } = await import("../src/services/bloodShortagePredictor.service");
    console.log("===============================================================================");
    console.log(" SWASTYA: AI BLOOD SHORTAGE PREDICTOR VERIFICATION TEST SUITE");
    console.log("===============================================================================\n");

    // 1. Safety & Tenant Setup
    console.log("--- 1. Safety & Database Fixture Verification ---");
    const bloodBank = await prisma.bloodbanks.findFirst({
        select: { bloodbankid: true, bloodbankname: true, userid: true, city: true, state: true },
    });
    assert(!!bloodBank, "1.1 Active blood bank facility found in development database");

    if (!bloodBank) {
        console.error("Cannot proceed without a test blood bank facility.");
        return;
    }
    console.log(`    Testing with facility: ${bloodBank.bloodbankname} (${bloodBank.bloodbankid}) in ${bloodBank.city || "Unknown City"}`);

    // 2. Multi-Horizon Forecasting Engine Tests
    console.log("\n--- 2. Multi-Horizon Forecasting Engine Tests (7, 14, 30 Days) ---");
    const horizons: ForecastPeriod[] = [7, 14, 30];

    for (const h of horizons) {
        const payload = await BloodShortagePredictorService.calculatePredictions({
            bloodBankId: bloodBank.bloodbankid,
            forecastDays: h,
        });

        assert(!!payload, `2.${h}.1 Successful prediction payload generated for ${h}-day horizon`);
        assert(payload.overview.forecastPeriodDays === h, `2.${h}.2 Payload reflects ${h}-day forecast horizon`);
        assert(payload.predictions.length === 8, `2.${h}.3 Exactly 8 ABO/Rh blood groups analyzed for ${h}-day horizon`);
        assert(payload.trends.timeline.length === h, `2.${h}.4 Trend timeline contains exactly ${h} daily projection points`);
        assert(typeof payload.overview.confidenceScore === "number", `2.${h}.5 Data sufficiency confidence score is numeric`);
        assert(["HIGH", "MEDIUM", "LOW"].includes(payload.overview.confidenceLevel), `2.${h}.6 Confidence level is HIGH, MEDIUM, or LOW`);
    }

    // 3. Component Filter Tests
    console.log("\n--- 3. Blood Component Derivative Filter Tests ---");
    const components = ["ALL", "WHOLE_BLOOD", "RBC", "PLATELETS", "PLASMA"];

    for (const comp of components) {
        const res = await BloodShortagePredictorService.calculatePredictions({
            bloodBankId: bloodBank.bloodbankid,
            forecastDays: 7,
            component: comp,
        });

        assert(res.overview.selectedComponent === comp, `3.1 Component filter '${comp}' correctly retained in overview`);
        assert(Array.isArray(res.predictions), `3.2 Predictions array returned for '${comp}'`);

        // Check each prediction's component breakdown
        for (const p of res.predictions) {
            assert(p.componentBreakdown.length > 0, `3.3 Component breakdown present for group ${p.displayName}`);
        }
    }

    // 4. ABO/Rh Completeness & Risk Classification Verification
    console.log("\n--- 4. ABO/Rh Completeness & 4-Tier Risk Classification ---");
    const prediction7 = await BloodShortagePredictorService.calculatePredictions({
        bloodBankId: bloodBank.bloodbankid,
        forecastDays: 7,
    });

    const groupsFound = new Set(prediction7.predictions.map((p) => p.bloodGroup));
    const allGroupsExpected = [
        "A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE",
        "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE",
    ];

    for (const g of allGroupsExpected) {
        assert(groupsFound.has(g as any), `4.1 Blood group ${g} present in predictions`);
    }

    const validRiskTiers: ShortageRiskLevel[] = ["CRITICAL", "HIGH", "MODERATE", "LOW"];
    for (const p of prediction7.predictions) {
        assert(validRiskTiers.includes(p.riskLevel), `4.2 Group ${p.displayName} risk level '${p.riskLevel}' is valid 4-tier risk`);
        assert(typeof p.daysOfSupply === "number" && p.daysOfSupply >= 0, `4.3 Group ${p.displayName} days of supply is non-negative number`);
        assert(typeof p.predictedDemand === "number" && p.predictedDemand >= 0, `4.4 Group ${p.displayName} predicted demand >= 0`);
        assert(typeof p.availableUnits === "number" && p.availableUnits >= 0, `4.5 Group ${p.displayName} available units >= 0`);
        assert(typeof p.explanation === "string" && p.explanation.length > 0, `4.6 Group ${p.displayName} has clinical explanation`);
    }

    // 5. Expiry & Shelf-Life Attrition Verification
    console.log("\n--- 5. Expiry & Shelf-Life Attrition Modeling ---");
    assert(typeof prediction7.overview.unitsApproachingCriticalExpiry === "number", "5.1 Units approaching expiry metric computed");
    assert(prediction7.overview.unitsApproachingCriticalExpiry >= 0, "5.2 Units approaching expiry is non-negative");

    // Verify alias generatePredictions
    const aliasResult = await BloodShortagePredictorService.generatePredictions({
        bloodBankId: bloodBank.bloodBankId || bloodBank.bloodbankid,
        period: 14,
        componentFilter: "RBC",
    });
    assert(aliasResult.overview.forecastPeriodDays === 14, "5.3 generatePredictions alias correctly handles period & componentFilter");
    assert(aliasResult.overview.selectedComponent === "RBC", "5.4 generatePredictions alias selected component matches RBC");

    // 6. AI Insights & Operational Recommendations
    console.log("\n--- 6. AI Insights & Operational Recommendations ---");
    assert(Array.isArray(prediction7.insights), "6.1 Insights array generated");
    assert(prediction7.insights.length > 0, `6.2 Generated ${prediction7.insights.length} dynamic AI insights`);

    for (const insight of prediction7.insights) {
        assert(["critical", "warning", "info", "success"].includes(insight.severity), `6.3 Insight '${insight.title}' has valid severity`);
        assert(typeof insight.suggestedAction === "string" && insight.suggestedAction.length > 0, `6.4 Insight has actionable suggestion`);
        assert(["HIGH", "MEDIUM", "LOW"].includes(insight.confidence), `6.5 Insight confidence score is valid`);
    }

    assert(Array.isArray(prediction7.recommendations), "6.6 Recommendations array generated");
    assert(prediction7.recommendations.length > 0, `6.7 Generated ${prediction7.recommendations.length} actionable recommendations`);

    for (const rec of prediction7.recommendations) {
        assert(["HIGH", "MEDIUM", "LOW"].includes(rec.priority), `6.8 Recommendation '${rec.title}' has valid priority`);
        assert(typeof rec.actionText === "string" && rec.actionText.length > 0, `6.9 Recommendation has concrete action text`);
    }

    // 7. Express HTTP API Routes & Tenant Isolation Tests
    console.log("\n--- 7. Express HTTP API Routes & Tenant Isolation Tests ---");
    const app = (await import("../src/app")).default;
    const { generateToken } = await import("../src/utils/jwt");

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        const bbToken = generateToken(bloodBank.userid, "BLOOD_BANK");

        // 7.1 Unified predictions endpoint
        const resPred = await fetch(`${baseUrl}/bloodbanks/me/predictions?period=7&component=ALL`, {
            headers: { Authorization: `Bearer ${bbToken}` },
        });
        assert(resPred.status === 200, "7.1 GET /bloodbanks/me/predictions returns 200 OK");
        const jsonPred: any = await resPred.json();
        assert(jsonPred.success === true, "7.2 Response body has success=true");
        assert(jsonPred.data?.overview?.forecastPeriodDays === 7, "7.3 Unified endpoint returns valid data object");

        // 7.2 Sub-resource /overview
        const resOverview = await fetch(`${baseUrl}/bloodbanks/me/predictions/overview?period=14`, {
            headers: { Authorization: `Bearer ${bbToken}` },
        });
        assert(resOverview.status === 200, "7.4 GET /bloodbanks/me/predictions/overview returns 200 OK");
        const jsonOverview: any = await resOverview.json();
        assert(jsonOverview.data?.forecastPeriodDays === 14, "7.5 Overview sub-resource reflects 14-day horizon");

        // 7.3 Sub-resource /shortages
        const resShortages = await fetch(`${baseUrl}/bloodbanks/me/predictions/shortages?period=7`, {
            headers: { Authorization: `Bearer ${bbToken}` },
        });
        assert(resShortages.status === 200, "7.6 GET /bloodbanks/me/predictions/shortages returns 200 OK");
        const jsonShortages: any = await resShortages.json();
        assert(Array.isArray(jsonShortages.data?.predictions), "7.7 Shortages sub-resource returns predictions array");

        // 7.4 Sub-resource /trends
        const resTrends = await fetch(`${baseUrl}/bloodbanks/me/predictions/trends?period=30`, {
            headers: { Authorization: `Bearer ${bbToken}` },
        });
        assert(resTrends.status === 200, "7.8 GET /bloodbanks/me/predictions/trends returns 200 OK");
        const jsonTrends: any = await resTrends.json();
        assert(jsonTrends.data?.trends?.timeline?.length === 30, "7.9 Trends sub-resource returns 30 timeline points");

        // 7.5 Sub-resource /insights
        const resInsights = await fetch(`${baseUrl}/bloodbanks/me/predictions/insights`, {
            headers: { Authorization: `Bearer ${bbToken}` },
        });
        assert(resInsights.status === 200, "7.10 GET /bloodbanks/me/predictions/insights returns 200 OK");
        const jsonInsights: any = await resInsights.json();
        assert(Array.isArray(jsonInsights.data?.insights), "7.11 Insights sub-resource returns insights array");
        assert(Array.isArray(jsonInsights.data?.recommendations), "7.12 Insights sub-resource returns recommendations array");

        // 7.6 Alias /api/blood-bank/predictions
        const resAlias = await fetch(`${baseUrl}/api/blood-bank/predictions?period=7`, {
            headers: { Authorization: `Bearer ${bbToken}` },
        });
        assert(resAlias.status === 200, "7.13 GET /api/blood-bank/predictions alias returns 200 OK");

        // 7.7 Unauthenticated request rejected with 401
        const resUnauth = await fetch(`${baseUrl}/bloodbanks/me/predictions`);
        assert(resUnauth.status === 401, "7.14 Unauthenticated request returns 401 Unauthorized");

        // 7.8 Role guard: Donor role cannot access blood bank shortage predictor
        const donorUser = await prisma.users.findFirst({ where: { role: "DONOR" }, select: { userid: true } });
        if (donorUser) {
            const donorToken = generateToken(donorUser.userid, "DONOR");
            const resDonor = await fetch(`${baseUrl}/bloodbanks/me/predictions`, {
                headers: { Authorization: `Bearer ${donorToken}` },
            });
            assert(resDonor.status === 403, "7.15 Donor role receives 403 Forbidden");
        }

        // 7.9 Tenant isolation: Cross-facility probe rejected with 403
        const resCrossProbe = await fetch(`${baseUrl}/bloodbanks/me/predictions?bloodBankId=00000000-0000-0000-0000-000000000000`, {
            headers: { Authorization: `Bearer ${bbToken}` },
        });
        assert(resCrossProbe.status === 403, "7.16 Cross-facility bloodBankId mismatch rejected with 403 Forbidden");
    } finally {
        server.close();
    }

    // 7. Summary & Results
    console.log("\n===============================================================================");
    console.log(`  TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
    console.log("===============================================================================\n");

    if (failedTests > 0) {
        console.error("FAILURES:");
        failures.forEach((f) => console.error(`  - ${f.error}`));
        process.exit(1);
    } else {
        console.log("ALL AI BLOOD SHORTAGE PREDICTOR TESTS PASSED SUCCESSFULLY!\n");
    }
}

runTestSuite()
    .catch((err) => {
        console.error("Fatal test error:", err);
        process.exit(1);
    })
    .finally(async () => {
        try {
            const { prisma } = await import("../src/config/prisma");
            await prisma.$disconnect();
        } catch {}
    });
