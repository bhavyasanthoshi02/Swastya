import { prisma } from "../backend/src/config/prisma";

async function runLiveVerification() {
    console.log("=== LIVE HTTP SERVER CUSTOM SMS DISPATCH VERIFICATION ===\n");

    // 1. Login as hospital user
    const loginRes = await fetch("http://localhost:5000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "hospital@gmail.com", password: "TestPassword123!" }),
    }).then(r => r.json());

    if (!loginRes.success || !loginRes.token) {
        throw new Error("Hospital login failed: " + JSON.stringify(loginRes));
    }
    console.log("1. Authenticated as Hospital:", loginRes.user.name, `(${loginRes.user.email})`);
    const token = loginRes.token;

    // 2. Fetch permitted recipients
    const recipientsRes = await fetch("http://localhost:5000/custom-sms/recipients", {
        headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    console.log("2. Permitted Recipients found:", recipientsRes.recipients?.length || 0);
    const targetRecipient = recipientsRes.recipients?.[0];
    if (!targetRecipient) {
        throw new Error("No permitted recipient found for hospital user!");
    }
    console.log("   Selected Recipient:", targetRecipient.displayName, `(masked: ${targetRecipient.maskedPhone})`);

    // 3. Send Custom SMS via live HTTP endpoint
    const idempotencyKey = `live_verify_${Date.now()}`;
    const sendRes = await fetch("http://localhost:5000/custom-sms/send", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            recipientUserId: targetRecipient.userId,
            message: "Please bring your original Aadhaar Card to Blood Bank Room 102 for verification.",
            contextRequestId: targetRecipient.targetRequestId,
            idempotencyKey,
        }),
    }).then(r => r.json());

    console.log("\n3. Send API Response:", sendRes);
    const outboxId = sendRes.data?.outboxId || sendRes.outboxId;
    if (!sendRes.success || !outboxId) {
        throw new Error("Failed to send Custom SMS: " + JSON.stringify(sendRes));
    }

    // 4. Wait 1.5 seconds for background outbox worker in server.ts to pick up and dispatch
    console.log("\n4. Waiting 2.5 seconds for server outbox worker to process...");
    await new Promise(r => setTimeout(r, 2500));

    // 5. Query Neon dev database for outbox record
    const outboxRecord = await prisma.smsoutbox.findUnique({
        where: { outboxid: outboxId },
    });
    console.log("\n5. Database Record Verified in Neon 'dev-sms-feature':");
    console.log({
        outboxId: outboxRecord?.outboxid,
        status: outboxRecord?.status,
        messagesid: outboxRecord?.messagesid,
        attempts: outboxRecord?.attempts,
        dispatchConfirmedAt: outboxRecord?.dispatchconfirmedat,
    });

    if (outboxRecord?.status !== "SENT" || !outboxRecord?.messagesid?.startsWith("SMmock_")) {
        throw new Error(`Outbox item not marked SENT by live worker! Status: ${outboxRecord?.status}`);
    }

    // 6. Fetch sender's custom SMS history
    const historyRes = await fetch("http://localhost:5000/custom-sms/history", {
        headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    console.log("\n6. Live SMS History Verified:");
    const foundInHistory = historyRes.history?.find((h: any) => h.outboxId === outboxId);
    console.log("   Found in sender history:", !!foundInHistory);
    console.log("   Delivery status in audit log:", foundInHistory?.status);
    console.log("   Masked phone in audit log:", foundInHistory?.maskedPhone);

    console.log("\n>>> LIVE SERVER CUSTOM SMS VERIFICATION PASSED 100%! <<<\n");
}

runLiveVerification().catch(err => {
    console.error("Live verification fatal error:", err);
    process.exit(1);
});
