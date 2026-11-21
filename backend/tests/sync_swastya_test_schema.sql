-- ============================================================================
-- Swastya Test Database Synchronization Script (AUD-01)
-- Target database: swastya_test ONLY
-- Idempotent, transactional, and strict conflict-checking (no blind drops).
-- ============================================================================

DO $$
BEGIN
  IF current_database() <> 'swastya_test' THEN
    RAISE EXCEPTION 'SAFETY ABORT: Expected database swastya_test, got %', current_database();
  END IF;
END $$;

BEGIN;

-- ============================================================================
-- 1. Missing columns on public.broadcastdeliveries & nullable pending verification on unitscreeningrecords
-- ============================================================================
ALTER TABLE public.broadcastdeliveries
  ADD COLUMN IF NOT EXISTS acceptancestatus varchar(30) DEFAULT 'PENDING'::character varying,
  ADD COLUMN IF NOT EXISTS acceptedat timestamp,
  ADD COLUMN IF NOT EXISTS acceptedbyuserid uuid,
  ADD COLUMN IF NOT EXISTS rejectedat timestamp,
  ADD COLUMN IF NOT EXISTS rejectedbyuserid uuid,
  ADD COLUMN IF NOT EXISTS receiptconfirmedat timestamp,
  ADD COLUMN IF NOT EXISTS receiptconfirmedbyuserid uuid,
  ADD COLUMN IF NOT EXISTS receiptfileurl text,
  ADD COLUMN IF NOT EXISTS receiptfilename varchar(255),
  ADD COLUMN IF NOT EXISTS receiptmimetype varchar(100),
  ADD COLUMN IF NOT EXISTS receiptfilesize int4;

ALTER TABLE public.unitscreeningrecords
  ALTER COLUMN verifiedat DROP NOT NULL,
  ALTER COLUMN verifiedat DROP DEFAULT,
  ALTER COLUMN verifiedbyuserid DROP NOT NULL;

-- ============================================================================
-- 2. Partial unique indexes (3 indexes) with strict definition conflict check
-- ============================================================================
DO $$
DECLARE
  v_idx record;
  v_actual text;
  v_expected_norm text;
  v_actual_norm text;
BEGIN
  FOR v_idx IN
    SELECT * FROM (VALUES
      (
        'uq_crossmatch_active_certificate',
        'CREATE UNIQUE INDEX uq_crossmatch_active_certificate ON public.clinicalcrossmatches USING btree (reservationitemid) WHERE (iscurrent = true)'
      ),
      (
        'uq_request_active_assignment',
        'CREATE UNIQUE INDEX uq_request_active_assignment ON public.requisitionassignments USING btree (requestid) WHERE ((assignmentstatus)::text = ANY (ARRAY[(''PENDING_ACCEPTANCE''::character varying)::text, (''ACCEPTED''::character varying)::text]))'
      ),
      (
        'uq_screening_current_unit',
        'CREATE UNIQUE INDEX uq_screening_current_unit ON public.unitscreeningrecords USING btree (unitid) WHERE (iscurrent = true)'
      ),
      (
        'uq_open_scheduler_job_per_request',
        'CREATE UNIQUE INDEX uq_open_scheduler_job_per_request ON public.emergencyschedulerjobs USING btree (requestid) WHERE ((status)::text = ANY ((ARRAY[''PENDING''::character varying, ''PROCESSING''::character varying])::text[]))'
      )
    ) AS t(indexname, expected_def)
  LOOP
    SELECT indexdef INTO v_actual
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = v_idx.indexname;

    IF v_actual IS NULL THEN
      EXECUTE v_idx.expected_def;
    ELSE
      v_actual_norm := regexp_replace(trim(v_actual), '\s+', ' ', 'g');
      v_expected_norm := regexp_replace(trim(v_idx.expected_def), '\s+', ' ', 'g');
      IF v_actual_norm <> v_expected_norm THEN
        RAISE EXCEPTION 'CONFLICT: Index % exists with unexpected definition: % (expected: %)',
          v_idx.indexname, v_actual, v_idx.expected_def;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 3. UNIQUE & CHECK constraints (36 constraints) with strict conflict check
