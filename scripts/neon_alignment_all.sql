-- ========================================================
-- AUTOMATICALLY EXTRACTED SCHEMA FOR SWASTYA FEATURES ON NEON
-- ========================================================

ALTER TABLE "bloodrequests" ADD COLUMN IF NOT EXISTS "isdraft" BOOLEAN DEFAULT false;
ALTER TABLE "procedurebloodconfigs" ADD COLUMN IF NOT EXISTS "guidelinecitation" TEXT;
ALTER TABLE "procedurebloodconfigs" ALTER COLUMN "guidelinecitation" TYPE TEXT;
ALTER TABLE "procedurebloodconfigs" ADD COLUMN IF NOT EXISTS "requireshospitalapproval" BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS "donationcamps" (
  "campid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "bloodbankid" UUID NOT NULL,
  "createdbyuserid" UUID NOT NULL,
  "campname" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "organizername" VARCHAR(255) NOT NULL,
  "contactperson" VARCHAR(100) NOT NULL,
  "contactphone" VARCHAR(20),
  "campdate" DATE NOT NULL,
  "starttime" TIME NOT NULL,
  "endtime" TIME NOT NULL,
  "timezone" VARCHAR(50) DEFAULT 'Asia/Kolkata'::character varying NOT NULL,
  "registrationopeningdate" TIMESTAMP(6) NOT NULL,
  "registrationdeadline" TIMESTAMP(6) NOT NULL,
  "venuename" VARCHAR(255) NOT NULL,
  "address" VARCHAR(255) NOT NULL,
  "city" VARCHAR(100) NOT NULL,
  "district" VARCHAR(100) NOT NULL,
  "state" VARCHAR(100) NOT NULL,
  "pincode" VARCHAR(10) NOT NULL,
  "latitude" NUMERIC,
  "longitude" NUMERIC,
  "isregistrationrequired" BOOLEAN DEFAULT true NOT NULL,
  "maxcapacity" INTEGER,
  "registrationinstructions" TEXT,
  "donorinstructions" TEXT,
  "eligibilitynotes" TEXT,
  "status" CAMP_STATUS DEFAULT 'DRAFT'::camp_status NOT NULL,
  "registrationstatus" CAMP_REGISTRATION_AVAILABILITY DEFAULT 'OPEN'::camp_registration_availability NOT NULL,
  "cancellationreason" TEXT,
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "updatedat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("campid")
);

CREATE TABLE IF NOT EXISTS "campregistrations" (
  "registrationid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "campid" UUID NOT NULL,
  "donorid" UUID NOT NULL,
  "registrationreference" VARCHAR(50) NOT NULL,
  "registrationdate" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "registrationstatus" CAMP_REGISTRATION_STATUS DEFAULT 'REGISTERED'::camp_registration_status NOT NULL,
  "attendancestatus" CAMP_ATTENDANCE_STATUS DEFAULT 'PENDING'::camp_attendance_status NOT NULL,
  "attendedat" TIMESTAMP(6),
  "unitsdonated" INTEGER,
  "attendancenotes" TEXT,
  "cancellationreason" TEXT,
  "cancelledat" TIMESTAMP(6),
  "cancelledbyuserid" UUID,
  "previouscancellationreason" TEXT,
  "previouscancelledat" TIMESTAMP(6),
  "reregisteredat" TIMESTAMP(6),
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "updatedat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "attendanceupdatedbyuserid" UUID,
  "cancellationhistory" JSONB DEFAULT '[]'::jsonb,
  PRIMARY KEY ("registrationid")
);

CREATE TABLE IF NOT EXISTS "campaudithistory" (
  "auditid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "campid" UUID NOT NULL,
  "action" VARCHAR(50) NOT NULL,
  "changedbyuserid" UUID NOT NULL,
  "details" TEXT,
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("auditid")
);

CREATE TABLE IF NOT EXISTS "campstatushistory" (
  "historyid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "campid" UUID NOT NULL,
  "oldstatus" CAMP_STATUS,
  "newstatus" CAMP_STATUS NOT NULL,
  "changedbyuserid" UUID NOT NULL,
  "reason" TEXT,
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("historyid")
);

