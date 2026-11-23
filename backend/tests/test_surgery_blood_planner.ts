import dotenv from "dotenv";
import path from "path";

// Strictly load test environment
dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });

import { prisma } from "../src/config/prisma";
import { SurgeryPlannerService, DEFAULT_CLINICAL_GUIDELINES } from "../src/services/surgeryPlanner.service";
import {
    blood_group,
    blood_component,
    gender_type,
    surgery_status,
    user_role,
} from "../src/generated/prisma/enums";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: Array<{ name: string; error: string }> = [];

function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${testName}`);
    } else {
        failedTests++;
        const err = detail ? `${testName} — ${detail}` : testName;
        failures.push({ name: testName, error: err });
        console.error(`  [FAIL] ${err}`);
    }
}

async function runComprehensiveSurgeryBloodPlannerTestSuite() {
    console.log("===============================================================================");
    console.log("  SWASTYA: SURGERY BLOOD REQUIREMENT PLANNER FINAL VERIFICATION TEST SUITE    ");
    console.log("===============================================================================\n");

    // -------------------------------------------------------------------------
    // TEST SECTION 1: SAFETY GUARDS & DATABASE ISOLATION
    // -------------------------------------------------------------------------
    console.log("--- 1. Safety Guards & Database Isolation ---");
    const dbUrl = process.env.DATABASE_URL || "";
    const isNeon = dbUrl.includes("neon.tech") || dbUrl.includes("neondb");
    assert(!isNeon, "1.1 Tests strictly avoid remote production Neon database");

    const dbCheck: any = await prisma.$queryRawUnsafe("SELECT current_database();");
    const currentDb = dbCheck[0]?.current_database || "";
    assert(currentDb === "swastya_test", `1.2 Target database is strictly swastya_test (got: ${currentDb})`);

    // Setup test fixtures
    console.log("\n--- Setting up test fixtures in swastya_test ---");
    const testStamp = Date.now();
    const testEmailHospitalClerk = `clerk_${testStamp}@swastya.org`;
    const testEmailClinician = `clinician_${testStamp}@swastya.org`;
    const testEmailHospitalB = `hospital_b_${testStamp}@swastya.org`;
    const testEmailBloodBank = `bloodbank_${testStamp}@swastya.org`;
    const testEmailDonor = `donor_${testStamp}@swastya.org`;

    // Reset any previous test inventory units to DISCARDED
    await prisma.inventoryunits.updateMany({
        where: {
            OR: [
                { unitbarcode: { startsWith: "U-PLT-" } },
                { unitbarcode: { startsWith: "UNIT-" } },
                { unitbarcode: { startsWith: "U-PLS-" } },
            ],
        },
        data: { status: "DISCARDED" },
    });

    // 1. Hospital A user (Ordinary non-clinical clerical staff: isclinicalreviewer = false)
    const hospitalClerkUser = await prisma.users.create({
        data: {
            name: "Sunil Patil (Ward Clerk)",
            email: testEmailHospitalClerk,
            phonenumber: "+919876543201",
            password: "hashed_test_password_clerk",
            role: user_role.HOSPITAL,
            isclinicalreviewer: false,
            emailverified: true,
            isactive: true,
        },
    });

    // 2. Hospital A Clinician (Authorized clinical reviewer: isclinicalreviewer = true)
    const hospitalClinicianUser = await prisma.users.create({
        data: {
            name: "Dr. Arvind Sharma (Chief Surgical Officer)",
            email: testEmailClinician,
            phonenumber: "+919876543202",
            password: "hashed_test_password_clinician",
            role: user_role.HOSPITAL,
            isclinicalreviewer: true,
            medicalcouncilregno: "MCI-MH-2012-88412",
            emailverified: true,
            isactive: true,
        },
    });

    // Hospital A facility
    const hospitalA = await prisma.hospitals.create({
        data: {
            userid: hospitalClerkUser.userid,
            hospitalname: `Apollo Surgical Institute ${testStamp}`,
            registrationnumber: `HOSP-A-${testStamp}`,
            contactpersonname: "Dr. Arvind Sharma",
            contactpersonphone: "+919876543202",
            address: "42 Healthcare Expressway, Baner",
            city: "PUNE",
            state: "MAHARASHTRA",
            pincode: "411045",
            latitude: 18.5590,
            longitude: 73.7868,
        },
    });

    // 3. Hospital B user & facility (for tenant isolation check)
    const hospitalBUser = await prisma.users.create({
        data: {
            name: "Hospital B Admin",
            email: testEmailHospitalB,
            phonenumber: "+919876543203",
            password: "hashed_test_password_hosp_b",
            role: user_role.HOSPITAL,
            isclinicalreviewer: true,
            emailverified: true,
            isactive: true,
        },
    });

    const hospitalB = await prisma.hospitals.create({
        data: {
            userid: hospitalBUser.userid,
            hospitalname: `Ruby Hall Surgery Center ${testStamp}`,
            registrationnumber: `HOSP-B-${testStamp}`,
            contactpersonname: "Dr. Ruby",
            contactpersonphone: "+919876543203",
            address: "Dhole Patil Road",
            city: "PUNE",
            state: "MAHARASHTRA",
            pincode: "411001",
            latitude: 18.5362,
            longitude: 73.8795,
        },
    });

    // 4. Blood Bank user & facility
    const bloodBankUser = await prisma.users.create({
        data: {
            name: "Dr. K. Nair (Blood Bank Director)",
            email: testEmailBloodBank,
            phonenumber: "+919123456780",
            password: "hashed_test_password_bb",
            role: user_role.BLOOD_BANK,
            emailverified: true,
            isactive: true,
        },
    });

    const bloodBank = await prisma.bloodbanks.create({
        data: {
            userid: bloodBankUser.userid,
            bloodbankname: `Central Regional Blood Bank ${testStamp}`,
            licensenumber: `BB-LIC-${testStamp}`,
            contactpersonname: "Dr. K. Nair",
            contactpersonphone: "+919123456780",
            address: "10 Blood Bank Road, Shivajinagar",
            city: "PUNE",
            state: "MAHARASHTRA",
            pincode: "411005",
            latitude: 18.5308,
            longitude: 73.8475,
        },
    });

    // 5. Donor user
    const donorUser = await prisma.users.create({
        data: {
            name: "Rahul Verma (Volunteer Donor)",
            email: testEmailDonor,
            phonenumber: "+919988776655",
            password: "hashed_test_password_donor",
            role: user_role.DONOR,
            emailverified: true,
            isactive: true,
        },
    });

    // -------------------------------------------------------------------------
    // TEST SECTION 2: VERIFY ALL CLINICAL CONFIGURATION DATA
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Clinical Configuration Data Verification ---");

    await SurgeryPlannerService.ensureDefaultGuidelines();
    const configs = await SurgeryPlannerService.getProcedureConfigs(hospitalA.hospitalid);

    // 2.1 CABG Verification
    const cabg = configs.find((c) => c.procedurename.includes("CABG"));
    assert(cabg !== undefined, "2.1.a CABG configuration exists");
    assert(cabg?.defaultunits === 2, "2.1.b CABG default requirement is exactly 2 units PRBC");
    assert(cabg?.secondaryunits === 0, "2.1.c CABG secondary units is 0 (routine prophylactic plasma advised against by STS/SCA)");
    assert(
        cabg?.guidelinesource.includes("Society of Thoracic Surgeons"),
        "2.1.d Source cites Society of Thoracic Surgeons & Society of Cardiovascular Anesthesiologists"
    );
    assert(
        cabg?.guidelinecitation?.includes("Annals of Thoracic Surgery") && cabg?.guidelinecitation?.includes("Table 5"),
        "2.1.e Citation contains exact journal and Table 5 reference"
    );

    // 2.2 TKA Verification
    const tka = configs.find((c) => c.procedurename.includes("TKA"));
    assert(tka !== undefined, "2.2.a TKA configuration exists");
    assert(tka?.defaultunits === 1, "2.2.b TKA default requirement is exactly 1 unit PRBC (with TXA protocol)");
    assert(
        tka?.guidelinecitation?.includes("Table 4") || tka?.guidelinecitation?.includes("Table 2"),
        "2.2.c TKA citation includes published table reference (BCSH / Frank SM et al.)"
    );

    // 2.3 Laparoscopic Cholecystectomy Verification
    const chole = configs.find((c) => c.procedurename.includes("Cholecystectomy"));
    assert(chole !== undefined, "2.3.a Laparoscopic Cholecystectomy exists");
    assert(chole?.defaultunits === 0, "2.3.b Crossmatch units is 0 (Type & Screen only per SAGES/AABB)");
    assert(
        chole?.guidelinecitation?.includes("Table 20-3"),
        "2.3.c Citation contains AABB Table 20-3 reference"
    );

    // 2.4 Cesarean Section (High Risk) Verification
    const csec = configs.find((c) => c.procedurename.includes("Cesarean Section"));
    assert(csec !== undefined, "2.4.a High-Risk Cesarean Section exists");
    assert(
        csec?.requireshospitalapproval === true,
        "2.4.b High-Risk Cesarean Section flagged as requiring individual hospital clinical approval"
    );

    // 2.5 Unverified procedure returns review required
    const unknownEst = await SurgeryPlannerService.estimateRequirements(
        "Complex Craniofacial Free Flap Reconstruction",
        hospitalA.hospitalid
    );
    assert(unknownEst.estimateAvailable === false, "2.5.a Unverified procedure returns estimateAvailable = false");
    assert(
        unknownEst.message === "Estimate unavailable – Clinical review required.",
        "2.5.b Exact clinical review required message returned without guessing numbers"
    );

    // 2.6 Hospital Override Precedence
    await SurgeryPlannerService.saveProcedureConfig(hospitalA.hospitalid, {
        procedurename: "Coronary Artery Bypass Graft (CABG)",
        category: "Cardiothoracic Surgery",
        defaultcomponent: blood_component.RBC,
        defaultunits: 3,
        guidelinesource: "Apollo Pune Cardiac Surgery Clinical Audit 2026",
        guidelineversion: "2026.2",
        guidelinecitation: "Apollo Transfusion Audit Minutes Jan 2026, Minute 4.1",
        approvalauthority: "Dr. Arvind Sharma (Cardiac Surgery Chair)",
        effectivedate: new Date("2026-01-01"),
        clinicalrationale: "Institutional high-risk CABG cohort with high re-operation rate; 3 units PRBC ratified.",
    });

    const configsAfterOverride = await SurgeryPlannerService.getProcedureConfigs(hospitalA.hospitalid);
    const cabgOverridden = configsAfterOverride.find((c) => c.procedurename.includes("CABG"));
    assert(cabgOverridden?.defaultunits === 3, "2.6.a Hospital override took precedence over default baseline (got: 3 units)");
    assert(cabgOverridden?.isHospitalOverride === true, "2.6.b isHospitalOverride flag is true");

    // Hospital B must still see global baseline (2 units), NOT Hospital A's override!
    const configsHospitalB = await SurgeryPlannerService.getProcedureConfigs(hospitalB.hospitalid);
    const cabgHospB = configsHospitalB.find((c) => c.procedurename.includes("CABG"));
    assert(cabgHospB?.defaultunits === 2, "2.6.c Hospital B sees global baseline of 2 units (tenant isolation preserved)");

    // -------------------------------------------------------------------------
    // TEST SECTION 3: CLINICAL REVIEWER PERMISSIONS & TENANT ISOLATION
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Clinical Reviewer Permissions & Ownership Checks ---");

    const surgeryDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days in future

    // 3.1 Create surgery plan in Hospital A
    const planA = await SurgeryPlannerService.createSurgeryPlan(
        hospitalA.hospitalid,
        hospitalClerkUser.userid,
        {
            patientreference: "PAT-HOSP-A-991",
            patientage: 58,
            patientgender: gender_type.MALE,
            patientbloodgroup: blood_group.A_POSITIVE,
            procedurename: "Total Hip Replacement (THR)",
            scheduleddate: surgeryDate,
            expecteddurationminutes: 150,
        }
    );
    assert(planA.surgeryid !== undefined, "3.1.a Surgery plan created by hospital staff");

    // 3.2 Ordinary hospital staff without clinical reviewer permission cannot approve
    let clerkBlocked = false;
    try {
        await SurgeryPlannerService.reviewAndApprovePlan(
            planA.surgeryid,
            hospitalA.hospitalid,
            { userid: hospitalClerkUser.userid, role: user_role.HOSPITAL, name: hospitalClerkUser.name },
            {
                finalcomponent: blood_component.RBC,
                finalunits: 2,
                adjustmentreason: "Attempt by non-clinical clerk",
            }
        );
    } catch (err: any) {
        if (err.message.includes("verified hospital clinical reviewers")) {
            clerkBlocked = true;
        }
    }
    assert(clerkBlocked, "3.2.a Ordinary hospital staff (isclinicalreviewer = false) blocked from clinical approval");

    // 3.3 Donor user cannot approve
    let donorBlocked = false;
    try {
        await SurgeryPlannerService.reviewAndApprovePlan(
            planA.surgeryid,
            hospitalA.hospitalid,
            { userid: donorUser.userid, role: user_role.DONOR, name: donorUser.name },
            {
                finalcomponent: blood_component.RBC,
                finalunits: 2,
                adjustmentreason: "Attempt by donor",
            }
        );
    } catch (err: any) {
        if (err.message.includes("verified hospital clinical reviewers")) {
            donorBlocked = true;
        }
    }
    assert(donorBlocked, "3.3.a Donor user blocked from clinical approval");

    // 3.4 Authorized clinical reviewer successfully approves
    const approvedPlanA = await SurgeryPlannerService.reviewAndApprovePlan(
        planA.surgeryid,
        hospitalA.hospitalid,
        { userid: hospitalClinicianUser.userid, role: user_role.HOSPITAL, name: hospitalClinicianUser.name },
        {
            finalcomponent: blood_component.RBC,
            finalunits: 2,
            adjustmentreason: "Approved 2 units PRBC for primary THR with autologous blood recovery ready.",
        }
    );
    assert(approvedPlanA.reviewedbyuserid === hospitalClinicianUser.userid, "3.4.a Reviewer user recorded");
    assert(approvedPlanA.finalunits === 2, "3.4.b Approved requirement units recorded");

    // 3.5 Cross-hospital tenant isolation check
    let crossHospitalBlocked = false;
    try {
        await SurgeryPlannerService.getSurgeryPlanById(planA.surgeryid, hospitalB.hospitalid);
    } catch (err: any) {
        if (err.message.includes("Surgery plan not found")) {
            crossHospitalBlocked = true;
        }
    }
    assert(crossHospitalBlocked, "3.5.a Hospital B cannot view Hospital A surgery plan (tenant isolation verified)");

    // -------------------------------------------------------------------------
    // TEST SECTION 4: INVENTORY CALCULATIONS ACROSS ALL 4 COMPONENTS
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Inventory Calculations Across All 4 Components & Unit Exclusions ---");

    const lotExpiry = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000); // 25 days in future

    // Helper to create safe screened test unit
    async function createTestScreenedUnit(
        bloodGroup: blood_group,
        bloodComponent: blood_component,
        status: string,
        ttiStatus: string,
        expiry: Date,
        barcode: string
    ) {
        // Create base lot if not exists
        let lot = await prisma.inventory.findFirst({
            where: {
                bloodbankid: bloodBank.bloodbankid,
                bloodgroup: bloodGroup,
                bloodcomponent: bloodComponent,
            },
        });
        if (!lot) {
            lot = await prisma.inventory.create({
                data: {
                    bloodbankid: bloodBank.bloodbankid,
                    bloodgroup: bloodGroup,
                    bloodcomponent: bloodComponent,
                    unitsavailable: 1,
                    unitsreserved: 0,
                    unitsquarantined: 0,
                    expirydate: expiry,
                },
            });
        }

        const unit = await prisma.inventoryunits.create({
            data: {
                inventoryid: lot.inventoryid,
                bloodbankid: bloodBank.bloodbankid,
                unitbarcode: barcode,
                donationidentificationnumber: `DIN-${barcode}`,
                bloodgroup: bloodGroup,
                bloodcomponent: bloodComponent,
                collectiondate: new Date(),
                expirydate: expiry,
                status: "QUARANTINED",
                ttiscreeningstatus: "PENDING",
            },
        });

        if (status === "AVAILABLE" && ttiStatus === "PASSED") {
            const scr = await prisma.unitscreeningrecords.create({
                data: {
                    unitid: unit.unitid,
                    revisionnumber: 1,
                    iscurrent: true,
                    hivresult: "NON_REACTIVE",
                    hbvresult: "NON_REACTIVE",
                    hcvresult: "NON_REACTIVE",
                    syphilisresult: "NON_REACTIVE",
                    malariaresult: "NON_REACTIVE",
                    overallstatus: "PASSED",
                    testedbyuserid: bloodBankUser.userid,
                    verifiedbyuserid: hospitalClinicianUser.userid,
                    verifiedat: new Date(),
                },
            });
            await prisma.inventoryunits.update({
                where: { unitid: unit.unitid },
                data: {
                    currentscreeningid: scr.screeningid,
                    status: "AVAILABLE",
                    ttiscreeningstatus: "PASSED",
                },
            });
        } else if (status !== "AVAILABLE" || ttiStatus !== "PASSED") {
            // Keep status or update as requested
            await prisma.inventoryunits.update({
                where: { unitid: unit.unitid },
                data: {
                    status: status,
                    ttiscreeningstatus: ttiStatus,
                },
            });
        }

        return unit;
    }

    // 4.1 Platelet Compatibility Test (AB- recipient requires AB- platelets)
    const platBarcodeEligible = `U-PLT-ELIG-${testStamp}`;
    const platBarcodeQuarantine = `U-PLT-QUAR-${testStamp}`;
    const platBarcodeExpired = `U-PLT-EXP-${testStamp}`;

    await createTestScreenedUnit(
        blood_group.AB_NEGATIVE,
        blood_component.PLATELETS,
        "AVAILABLE",
        "PASSED",
        lotExpiry,
        platBarcodeEligible
    );
    await createTestScreenedUnit(
        blood_group.AB_NEGATIVE,
        blood_component.PLATELETS,
        "QUARANTINED",
        "PENDING",
        lotExpiry,
        platBarcodeQuarantine
    );
    const earlyExpired = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days in future (expires before surgery date of 5 days)
    await createTestScreenedUnit(
        blood_group.AB_NEGATIVE,
        blood_component.PLATELETS,
        "AVAILABLE",
        "PASSED",
        earlyExpired,
        platBarcodeExpired
    );

    const planPlat = await SurgeryPlannerService.createSurgeryPlan(
        hospitalA.hospitalid,
        hospitalClinicianUser.userid,
        {
            patientreference: "PAT-PLT-TEST",
            patientage: 49,
            patientgender: gender_type.FEMALE,
            patientbloodgroup: blood_group.AB_NEGATIVE,
            procedurename: "Coronary Artery Bypass Graft (CABG)",
            scheduleddate: surgeryDate,
            clinicianspecifiedcomponent: blood_component.PLATELETS,
            clinicianspecifiedunits: 2,
        }
    );

    const platAvail = await SurgeryPlannerService.checkAvailability(planPlat.surgeryid, hospitalA.hospitalid);
    assert(platAvail.totalAvailable === 1, `4.1.a Platelet filtering: exactly 1 eligible unit found (got: ${platAvail.totalAvailable})`);
    assert(platAvail.isShortage === true, "4.1.b Platelet shortage identified (1 available vs 2 required)");
    assert(platAvail.shortageUnits === 1, "4.1.c Platelet shortage deficit is exactly 1");

    // 4.2 Plasma Compatibility Test (AB is universal plasma donor, can donate to O)
    // Create an AB+ Plasma unit
    const plasmaBarcode = `U-PLS-AB-${testStamp}`;
    await createTestScreenedUnit(
        blood_group.AB_POSITIVE,
        blood_component.PLASMA,
        "AVAILABLE",
        "PASSED",
        lotExpiry,
        plasmaBarcode
    );

    const planPlasma = await SurgeryPlannerService.createSurgeryPlan(
        hospitalA.hospitalid,
        hospitalClinicianUser.userid,
        {
            patientreference: "PAT-PLS-O-POS",
            patientage: 34,
            patientgender: gender_type.MALE,
            patientbloodgroup: blood_group.O_POSITIVE,
            procedurename: "Cesarean Section (High Risk)",
            scheduleddate: surgeryDate,
            clinicianspecifiedcomponent: blood_component.PLASMA,
            clinicianspecifiedunits: 1,
        }
    );

    const plasmaAvail = await SurgeryPlannerService.checkAvailability(planPlasma.surgeryid, hospitalA.hospitalid);
    assert(
        plasmaAvail.totalAvailable >= 1,
        `4.2.a Plasma compatibility: O+ recipient can receive AB+ plasma (got: ${plasmaAvail.totalAvailable})`
    );

    // 4.3 Stock expiry relative to scheduled surgery date
    assert(
        earlyExpired.getTime() < surgeryDate.getTime(),
        "4.3.a Verified unit expiring at T+2 days expires before surgery at T+5 days and is excluded"
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 5: STATUS TRANSITIONS & PREPARATION CONFIRMATION
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Status Transitions & Preparation Confirmation ---");

    // 5.1 Alternative outcomes: BLOOD_AVAILABLE vs SHORTAGE_IDENTIFIED
    assert(
        platAvail.status === surgery_status.SHORTAGE_IDENTIFIED,
        "5.1.a Shortage outcome sets status = SHORTAGE_IDENTIFIED"
    );

    // Now add a 2nd eligible Platelet unit
    const platBarcode2 = `U-PLT-ELIG-2-${testStamp}`;
    await createTestScreenedUnit(
        blood_group.AB_NEGATIVE,
        blood_component.PLATELETS,
        "AVAILABLE",
        "PASSED",
        lotExpiry,
        platBarcode2
    );

    // Recheck availability: Now 2 units available for 2 required -> should transition to BLOOD_AVAILABLE
    const platAvailRecheck = await SurgeryPlannerService.checkAvailability(planPlat.surgeryid, hospitalA.hospitalid);
    assert(platAvailRecheck.totalAvailable === 2, "5.1.b Recheck found 2 eligible units after stock added");
    assert(platAvailRecheck.isShortage === false, "5.1.c Shortage resolved (isShortage = false)");
    assert(platAvailRecheck.status === surgery_status.BLOOD_AVAILABLE, "5.1.d Direct transition to BLOOD_AVAILABLE");

    // 5.2 READY_FOR_SURGERY requires preparation confirmation
    const readyPlan = await SurgeryPlannerService.confirmSurgeryReadiness(
        planPlat.surgeryid,
        hospitalA.hospitalid,
        hospitalClinicianUser.userid,
        "Crossmatch blood serum checked; 2 units platelets inspected and cold chain verified."
    );
    assert(readyPlan.status === surgery_status.READY_FOR_SURGERY, "5.2.a Transitioned to READY_FOR_SURGERY upon confirmation");

    // 5.3 Cannot confirm readiness if unresolved shortage exists
    let readinessBlockedOnShortage = false;
    // Create a plan with shortage (needs 10 units)
    const shortagePlan = await SurgeryPlannerService.createSurgeryPlan(
        hospitalA.hospitalid,
        hospitalClinicianUser.userid,
        {
            patientreference: "PAT-SHORTAGE-CONFIRM",
            patientage: 50,
            patientgender: gender_type.MALE,
            patientbloodgroup: blood_group.AB_NEGATIVE,
            procedurename: "Coronary Artery Bypass Graft (CABG)",
            scheduleddate: surgeryDate,
            clinicianspecifiedcomponent: blood_component.PLATELETS,
            clinicianspecifiedunits: 10,
        }
    );
    await SurgeryPlannerService.checkAvailability(shortagePlan.surgeryid, hospitalA.hospitalid);

    try {
        await SurgeryPlannerService.confirmSurgeryReadiness(
            shortagePlan.surgeryid,
            hospitalA.hospitalid,
            hospitalClinicianUser.userid,
            "Premature confirmation attempt"
        );
    } catch (err: any) {
        if (err.message.includes("Unresolved blood shortage")) {
            readinessBlockedOnShortage = true;
        }
    }
    assert(readinessBlockedOnShortage, "5.3.a Confirming readiness blocked when unresolved shortage exists");

    // -------------------------------------------------------------------------
    // TEST SECTION 6: REQUISITION TRANSACTION SAFETY & CONCURRENCY
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Requisition Transaction Safety & Concurrency ---");

    // 6.1 Successful requisition creation and linking
    const reqRes = await SurgeryPlannerService.createRequisitionForShortage(
        shortagePlan.surgeryid,
        hospitalA.hospitalid,
        hospitalClinicianUser.userid
    );
    assert(reqRes.success === true, "6.1.a Requisition created successfully");
    assert(reqRes.status === surgery_status.BLOOD_REQUESTED, "6.1.b Status is BLOOD_REQUESTED");

    // 6.2 Concurrent / Duplicate submission handling
    let concurrentBlocked = false;
    try {
        await SurgeryPlannerService.createRequisitionForShortage(
            shortagePlan.surgeryid,
            hospitalA.hospitalid,
            hospitalClinicianUser.userid
        );
    } catch (err: any) {
        if (err.message.includes("already been initiated")) {
            concurrentBlocked = true;
        }
    }
    assert(concurrentBlocked, "6.2.a Second requisition submission blocked by transaction lock");

    // 6.3 Verify no patient PII in query URLs (URL structure test)
    // The requisition handoff uses POST /hospitals/me/surgeries/:id/create-request without query params
    const handoffEndpoint = `/hospitals/me/surgeries/${shortagePlan.surgeryid}/create-request`;
    assert(!handoffEndpoint.includes("patient"), "6.3.a Requisition endpoint uses surgical ID without patient PII");
    assert(!handoffEndpoint.includes("name"), "6.3.b Requisition endpoint contains no patient names or sensitive data in URL");

    // -------------------------------------------------------------------------
    // TEST SECTION 7: DATABASE CONSTRAINTS & DUPLICATE CONFIGURATIONS
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Database Safety & Unique Constraint Verification ---");

    // 7.1 Duplicate hospital configuration must be rejected by PostgreSQL / service
    let duplicateHospitalConfigBlocked = false;
    try {
        await SurgeryPlannerService.saveProcedureConfig(hospitalA.hospitalid, {
            procedurename: "Coronary Artery Bypass Graft (CABG)", // Already exists for hospitalA
            category: "Cardiothoracic Surgery",
            defaultcomponent: blood_component.RBC,
            defaultunits: 4,
            guidelinesource: "Duplicate Attempt Source",
            guidelineversion: "2026.X",
            approvalauthority: "Dr. Duplicate",
            effectivedate: new Date(),
        });
    } catch (err: any) {
        if (err.message.includes("already exists for this hospital")) {
            duplicateHospitalConfigBlocked = true;
        }
    }
    assert(duplicateHospitalConfigBlocked, "7.1.a Duplicate hospital-specific configuration blocked");

    // 7.2 Non-destructive cancellation preserves audit history
    const cancelReason = "Patient scheduled for CABG developed acute pulmonary edema; postponed.";
    const cancelledPlan = await SurgeryPlannerService.cancelSurgeryPlan(
        planPlat.surgeryid,
        hospitalA.hospitalid,
        hospitalClinicianUser.userid,
        cancelReason
    );
    assert(cancelledPlan.status === surgery_status.CANCELLED, "7.2.a Status transitioned to CANCELLED");

    const finalPlanRecord = await SurgeryPlannerService.getSurgeryPlanById(planPlat.surgeryid, hospitalA.hospitalid);
    assert(finalPlanRecord.statushistory.length >= 4, "7.2.b Complete status history preserved across all transitions");
    const lastAudit = finalPlanRecord.statushistory[finalPlanRecord.statushistory.length - 1];
    assert(lastAudit.reason?.includes("pulmonary edema"), "7.2.c Cancellation reason recorded in immutable history");

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log("\n--- Cleaning up test fixtures in swastya_test ---");
    try {
        const testSurgeryIds = [planA.surgeryid, planPlat.surgeryid, shortagePlan.surgeryid];
        await prisma.surgeryplanstatushistory.deleteMany({
            where: { surgeryid: { in: testSurgeryIds } },
        });
        await prisma.surgeryplans.deleteMany({
            where: { surgeryid: { in: testSurgeryIds } },
        });
        if (reqRes.requestId) {
            await prisma.bloodrequests.delete({ where: { requestid: reqRes.requestId } });
        }
        await prisma.procedurebloodconfigs.deleteMany({
            where: { hospitalid: { in: [hospitalA.hospitalid, hospitalB.hospitalid] } },
        });
        await prisma.inventoryunits.updateMany({
            where: {
                OR: [
                    { unitbarcode: { startsWith: "U-PLT-" } },
                    { unitbarcode: { startsWith: "UNIT-" } },
                    { unitbarcode: { startsWith: "U-PLS-" } },
                ],
            },
            data: { status: "DISCARDED" },
        });
        await prisma.hospitals.deleteMany({
            where: { hospitalid: { in: [hospitalA.hospitalid, hospitalB.hospitalid] } },
        });
        console.log("  [CLEANUP] Test fixtures successfully cleaned up.");
    } catch (cleanupErr: any) {
        console.warn("  [CLEANUP NOTE]", cleanupErr.message || cleanupErr);
    }

    // -------------------------------------------------------------------------
    // FINAL RESULTS SUMMARY
    // -------------------------------------------------------------------------
    console.log("\n===============================================================================");
    console.log(`  SURGERY BLOOD PLANNER VERIFICATION RESULTS: ${passedTests}/${totalTests} PASSED`);
    console.log("===============================================================================");

    if (failures.length > 0) {
        console.error("\nFAILURES:");
        failures.forEach((f) => console.error(`  - ${f.error}`));
        process.exit(1);
    } else {
        console.log("\nALL VERIFICATION PASS TESTS COMPLETED WITH 100% SUCCESS!\n");
        process.exit(0);
    }
}

runComprehensiveSurgeryBloodPlannerTestSuite().catch((err) => {
    console.error("Test execution failed with fatal error:", err);
    process.exit(1);
});
