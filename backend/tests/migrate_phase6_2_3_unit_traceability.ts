import { prisma } from "../src/config/prisma";

export async function migratePhase623UnitTraceability() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 6.2.3: DATABASE MIGRATION - UNIT TRACEABILITY & CLINICAL SAFETY  ");
    console.log("===============================================================================\n");

    console.log("Step 1: Expanding inventory_operation_type enum...");
    const operationsToAdd = [
        "STOCK_INTAKE",
        "SCREENING_CLEARANCE",
        "RESERVATION_ALLOCATE",
        "RESERVATION_CANCEL",
        "UNIT_PACKED_COLD_BOX",
        "DISPATCH_DEPARTURE",
        "HOSPITAL_RECEIPT_CONFIRM",
        "TRANSIT_EXCURSION_RETURN",
        "UNIT_DISPOSAL",
        "OPENING_BALANCE_INITIALIZATION",
    ];

    for (const op of operationsToAdd) {
        await prisma.$executeRawUnsafe(`
            ALTER TYPE inventory_operation_type ADD VALUE IF NOT EXISTS '${op}';
        `);
    }
    console.log("  [PASS] inventory_operation_type enum updated with all Phase 6.2.3 operations.");

    console.log("Step 2: Altering inventory table for quarantine and legacy reconciliation...");
    await prisma.$executeRawUnsafe(`
        ALTER TABLE inventory 
        ADD COLUMN IF NOT EXISTS unitsquarantined INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS islegacyreconciled BOOLEAN NOT NULL DEFAULT true;

        ALTER TABLE inventoryledger DROP CONSTRAINT IF EXISTS chk_quantity_delta_nonzero;
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'chk_quantity_delta_valid'
            ) THEN
                ALTER TABLE inventoryledger ADD CONSTRAINT chk_quantity_delta_valid CHECK (
                    (operationtype IN ('SCREENING_CLEARANCE', 'RESERVATION_ALLOCATE', 'RESERVATION_CANCEL', 'UNIT_PACKED_COLD_BOX', 'HOSPITAL_RECEIPT_CONFIRM') AND quantitydelta = 0)
                    OR
                    (operationtype NOT IN ('SCREENING_CLEARANCE', 'RESERVATION_ALLOCATE', 'RESERVATION_CANCEL', 'UNIT_PACKED_COLD_BOX', 'HOSPITAL_RECEIPT_CONFIRM') AND quantitydelta != 0)
                );
            END IF;
        END $$;
    `);
    console.log("  [PASS] inventory columns and inventoryledger quantity delta constraint updated.");

    console.log("Step 3: Creating inventoryunits table with strict constraints...");
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS inventoryunits (
            unitid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            inventoryid UUID NOT NULL,
            bloodbankid UUID NOT NULL,
            unitbarcode VARCHAR(50) NOT NULL,
            donationidentificationnumber VARCHAR(50),
            bloodgroup blood_group NOT NULL,
            bloodcomponent blood_component NOT NULL,
            collectiondate TIMESTAMP(6),
            expirydate TIMESTAMP(6) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'QUARANTINED',
            ttiscreeningstatus VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            currentscreeningid UUID,
            storagebinlocation VARCHAR(50),
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            updatedat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_unit_inventory FOREIGN KEY (inventoryid)
                REFERENCES inventory(inventoryid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_unit_bloodbank FOREIGN KEY (bloodbankid)
                REFERENCES bloodbanks(bloodbankid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT uq_bloodbank_unitbarcode UNIQUE (bloodbankid, unitbarcode),
            CONSTRAINT chk_unit_status CHECK (status IN ('QUARANTINED', 'AVAILABLE', 'RESERVED', 'IN_TRANSIT', 'DELIVERED', 'DISCARDED')),
            CONSTRAINT chk_screening_status CHECK (ttiscreeningstatus IN ('PENDING', 'PASSED', 'FAILED', 'INDETERMINATE'))
        );
    `);
    console.log("  [PASS] inventoryunits table created.");

    console.log("Step 4: Creating unitscreeningrecords table (immutable & append-only)...");
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS unitscreeningrecords (
            screeningid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            unitid UUID NOT NULL,
            revisionnumber INT NOT NULL DEFAULT 1,
            iscurrent BOOLEAN NOT NULL DEFAULT true,
            supersededat TIMESTAMP(6),
            supersededbyuserid UUID,
            hivresult VARCHAR(20) NOT NULL,
            hbvresult VARCHAR(20) NOT NULL,
            hcvresult VARCHAR(20) NOT NULL,
            syphilisresult VARCHAR(20) NOT NULL,
            malariaresult VARCHAR(20) NOT NULL,
            overallstatus VARCHAR(20) NOT NULL,
            testedat TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            testedbyuserid UUID NOT NULL,
            verifiedat TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            verifiedbyuserid UUID NOT NULL,
            laboratoryremarks TEXT,
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_screening_unit FOREIGN KEY (unitid)
                REFERENCES inventoryunits(unitid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_screening_tester FOREIGN KEY (testedbyuserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_screening_verifier FOREIGN KEY (verifiedbyuserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_screening_supersededby FOREIGN KEY (supersededbyuserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT chk_screening_dual_signoff CHECK (testedbyuserid != verifiedbyuserid),
            CONSTRAINT chk_screening_overall CHECK (overallstatus IN ('PASSED', 'FAILED', 'INDETERMINATE')),
            CONSTRAINT uq_unit_screening_revision UNIQUE (unitid, revisionnumber)
        );
    `);

    // Partial unique index for active screening
    await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_screening_current_unit 
        ON unitscreeningrecords(unitid) 
        WHERE (iscurrent = true);
    `);

    // Foreign key from inventoryunits.currentscreeningid -> unitscreeningrecords.screeningid
    await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_unit_current_screening'
            ) THEN
                ALTER TABLE inventoryunits 
                ADD CONSTRAINT fk_unit_current_screening 
                FOREIGN KEY (currentscreeningid) REFERENCES unitscreeningrecords(screeningid) ON DELETE RESTRICT;
            END IF;
        END $$;
    `);
    console.log("  [PASS] unitscreeningrecords table, indices, and dual-signoff constraints created.");

    console.log("Step 5: Creating requisitionassignments table...");
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS requisitionassignments (
            assignmentid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            requestid UUID NOT NULL,
            bloodbankid UUID NOT NULL,
            assignedbyuserid UUID NOT NULL,
            assignedat TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            assignmentstatus VARCHAR(30) NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
            respondedat TIMESTAMP(6),
            respondedbyuserid UUID,
            declinereason TEXT,
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            updatedat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_assignment_request FOREIGN KEY (requestid)
                REFERENCES bloodrequests(requestid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_assignment_bloodbank FOREIGN KEY (bloodbankid)
                REFERENCES bloodbanks(bloodbankid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_assignment_assignedby FOREIGN KEY (assignedbyuserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_assignment_respondedby FOREIGN KEY (respondedbyuserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT chk_assignment_status CHECK (assignmentstatus IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'))
        );
    `);

    await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_request_active_assignment 
        ON requisitionassignments(requestid) 
        WHERE (assignmentstatus IN ('PENDING_ACCEPTANCE', 'ACCEPTED'));
    `);
    console.log("  [PASS] requisitionassignments table and unique active assignment index created.");

    console.log("Step 6: Creating bloodreservations table...");
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS bloodreservations (
            reservationid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            requestid UUID NOT NULL,
            assignmentid UUID NOT NULL,
            bloodbankid UUID NOT NULL,
            reservationstatus VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
            reservedbyuserid UUID NOT NULL,
            reservedat TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expiresat TIMESTAMP(6) NOT NULL,
            cancelledat TIMESTAMP(6),
            cancelledbyuserid UUID,
            cancellationreason TEXT,
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            updatedat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_reservation_request FOREIGN KEY (requestid)
                REFERENCES bloodrequests(requestid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_reservation_assignment FOREIGN KEY (assignmentid)
                REFERENCES requisitionassignments(assignmentid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_reservation_bloodbank FOREIGN KEY (bloodbankid)
                REFERENCES bloodbanks(bloodbankid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_reservation_reservedby FOREIGN KEY (reservedbyuserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_reservation_cancelledby FOREIGN KEY (cancelledbyuserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT chk_reservation_status CHECK (reservationstatus IN ('ACTIVE', 'PREPARED', 'DISPATCHED', 'COMPLETED', 'CANCELLED', 'EXPIRED'))
        );
    `);
    console.log("  [PASS] bloodreservations table created.");

    console.log("Step 7: Creating reservationitems table...");
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS reservationitems (
            itemid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            reservationid UUID NOT NULL,
            unitid UUID NOT NULL,
            itemstatus VARCHAR(30) NOT NULL DEFAULT 'RESERVED',
            allocatedat TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            preparedat TIMESTAMP(6),
            dispatchedat TIMESTAMP(6),
            deliveredat TIMESTAMP(6),
            releasedat TIMESTAMP(6),
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            updatedat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_item_reservation FOREIGN KEY (reservationid)
                REFERENCES bloodreservations(reservationid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_item_unit FOREIGN KEY (unitid)
                REFERENCES inventoryunits(unitid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT uq_reservation_unit UNIQUE (reservationid, unitid),
            CONSTRAINT chk_item_status CHECK (itemstatus IN ('RESERVED', 'PREPARED', 'DISPATCHED', 'DELIVERED', 'RELEASED', 'REJECTED_TRANSIT', 'DISCARDED'))
        );
    `);
    console.log("  [PASS] reservationitems table created.");

    console.log("Step 8: Creating clinicalcrossmatches table...");
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS clinicalcrossmatches (
            crossmatchid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            reservationitemid UUID NOT NULL,
            reservationid UUID NOT NULL,
            requestid UUID NOT NULL,
            unitid UUID NOT NULL,
            attemptnumber INT NOT NULL DEFAULT 1,
            iscurrent BOOLEAN NOT NULL DEFAULT true,
            isinvalidated BOOLEAN NOT NULL DEFAULT false,
            invalidationreason TEXT,
            methodology VARCHAR(50) NOT NULL,
            testresult VARCHAR(30) NOT NULL,
            validuntil TIMESTAMP(6) NOT NULL,
            testedat TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            testedbyuserid UUID NOT NULL,
            verifiedat TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            verifiedbyuserid UUID NOT NULL,
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_crossmatch_item FOREIGN KEY (reservationitemid)
                REFERENCES reservationitems(itemid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_crossmatch_reservation FOREIGN KEY (reservationid)
                REFERENCES bloodreservations(reservationid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_crossmatch_request FOREIGN KEY (requestid)
                REFERENCES bloodrequests(requestid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_crossmatch_unit FOREIGN KEY (unitid)
                REFERENCES inventoryunits(unitid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_crossmatch_tester FOREIGN KEY (testedbyuserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_crossmatch_verifier FOREIGN KEY (verifiedbyuserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT chk_crossmatch_dual_signoff CHECK (testedbyuserid != verifiedbyuserid),
            CONSTRAINT chk_crossmatch_result CHECK (testresult IN ('COMPATIBLE', 'INCOMPATIBLE', 'INCONCLUSIVE')),
            CONSTRAINT uq_crossmatch_item_attempt UNIQUE (reservationitemid, attemptnumber)
        );
    `);

    await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crossmatch_active_certificate 
        ON clinicalcrossmatches(reservationitemid) 
        WHERE (iscurrent = true);
    `);
    console.log("  [PASS] clinicalcrossmatches table and active certificate partial index created.");

    console.log("Step 9: Creating unitdispositionhistory table...");
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS unitdispositionhistory (
            dispositionid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            unitid UUID NOT NULL,
            bloodbankid UUID NOT NULL,
            actoruserid UUID NOT NULL,
            previousstatus VARCHAR(30) NOT NULL,
            newstatus VARCHAR(30) NOT NULL,
            reason VARCHAR(255) NOT NULL,
            temperaturereading DECIMAL(4, 2),
            notes TEXT,
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_disposition_unit FOREIGN KEY (unitid)
                REFERENCES inventoryunits(unitid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_disposition_bloodbank FOREIGN KEY (bloodbankid)
                REFERENCES bloodbanks(bloodbankid) ON DELETE RESTRICT ON UPDATE NO ACTION,
            CONSTRAINT fk_disposition_actor FOREIGN KEY (actoruserid)
                REFERENCES users(userid) ON DELETE RESTRICT ON UPDATE NO ACTION
        );
    `);
    console.log("  [PASS] unitdispositionhistory table created.");

    console.log("Step 10: Installing Database Triggers for Clinical Safety & Integrity...");

    // Trigger 1: Protect Screening Records (immutable, append-only, allow superseding updates only)
    await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION fn_protect_screening_records()
        RETURNS TRIGGER AS $$
        BEGIN
            IF (TG_OP = 'DELETE') THEN
                RAISE EXCEPTION 'CLINICAL VIOLATION: Screening records are immutable and cannot be deleted.';
            ELSIF (TG_OP = 'UPDATE') THEN
                IF (OLD.iscurrent = true AND NEW.iscurrent = false AND NEW.supersededat IS NOT NULL) THEN
                    RETURN NEW;
                ELSE
                    RAISE EXCEPTION 'CLINICAL VIOLATION: Screening results are immutable once recorded.';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_protect_screening_records ON unitscreeningrecords;
        CREATE TRIGGER trg_protect_screening_records
        BEFORE UPDATE OR DELETE ON unitscreeningrecords
        FOR EACH ROW EXECUTE FUNCTION fn_protect_screening_records();
    `);
    console.log("  [PASS] trg_protect_screening_records installed.");

    // Trigger 2: Enforce Unit Screening Clearance
    await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION fn_enforce_unit_screening_clearance()
        RETURNS TRIGGER AS $$
        DECLARE
            v_screening unitscreeningrecords%ROWTYPE;
        BEGIN
            IF (NEW.status IN ('AVAILABLE', 'RESERVED')) THEN
                IF (NEW.currentscreeningid IS NULL) THEN
                    RAISE EXCEPTION 'SAFETY VIOLATION: Unit % cannot enter % status without an attached screening record.', NEW.unitbarcode, NEW.status;
                END IF;
                
                SELECT * INTO v_screening 
                FROM unitscreeningrecords 
                WHERE screeningid = NEW.currentscreeningid;
                
                IF (v_screening.iscurrent != true OR v_screening.overallstatus != 'PASSED') THEN
                    RAISE EXCEPTION 'SAFETY VIOLATION: Unit % screening status is %, not PASSED.', NEW.unitbarcode, v_screening.overallstatus;
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_enforce_unit_screening_clearance ON inventoryunits;
        CREATE TRIGGER trg_enforce_unit_screening_clearance
        BEFORE INSERT OR UPDATE OF status, currentscreeningid ON inventoryunits
        FOR EACH ROW EXECUTE FUNCTION fn_enforce_unit_screening_clearance();
    `);
    console.log("  [PASS] trg_enforce_unit_screening_clearance installed.");

    // Trigger 3: 4-Way Crossmatch Referential Integrity Lock
    await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION fn_enforce_crossmatch_integrity()
        RETURNS TRIGGER AS $$
        DECLARE
            v_item reservationitems%ROWTYPE;
            v_res bloodreservations%ROWTYPE;
        BEGIN
            SELECT * INTO v_item FROM reservationitems WHERE itemid = NEW.reservationitemid;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'INTEGRITY VIOLATION: Reservation item % not found.', NEW.reservationitemid;
            END IF;

            IF (v_item.reservationid != NEW.reservationid) THEN
                RAISE EXCEPTION 'INTEGRITY VIOLATION: Crossmatch reservationid does not match reservationitems.reservationid.';
            END IF;

            IF (v_item.unitid != NEW.unitid) THEN
                RAISE EXCEPTION 'INTEGRITY VIOLATION: Crossmatch unitid does not match reservationitems.unitid.';
            END IF;

            SELECT * INTO v_res FROM bloodreservations WHERE reservationid = NEW.reservationid;
            IF (v_res.requestid != NEW.requestid) THEN
                RAISE EXCEPTION 'INTEGRITY VIOLATION: Crossmatch requestid does not match bloodreservations.requestid.';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_enforce_crossmatch_integrity ON clinicalcrossmatches;
        CREATE TRIGGER trg_enforce_crossmatch_integrity
        BEFORE INSERT ON clinicalcrossmatches
        FOR EACH ROW EXECUTE FUNCTION fn_enforce_crossmatch_integrity();
    `);
    console.log("  [PASS] trg_enforce_crossmatch_integrity installed.");

    console.log("Step 11: Anchoring legacy stock opening balances...");
    // Check if any legacy inventory lots have unledgered opening balances
    const lots: any[] = await prisma.$queryRawUnsafe(`
        SELECT inventoryid, bloodbankid, unitsavailable, unitsreserved
        FROM inventory
        WHERE (unitsavailable + unitsreserved) > 0;
    `);

    let initializedCount = 0;
    for (const lot of lots) {
        const totalUnits = lot.unitsavailable + lot.unitsreserved;
        const existingOpening: any[] = await prisma.$queryRawUnsafe(`
            SELECT ledgerid FROM inventoryledger 
            WHERE inventoryid = $1 AND operationtype = 'OPENING_BALANCE_INITIALIZATION';
        `, lot.inventoryid);

        if (existingOpening.length === 0) {
            // Find blood bank user to attribute initialization
            const bbUser: any[] = await prisma.$queryRawUnsafe(`
                SELECT userid FROM bloodbanks WHERE bloodbankid = $1;
            `, lot.bloodbankid);
            const actorUserId = bbUser[0]?.userid;

            if (actorUserId) {
                const idempotencyKey = `migration:opening-balance:${lot.inventoryid}`;
                const reqHash = "0000000000000000000000000000000000000000000000000000000000000000";
                const responseBody = JSON.stringify({
                    message: "Baseline opening balance initialized from pre-Phase 6.2.3 inventory",
                    initialAvailable: lot.unitsavailable,
                    initialReserved: lot.unitsreserved,
                    totalUnits,
                });

                await prisma.$executeRawUnsafe(`
                    INSERT INTO inventoryledger (
                        inventoryid, bloodbankid, actoruserid, operationtype,
                        quantitydelta, previousavailable, newavailable,
                        previousreserved, newreserved, reason, idempotencykey,
                        requesthash, responsecode, responsebody, createdat
                    ) VALUES (
                        $1, $2, $3, 'OPENING_BALANCE_INITIALIZATION',
                        $4, 0, $5, 0, $6, 'Phase 6.2.3 Baseline Opening Balance',
                        $7, $8, 200, $9::jsonb, NOW()
                    );
                `, lot.inventoryid, lot.bloodbankid, actorUserId, totalUnits, lot.unitsavailable, lot.unitsreserved, idempotencyKey, reqHash, responseBody);

                // Mark legacy lot as unreconciled so unit-level reservations do not oversell
                await prisma.$executeRawUnsafe(`
                    UPDATE inventory SET islegacyreconciled = false WHERE inventoryid = $1;
                `, lot.inventoryid);

                initializedCount++;
            }
        }
    }
    console.log(`  [PASS] Checked ${lots.length} legacy lots. Initialized ${initializedCount} opening-balance ledger baselines.`);

    console.log("\n>>> Phase 6.2.3 Database Migration Completed Successfully! <<<");
}

if (require.main === module) {
    migratePhase623UnitTraceability()
        .then(async () => {
            await prisma.$disconnect();
            process.exit(0);
        })
        .catch(async (err) => {
            console.error("Migration error:", err);
            await prisma.$disconnect();
            process.exit(1);
        });
}