-- ============================================================================
ALTER TABLE public.unitscreeningrecords
  DROP CONSTRAINT IF EXISTS chk_screening_panel_values,
  DROP CONSTRAINT IF EXISTS chk_screening_overall_consistency,
  DROP CONSTRAINT IF EXISTS chk_screening_verification_pair;

DO $$
DECLARE
  v_con record;
  v_actual_type "char";
  v_actual_def text;
  v_existing_idx text;
  v_expected_idx text;
BEGIN
  FOR v_con IN
    SELECT * FROM (VALUES
      ('bloodbanks', 'bloodbanks_licensenumber_key', 'u', 'UNIQUE (licensenumber)'),
      ('bloodbanks', 'bloodbanks_userid_key', 'u', 'UNIQUE (userid)'),
      ('bloodrequests', 'chk_patient_age', 'c', 'CHECK (patientage > 0)'),
      ('bloodrequests', 'chk_units_required', 'c', 'CHECK (unitsrequired > 0)'),
      ('bloodreservations', 'chk_reservation_status', 'c', 'CHECK (reservationstatus::text = ANY (ARRAY[''ACTIVE''::character varying::text, ''PREPARED''::character varying::text, ''DISPATCHED''::character varying::text, ''COMPLETED''::character varying::text, ''CANCELLED''::character varying::text, ''EXPIRED''::character varying::text]))'),
      ('broadcastdeliveries', 'uq_broadcast_donor', 'u', 'UNIQUE (broadcastid, donorid)'),
      ('clinicalcrossmatches', 'chk_crossmatch_dual_signoff', 'c', 'CHECK (testedbyuserid <> verifiedbyuserid)'),
      ('clinicalcrossmatches', 'chk_crossmatch_result', 'c', 'CHECK (testresult::text = ANY (ARRAY[''COMPATIBLE''::character varying::text, ''INCOMPATIBLE''::character varying::text, ''INCONCLUSIVE''::character varying::text]))'),
      ('clinicalcrossmatches', 'uq_crossmatch_item_attempt', 'u', 'UNIQUE (reservationitemid, attemptnumber)'),
      ('donors', 'donors_userid_key', 'u', 'UNIQUE (userid)'),
      ('emergencyschedulerjobs', 'emergencyschedulerjobs_idempotencykey_key', 'u', 'UNIQUE (idempotencykey)'),
      ('hospitaldonors', 'uq_hospital_donor', 'u', 'UNIQUE (hospitalid, donorid)'),
      ('hospitals', 'hospitals_registrationnumber_key', 'u', 'UNIQUE (registrationnumber)'),
      ('hospitals', 'hospitals_userid_key', 'u', 'UNIQUE (userid)'),
      ('inventory', 'chk_units_available', 'c', 'CHECK (unitsavailable >= 0)'),
      ('inventory', 'chk_units_reserved', 'c', 'CHECK (unitsreserved >= 0)'),
      ('inventory', 'uq_inventory', 'u', 'UNIQUE (bloodbankid, bloodgroup, bloodcomponent, expirydate)'),
      ('inventoryledger', 'chk_ledger_available_nonneg', 'c', 'CHECK (previousavailable >= 0 AND newavailable >= 0)'),
      ('inventoryledger', 'chk_ledger_reserved_nonneg', 'c', 'CHECK (previousreserved >= 0 AND newreserved >= 0)'),
      ('inventoryledger', 'chk_quantity_delta_valid', 'c', 'CHECK ((operationtype = ANY (ARRAY[''SCREENING_CLEARANCE''::inventory_operation_type, ''RESERVATION_ALLOCATE''::inventory_operation_type, ''RESERVATION_CANCEL''::inventory_operation_type, ''UNIT_PACKED_COLD_BOX''::inventory_operation_type, ''HOSPITAL_RECEIPT_CONFIRM''::inventory_operation_type])) AND quantitydelta = 0 OR (operationtype <> ALL (ARRAY[''SCREENING_CLEARANCE''::inventory_operation_type, ''RESERVATION_ALLOCATE''::inventory_operation_type, ''RESERVATION_CANCEL''::inventory_operation_type, ''UNIT_PACKED_COLD_BOX''::inventory_operation_type, ''HOSPITAL_RECEIPT_CONFIRM''::inventory_operation_type])) AND quantitydelta <> 0)'),
      ('inventoryledger', 'inventoryledger_idempotencykey_key', 'u', 'UNIQUE (idempotencykey)'),
      ('inventoryunits', 'chk_screening_status', 'c', 'CHECK (ttiscreeningstatus::text = ANY (ARRAY[''PENDING''::character varying::text, ''PASSED''::character varying::text, ''FAILED''::character varying::text, ''INDETERMINATE''::character varying::text]))'),
      ('inventoryunits', 'chk_unit_status', 'c', 'CHECK (status::text = ANY (ARRAY[''QUARANTINED''::character varying::text, ''AVAILABLE''::character varying::text, ''RESERVED''::character varying::text, ''IN_TRANSIT''::character varying::text, ''DELIVERED''::character varying::text, ''DISCARDED''::character varying::text]))'),
      ('inventoryunits', 'uq_bloodbank_unitbarcode', 'u', 'UNIQUE (bloodbankid, unitbarcode)'),
      ('prescription', 'prescription_requestid_key', 'u', 'UNIQUE (requestid)'),
      ('requesters', 'requesters_userid_key', 'u', 'UNIQUE (userid)'),
      ('requisitionassignments', 'chk_assignment_status', 'c', 'CHECK (assignmentstatus::text = ANY (ARRAY[''PENDING_ACCEPTANCE''::character varying::text, ''ACCEPTED''::character varying::text, ''DECLINED''::character varying::text, ''EXPIRED''::character varying::text, ''CANCELLED''::character varying::text]))'),
      ('reservationitems', 'chk_item_status', 'c', 'CHECK (itemstatus::text = ANY (ARRAY[''RESERVED''::character varying::text, ''PREPARED''::character varying::text, ''DISPATCHED''::character varying::text, ''DELIVERED''::character varying::text, ''RELEASED''::character varying::text, ''REJECTED_TRANSIT''::character varying::text, ''DISCARDED''::character varying::text]))'),
      ('reservationitems', 'uq_reservation_unit', 'u', 'UNIQUE (reservationid, unitid)'),
      ('unitscreeningrecords', 'chk_screening_dual_signoff', 'c', 'CHECK (testedbyuserid <> verifiedbyuserid)'),
      ('unitscreeningrecords', 'chk_screening_overall', 'c', 'CHECK (overallstatus::text = ANY (ARRAY[''PASSED''::character varying::text, ''FAILED''::character varying::text, ''INDETERMINATE''::character varying::text]))'),
      ('unitscreeningrecords', 'chk_screening_panel_values', 'c', 'CHECK (hivresult::text = ANY (ARRAY[''NON_REACTIVE''::character varying::text, ''REACTIVE''::character varying::text, ''INDETERMINATE''::character varying::text]) AND hbvresult::text = ANY (ARRAY[''NON_REACTIVE''::character varying::text, ''REACTIVE''::character varying::text, ''INDETERMINATE''::character varying::text]) AND hcvresult::text = ANY (ARRAY[''NON_REACTIVE''::character varying::text, ''REACTIVE''::character varying::text, ''INDETERMINATE''::character varying::text]) AND syphilisresult::text = ANY (ARRAY[''NON_REACTIVE''::character varying::text, ''REACTIVE''::character varying::text, ''INDETERMINATE''::character varying::text]) AND malariaresult::text = ANY (ARRAY[''NON_REACTIVE''::character varying::text, ''REACTIVE''::character varying::text, ''INDETERMINATE''::character varying::text]))'),
      ('unitscreeningrecords', 'chk_screening_overall_consistency', 'c', 'CHECK (overallstatus::text = ''PASSED''::text AND hivresult::text = ''NON_REACTIVE''::text AND hbvresult::text = ''NON_REACTIVE''::text AND hcvresult::text = ''NON_REACTIVE''::text AND syphilisresult::text = ''NON_REACTIVE''::text AND malariaresult::text = ''NON_REACTIVE''::text OR overallstatus::text = ''FAILED''::text AND (hivresult::text <> ''NON_REACTIVE''::text OR hbvresult::text <> ''NON_REACTIVE''::text OR hcvresult::text <> ''NON_REACTIVE''::text OR syphilisresult::text <> ''NON_REACTIVE''::text OR malariaresult::text <> ''NON_REACTIVE''::text) OR overallstatus::text = ''INDETERMINATE''::text AND hivresult::text <> ''REACTIVE''::text AND hbvresult::text <> ''REACTIVE''::text AND hcvresult::text <> ''REACTIVE''::text AND syphilisresult::text <> ''REACTIVE''::text AND malariaresult::text <> ''REACTIVE''::text AND (hivresult::text = ''INDETERMINATE''::text OR hbvresult::text = ''INDETERMINATE''::text OR hcvresult::text = ''INDETERMINATE''::text OR syphilisresult::text = ''INDETERMINATE''::text OR malariaresult::text = ''INDETERMINATE''::text))'),
      ('unitscreeningrecords', 'chk_screening_verification_pair', 'c', 'CHECK (verifiedbyuserid IS NULL AND verifiedat IS NULL OR verifiedbyuserid IS NOT NULL AND verifiedat IS NOT NULL)'),
      ('unitscreeningrecords', 'uq_unit_screening_revision', 'u', 'UNIQUE (unitid, revisionnumber)'),
      ('users', 'users_email_key', 'u', 'UNIQUE (email)')
    ) AS t(table_name, con_name, expected_type, expected_def)
  LOOP
    SELECT contype, pg_get_constraintdef(oid, true)
      INTO v_actual_type, v_actual_def
    FROM pg_constraint
    WHERE conname = v_con.con_name
      AND conrelid = ('public.' || quote_ident(v_con.table_name))::regclass;

    IF v_actual_def IS NULL THEN
      IF v_con.expected_type = 'u' THEN
        SELECT indexdef INTO v_existing_idx
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = v_con.table_name
          AND indexname = v_con.con_name;

        IF v_existing_idx IS NOT NULL THEN
          v_expected_idx := format(
            'CREATE UNIQUE INDEX %I ON public.%I USING btree %s',
            v_con.con_name,
            v_con.table_name,
            substring(v_con.expected_def from '^UNIQUE\s*(\(.+\))$')
          );
          IF regexp_replace(trim(v_existing_idx), '\s+', ' ', 'g')
             <> regexp_replace(trim(v_expected_idx), '\s+', ' ', 'g') THEN
            RAISE EXCEPTION 'CONFLICT: Index %.% exists with unexpected definition: % (expected: %)',
              v_con.table_name, v_con.con_name, v_existing_idx, v_expected_idx;
          END IF;
          EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE USING INDEX %I',
            v_con.table_name,
            v_con.con_name,
            v_con.con_name
          );
        ELSE
          EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I %s',
            v_con.table_name,
            v_con.con_name,
            v_con.expected_def
          );
        END IF;
      ELSE
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I %s',
          v_con.table_name,
          v_con.con_name,
          v_con.expected_def
        );
      END IF;
    ELSE
      IF v_actual_type::text <> v_con.expected_type
         OR regexp_replace(trim(v_actual_def), '\s+', ' ', 'g')
            <> regexp_replace(trim(v_con.expected_def), '\s+', ' ', 'g') THEN
        RAISE EXCEPTION 'CONFLICT: Constraint %.% exists with type=% def=% (expected type=% def=%)',
          v_con.table_name, v_con.con_name, v_actual_type, v_actual_def, v_con.expected_type, v_con.expected_def;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 4. Trigger functions (4 PL/pgSQL functions)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_enforce_crossmatch_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
        $function$;

