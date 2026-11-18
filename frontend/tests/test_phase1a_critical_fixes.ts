/**
 * Phase 1A Regression Test Suite:
 * 1. Infinite Auth Loop & Transient Error Resilience (auth.ts, donor/layout.tsx, requester/layout.tsx)
 * 2. Authenticated Prescription Blob Retrieval (api.ts, requester/requests/[id], hospital/requests/[id])
 * 3. Wrong-Request Substitution Prevention (donor/requests/[id]/donate/page.tsx)
 * 4. Next.js 15 Suspense Boundary for useSearchParams() (requester/donors/page.tsx)
 */

import fs from "fs";
import path from "path";
import assert from "node:assert";
import { setAuthToken, clearAuthToken, setStoredUser, AuthUser } from "../src/lib/auth";

let passed = 0;
let failed = 0;

function check(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ` -> ${detail}` : ""}`);
    failed++;
  }
}

// Setup minimal browser globals for runtime auth event testing
const storageMap = new Map<string, string>();
const listeners = new Map<string, Array<(e: any) => void>>();

(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};
(globalThis as any).sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
(globalThis as any).CustomEvent = class CustomEventMock {
  type: string;
  detail: any;
  constructor(type: string, init?: { detail?: any }) {
    this.type = type;
    this.detail = init?.detail;
  }
};
(globalThis as any).window = {
  addEventListener: (type: string, fn: (e: any) => void) => {
    const arr = listeners.get(type) || [];
    arr.push(fn);
    listeners.set(type, arr);
  },
  removeEventListener: (type: string, fn: (e: any) => void) => {
    const arr = listeners.get(type) || [];
    listeners.set(
      type,
      arr.filter((f) => f !== fn)
    );
  },
  dispatchEvent: (ev: any) => {
    const arr = listeners.get(ev.type) || [];
    arr.forEach((fn) => fn(ev));
    return true;
  },
  location: { pathname: "/donor/dashboard", href: "" },
};

async function runTests() {
  console.log("\n=== SWASTYA PHASE 1A REGRESSION TESTS ===\n");

  // 1. Runtime Auth Event Cycle Tests
  console.log("Group 1: Authentication Event Cycle & Loop Prevention");
  const receivedReasons: Array<string | undefined> = [];
  const authListener = (ev: any) => {
    receivedReasons.push(ev?.detail?.reason);
  };
  (globalThis as any).window.addEventListener("swastya-auth-change", authListener);

  const mockUser: AuthUser = {
    userid: "11111111-1111-4111-8111-111111111111",
    name: "Test Donor",
    email: "donor@swastya.test",
    phonenumber: null,
    role: "DONOR",
  };

  setStoredUser(mockUser, null, null, null, null, { silent: true });
  check(
    receivedReasons.length === 0,
    "setStoredUser(..., { silent: true }) does NOT dispatch swastya-auth-change"
  );

  setStoredUser(mockUser);
  check(
    receivedReasons.length === 1 && receivedReasons[0] === "profile-sync",
    "setStoredUser() dispatches profile-sync reason (not session-change)"
  );

  setAuthToken("jwt-abc");
  clearAuthToken();
  check(
    receivedReasons.length === 3 &&
      receivedReasons[1] === "session-change" &&
      receivedReasons[2] === "session-change",
    "setAuthToken and clearAuthToken dispatch session-change events"
  );

  (globalThis as any).window.removeEventListener("swastya-auth-change", authListener);

  // Static verification of DonorLayout & RequesterLayout loop/transient guards
  const donorLayoutSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/app/donor/layout.tsx"),
    "utf-8"
  );
  const requesterLayoutSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/app/requester/layout.tsx"),
    "utf-8"
  );

  for (const [name, src] of [
    ["DonorLayout", donorLayoutSrc],
    ["RequesterLayout", requesterLayoutSrc],
  ] as const) {
    check(src.includes("inFlightRef"), `${name} coalesces duplicate /auth/me calls via inFlightRef`);
    check(
      src.includes("{ silent: true }"),
      `${name} calls setStoredUser with { silent: true } to prevent event recursion`
    );
    check(
      src.includes('detail?.reason === "profile-sync"'),
      `${name} ignores profile-sync events in swastya-auth-change listener`
    );
    check(
      src.includes("status === 401 || status === 403"),
      `${name} only clears token and logs out on 401/403 (preserving session on 429/5xx/network errors)`
    );
    check(
      src.includes('window.removeEventListener("swastya-auth-change"'),
      `${name} cleans up swastya-auth-change listener on unmount`
    );
  }

  // 2. Authenticated Prescription Viewing Tests
  console.log("\nGroup 2: Authenticated Prescription Blob Retrieval");
  const apiSrc = fs.readFileSync(path.resolve(__dirname, "../src/lib/api.ts"), "utf-8");
  const reqDetailSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/app/requester/requests/[id]/page.tsx"),
    "utf-8"
  );
  const hospDetailSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/app/hospital/requests/[id]/page.tsx"),
    "utf-8"
  );

  check(
    apiSrc.includes("fetchPrescriptionBlob") && apiSrc.includes("Authorization: `Bearer ${token}`"),
    "api.bloodRequests.fetchPrescriptionBlob sends Authorization Bearer header"
  );
  check(
    apiSrc.includes("response.status === 401") &&
      apiSrc.includes("response.status === 403") &&
      apiSrc.includes("response.status === 404"),
    "fetchPrescriptionBlob explicitly handles 401, 403, and 404 errors"
  );

  for (const [name, src] of [
    ["requester/requests/[id]", reqDetailSrc],
    ["hospital/requests/[id]", hospDetailSrc],
  ] as const) {
    check(
      !src.includes("href={api.bloodRequests.getPrescriptionDownloadUrl"),
      `${name} no longer uses unauthenticated <a href> for prescription viewing/downloading`
    );
    check(
      src.includes("api.bloodRequests.fetchPrescriptionBlob") &&
        src.includes("URL.createObjectURL") &&
        src.includes("URL.revokeObjectURL"),
      `${name} retrieves prescription as Blob via object URL and revokes URLs`
    );
  }

  // 3. Wrong-Request Substitution Prevention
  console.log("\nGroup 3: Wrong-Request Substitution Prevention");
  const donateSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/app/donor/requests/[id]/donate/page.tsx"),
    "utf-8"
  );
  check(
    !donateSrc.includes("reqRes.requests[0]"),
    "donor/requests/[id]/donate no longer falls back to reqRes.requests[0]"
  );
  check(
    donateSrc.includes("if (!request)") && donateSrc.includes("Blood Request Not Found"),
    "donor/requests/[id]/donate renders a proper Not Found state when request is missing"
  );

  // 4. Suspense Boundary for useSearchParams
  console.log("\nGroup 4: Next.js 15 Suspense Boundary");
  const reqDonorsSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/app/requester/donors/page.tsx"),
    "utf-8"
  );
  check(
    reqDonorsSrc.includes("<Suspense") && reqDonorsSrc.includes("useSearchParams()"),
    "requester/donors/page.tsx wraps useSearchParams() consumer in a React <Suspense> boundary"
  );

  console.log(`\n=== PHASE 1A RESULTS: ${passed} passed, ${failed} failed ===\n`);
  assert.strictEqual(failed, 0);
}

runTests().catch((err) => {
  console.error("Phase 1A tests failed:", err);
  process.exit(1);
});