CREATE TABLE IF NOT EXISTS "donornotificationpreferences" (
  "preferenceid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "donorid" UUID NOT NULL,
  "nearbycamps" BOOLEAN DEFAULT true NOT NULL,
  "campreminders" BOOLEAN DEFAULT true NOT NULL,
  "campupdates" BOOLEAN DEFAULT true NOT NULL,
  "campcancellations" BOOLEAN DEFAULT true NOT NULL,
  "preferredcity" VARCHAR(100),
  "preferredradiuskm" INTEGER DEFAULT 25,
  "createdat" TIMESTAMP(6) DEFAULT now(),
  "updatedat" TIMESTAMP(6) DEFAULT now(),
  PRIMARY KEY ("preferenceid")
);

CREATE TABLE IF NOT EXISTS "equipmentcategories" (
  "categoryid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "bloodbankid" UUID,
  "categoryname" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "defaultcalibrationinterval" INTEGER,
  "defaultmaintenanceinterval" INTEGER,
  "isactive" BOOLEAN DEFAULT true NOT NULL,
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("categoryid")
);

CREATE TABLE IF NOT EXISTS "equipment" (
  "equipmentid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "bloodbankid" UUID NOT NULL,
  "assetnumber" VARCHAR(100) NOT NULL,
  "equipmentname" VARCHAR(255) NOT NULL,
  "category" VARCHAR(100) NOT NULL,
  "manufacturer" VARCHAR(100),
  "modelnumber" VARCHAR(100),
  "serialnumber" VARCHAR(100),
  "installationdate" DATE,
  "warrantyexpirydate" DATE,
  "location" VARCHAR(100),
  "department" VARCHAR(100),
  "responsibleperson" VARCHAR(100),
  "operationalstatus" EQUIPMENT_OPERATIONAL_STATUS DEFAULT 'OPERATIONAL'::equipment_operational_status NOT NULL,
  "iscalibrationrequired" BOOLEAN DEFAULT true NOT NULL,
  "calibrationintervaldays" INTEGER,
  "lastcalibrationdate" DATE,
  "nextcalibrationdate" DATE,
  "calibrationstatus" EQUIPMENT_CALIBRATION_STATUS DEFAULT 'NOT_APPLICABLE'::equipment_calibration_status NOT NULL,
  "ismaintenancerequired" BOOLEAN DEFAULT true NOT NULL,
  "maintenanceintervaldays" INTEGER,
  "lastmaintenancedate" DATE,
  "nextmaintenancedate" DATE,
  "maintenancestatus" EQUIPMENT_MAINTENANCE_STATUS DEFAULT 'NOT_APPLICABLE'::equipment_maintenance_status NOT NULL,
  "notes" TEXT,
  "createdbyuserid" UUID NOT NULL,
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "updatedat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("equipmentid")
);

CREATE TABLE IF NOT EXISTS "equipmentcalibrations" (
  "calibrationid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "equipmentid" UUID NOT NULL,
  "bloodbankid" UUID NOT NULL,
  "scheduleddate" DATE,
  "performeddate" DATE NOT NULL,
  "nextduedate" DATE,
  "performedby" VARCHAR(100) NOT NULL,
  "serviceprovider" VARCHAR(100),
  "certificatefilepath" VARCHAR(500),
  "certificatefilename" VARCHAR(255),
  "result" CALIBRATION_RESULT NOT NULL,
  "standardsused" VARCHAR(255),
  "readings" TEXT,
  "remarks" TEXT,
  "verificationstatus" CALIBRATION_VERIFICATION_STATUS DEFAULT 'PENDING'::calibration_verification_status NOT NULL,
  "verifiedbyuserid" UUID,
  "verifiedat" TIMESTAMP(6),
  "createdbyuserid" UUID NOT NULL,
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("calibrationid")
);

CREATE TABLE IF NOT EXISTS "equipmentmaintenance" (
  "maintenanceid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "equipmentid" UUID NOT NULL,
  "bloodbankid" UUID NOT NULL,
  "maintenancetype" MAINTENANCE_TYPE NOT NULL,
  "status" MAINTENANCE_RECORD_STATUS DEFAULT 'SCHEDULED'::maintenance_record_status NOT NULL,
  "scheduleddate" DATE NOT NULL,
  "completeddate" DATE,
  "assignedto" VARCHAR(100),
  "serviceprovider" VARCHAR(100),
  "workdetails" TEXT,
  "partsreplaced" TEXT,
  "downtimehours" NUMERIC,
  "cost" NUMERIC,
  "reportfilepath" VARCHAR(500),
  "reportfilename" VARCHAR(255),
  "createdbyuserid" UUID NOT NULL,
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "updatedat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("maintenanceid")
);