CREATE OR REPLACE FUNCTION public.trg_fn_prevent_ledger_modification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
        BEGIN
            RAISE EXCEPTION 'Clinical Governance Violation: inventoryledger rows are permanently immutable and cannot be updated or deleted (ledgerid: %)', OLD.ledgerid;
        END;
        $function$;

CREATE OR REPLACE FUNCTION public.fn_enforce_unit_screening_clearance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
        DECLARE
            v_screening unitscreeningrecords%ROWTYPE;
        BEGIN
            IF (TG_OP = 'UPDATE' AND OLD.status IN ('IN_TRANSIT', 'DELIVERED', 'DISCARDED')) THEN
                IF (NEW.currentscreeningid IS DISTINCT FROM OLD.currentscreeningid OR
                    NEW.ttiscreeningstatus IS DISTINCT FROM OLD.ttiscreeningstatus) THEN
                    RAISE EXCEPTION 'SAFETY VIOLATION: Cannot modify TTI screening state for unit % while in % status.', NEW.unitbarcode, OLD.status;
                END IF;
            END IF;

            IF (NEW.status IN ('AVAILABLE', 'RESERVED') OR NEW.ttiscreeningstatus = 'PASSED') THEN
                IF (NEW.currentscreeningid IS NULL) THEN
                    RAISE EXCEPTION 'SAFETY VIOLATION: Unit % cannot enter % status without an attached screening record.', NEW.unitbarcode, NEW.status;
                END IF;
                
                SELECT * INTO v_screening 
                FROM unitscreeningrecords 
                WHERE screeningid = NEW.currentscreeningid;

                IF NOT FOUND OR v_screening.unitid != NEW.unitid THEN
                    RAISE EXCEPTION 'SAFETY VIOLATION: Attached screening record % does not belong to unit %.', NEW.currentscreeningid, NEW.unitbarcode;
                END IF;
                
                IF (v_screening.iscurrent != true OR v_screening.overallstatus != 'PASSED') THEN
                    RAISE EXCEPTION 'SAFETY VIOLATION: Unit % screening status is %, not PASSED.', NEW.unitbarcode, v_screening.overallstatus;
                END IF;

                IF (v_screening.hivresult != 'NON_REACTIVE' OR
                    v_screening.hbvresult != 'NON_REACTIVE' OR
                    v_screening.hcvresult != 'NON_REACTIVE' OR
                    v_screening.syphilisresult != 'NON_REACTIVE' OR
                    v_screening.malariaresult != 'NON_REACTIVE') THEN
                    RAISE EXCEPTION 'SAFETY VIOLATION: Unit % cannot be cleared unless all five TTI markers are NON_REACTIVE.', NEW.unitbarcode;
                END IF;

                IF (v_screening.verifiedbyuserid IS NULL OR
                    v_screening.verifiedat IS NULL OR
                    v_screening.verifiedbyuserid = v_screening.testedbyuserid) THEN
                    RAISE EXCEPTION 'SAFETY VIOLATION: Unit % cannot be cleared without independent two-person clinical verification.', NEW.unitbarcode;
                END IF;
            END IF;
            RETURN NEW;
        END;
        $function$;

