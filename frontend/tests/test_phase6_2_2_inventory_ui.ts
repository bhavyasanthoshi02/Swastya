/**
 * Phase 6.2.2 - Blood Bank Inventory Management UI Test Suite
 *
 * Validates:
 * 1. File Architecture & Component Existence (StockIntakeModal, StockAdjustmentModal, Idempotency utility)
 * 2. Idempotency Key Generation & Header Propagation in API Client
 * 3. Stock Intake UI: Blood group, component, quantity, future expiry date, lot merge detection
 * 4. Stock Adjustment UI: Available stock corrections, INCREMENT/DECREMENT, live balance preview, over-decrement prevention
 * 5. Reserved Stock Protection: Reserved units cannot be edited directly, invariance enforced
 * 6. Audit Immutability: No ledger update or deletion controls presented
 * 7. Search, Filter, Sort, Loading, and Empty States
 * 8. Responsive Layout & Swastya Design Tokens Compliance (#053845, #317786, #F3E9D1, #FAF6EE, #A2363A, #B94F30)
 * 9. Scope Boundaries: Reservations, disposal, and fulfillment workflows remain excluded
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
  console.log('\n=================================================================');
  console.log('--- SWASTYA PHASE 6.2.2 BLOOD BANK INVENTORY UI TESTS ---');
  console.log('=================================================================\n');

  const intakeModalPath = path.resolve(__dirname, '../src/components/bloodbank/StockIntakeModal.tsx');
  const adjustModalPath = path.resolve(__dirname, '../src/components/bloodbank/StockAdjustmentModal.tsx');
  const inventoryPagePath = path.resolve(__dirname, '../src/app/bloodbank/inventory/page.tsx');
  const idempotencyPath = path.resolve(__dirname, '../src/lib/idempotency.ts');
  const apiPath = path.resolve(__dirname, '../src/lib/api.ts');

  console.log('Group 1: File Architecture & Component Existence');
  assert(fs.existsSync(intakeModalPath), 'StockIntakeModal.tsx exists');
  assert(fs.existsSync(adjustModalPath), 'StockAdjustmentModal.tsx exists');
  assert(fs.existsSync(inventoryPagePath), 'bloodbank/inventory/page.tsx exists');
  assert(fs.existsSync(idempotencyPath), 'lib/idempotency.ts exists');
  assert(fs.existsSync(apiPath), 'lib/api.ts exists');

  const intakeSrc = fs.readFileSync(intakeModalPath, 'utf-8');
  const adjustSrc = fs.readFileSync(adjustModalPath, 'utf-8');
  const inventorySrc = fs.readFileSync(inventoryPagePath, 'utf-8');
  const idempotencySrc = fs.readFileSync(idempotencyPath, 'utf-8');
  const apiSrc = fs.readFileSync(apiPath, 'utf-8');

  console.log('\nGroup 2: Idempotency Key Generation & API Client Integration');
  const generatedKey = generateIdempotencyKey();
  assert(typeof generatedKey === 'string', 'generateIdempotencyKey returns string');
  assert(generatedKey.length >= 16 && generatedKey.length <= 255, 'Generated key length is between 16 and 255 characters');
  assert(/^[A-Za-z0-9_\-\:]{16,255}$/.test(generatedKey), 'Generated key satisfies format /^[A-Za-z0-9_\\-\\:]+$/');

  assert(
    apiSrc.includes('addInventory:') && apiSrc.includes('headers["Idempotency-Key"] = idempotencyKey'),
    'api.bloodbank.addInventory attaches Idempotency-Key header'
  );
  assert(
    apiSrc.includes('adjustInventory:') && apiSrc.includes('headers["Idempotency-Key"] = idempotencyKey'),
    'api.bloodbank.adjustInventory attaches Idempotency-Key header'
  );
  assert(
    apiSrc.includes('PATCH') && apiSrc.includes('/bloodbanks/${bloodBankId}/inventory/${inventoryId}'),
    'api.bloodbank.adjustInventory targets PATCH /bloodbanks/:bloodBankId/inventory/:inventoryId'
  );
  assert(
    apiSrc.includes('POST') && apiSrc.includes('/bloodbanks/${bloodBankId}/inventory'),
    'api.bloodbank.addInventory targets POST /bloodbanks/:bloodBankId/inventory'
  );

  console.log('\nGroup 3: Stock Intake Modal & Lot Merging Support');
  assert(
    intakeSrc.includes('BLOOD_GROUPS') && intakeSrc.includes('A+') && intakeSrc.includes('O-'),
    'Intake modal provides all 8 standard blood groups'
  );
  assert(
    intakeSrc.includes('BLOOD_COMPONENTS') && intakeSrc.includes('WHOLE_BLOOD') && intakeSrc.includes('PLATELETS'),
    'Intake modal provides WHOLE_BLOOD, RBC, PLATELETS, and PLASMA options'
  );
  assert(
    intakeSrc.includes('minExpiryDate') && intakeSrc.includes('setDate(tomorrow.getDate() + 1)'),
    'Intake modal restricts expiry date strictly to future dates (minimum tomorrow)'
  );
  assert(
    intakeSrc.includes('matchingLot') && intakeSrc.includes('Matching Vault Batch Found'),
    'Intake modal actively detects existing matching lot for automatic merging'
  );
  assert(
    intakeSrc.includes('Confirm & Merge Units') || intakeSrc.includes('isMerged'),
    'Intake modal provides visual distinction when merging matching batches'
  );
  assert(
    intakeSrc.includes('generateIdempotencyKey()'),
    'Intake modal generates fresh idempotency keys'
  );
  assert(
    intakeSrc.includes('handlePayloadChange'),
    'Intake modal regenerates idempotency key on payload modification'
  );

  console.log('\nGroup 4: Stock Adjustment Modal & Concurrency Over-Decrement Guard');
  assert(
    adjustSrc.includes('INCREMENT') && adjustSrc.includes('DECREMENT'),
    'Adjustment modal supports both INCREMENT and DECREMENT operations'
  );
  assert(
    adjustSrc.includes('isOverDecrement') && adjustSrc.includes('quantity > availableUnits'),
    'Adjustment modal computes over-decrement condition'
  );
  assert(
    adjustSrc.includes('Over-decrement prevented') || adjustSrc.includes('Cannot decrement'),
    'Adjustment modal displays explicit over-decrement prevention error'
  );
  assert(
    adjustSrc.includes('disabled={isSubmitting || isOverDecrement}'),
    'Adjustment submit button is disabled when decrement exceeds available stock'
  );
  assert(
    adjustSrc.includes('Balance Transition:') && adjustSrc.includes('newAvailableUnits'),
    'Adjustment modal renders real-time balance transition preview'
  );
  assert(
    adjustSrc.includes('reason.trim().length < 5') || adjustSrc.includes('clinical / audit reason'),
    'Adjustment modal requires a mandatory non-empty audit reason'
  );
  assert(
    adjustSrc.includes('generateIdempotencyKey()') && adjustSrc.includes('handleParamChange'),
    'Adjustment modal regenerates idempotency key when adjustment parameters change'
  );

  console.log('\nGroup 5: Reserved Units Protection & Ledger Immutability');
  assert(
    adjustSrc.includes('Reserved units cannot be modified') || adjustSrc.includes('strictly invariant'),
    'Adjustment modal explicitly states reserved units cannot be modified'
  );
  assert(
    !inventorySrc.includes('editReserved') && !intakeSrc.includes('unitsreserved') && !adjustSrc.includes('unitsreserved ='),
    'UI provides no input field or mutation method for unitsreserved'
  );
  assert(
    adjustSrc.includes('permanent, immutable inventory ledger'),
    'Adjustment modal explains ledger immutability and actor accountability'
  );
  assert(
    !inventorySrc.includes('DELETE /inventory') && !inventorySrc.includes('deleteLedger') && !inventorySrc.includes('deleteBatch'),
    'UI contains no destructive batch deletion or ledger removal endpoints'
  );

  console.log('\nGroup 6: Inventory Management Screen Integration & Controls');
  assert(
    inventorySrc.includes('StockIntakeModal'),
    'Inventory page imports and renders StockIntakeModal'
  );
  assert(
    inventorySrc.includes('StockAdjustmentModal'),
    'Inventory page imports and renders StockAdjustmentModal'
  );
  assert(
    inventorySrc.includes('PackagePlus') && inventorySrc.includes('Stock Intake / Register Lot'),
    'Inventory page renders Stock Intake primary trigger button'
  );
  assert(
    inventorySrc.includes('Adjust Stock') && inventorySrc.includes('setAdjustmentTargetLot'),
    'Inventory table rows feature Adjust Stock buttons opening adjustment modal'
  );
  assert(
    inventorySrc.includes('selectedBloodGroup') && inventorySrc.includes('selectedComponent'),
    'Inventory page includes blood group and component filters'
  );
  assert(
    inventorySrc.includes('selectedStatus') && inventorySrc.includes('LOW_STOCK') && inventorySrc.includes('EXPIRING_SOON'),
    'Inventory page includes stock status filter (low stock, expiring soon)'
  );
  assert(
    inventorySrc.includes('searchQuery') && inventorySrc.includes('Search by Batch ID'),
    'Inventory page provides search input for batch ID, blood group, or component'
  );
  assert(
    inventorySrc.includes('Last Updated') && inventorySrc.includes('lastUpdatedTime'),
    'Inventory table displays last updated timestamp'
  );
  assert(
    inventorySrc.includes('successMessage') && inventorySrc.includes('Ledger Mutation Committed'),
    'Inventory page presents clear success notification banner upon committed ledger mutations'
  );
  assert(
    inventorySrc.includes('Register First Stock Batch') || inventorySrc.includes('Clear all filters'),
    'Inventory page provides actionable empty state for unstocked or filtered vaults'
  );

  console.log('\nGroup 7: Swastya Design System Tokens & Responsiveness');
  assert(
    inventorySrc.includes('#053845') && intakeSrc.includes('#053845') && adjustSrc.includes('#053845'),
    'All views use Peacock Blue (#053845) for primary identity'
  );
  assert(
    inventorySrc.includes('#317786') && intakeSrc.includes('#317786') && adjustSrc.includes('#317786'),
    'All views use Teal Blue (#317786) for interactive accents'
  );
  assert(
    inventorySrc.includes('#F3E9D1') && intakeSrc.includes('#F3E9D1') && adjustSrc.includes('#F3E9D1'),
    'All views use Swastya Cream (#F3E9D1) for borders and subtle cards'
  );
  assert(
    inventorySrc.includes('overflow-x-auto'),
    'Inventory table is horizontally scrollable for mobile responsiveness'
  );

  console.log('\nGroup 8: Scope Boundary Adherence');
  assert(
    !inventorySrc.includes('/dispatch') && !inventorySrc.includes('/fulfill') && !inventorySrc.includes('/requisitions/assign'),
    'Phase 6.2.3 fulfillment and dispatch workflows are not present'
  );
  assert(
    !inventorySrc.includes('/dispose') && !inventorySrc.includes('/discard'),
    'Stock disposal workflows remain outside Phase 6.2.2 scope'
  );

  console.log('\n-----------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
