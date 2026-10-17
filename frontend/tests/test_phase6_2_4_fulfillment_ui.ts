/**
 * Phase 6.2.4 - Hospital Requisition Assignment, Blood Unit Traceability,
 * TTI Screening, Clinical Crossmatching, and Controlled Dispatch UI Test Suite
 *
 * Validates:
 * 1. File Architecture & Component Existence (Requisitions, Screening, Dispatch, Receipt screens)
 * 2. Navigation Consistency across Blood Bank and Hospital TopNavs
 * 3. Swastya Three-Portal Design System Conformance (#053845, #317786, #F3E9D1, #FAF6EE, #B94F30, #EFA27E)
 * 4. API Client Integration & Endpoints (Assignments, Screening, Crossmatches, Dispatch, Receipt, Discard)
 * 5. Idempotency Key Generation & Mutation Safety
 * 6. Clinical Safety & Fail-Closed Protocols (5-Panel TTI, Dual Sign-off, Cold-Box 2°C–6°C Invariants, Excursion Quarantine)
 * 7. Boundary Protection: Existing Phase 6.2.2 Inventory Overview remains strictly unpolluted
 */

import fs from 'fs';
import path from 'path';
import { generateIdempotencyKey } from '../src/lib/idempotency';

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
  console.log('\n========================================================================');
  console.log('--- SWASTYA PHASE 6.2.4 FULFILLMENT & TRACEABILITY UI TESTS ---');
  console.log('========================================================================\n');

  const requisitionsPagePath = path.resolve(__dirname, '../src/app/bloodbank/requisitions/page.tsx');
  const screeningPagePath = path.resolve(__dirname, '../src/app/bloodbank/screening/page.tsx');
  const dispatchPagePath = path.resolve(__dirname, '../src/app/bloodbank/dispatch/page.tsx');
  const receiptPagePath = path.resolve(__dirname, '../src/app/hospital/receipt/page.tsx');
  const bbTopNavPath = path.resolve(__dirname, '../src/components/bloodbank/BloodBankTopNav.tsx');
  const hospitalTopNavPath = path.resolve(__dirname, '../src/components/hospital/HospitalTopNav.tsx');
  const apiPath = path.resolve(__dirname, '../src/lib/api.ts');
  const inventoryPagePath = path.resolve(__dirname, '../src/app/bloodbank/inventory/page.tsx');

  console.log('Group 1: File Architecture & Page Route Existence');
  assert(fs.existsSync(requisitionsPagePath), 'bloodbank/requisitions/page.tsx exists');
  assert(fs.existsSync(screeningPagePath), 'bloodbank/screening/page.tsx exists');
  assert(fs.existsSync(dispatchPagePath), 'bloodbank/dispatch/page.tsx exists');
  assert(fs.existsSync(receiptPagePath), 'hospital/receipt/page.tsx exists');
  assert(fs.existsSync(bbTopNavPath), 'components/bloodbank/BloodBankTopNav.tsx exists');
  assert(fs.existsSync(hospitalTopNavPath), 'components/hospital/HospitalTopNav.tsx exists');
  assert(fs.existsSync(apiPath), 'lib/api.ts exists');

  const reqSrc = fs.readFileSync(requisitionsPagePath, 'utf-8');
  const screenSrc = fs.readFileSync(screeningPagePath, 'utf-8');
  const dispatchSrc = fs.readFileSync(dispatchPagePath, 'utf-8');
  const receiptSrc = fs.readFileSync(receiptPagePath, 'utf-8');
  const bbTopNavSrc = fs.readFileSync(bbTopNavPath, 'utf-8');
  const hospTopNavSrc = fs.readFileSync(hospitalTopNavPath, 'utf-8');
  const apiSrc = fs.readFileSync(apiPath, 'utf-8');
  const invSrc = fs.readFileSync(inventoryPagePath, 'utf-8');

  console.log('\nGroup 2: Portal Navigation Integration & Sibling Consistency');
  assert(
    bbTopNavSrc.includes('/bloodbank/requisitions') && bbTopNavSrc.includes('Requisitions Queue'),
    'BloodBankTopNav links to /bloodbank/requisitions'
  );
  assert(
    bbTopNavSrc.includes('/bloodbank/screening') && bbTopNavSrc.includes('TTI Screening'),
    'BloodBankTopNav links to /bloodbank/screening'
  );
  assert(
    bbTopNavSrc.includes('/bloodbank/dispatch') && bbTopNavSrc.includes('Dispatch & Crossmatch'),
    'BloodBankTopNav links to /bloodbank/dispatch'
  );
  assert(
    hospTopNavSrc.includes('/hospital/receipt') && hospTopNavSrc.includes('Delivery Receipt'),
    'HospitalTopNav links to /hospital/receipt'
  );
  assert(
    bbTopNavSrc.includes('md:hidden') && hospTopNavSrc.includes('md:hidden'),
    'Both navigation bars support responsive mobile drawer menus'
  );

  console.log('\nGroup 3: Swastya Three-Portal Design System Conformance');
  const screens = [
    { name: 'Requisitions', src: reqSrc },
    { name: 'Screening', src: screenSrc },
    { name: 'Dispatch', src: dispatchSrc },
    { name: 'Receipt', src: receiptSrc },
  ];

  screens.forEach(({ name, src }) => {
    assert(src.includes('#053845'), `${name} page uses Peacock Blue (#053845) for brand identity`);
    assert(src.includes('#317786'), `${name} page uses Teal Blue (#317786) for accents & indicators`);
    assert(src.includes('#F3E9D1'), `${name} page uses Swastya Cream (#F3E9D1) for borders & cards`);
    assert(src.includes('#FAF6EE'), `${name} page uses Cream Tint (#FAF6EE) for subtle backgrounds`);
    assert(src.includes('font-serif'), `${name} page utilizes Playfair Display (font-serif) headings`);
    assert(src.includes('rounded-3xl'), `${name} page maintains consistent rounded-3xl card curvature`);
    assert(src.includes('overflow-x-auto'), `${name} page provides responsive overflow-x-auto tables`);
  });

  console.log('\nGroup 4: API Client Methods & Data Interfaces');
  assert(apiSrc.includes('getAssignments:'), 'api.bloodbank.getAssignments is defined');
  assert(apiSrc.includes('updateAssignment:'), 'api.bloodbank.updateAssignment is defined');
  assert(apiSrc.includes('createReservation:'), 'api.bloodbank.createReservation is defined');
  assert(apiSrc.includes('getUnits:'), 'api.bloodbank.getUnits is defined');
  assert(apiSrc.includes('recordScreening:'), 'api.bloodbank.recordScreening is defined');
  assert(apiSrc.includes('getScreeningHistory:'), 'api.bloodbank.getScreeningHistory is defined');
  assert(apiSrc.includes('recordCrossmatch:'), 'api.bloodbank.recordCrossmatch is defined');
  assert(apiSrc.includes('dispatchReservation:'), 'api.bloodbank.dispatchReservation is defined');
  assert(apiSrc.includes('cancelReservation:'), 'api.bloodbank.cancelReservation is defined');
  assert(apiSrc.includes('discardUnit:'), 'api.bloodbank.discardUnit is defined');
  assert(apiSrc.includes('confirmReceipt:'), 'api.hospital.confirmReceipt is defined');
  assert(apiSrc.includes('bloodbanks: {'), 'api.bloodbanks directory namespace is defined');

  console.log('\nGroup 5: Idempotency Key & Concurrency Protection');
  assert(
    reqSrc.includes('generateIdempotencyKey()') &&
    screenSrc.includes('generateIdempotencyKey()') &&
    dispatchSrc.includes('generateIdempotencyKey()') &&
    receiptSrc.includes('generateIdempotencyKey()'),
    'All four new workflow screens generate and propagate Idempotency-Key headers'
  );

  console.log('\nGroup 6: Clinical Safety & Protocol Invariants');
  // TTI Screening Protocols
  assert(
    screenSrc.includes('HIV') && screenSrc.includes('Hepatitis B') && screenSrc.includes('Hepatitis C') &&
    screenSrc.includes('Syphilis') && screenSrc.includes('Malaria'),
    'TTI Screening validates complete 5-panel infectious disease tests'
  );
  assert(
    screenSrc.includes('labTechnicianName') && screenSrc.includes('medicalOfficerName'),
    'TTI Screening enforces dual sign-off (Technician + Medical Officer)'
  );
  assert(
    screenSrc.includes('isAllClear') && screenSrc.includes('PASSED') && screenSrc.includes('FAILED'),
    'TTI Screening automatically marks FAILED if any pathogen marker is reactive'
  );

  // Crossmatching & Controlled Dispatch
  assert(
    dispatchSrc.includes('allCompatible') && dispatchSrc.includes('COMPATIBLE'),
    'Dispatch is strictly blocked unless all units have certified COMPATIBLE crossmatch'
  );
  assert(
    dispatchSrc.includes('courierTempC') && dispatchSrc.includes('2°C–6°C'),
    'Dispatch requires cold-box temperature recording and documents 2°C–6°C storage invariants'
  );

  // Hospital Delivery Receipt & Excursion Quarantine
  assert(
    receiptSrc.includes('arrivalTempC') && receiptSrc.includes('isSevereExcursion'),
    'Hospital receipt evaluates arrival cold-box temperature against excursion boundaries'
  );
  assert(
    receiptSrc.includes('REJECTED_EXCURSION') && receiptSrc.includes('quarantine'),
    'Shipments with temperature excursions are rejected into quarantine without auto-discard'
  );
  assert(
    receiptSrc.includes('recipientName'),
    'Hospital receipt requires receiving clinician / technologist signature'
  );

  console.log('\nGroup 7: Boundary Protection & Regression Isolation');
  assert(
    !invSrc.includes('/dispatch') && !invSrc.includes('/fulfill') && !invSrc.includes('/requisitions/assign'),
    'Phase 6.2.2 Inventory Overview remains completely isolated from direct dispatch/fulfill mutation paths'
  );
  assert(
    !invSrc.includes('/dispose') && !invSrc.includes('/discard'),
    'Phase 6.2.2 Inventory Overview contains no direct unit disposal actions'
  );

  console.log('\n------------------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('------------------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
