import dotenv from "dotenv";
import path from "path";
import jwt from "jsonwebtoken";

process.env.SWASTYA_DB_TARGET = "neon";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

async function diagnoseAllRoutes() {
  const { prisma } = await import("../src/config/prisma");
  const appModule = await import("../src/app");
  const app = appModule.default;
  const http = await import("http");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`Diagnostic server listening on ${baseUrl}\n`);

  // Fetch real users from Neon for each role
  const donorUser = await prisma.users.findFirst({ where: { role: "DONOR" }, include: { donors: true } });
  const requesterUser = await prisma.users.findFirst({ where: { role: "REQUESTER" }, include: { requesters: true } });
  const hospitalUser = await prisma.users.findFirst({ where: { role: "HOSPITAL" }, include: { hospitals: true } });
  const bloodbankUser = await prisma.users.findFirst({ where: { role: "BLOOD_BANK" }, include: { bloodbanks: true } });

  const { generateToken } = await import("../src/utils/jwt");

  const donorToken = donorUser ? generateToken(donorUser.userid, donorUser.role) : "";
  const requesterToken = requesterUser ? generateToken(requesterUser.userid, requesterUser.role) : "";
  const hospitalToken = hospitalUser ? generateToken(hospitalUser.userid, hospitalUser.role) : "";
  const bloodbankToken = bloodbankUser ? generateToken(bloodbankUser.userid, bloodbankUser.role) : "";

  const endpoints = [
    // Health & Auth
    { label: "Health", url: "/health", token: "" },
    { label: "Health DB", url: "/health/db", token: "" },
    { label: "Donor /auth/me", url: "/auth/me", token: donorToken },
    { label: "Hospital /auth/me", url: "/auth/me", token: hospitalToken },
    { label: "BloodBank /auth/me", url: "/auth/me", token: bloodbankToken },
    { label: "Requester /auth/me", url: "/auth/me", token: requesterToken },

    // Hospital Portal endpoints
    { label: "Hospital Surgeries List", url: "/hospitals/me/surgeries", token: hospitalToken },
    { label: "Hospital Surgeries Summary", url: "/hospitals/me/surgeries/summary", token: hospitalToken },
    { label: "Hospital Procedure Configs", url: "/hospitals/me/surgeries/configs", token: hospitalToken },
    { label: "Hospital Donors", url: "/hospitals/me/donors", token: hospitalToken },
    { label: "Hospital Blood Requests", url: "/bloodrequests", token: hospitalToken },

    // Donor Portal endpoints
    { label: "Donor History", url: "/donors/me/history", token: donorToken },
    { label: "Donor Notifications", url: "/notifications", token: donorToken },
    { label: "Donor Camps Nearby", url: "/camps/nearby?latitude=12.9716&longitude=77.5946", token: donorToken },
    { label: "Donor My Camps", url: "/camps/my-registrations", token: donorToken },

    // Requester Portal endpoints
    { label: "Requester Requests", url: "/bloodrequests", token: requesterToken },
    { label: "Requester Notifications", url: "/notifications", token: requesterToken },

    // Blood Bank Portal endpoints
    { label: "Blood Bank Inventory", url: "/bloodbanks/me/inventory", token: bloodbankToken },
    { label: "Blood Bank Camps", url: "/bloodbanks/me/camps", token: bloodbankToken },
    { label: "Blood Bank Equipment", url: "/equipment", token: bloodbankToken },
  ];

  const results: any[] = [];

  for (const ep of endpoints) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (ep.token) headers["Authorization"] = `Bearer ${ep.token}`;

      const res = await fetch(`${baseUrl}${ep.url}`, { headers });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = await res.text();
      }

      const passed = res.status >= 200 && res.status < 400;
      results.push({
        endpoint: ep.label,
        url: ep.url,
        status: res.status,
        result: passed ? "OK" : "ERROR",
        message: typeof data === "object" ? data?.message || data?.error || JSON.stringify(data).slice(0, 100) : String(data).slice(0, 100)
      });
    } catch (err: any) {
      results.push({
        endpoint: ep.label,
        url: ep.url,
        status: "NET_ERR",
        result: "ERROR",
        message: err.message
      });
    }
  }

  console.log("=== DIAGNOSTIC REPORT FOR ALL PORTALS ON NEON ===");
  console.table(results);

  server.close();
  await prisma.$disconnect();
}

diagnoseAllRoutes().catch(console.error);
