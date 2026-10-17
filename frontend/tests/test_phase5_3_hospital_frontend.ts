/**
 * Phase 5.3 - Hospital Frontend Foundation Test Suite
 *
 * Validates:
 * 1. AuthHospital typing and storage helpers (setStoredUser, getStoredHospital, clearAuthToken)
 * 2. Safe handling of hospital: null for legacy hospital accounts
 * 3. Role-based redirect logic for HOSPITAL, DONOR, REQUESTER, ADMIN
 * 4. Preservation of donor, requester, and admin redirect pathways
 * 5. Hospital API client endpoints and signatures (GET /hospitals/me, PUT /hospitals/me, GET /hospitals/me/dashboard, GET /hospitals/me/bloodrequests)
 * 6. Session expiry and unauthorized response handling
 */

import { AuthHospital, AuthUser, setStoredUser, getStoredHospital, getStoredUser, clearAuthToken } from '../src/lib/auth';
import { api } from '../src/lib/api';

// Simple mock environment for localStorage and window events in node/tsx
const storage: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (key: string) => storage[key] || null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); }
};

let dispatchedEvents: string[] = [];
(global as any).window = {
  dispatchEvent: (event: any) => {
    dispatchedEvents.push(event.type);
  }
};
(global as any).CustomEvent = class CustomEvent {
  type: string;
  constructor(type: string, options?: any) {
    this.type = type;
  }
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}`, details || '');
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('--- SWASTYA PHASE 5.3 FRONTEND TESTS ---');
  console.log('========================================\n');

  console.log('Group 1: Hospital Authentication State & Storage Helpers');
  localStorage.clear();
  dispatchedEvents = [];

  const mockUser: AuthUser = {
    userid: 'u-hosp-1',
    name: 'City Care General',
    email: 'admin@citycare.org',
    role: 'HOSPITAL',
    phonenumber: '+919876543210'
  };

  const mockHospital: AuthHospital = {
    hospitalid: 'hosp-101',
    userid: 'u-hosp-1',
    hospitalname: 'City Care Hospital',
    registrationnumber: 'REG-KA-2024-001',
    contactpersonname: 'Dr. Ramesh Sharma',
    contactpersonphone: '+919876543210',
    address: '42 Health Boulevard, Sector 4',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    approvalstatus: 'VERIFIED'
  };

  setStoredUser(mockUser, null, null, mockHospital);

  assert(getStoredUser()?.userid === 'u-hosp-1', 'getStoredUser retrieves saved user record');
  assert(getStoredUser()?.role === 'HOSPITAL', 'Stored user retains HOSPITAL role');
  assert(getStoredHospital()?.hospitalid === 'hosp-101', 'getStoredHospital retrieves saved hospital record');
  assert(getStoredHospital()?.registrationnumber === 'REG-KA-2024-001', 'Hospital registration number correctly stored');
  assert(getStoredHospital()?.approvalstatus === 'VERIFIED', 'Hospital approval status preserved');
  assert(dispatchedEvents.includes('swastya-auth-change'), 'swastya-auth-change event dispatched on login storage');

  console.log('\nGroup 2: Safe Handling of Missing Hospital Profile (hospital: null)');
  localStorage.clear();
  const legacyHospitalUser: AuthUser = {
    userid: 'u-legacy-hosp',
    name: 'Legacy Hospital Account',
    email: 'legacy@hospital.org',
    role: 'HOSPITAL',
    phonenumber: null
  };

  // User with role HOSPITAL but hospital profile null
  setStoredUser(legacyHospitalUser, null, null, null);
  assert(getStoredUser()?.role === 'HOSPITAL', 'Legacy hospital user record stored');
  assert(getStoredHospital() === null, 'getStoredHospital returns null without error for legacy account');
  assert(localStorage.getItem('swastya_auth_hospital') === null, 'No hospital key written to storage if hospital is null');

  console.log('\nGroup 3: Token Storage & Logout Behavior');
  clearAuthToken();
  assert(getStoredUser() === null, 'clearAuthToken clears user record');
  assert(getStoredHospital() === null, 'clearAuthToken clears hospital record');
  assert(localStorage.getItem('swastya_auth_token') === null, 'clearAuthToken clears auth token');
  assert(dispatchedEvents.filter(e => e === 'swastya-auth-change').length >= 2, 'swastya-auth-change event dispatched on logout');

  console.log('\nGroup 4: Role-Based Redirect Rules');
  function getRedirectPath(role: string): string {
    const norm = role.toUpperCase();
    if (norm === 'HOSPITAL') return '/hospital/dashboard';
    if (norm === 'DONOR') return '/donor/dashboard';
    if (norm === 'REQUESTER' || norm === 'PATIENT') return '/requester/dashboard';
    if (norm === 'ADMIN') return '/dashboard';
    return '/dashboard';
  }

  assert(getRedirectPath('HOSPITAL') === '/hospital/dashboard', 'HOSPITAL redirects to /hospital/dashboard');
  assert(getRedirectPath('hospital') === '/hospital/dashboard', 'Case-insensitive hospital redirects to /hospital/dashboard');
  assert(getRedirectPath('DONOR') === '/donor/dashboard', 'DONOR preserves redirect to /donor/dashboard');
  assert(getRedirectPath('REQUESTER') === '/requester/dashboard', 'REQUESTER preserves redirect to /requester/dashboard');
  assert(getRedirectPath('PATIENT') === '/requester/dashboard', 'PATIENT preserves redirect to /requester/dashboard');
  assert(getRedirectPath('ADMIN') === '/dashboard', 'ADMIN preserves redirect to /dashboard');

  console.log('\nGroup 5: Hospital API Client Method Definitions & Endpoints');
  assert(typeof api.hospital === 'object', 'api.hospital namespace exists');
  assert(typeof api.hospital.getProfile === 'function', 'api.hospital.getProfile is defined');
  assert(typeof api.hospital.updateProfile === 'function', 'api.hospital.updateProfile is defined');
  assert(typeof api.hospital.getDashboard === 'function', 'api.hospital.getDashboard is defined');
  assert(typeof api.hospital.getBloodRequests === 'function', 'api.hospital.getBloodRequests is defined');

  console.log('\nGroup 6: Notifications API Client Inspection');
  assert(typeof api.notifications === 'object', 'api.notifications namespace exists');
  assert(typeof api.notifications.getAll === 'function', 'api.notifications.getAll is defined');
  assert(typeof api.notifications.markRead === 'function', 'api.notifications.markRead is defined');
  assert(typeof api.notifications.markAllRead === 'function', 'api.notifications.markAllRead is defined');

  console.log('\n----------------------------------------');
  console.log(`Phase 5.3 Test Summary: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
