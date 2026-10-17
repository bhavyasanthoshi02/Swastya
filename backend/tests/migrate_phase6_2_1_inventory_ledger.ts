import { prisma } from "../src/config/prisma";

export async function migratePhase621InventoryLedger() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 6.2.1: INVENTORY AUDIT LEDGER & IMMUTABILITY MIGRATION          ");
    console.log("===============================================================================\n");

    console.log("Step 1: Running pre-migration safety checks...");
    // Verify required parent tables exist
    const parentTables: any = await prisma.$queryRawUnsafe(`
        SELECT table_name::text
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('inventory', 'bloodbanks', 'users');
    `);
    const foundTables = parentTables.map((t: any) => t.table_name);
    if (!foundTables.includes("inventory") || !foundTables.includes("bloodbanks") || !foundTables.includes("users")) {
        throw new Error(`Pre-migration safety check failed: Missing parent tables. Found: ${foundTables.join(", ")}`);
    }
    console.log("  [PASS] All parent tables (inventory, bloodbanks, users) verified.");

    console.log("Step 2: Creating inventory_operation_type enum if not exists...");
    await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
            CREATE TYPE inventory_operation_type AS ENUM (
                'STOCK_ADDITION',
                'CORRECTION_INCREMENT',
                'CORRECTION_DECREMENT'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    `);
    console.log("  [PASS] inventory_operation_type enum created or already exists.");

    console.log("Step 3: Creating immutable inventoryledger table with strict RESTRICT foreign keys...");
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS inventoryledger (
            ledgerid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            inventoryid UUID NOT NULL,
            bloodbankid UUID NOT NULL,
            actoruserid UUID NOT NULL,
            operationtype inventory_operation_type NOT NULL,
            quantitydelta INT NOT NULL,
            previousavailable INT NOT NULL,
            newavailable INT NOT NULL,
            previousreserved INT NOT NULL,
            newreserved INT NOT NULL,
            reason VARCHAR(255) NOT NULL,
            idempotencykey VARCHAR(255) NOT NULL,
            requesthash VARCHAR(64) NOT NULL,
            responsecode INT NOT NULL DEFAULT 200,
            responsebody JSONB NOT NULL,
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_ledger_inventory FOREIGN KEY (inventoryid)
                REFERENCES inventory(inventoryid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_ledger_bloodbank FOREIGN KEY (bloodbankid)
                REFERENCES bloodbanks(bloodbankid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_ledger_user FOREIGN KEY (actoruserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT uq_ledger_idempotency UNIQUE (idempotencykey),
            CONSTRAINT chk_quantity_delta_nonzero CHECK (quantitydelta != 0),
            CONSTRAINT chk_ledger_available_nonneg CHECK (previousavailable >= 0 AND newavailable >= 0),
            CONSTRAINT chk_ledger_reserved_nonneg CHECK (previousreserved >= 0 AND newreserved >= 0)
        );
    `);
    console.log("  [PASS] Table inventoryledger created successfully with check constraints.");

    console.log("Step 4: Creating performance indexes on inventoryledger...");
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_ledger_inventory ON inventoryledger(inventoryid);
        CREATE INDEX IF NOT EXISTS idx_ledger_bloodbank ON inventoryledger(bloodbankid);
        CREATE INDEX IF NOT EXISTS idx_ledger_actor ON inventoryledger(actoruserid);
        CREATE INDEX IF NOT EXISTS idx_ledger_createdat ON inventoryledger(createdat);
    `);
    console.log("  [PASS] Indexes created successfully.");

    console.log("Step 5: Installing database-level immutability enforcement trigger...");
    await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION trg_fn_prevent_ledger_modification()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'Clinical Governance Violation: inventoryledger rows are permanently immutable and cannot be updated or deleted (ledgerid: %)', OLD.ledgerid;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_prevent_ledger_update_delete ON inventoryledger;
        CREATE TRIGGER trg_prevent_ledger_update_delete
        BEFORE UPDATE OR DELETE ON inventoryledger
        FOR EACH ROW
        EXECUTE FUNCTION trg_fn_prevent_ledger_modification();
    `);
    console.log("  [PASS] Immutability trigger installed successfully.");

    console.log("Step 6: Verifying table creation and catalog state...");
    const tableCheck: any = await prisma.$queryRawUnsafe(`
        SELECT table_name::text FROM information_schema.tables WHERE table_name = 'inventoryledger';
    `);
    if (tableCheck.length === 0) {
        throw new Error("Verification failed: inventoryledger table was not found in catalog.");
    }

    const triggerCheck: any = await prisma.$queryRawUnsafe(`
        SELECT tgname::text FROM pg_trigger WHERE tgname = 'trg_prevent_ledger_update_delete';
    `);
    if (triggerCheck.length === 0) {
        throw new Error("Verification failed: Immutability trigger was not found in catalog.");
    }

    console.log("  [PASS] Migration verified successfully. inventoryledger is active and protected.\n");
}

if (require.main === module || process.argv[1]?.endsWith("migrate_phase6_2_1_inventory_ledger.ts")) {
    migratePhase621InventoryLedger()
        .then(async () => {
            console.log("Phase 6.2.1 database migration completed successfully.");
            await prisma.$disconnect();
            process.exit(0);
        })
        .catch(async (err) => {
            console.error("Phase 6.2.1 migration failed:", err);
            await prisma.$disconnect();
            process.exit(1);
        });
}
