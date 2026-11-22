-- ============================================================================
-- SWASTYA: FEATURE 4 — EQUIPMENT AND CALIBRATION TRACKER MIGRATION SCRIPT
-- Safe, idempotent DDL for development/test databases.
-- Target database: Development / Test ONLY (Never execute against production data)
-- ============================================================================

-- 1. Create Enums if they do not exist
DO $$ BEGIN
    CREATE TYPE equipment_operational_status AS ENUM ('OPERATIONAL', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE equipment_calibration_status AS ENUM ('UP_TO_DATE', 'DUE_SOON', 'OVERDUE', 'NOT_APPLICABLE', 'PENDING_VERIFICATION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE equipment_maintenance_status AS ENUM ('UP_TO_DATE', 'DUE_SOON', 'OVERDUE', 'NOT_APPLICABLE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE calibration_result AS ENUM ('PASSED', 'FAILED', 'PASSED_WITH_CONDITIONS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE calibration_verification_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE maintenance_type AS ENUM ('PREVENTIVE', 'CORRECTIVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE maintenance_record_status AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE breakdown_severity AS ENUM ('CRITICAL', 'MAJOR', 'MINOR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE breakdown_status AS ENUM ('REPORTED', 'ASSIGNED', 'IN_REPAIR', 'RESOLVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create equipment table
CREATE TABLE IF NOT EXISTS equipment (
    equipmentid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bloodbankid UUID NOT NULL,
    assetnumber VARCHAR(100) NOT NULL,
    equipmentname VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    manufacturer VARCHAR(100),
    modelnumber VARCHAR(100),
    serialnumber VARCHAR(100),
    installationdate DATE,
    warrantyexpirydate DATE,
    location VARCHAR(100),
    department VARCHAR(100),
    responsibleperson VARCHAR(100),
    operationalstatus equipment_operational_status NOT NULL DEFAULT 'OPERATIONAL',
    iscalibrationrequired BOOLEAN NOT NULL DEFAULT true,
    calibrationintervaldays INTEGER,
    lastcalibrationdate DATE,
    nextcalibrationdate DATE,
    calibrationstatus equipment_calibration_status NOT NULL DEFAULT 'NOT_APPLICABLE',
    ismaintenancerequired BOOLEAN NOT NULL DEFAULT true,
    maintenanceintervaldays INTEGER,
    lastmaintenancedate DATE,
    nextmaintenancedate DATE,
    maintenancestatus equipment_maintenance_status NOT NULL DEFAULT 'NOT_APPLICABLE',
    notes TEXT,
    createdbyuserid UUID NOT NULL,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_equipment_bloodbank FOREIGN KEY (bloodbankid)
        REFERENCES bloodbanks(bloodbankid) ON DELETE CASCADE,
    CONSTRAINT fk_equipment_creator FOREIGN KEY (createdbyuserid)
        REFERENCES users(userid) ON DELETE NO ACTION,
    CONSTRAINT uq_equipment_bloodbank_asset UNIQUE (bloodbankid, assetnumber)
);

CREATE INDEX IF NOT EXISTS idx_equipment_bloodbank ON equipment(bloodbankid);
CREATE INDEX IF NOT EXISTS idx_equipment_operationalstatus ON equipment(operationalstatus);
CREATE INDEX IF NOT EXISTS idx_equipment_calibrationstatus ON equipment(calibrationstatus);

-- 3. Create equipmentcalibrations table
CREATE TABLE IF NOT EXISTS equipmentcalibrations (
    calibrationid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipmentid UUID NOT NULL,
    bloodbankid UUID NOT NULL,
    scheduleddate DATE,
    performeddate DATE NOT NULL,
    nextduedate DATE,
    performedby VARCHAR(100) NOT NULL,
    serviceprovider VARCHAR(100),
    certificatefilepath VARCHAR(500),
    certificatefilename VARCHAR(255),
    result calibration_result NOT NULL,
    standardsused VARCHAR(255),
    readings TEXT,
    remarks TEXT,
    verificationstatus calibration_verification_status NOT NULL DEFAULT 'PENDING',
    verifiedbyuserid UUID,
    verifiedat TIMESTAMP,
    createdbyuserid UUID NOT NULL,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_calibration_equipment FOREIGN KEY (equipmentid)
        REFERENCES equipment(equipmentid) ON DELETE CASCADE,
    CONSTRAINT fk_calibration_bloodbank FOREIGN KEY (bloodbankid)
        REFERENCES bloodbanks(bloodbankid) ON DELETE CASCADE,
    CONSTRAINT fk_calibration_creator FOREIGN KEY (createdbyuserid)
        REFERENCES users(userid) ON DELETE NO ACTION,
    CONSTRAINT fk_calibration_verifier FOREIGN KEY (verifiedbyuserid)
        REFERENCES users(userid) ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_calibration_equipment ON equipmentcalibrations(equipmentid);
CREATE INDEX IF NOT EXISTS idx_calibration_bloodbank ON equipmentcalibrations(bloodbankid);

-- 4. Create equipmentmaintenance table
CREATE TABLE IF NOT EXISTS equipmentmaintenance (
    maintenanceid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipmentid UUID NOT NULL,
    bloodbankid UUID NOT NULL,
    maintenancetype maintenance_type NOT NULL,
    status maintenance_record_status NOT NULL DEFAULT 'SCHEDULED',
    scheduleddate DATE NOT NULL,
    completeddate DATE,
    assignedto VARCHAR(100),
    serviceprovider VARCHAR(100),
    workdetails TEXT,
    partsreplaced TEXT,
    downtimehours DECIMAL(6, 2),
    cost DECIMAL(10, 2),
    reportfilepath VARCHAR(500),
    reportfilename VARCHAR(255),
    createdbyuserid UUID NOT NULL,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_maintenance_equipment FOREIGN KEY (equipmentid)
        REFERENCES equipment(equipmentid) ON DELETE CASCADE,
    CONSTRAINT fk_maintenance_bloodbank FOREIGN KEY (bloodbankid)
        REFERENCES bloodbanks(bloodbankid) ON DELETE CASCADE,
    CONSTRAINT fk_maintenance_creator FOREIGN KEY (createdbyuserid)
        REFERENCES users(userid) ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_maintenance_equipment ON equipmentmaintenance(equipmentid);
CREATE INDEX IF NOT EXISTS idx_maintenance_bloodbank ON equipmentmaintenance(bloodbankid);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON equipmentmaintenance(status);

-- 5. Create equipmentbreakdowns table
CREATE TABLE IF NOT EXISTS equipmentbreakdowns (
    breakdownid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipmentid UUID NOT NULL,
    bloodbankid UUID NOT NULL,
    reportedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reportedbyuserid UUID NOT NULL,
    issue VARCHAR(255) NOT NULL,
    description TEXT,
    severity breakdown_severity NOT NULL DEFAULT 'MAJOR',
    status breakdown_status NOT NULL DEFAULT 'REPORTED',
    impactonstorage BOOLEAN NOT NULL DEFAULT false,
    sopactiontaken TEXT,
    resolutiondetails TEXT,
    resolvedat TIMESTAMP,
    resolvedbyuserid UUID,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_breakdown_equipment FOREIGN KEY (equipmentid)
        REFERENCES equipment(equipmentid) ON DELETE CASCADE,
    CONSTRAINT fk_breakdown_bloodbank FOREIGN KEY (bloodbankid)
        REFERENCES bloodbanks(bloodbankid) ON DELETE CASCADE,
    CONSTRAINT fk_breakdown_reporter FOREIGN KEY (reportedbyuserid)
        REFERENCES users(userid) ON DELETE NO ACTION,
    CONSTRAINT fk_breakdown_resolver FOREIGN KEY (resolvedbyuserid)
        REFERENCES users(userid) ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_breakdown_equipment ON equipmentbreakdowns(equipmentid);
CREATE INDEX IF NOT EXISTS idx_breakdown_bloodbank ON equipmentbreakdowns(bloodbankid);
CREATE INDEX IF NOT EXISTS idx_breakdown_status ON equipmentbreakdowns(status);

-- 6. Create equipmentstatushistory table (Append-only audit trail)
CREATE TABLE IF NOT EXISTS equipmentstatushistory (
    historyid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipmentid UUID NOT NULL,
    bloodbankid UUID NOT NULL,
    previousstatus VARCHAR(50) NOT NULL,
    newstatus VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    changedbyuserid UUID NOT NULL,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_statushistory_equipment FOREIGN KEY (equipmentid)
        REFERENCES equipment(equipmentid) ON DELETE CASCADE,
    CONSTRAINT fk_statushistory_bloodbank FOREIGN KEY (bloodbankid)
        REFERENCES bloodbanks(bloodbankid) ON DELETE CASCADE,
    CONSTRAINT fk_statushistory_user FOREIGN KEY (changedbyuserid)
        REFERENCES users(userid) ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_statushistory_equipment ON equipmentstatushistory(equipmentid);

-- 7. Create equipmentcategories table
CREATE TABLE IF NOT EXISTS equipmentcategories (
    categoryid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bloodbankid UUID,
    categoryname VARCHAR(100) NOT NULL,
    description TEXT,
    defaultcalibrationinterval INTEGER,
    defaultmaintenanceinterval INTEGER,
    isactive BOOLEAN NOT NULL DEFAULT true,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eqcat_bloodbank ON equipmentcategories(bloodbankid);

-- Pre-seed default categories if not already present
INSERT INTO equipmentcategories (categoryname, description, defaultcalibrationinterval, defaultmaintenanceinterval)
SELECT v.categoryname, v.description, v.defaultcal, v.defaultmaint
FROM (VALUES
    ('Blood Bank Refrigerator', '2°C to 6°C cold storage for Whole Blood and PRBC', 90, 90),
    ('Deep Freezer (-40°C / -80°C)', 'Ultra-low temperature storage for Fresh Frozen Plasma and Cryoprecipitate', 90, 90),
    ('Platelet Agitator / Incubator', '20°C to 24°C continuous agitation storage for Platelet concentrates', 90, 90),
    ('Blood Component Centrifuge', 'High-capacity refrigerated centrifuge for component separation', 180, 180),
    ('Blood Collection Monitor', 'Weighing and mixing monitor for whole blood collection', 180, 180),
    ('Plasma Thawing Bath', 'Controlled 37°C rapid plasma thawer', 90, 90),
    ('Tube Sealer', 'High-frequency dielectric or thermal RF segment sealer', 180, 180),
    ('Digital Temperature Logger', 'Continuous NIST-traceable ambient & chamber thermal sensor', 90, 90),
    ('Laboratory Analytical Balance', 'Precision balance for blood volume and component verification', 180, 180),
    ('Biosafety Cabinet / Laminar Flow', 'HEPA-filtered sterile enclosure for aseptic blood handling', 365, 180)
) AS v(categoryname, description, defaultcal, defaultmaint)
WHERE NOT EXISTS (
    SELECT 1 FROM equipmentcategories WHERE categoryname = v.categoryname AND bloodbankid IS NULL
);