CREATE OR REPLACE FUNCTION public.fn_protect_screening_records()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
        DECLARE
            v_unit inventoryunits%ROWTYPE;
        BEGIN
            IF (TG_OP = 'DELETE') THEN
                RAISE EXCEPTION 'CLINICAL VIOLATION: Screening records are immutable and cannot be deleted.';
            END IF;

            SELECT * INTO v_unit FROM inventoryunits WHERE unitid = NEW.unitid;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'CLINICAL VIOLATION: Target blood unit % not found.', NEW.unitid;
            END IF;

            IF (v_unit.status IN ('IN_TRANSIT', 'DELIVERED', 'DISCARDED')) THEN
                RAISE EXCEPTION 'CLINICAL VIOLATION: Cannot create or modify screening records for unit % in % status.', v_unit.unitbarcode, v_unit.status;
            END IF;

            IF (TG_OP = 'UPDATE') THEN
                IF (NEW.unitid IS DISTINCT FROM OLD.unitid OR
                    NEW.revisionnumber IS DISTINCT FROM OLD.revisionnumber OR
                    NEW.hivresult IS DISTINCT FROM OLD.hivresult OR
                    NEW.hbvresult IS DISTINCT FROM OLD.hbvresult OR
                    NEW.hcvresult IS DISTINCT FROM OLD.hcvresult OR
                    NEW.syphilisresult IS DISTINCT FROM OLD.syphilisresult OR
                    NEW.malariaresult IS DISTINCT FROM OLD.malariaresult OR
                    NEW.overallstatus IS DISTINCT FROM OLD.overallstatus OR
                    NEW.testedat IS DISTINCT FROM OLD.testedat OR
                    NEW.testedbyuserid IS DISTINCT FROM OLD.testedbyuserid) THEN
                    RAISE EXCEPTION 'CLINICAL VIOLATION: Screening results are immutable once recorded.';
                END IF;

                IF (OLD.iscurrent = true AND NEW.iscurrent = true AND
                    OLD.verifiedbyuserid IS NULL AND OLD.verifiedat IS NULL AND
                    NEW.verifiedbyuserid IS NOT NULL AND NEW.verifiedat IS NOT NULL AND
                    NEW.supersededat IS NULL AND NEW.supersededbyuserid IS NULL) THEN
                    RETURN NEW;
                ELSIF (OLD.iscurrent = true AND NEW.iscurrent = false AND
                       NEW.supersededat IS NOT NULL AND
                       NEW.verifiedbyuserid IS NOT DISTINCT FROM OLD.verifiedbyuserid AND
                       NEW.verifiedat IS NOT DISTINCT FROM OLD.verifiedat) THEN
                    RETURN NEW;
                ELSE
                    RAISE EXCEPTION 'CLINICAL VIOLATION: Screening results are immutable once recorded.';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $function$;

