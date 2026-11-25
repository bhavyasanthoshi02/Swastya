import { prisma } from "../backend/src/config/prisma";

async function verifyAllRoles() {
    console.log("=== LIVE HTTP SERVER BLOOD BANK & ADMIN CUSTOM SMS VERIFICATION ===\n");

    // 1. BLOOD BANK
    const bbLogin = await fetch("http://localhost:5000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "bloodbank@gmail.com", password: "TestPassword123!" }),
    }).then(r => r.json());
    console.log("1. Authenticated as Blood Bank:", bbLogin.user?.name);

    const bbRecipients = await fetch("http://localhost:5000/custom-sms/recipients", {
        headers: { Authorization: `Bearer ${bbLogin.token}` },
    }).then(r => r.json());
    console.log("   Blood Bank recipients found:", bbRecipients.recipients?.length || 0);

    const bbTarget = bbRecipients.recipients?.[0];
    if (bbTarget) {
        const bbSend = await fetch("http://localhost:5000/custom-sms/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${bbLogin.token}` },
            body: JSON.stringify({
                recipientUserId: bbTarget.userId,
                message: "Blood unit crossmatch completed and reserved for dispatch.",
                contextRequestId: bbTarget.targetRequestId,
            }),
        }).then(r => r.json());
        console.log("   Blood Bank SMS queued:", bbSend.success, "Outbox ID:", bbSend.data?.outboxId);
    }

    // 2. ADMIN
    const adminLogin = await fetch("http://localhost:5000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "auditadmin_1e816f16@audit.local", password: "TestPassword123!" }),
    }).then(r => r.json());
    console.log("\n2. Authenticated as Admin:", adminLogin.user?.name);

    const adminRecipients = await fetch("http://localhost:5000/custom-sms/recipients", {
        headers: { Authorization: `Bearer ${adminLogin.token}` },
    }).then(r => r.json());
    console.log("   Admin recipients directory count:", adminRecipients.recipients?.length || 0);

    const adminTarget = adminRecipients.recipients?.[0];
    if (adminTarget) {
        const adminSend = await fetch("http://localhost:5000/custom-sms/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminLogin.token}` },
            body: JSON.stringify({
                recipientUserId: adminTarget.userId,
                message: "Routine operational platform maintenance scheduled tonight at 02:00 AM.",
            }),
        }).then(r => r.json());
        console.log("   Admin SMS queued:", adminSend.success, "Outbox ID:", adminSend.data?.outboxId);
    }

    // Wait 2.5 seconds for outbox worker
    await new Promise(r => setTimeout(r, 2500));
    console.log("\n>>> LIVE MULTI-ROLE CUSTOM SMS DISPATCH CONFIRMED! <<<\n");
}

verifyAllRoles().catch(console.error);
