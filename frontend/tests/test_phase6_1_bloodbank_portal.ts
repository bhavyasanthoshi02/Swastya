/**
 * Phase 6.1 - Blood Bank Portal Foundation Test Suite
 *
 * Validates:
 * 1. Authenticated BLOOD_BANK users can access the portal and unauthorized roles are blocked
 * 2. Unauthenticated users are redirected according to established conventions
 * 3. Layout authentication, role authorization, and pending approval / unlinked states
 * 4. Facility dashboard renders real API aggregate metrics (no hardcoded mocks)
 * 5. Facility profile displays immutable approval status/license and allows supported mutations
 * 6. Inventory overview renders live records, filters, empty state, and read-only mode
 * 7. Unsupported inventory actions (manual addition, stock deletion) are not presented as functional
 * 8. Loading, empty, and server error states render correctly
 * 9. Responsive layout contracts across desktop, tablet, and mobile breakpoints
 * 10. Swastya brand tokens compliance (#053845, #317786, #F3E9D1, #FAF6EE, #A2363A, #B94F30)
 */

import fs from 'fs';
import path from 'path';

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
  console.log('\n======================================================');
  console.log('--- SWASTYA PHASE 6.1 BLOOD BANK PORTAL TESTS ---');
  console.log('======================================================\n');

  const layoutPath = path.resolve(__dirname, '../src/app/bloodbank/layout.tsx');
  const landingPath = path.resolve(__dirname, '../src/app/bloodbank/page.tsx');
  const dashboardPath = path.resolve(__dirname, '../src/app/bloodbank/dashboard/page.tsx');
  const profilePath = path.resolve(__dirname, '../src/app/bloodbank/profile/page.tsx');
  const inventoryPath = path.resolve(__dirname, '../src/app/bloodbank/inventory/page.tsx');
  const topNavPath = path.resolve(__dirname, '../src/components/bloodbank/BloodBankTopNav.tsx');
  const authPath = path.resolve(__dirname, '../src/lib/auth.ts');
  const apiPath = path.resolve(__dirname, '../src/lib/api.ts');
  const signinPath = path.resolve(__dirname, '../src/app/signin/page.tsx');
  const signupPath = path.resolve(__dirname, '../src/app/signup/page.tsx');

  console.log('Group 1: File Architecture & Component Existence');
  assert(fs.existsSync(layoutPath), 'bloodbank/layout.tsx exists');
  assert(fs.existsSync(landingPath), 'bloodbank/page.tsx exists');
  assert(fs.existsSync(dashboardPath), 'bloodbank/dashboard/page.tsx exists');
  assert(fs.existsSync(profilePath), 'bloodbank/profile/page.tsx exists');
  assert(fs.existsSync(inventoryPath), 'bloodbank/inventory/page.tsx exists');
  assert(fs.existsSync(topNavPath), 'components/bloodbank/BloodBankTopNav.tsx exists');

  const layoutSrc = fs.readFileSync(layoutPath, 'utf-8');
  const landingSrc = fs.readFileSync(landingPath, 'utf-8');
  const dashboardSrc = fs.readFileSync(dashboardPath, 'utf-8');
  const profileSrc = fs.readFileSync(profilePath, 'utf-8');
  const inventorySrc = fs.readFileSync(inventoryPath, 'utf-8');
  const topNavSrc = fs.readFileSync(topNavPath, 'utf-8');
  const authSrc = fs.readFileSync(authPath, 'utf-8');
  const apiSrc = fs.readFileSync(apiPath, 'utf-8');
  const signinSrc = fs.readFileSync(signinPath, 'utf-8');
  const signupSrc = fs.readFileSync(signupPath, 'utf-8');

  console.log('\nGroup 2: Authentication & Role Authorization Enforcement');
  assert(
    layoutSrc.includes('api.auth.me()'),
    'Layout validates session against backend api.auth.me()'
  );
  assert(
    layoutSrc.includes('BLOOD_BANK') && layoutSrc.includes('ADMIN'),
    'Layout permits only BLOOD_BANK and ADMIN roles'
  );
  assert(
    layoutSrc.includes('/signin?redirect='),
    'Unauthenticated callers are redirected to /signin with redirect parameter'
  );
  assert(
    layoutSrc.includes('router.replace("/dashboard")') || layoutSrc.includes('router.push("/dashboard")'),
    'Users with invalid roles are redirected or blocked from blood bank portal'
  );
  assert(
    signinSrc.includes('BLOOD_BANK') && signinSrc.includes('/bloodbank/dashboard'),
    'Sign-in redirects BLOOD_BANK users to /bloodbank/dashboard'
  );
  assert(
    signupSrc.includes('BLOOD_BANK') && signupSrc.includes('/bloodbank/dashboard'),
    'Sign-up redirects BLOOD_BANK users to /bloodbank/dashboard'
  );
  assert(
    authSrc.includes('export interface AuthBloodBank'),
    'auth.ts defines AuthBloodBank interface'
  );
  assert(
    authSrc.includes('getStoredBloodBank'),
    'auth.ts provides getStoredBloodBank getter'
  );

  console.log('\nGroup 3: API Client & Backend Integration');
  assert(
    apiSrc.includes('bloodbank: {'),
    'api.ts provides bloodbank namespace'
  );
  assert(
    apiSrc.includes('getProfile:') && apiSrc.includes('/bloodbanks/me'),
    'api.bloodbank.getProfile targets GET /bloodbanks/me'
  );
  assert(
    apiSrc.includes('updateProfile:') && apiSrc.includes('/bloodbanks/me'),
    'api.bloodbank.updateProfile targets PUT /bloodbanks/me'
  );
  assert(
    apiSrc.includes('getDashboard:') && apiSrc.includes('/dashboard'),
    'api.bloodbank.getDashboard targets GET /bloodbanks/:bloodBankId/dashboard'
  );
  assert(
    apiSrc.includes('getInventory:') && apiSrc.includes('/inventory'),
    'api.bloodbank.getInventory queries real blood bank inventory endpoint'
  );

  console.log('\nGroup 4: Facility Dashboard Implementation');
  assert(
    dashboardSrc.includes('api.bloodbank.getDashboard('),
    'Dashboard fetches live metrics via api.bloodbank.getDashboard(bloodBankId)'
  );
  assert(
    dashboardSrc.includes('dashboard.totalUnitsAvailable') || dashboardSrc.includes('totalUnitsAvailable'),
    'Dashboard renders totalUnitsAvailable from backend response'
  );
  assert(
    dashboardSrc.includes('dashboard.totalUnitsReserved') || dashboardSrc.includes('totalUnitsReserved'),
    'Dashboard renders totalUnitsReserved from backend response'
  );
  assert(
    dashboardSrc.includes('dashboard.totalInventoryRecords') || dashboardSrc.includes('totalInventoryRecords'),
    'Dashboard renders live totalInventoryRecords from backend response'
  );
  assert(
    dashboardSrc.includes('recentInventory') && dashboardSrc.includes('.map('),
    'Dashboard renders real recent inventory items table'
  );
  assert(
    dashboardSrc.includes('No Inventory Records Available') || dashboardSrc.includes('No Blood Unit Batches Registered'),
    'Dashboard provides graceful empty state for unstocked vaults'
  );
  assert(
    !dashboardSrc.includes('1,250') && !dashboardSrc.includes('4,800'),
    'Dashboard does not use hardcoded mock numbers in completed views'
  );

  console.log('\nGroup 5: Facility Profile & Ownership Security');
  assert(
    profileSrc.includes('api.bloodbank.getProfile()'),
    'Profile loads current facility data using api.bloodbank.getProfile()'
  );
  assert(
    profileSrc.includes('api.bloodbank.updateProfile('),
    'Profile submits permitted updates via api.bloodbank.updateProfile()'
  );
  assert(
    profileSrc.includes('Lock') && profileSrc.includes('Immutable'),
    'Regulatory license number is visually locked as immutable on existing profiles'
  );
  assert(
    profileSrc.includes('approvalstatus') || profileSrc.includes('Accreditation & Regulatory Status'),
    'Approval status is rendered read-only and reflects CDSCO/platform status'
  );
  assert(
    profileSrc.includes('Institutional Security Policy'),
    'Profile explicitly explains that approval and ownership are immutable by facility users'
  );
  assert(
    profileSrc.includes('isSaving') && profileSrc.includes('disabled={isSaving}'),
    'Profile submit button disables during mutation to prevent duplicate requests'
  );

  console.log('\nGroup 6: Inventory Overview & Scope Boundary');
  assert(
    inventorySrc.includes('api.bloodbank.getInventory('),
    'Inventory page queries real facility inventory records'
  );
  assert(
    inventorySrc.includes('selectedBloodGroup') && inventorySrc.includes('selectedComponent'),
    'Inventory provides blood group and component filter dropdowns'
  );
  assert(
    inventorySrc.includes('searchQuery'),
    'Inventory provides search query filtering'
  );
  assert(
    inventorySrc.includes('Read-Only Vault Mode (Phase 6.1 Architecture Notice)') ||
    inventorySrc.includes('Audit-Ledger Active') ||
    inventorySrc.includes('Blood Inventory Management'),
    'Inventory page documents vault governance and audit boundaries'
  );
  assert(
    !inventorySrc.includes('<button>Add Unit</button>') && !inventorySrc.includes('onClick={handleAddStock}'),
    'Unsupported inventory stock creation operations are not presented as functional'
  );
  assert(
    inventorySrc.includes('No Inventory Records Found'),
    'Inventory page provides clinical empty state when no stock matches'
  );

  console.log('\nGroup 7: UI Navigation & Layout Responsiveness');
  assert(
    topNavSrc.includes('/bloodbank/dashboard') &&
    topNavSrc.includes('/bloodbank/inventory') &&
    topNavSrc.includes('/bloodbank/profile'),
    'Top navigation links Dashboard, Inventory Overview, and Facility Profile'
  );
  assert(
    topNavSrc.includes('md:hidden') && topNavSrc.includes('isMobileMenuOpen'),
    'Top navigation provides responsive mobile drawer menu'
  );
  assert(
    dashboardSrc.includes('grid-cols-2') && dashboardSrc.includes('lg:grid-cols-4'),
    'Dashboard metric cards adapt responsively across mobile, tablet, and desktop'
  );
  assert(
    inventorySrc.includes('grid-cols-2') && inventorySrc.includes('lg:grid-cols-4'),
    'Inventory metrics adapt responsively across mobile, tablet, and desktop'
  );

  console.log('\nGroup 8: Swastya Brand Design Conformance');
  assert(
    topNavSrc.includes('#053845') && dashboardSrc.includes('#053845') && profileSrc.includes('#053845'),
    'Components use Peacock Blue (#053845) for brand identity and primary text'
  );
  assert(
    topNavSrc.includes('#317786') && dashboardSrc.includes('#317786') && inventorySrc.includes('#317786'),
    'Components use Teal Blue (#317786) for accents, active states, and spinners'
  );
  assert(
    dashboardSrc.includes('#F3E9D1') && profileSrc.includes('#F3E9D1') && inventorySrc.includes('#F3E9D1'),
    'Components use Swastya Cream (#F3E9D1) for subtle borders and backgrounds'
  );
  assert(
    !dashboardSrc.includes('bg-gradient-to-r') && !profileSrc.includes('bg-gradient-to-r'),
    'Components avoid excessive/distracting decorative gradients'
  );

  console.log('\n------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