-- ============================================================================
-- 5. Triggers (4 triggers) with strict definition conflict check
-- ============================================================================
DROP TRIGGER IF EXISTS trg_enforce_unit_screening_clearance ON public.inventoryunits;
DROP TRIGGER IF EXISTS trg_protect_screening_records ON public.unitscreeningrecords;

DO $$
DECLARE
  v_trg record;
  v_actual_def text;
BEGIN
  FOR v_trg IN
    SELECT * FROM (VALUES
      (
        'clinicalcrossmatches',
        'trg_enforce_crossmatch_integrity',
        'CREATE TRIGGER trg_enforce_crossmatch_integrity BEFORE INSERT ON public.clinicalcrossmatches FOR EACH ROW EXECUTE FUNCTION fn_enforce_crossmatch_integrity()'
      ),
      (
        'inventoryledger',
        'trg_prevent_ledger_update_delete',
        'CREATE TRIGGER trg_prevent_ledger_update_delete BEFORE DELETE OR UPDATE ON public.inventoryledger FOR EACH ROW EXECUTE FUNCTION trg_fn_prevent_ledger_modification()'
      ),
      (
        'inventoryunits',
        'trg_enforce_unit_screening_clearance',
        'CREATE TRIGGER trg_enforce_unit_screening_clearance BEFORE INSERT OR UPDATE OF status, currentscreeningid, ttiscreeningstatus ON public.inventoryunits FOR EACH ROW EXECUTE FUNCTION fn_enforce_unit_screening_clearance()'
      ),
      (
        'unitscreeningrecords',
        'trg_protect_screening_records',
        'CREATE TRIGGER trg_protect_screening_records BEFORE INSERT OR DELETE OR UPDATE ON public.unitscreeningrecords FOR EACH ROW EXECUTE FUNCTION fn_protect_screening_records()'
      )
    ) AS t(table_name, trg_name, expected_def)
  LOOP
    SELECT pg_get_triggerdef(tr.oid, true) INTO v_actual_def
    FROM pg_trigger tr
    WHERE tr.tgname = v_trg.trg_name
      AND tr.tgrelid = ('public.' || quote_ident(v_trg.table_name))::regclass
      AND NOT tr.tgisinternal;

    IF v_actual_def IS NULL THEN
      EXECUTE v_trg.expected_def;
    ELSE
      IF regexp_replace(regexp_replace(trim(v_actual_def), '\s+', ' ', 'g'), ' ON public\.', ' ON ', 'g')
         <> regexp_replace(regexp_replace(trim(v_trg.expected_def), '\s+', ' ', 'g'), ' ON public\.', ' ON ', 'g') THEN
        RAISE EXCEPTION 'CONFLICT: Trigger % on % exists with unexpected definition: % (expected: %)',
          v_trg.trg_name, v_trg.table_name, v_actual_def, v_trg.expected_def;
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
