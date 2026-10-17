/**
 * Phase 5.8 - Hospital Donor Card Grid UI Test Suite
 *
 * Validates:
 * 1. DonorCard component existence, props contract, and field rendering
 * 2. Responsive CSS Grid configuration: 4 cards/row (desktop), 2 cards/row (medium), 1 card/row (mobile)
 * 3. Swastya brand palette conformance (Peacock Blue, Teal Blue, Cream, White, Warm Coral, Burnt Orange, Alert Red)
 * 4. Preservation of actions (View Details trigger) and pagination mechanics (12 items/page)
 * 5. Empty state, search, and filter retention in the donor registry page
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
  console.log('--- SWASTYA PHASE 5.8 HOSPITAL DONOR CARD GRID TESTS ---');
  console.log('======================================================\n');

  const donorCardPath = path.resolve(__dirname, '../src/components/hospital/DonorCard.tsx');
  const donorsPagePath = path.resolve(__dirname, '../src/app/hospital/donors/page.tsx');

  console.log('Group 1: Component File & Import Structure');
  assert(fs.existsSync(donorCardPath), 'DonorCard.tsx component exists in components/hospital/');
  assert(fs.existsSync(donorsPagePath), 'Hospital donors page.tsx exists in app/hospital/donors/');

  const donorCardSource = fs.readFileSync(donorCardPath, 'utf-8');
  const donorsPageSource = fs.readFileSync(donorsPagePath, 'utf-8');

  assert(donorsPageSource.includes("import { DonorCard } from"), 'donors/page.tsx imports DonorCard');
  assert(donorsPageSource.includes("<DonorCard"), 'donors/page.tsx renders <DonorCard');

  console.log('\nGroup 2: Responsive CSS Grid Layout');
  assert(
    donorsPageSource.includes("lg:grid-cols-4"),
    'CSS Grid defines exactly 4 columns on desktop (lg:grid-cols-4)'
  );
  assert(
    donorsPageSource.includes("sm:grid-cols-2"),
    'CSS Grid defines 2 columns on medium screens (sm:grid-cols-2)'
  );
  assert(
    donorsPageSource.includes("grid-cols-1"),
    'CSS Grid defines 1 column on mobile (grid-cols-1)'
  );
  assert(
    donorsPageSource.includes("grid"),
    'Container uses CSS grid display'
  );

  console.log('\nGroup 3: DonorCard Content & Hierarchy');
  assert(donorCardSource.includes("donor.bloodGroup"), 'Card renders donor blood group prominently');
  assert(donorCardSource.includes("donor.name"), 'Card renders donor full name');
  assert(donorCardSource.includes("donor.city"), 'Card renders city/location');
  assert(donorCardSource.includes("donor.email"), 'Card renders donor email address');
  assert(donorCardSource.includes("donor.phoneNumber"), 'Card renders donor phone number');
  assert(donorCardSource.includes("donor.accountStatus"), 'Card displays account activation status');
  assert(donorCardSource.includes("donor.historicalVerificationStatus"), 'Card displays historical verification status');
  assert(donorCardSource.includes("donor.donationCount"), 'Card displays hospital donation records count');

  console.log('\nGroup 4: Swastya Brand Palette Compliance');
  assert(
    donorCardSource.includes("#053845"),
    'Card uses Swastya Peacock Blue (#053845) for donor names / primary text'
  );
  assert(
    donorCardSource.includes("#317786"),
    'Card uses Swastya Teal Blue (#317786) for accents and metadata icons'
  );
  assert(
    donorCardSource.includes("#F3E9D1") || donorCardSource.includes("#FAF6EE"),
    'Card uses Swastya Cream/Provolone (#F3E9D1 / #FAF6EE) for borders and subtle badges'
  );
  assert(
    donorCardSource.includes("bg-white"),
    'Card uses clean white background'
  );
  assert(
    !donorCardSource.includes("bg-gradient"),
    'Card does not use distracting gradients'
  );

  console.log('\nGroup 5: Card Actions & Interaction Safety');
  assert(
    donorCardSource.includes("onViewDetails"),
    'Card accepts onViewDetails callback'
  );
  assert(
    donorCardSource.includes("Eye") || donorCardSource.includes("Details"),
    'Card provides an explicit Details action button'
  );
  assert(
    donorsPageSource.includes("onViewDetails={loadDonorDetail}"),
    'donors/page.tsx connects onViewDetails to loadDonorDetail drawer'
  );

  console.log('\nGroup 6: Pagination & Upload Flow Continuity');
  assert(
    donorsPageSource.includes("limit: 12"),
    'Registry pagination uses limit 12 to perfectly fill 4-column desktop rows'
  );
  assert(
    donorsPageSource.includes("isUploadOpen"),
    'Upload modal functionality is preserved'
  );
  assert(
    donorsPageSource.includes("loadRegistry"),
    'Registry data loading and refresh functionality is preserved'
  );
  assert(
    donorsPageSource.includes("No donors found"),
    'Empty state is preserved when no donors match or exist'
  );

  console.log('\n======================================================');
  console.log(`Phase 5.8 Test Summary: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