CREATE TABLE IF NOT EXISTS "equipmentbreakdowns" (
  "breakdownid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "equipmentid" UUID NOT NULL,
  "bloodbankid" UUID NOT NULL,
  "reportedat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "reportedbyuserid" UUID NOT NULL,
  "issue" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "severity" BREAKDOWN_SEVERITY DEFAULT 'MAJOR'::breakdown_severity NOT NULL,
  "status" BREAKDOWN_STATUS DEFAULT 'REPORTED'::breakdown_status NOT NULL,
  "impactonstorage" BOOLEAN DEFAULT false NOT NULL,
  "sopactiontaken" TEXT,
  "resolutiondetails" TEXT,
  "resolvedat" TIMESTAMP(6),
  "resolvedbyuserid" UUID,
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("breakdownid")
);

CREATE TABLE IF NOT EXISTS "equipmentstatushistory" (
  "historyid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "equipmentid" UUID NOT NULL,
  "bloodbankid" UUID NOT NULL,
  "previousstatus" VARCHAR(50) NOT NULL,
  "newstatus" VARCHAR(50) NOT NULL,
  "reason" TEXT NOT NULL,
  "changedbyuserid" UUID NOT NULL,
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("historyid")
);

CREATE TABLE IF NOT EXISTS "requestdocuments" (
  "documentid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "requestid" UUID NOT NULL,
  "documenttype" VARCHAR(50) NOT NULL,
  "documentname" VARCHAR(255) NOT NULL,
  "ismandatory" BOOLEAN DEFAULT true,
  "filepath" TEXT NOT NULL,
  "originalfilename" VARCHAR(255) NOT NULL,
  "mimetype" VARCHAR(100) NOT NULL,
  "filesize" INTEGER NOT NULL,
  "version" INTEGER DEFAULT 1,
  "filehash" VARCHAR(64),
  "uploadedbyuserid" UUID NOT NULL,
  "uploadedat" TIMESTAMP(6) DEFAULT now(),
  "updatedat" TIMESTAMP(6) DEFAULT now(),
  PRIMARY KEY ("documentid")
);

CREATE TABLE IF NOT EXISTS "documentverifications" (
  "verificationid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "requestid" UUID NOT NULL,
  "documentid" UUID NOT NULL,
  "documentversion" INTEGER DEFAULT 1 NOT NULL,
  "documenttype" VARCHAR(50) NOT NULL,
  "filehash" VARCHAR(64),
  "verificationstatus" VARCHAR(30) DEFAULT 'NEEDS_REVIEW'::character varying NOT NULL,
  "ocrconfidence" FLOAT8 DEFAULT 0.0 NOT NULL,
  "extracteddata" JSONB DEFAULT '{}'::jsonb NOT NULL,
  "discrepancies" JSONB DEFAULT '[]'::jsonb NOT NULL,
  "summary" TEXT,
  "processingerror" TEXT,
  "iscurrentversion" BOOLEAN DEFAULT true NOT NULL,
  "reviewerdecision" VARCHAR(50),
  "reviewerremarks" TEXT,
  "reviewedbyuserid" UUID,
  "reviewedat" TIMESTAMP(6),
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "updatedat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("verificationid")
);

CREATE TABLE IF NOT EXISTS "documentreviewaudit" (
  "auditid" UUID DEFAULT gen_random_uuid() NOT NULL,
  "verificationid" UUID NOT NULL,
  "documentid" UUID NOT NULL,
  "documentversion" INTEGER DEFAULT 1 NOT NULL,
  "requestid" UUID NOT NULL,
  "revieweruserid" UUID NOT NULL,
  "previousstatus" VARCHAR(30) NOT NULL,
  "newstatus" VARCHAR(30) NOT NULL,
  "decision" VARCHAR(50) NOT NULL,
  "remarks" TEXT,
  "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("auditid")
);

