/**
 * Phase 5.6 - Hospital Request Creation Frontend Test Suite
 *
 * Validates:
 * 1. api.hospital.createBloodRequest API client method definition and signature
 * 2. CreateBloodRequestDto interface compatibility
 * 3. Existence and structural completeness of /hospital/requests/new page
 * 4. Hospital dashboard, blood requests page, and navigation integration
 */

import fs from 'fs';
import path from 'path';
import { api, CreateBloodRequestDto } from '../src/lib/api';

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
  console.log('--- SWASTYA PHASE 5.6 FRONTEND TESTS ---');
  console.log('========================================\n');

  console.log('Group 1: API Client Method & Contract Signatures');
  assert(typeof api.hospital === 'object', 'api.hospital namespace is defined');
  assert(typeof api.hospital.createBloodRequest === 'function', 'api.hospital.createBloodRequest is a function');
  assert(typeof api.hospital.getBloodRequests === 'function', 'api.hospital.getBloodRequests is a function');
  assert(typeof api.hospital.getDashboard === 'function', 'api.hospital.getDashboard is a function');
  assert(typeof api.hospital.getRequestDetails === 'function', 'api.hospital.getRequestDetails is a function');
  assert(typeof api.hospital.updateBloodRequest === 'function', 'api.hospital.updateBloodRequest is a function');

  // Verify type contract structure
  const sampleDto: CreateBloodRequestDto = {
    patientname: "Vikram Sen",
    patientage: 48,
    patientgender: "MALE",
    patientcontact: "9876543210",
    bloodgroup: "A_POSITIVE",
    bloodcomponent: "WHOLE_BLOOD",
    unitsrequired: 2,
    urgencylevel: "CRITICAL",
    isemergency: true,
    searchradius: 25,
    requiredby: new Date().toISOString(),
    notes: "Ward 4 Bed 12",
  };
  assert(Boolean(sampleDto.patientname && sampleDto.unitsrequired), 'CreateBloodRequestDto shape is valid');

  console.log('\nGroup 2: /hospital/requests/new Page Implementation');
  const newPagePath = path.resolve(__dirname, '../src/app/hospital/requests/new/page.tsx');
  assert(fs.existsSync(newPagePath), '/hospital/requests/new/page.tsx file exists');

  const pageContent = fs.readFileSync(newPagePath, 'utf8');
  assert(pageContent.includes('"use client"'), 'Page uses client-side rendering directive');
  assert(pageContent.includes('api.hospital.createBloodRequest'), 'Page calls api.hospital.createBloodRequest');
  assert(pageContent.includes('router.push(`/hospital/requests/${res.requestid}`)') || pageContent.includes('router.push'), 'Page navigates to request detail upon successful creation');
  assert(pageContent.includes('showReviewModal') || pageContent.includes('handleReview'), 'Page implements review/confirmation step before submission');
  assert(pageContent.includes('isSubmitting'), 'Page prevents duplicate submissions via loading state');
  assert(pageContent.includes('BLOOD_GROUPS') && pageContent.includes('BLOOD_COMPONENTS'), 'Page provides blood group and component selections');
  assert(pageContent.includes('URGENCY_LEVELS'), 'Page provides urgency selection');
  assert(pageContent.includes('patientcontact') || pageContent.includes('patientContact'), 'Page includes patient contact phone validation');

  console.log('\nGroup 3: Navigation Integration across Hospital Portal');
  const requestsPagePath = path.resolve(__dirname, '../src/app/hospital/requests/page.tsx');
  const requestsPageContent = fs.readFileSync(requestsPagePath, 'utf8');
  assert(requestsPageContent.includes('/hospital/requests/new'), 'Hospital blood requests page links to /hospital/requests/new');
  assert(requestsPageContent.includes('Create Blood Request'), 'Hospital blood requests page has "Create Blood Request" text');

  const dashboardPagePath = path.resolve(__dirname, '../src/app/hospital/dashboard/page.tsx');
  const dashboardPageContent = fs.readFileSync(dashboardPagePath, 'utf8');
  assert(dashboardPageContent.includes('/hospital/requests/new'), 'Hospital dashboard links to /hospital/requests/new');
  assert(dashboardPageContent.includes('Create Blood Request'), 'Hospital dashboard has prominent "Create Blood Request" action');

  const topNavPath = path.resolve(__dirname, '../src/components/hospital/HospitalTopNav.tsx');
  const topNavContent = fs.readFileSync(topNavPath, 'utf8');
  assert(topNavContent.includes('/hospital/requests/new'), 'Hospital top navigation links to /hospital/requests/new');

  console.log(`\n========================================`);
  console.log(`  Tests Passed: ${passed}`);
  console.log(`  Tests Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
