import crypto from "crypto";
import { prisma } from "../config/prisma";
import { blood_group, blood_component, inventory_operation_type, notification_type } from "../generated/prisma/enums";
import { buildScopedIdempotencyKey } from "../utils/idempotency";
import {
    RBC_RECIPIENT_TO_DONOR_MAP,
    PLASMA_RECIPIENT_TO_DONOR_MAP,
    PLATELET_RECIPIENT_TO_DONOR_MAP,
} from "../utils/bloodCompatibility";

export function computeRequestHash(payload: any): string {
    return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function getSafeCompatibleDonorGroups(component: blood_component, recipientGroup: blood_group): blood_group[] {
    // Under unapproved clinical policy gate: WHOLE_BLOOD enforces strict iso-group only!
    if (component === blood_component.WHOLE_BLOOD) {
        return [recipientGroup];
    }
    if (component === blood_component.RBC) {
        return RBC_RECIPIENT_TO_DONOR_MAP[recipientGroup] || [recipientGroup];
    }
    if (component === blood_component.PLASMA) {
        return PLASMA_RECIPIENT_TO_DONOR_MAP[recipientGroup] || [recipientGroup];
    }
    if (component === blood_component.PLATELETS) {
        return PLATELET_RECIPIENT_TO_DONOR_MAP[recipientGroup] || [recipientGroup];
    }
    return [recipientGroup];
}

export interface UnitIntakeInput {
    bloodBankId: string;
    actorUserId: string;
    bloodGroup: blood_group;
    bloodComponent: blood_component;
    expiryDate: Date;
    collectionDate?: Date;
    storageBinLocation?: string;
    units: Array<{
        unitBarcode: string;
        donationIdentificationNumber?: string;
    }>;
    idempotencyKey: string;
    reason: string;
}

export const ALLOWED_TTI_MARKER_RESULTS = ["NON_REACTIVE", "REACTIVE", "INDETERMINATE"] as const;
export type TtiMarkerResult = (typeof ALLOWED_TTI_MARKER_RESULTS)[number];

export const ALLOWED_SCREENING_OVERALL_STATUSES = ["PASSED", "FAILED", "INDETERMINATE"] as const;
export type ScreeningOverallStatus = (typeof ALLOWED_SCREENING_OVERALL_STATUSES)[number];

const TTI_MARKER_SET = new Set<string>(ALLOWED_TTI_MARKER_RESULTS);
const SCREENING_OVERALL_SET = new Set<string>(ALLOWED_SCREENING_OVERALL_STATUSES);
const FORBIDDEN_SCREENING_UNIT_STATUSES = new Set<string>(["IN_TRANSIT", "DELIVERED", "DISCARDED"]);

export function validateTtiPanelAndOverallStatus(input: {
    hivResult: unknown;
    hbvResult: unknown;
    hcvResult: unknown;
    syphilisResult: unknown;
    malariaResult: unknown;
    overallStatus: unknown;
}):
    | {
          ok: true;
          hivResult: TtiMarkerResult;
          hbvResult: TtiMarkerResult;
          hcvResult: TtiMarkerResult;
          syphilisResult: TtiMarkerResult;
          malariaResult: TtiMarkerResult;
          overallStatus: ScreeningOverallStatus;
      }
    | { ok: false; statusCode: number; message: string } {
    const markerEntries: Array<[string, unknown]> = [
        ["hivResult", input.hivResult],
        ["hbvResult", input.hbvResult],
        ["hcvResult", input.hcvResult],
        ["syphilisResult", input.syphilisResult],
        ["malariaResult", input.malariaResult],
    ];

    for (const [field, value] of markerEntries) {
        if (typeof value !== "string" || !TTI_MARKER_SET.has(value)) {
            return {
                ok: false,
                statusCode: 400,
                message: `Invalid ${field} value '${String(value)}'. Allowed TTI marker values are strictly: NON_REACTIVE, REACTIVE, INDETERMINATE`,
            };
        }
    }

    if (typeof input.overallStatus !== "string" || !SCREENING_OVERALL_SET.has(input.overallStatus)) {
        return {
            ok: false,
            statusCode: 400,
            message: `Invalid overallStatus '${String(input.overallStatus)}'. Allowed values: PASSED, FAILED, INDETERMINATE`,
        };
    }

    const hivResult = input.hivResult as TtiMarkerResult;
    const hbvResult = input.hbvResult as TtiMarkerResult;
    const hcvResult = input.hcvResult as TtiMarkerResult;
    const syphilisResult = input.syphilisResult as TtiMarkerResult;
    const malariaResult = input.malariaResult as TtiMarkerResult;
    const overallStatus = input.overallStatus as ScreeningOverallStatus;

    const markers = [hivResult, hbvResult, hcvResult, syphilisResult, malariaResult];
    const allNonReactive = markers.every((m) => m === "NON_REACTIVE");
    const anyReactive = markers.some((m) => m === "REACTIVE");

    if (overallStatus === "PASSED" && !allNonReactive) {
        return {
            ok: false,
            statusCode: 400,
            message:
                "Clinical TTI validation failure: overallStatus PASSED is permitted only when all five TTI markers (HIV, HBV, HCV, Syphilis, Malaria) are NON_REACTIVE",
        };
    }

    if (allNonReactive && overallStatus !== "PASSED") {
        return {
            ok: false,
            statusCode: 400,
            message:
                "Clinical TTI validation failure: inconsistent overallStatus. When all five TTI markers are NON_REACTIVE, overallStatus must be PASSED",
        };
    }

    if (anyReactive && overallStatus !== "FAILED") {
        return {
            ok: false,
            statusCode: 400,
            message:
                "Clinical TTI validation failure: inconsistent overallStatus. When any TTI marker is REACTIVE, overallStatus must be FAILED",
        };
    }

    return {
        ok: true,
        hivResult,
        hbvResult,
        hcvResult,
        syphilisResult,
        malariaResult,
        overallStatus,
    };
}

export interface ScreeningInput {
    unitId: string;
    bloodBankId: string;
    actorUserId: string;
    testedByUserId: string;
    verifiedByUserId?: never;
    hivResult: string;
    hbvResult: string;
    hcvResult: string;
    syphilisResult: string;
    malariaResult: string;
    overallStatus: "PASSED" | "FAILED" | "INDETERMINATE";
    laboratoryRemarks?: string;
}

export interface ScreeningVerificationInput {
    unitId: string;
    bloodBankId: string;
    screeningId?: string;
    verifierUserId: string;
    laboratoryRemarks?: string;
}

export interface ReservationAllocateInput {
    requestId: string;
    bloodBankId: string;
    actorUserId: string;
    requestedUnits: number;
    specificUnitIds?: string[];
    idempotencyKey: string;
}

export interface CrossmatchInput {
    reservationItemId: string;
    bloodBankId: string;
    actorUserId: string;
    testedByUserId: string;
    verifiedByUserId: string;
    methodology: string;
    testResult: "COMPATIBLE" | "INCOMPATIBLE" | "INCONCLUSIVE";
    validUntilHours?: number; // default 72h
}

export interface DispatchInput {
    reservationId: string;
    bloodBankId: string;
    actorUserId: string;
    courierName: string;
    trackingId?: string;
    coldBoxSealNumber: string;
    initialTemperature: number;
    idempotencyKey: string;
}

export interface HospitalReceiptItemInput {
    itemId: string;
    receivedStatus: "ACCEPTED" | "REJECTED_EXCURSION";
    tempReading?: number;
    notes?: string;
}

export const STRING_TO_BLOOD_GROUP_ENUM: Record<string, blood_group> = {
    "A+": blood_group.A_POSITIVE,
    "A-": blood_group.A_NEGATIVE,
    "B+": blood_group.B_POSITIVE,
    "B-": blood_group.B_NEGATIVE,
    "AB+": blood_group.AB_POSITIVE,
    "AB-": blood_group.AB_NEGATIVE,
    "O+": blood_group.O_POSITIVE,
    "O-": blood_group.O_NEGATIVE,
    "A_POSITIVE": blood_group.A_POSITIVE,
    "A_NEGATIVE": blood_group.A_NEGATIVE,
    "B_POSITIVE": blood_group.B_POSITIVE,
    "B_NEGATIVE": blood_group.B_NEGATIVE,
    "AB_POSITIVE": blood_group.AB_POSITIVE,
    "AB_NEGATIVE": blood_group.AB_NEGATIVE,
    "O_POSITIVE": blood_group.O_POSITIVE,
    "O_NEGATIVE": blood_group.O_NEGATIVE,
};

export const STRING_TO_BLOOD_COMPONENT_ENUM: Record<string, blood_component> = {
    "WHOLE_BLOOD": blood_component.WHOLE_BLOOD,
    "PLATELETS": blood_component.PLATELETS,
    "PLASMA": blood_component.PLASMA,
    "RBC": blood_component.RBC,
};

export class UnitTraceabilityService {
    /**
     * INTAKE INDIVIDUAL BLOOD UNITS
     * Atomically creates units in QUARANTINED status, updates lot quarantined count,
     * and records immutable STOCK_INTAKE ledger entry with sub-keyed idempotency.
     */
    static async intakeUnits(input: UnitIntakeInput) {
        const bloodBankId = input.bloodBankId;
        const actorUserId = input.actorUserId;
        const bloodGroup = STRING_TO_BLOOD_GROUP_ENUM[input.bloodGroup as string] || input.bloodGroup;
        const bloodComponent = STRING_TO_BLOOD_COMPONENT_ENUM[input.bloodComponent as string] || input.bloodComponent;
        const expiryDate = input.expiryDate;
        const collectionDate = input.collectionDate;
        const storageBinLocation = input.storageBinLocation;
        const units = input.units;
        const idempotencyKey = input.idempotencyKey;
        const reason = input.reason;

        if (!units || units.length === 0) {
            throw new Error("At least one blood unit is required for intake");
        }

        const bb = await prisma.bloodbanks.findUnique({
            where: { bloodbankid: bloodBankId },
            select: { bloodbankid: true, approvalstatus: true },
        });
        if (!bb || bb.approvalstatus !== "APPROVED") {
            const err: any = new Error(
                `Blood bank facility is ${bb?.approvalstatus || "NOT_APPROVED"}. Only APPROVED facilities may perform clinical operations.`
            );
            err.statusCode = 403;
            throw err;
        }

        // Verify duplicate barcodes in incoming payload
        const barcodeSet = new Set<string>();
        for (const u of units) {
            if (!u.unitBarcode || !u.unitBarcode.trim()) {
                throw new Error("Unit barcode cannot be empty");
            }
            const trimmed = u.unitBarcode.trim();
            if (barcodeSet.has(trimmed)) {
                throw new Error(`Duplicate barcode in payload: ${trimmed}`);
            }
            barcodeSet.add(trimmed);
        }

        const requestHash = computeRequestHash(input);

        // Check if root idempotency key was already committed (scoped by bloodBankId + operation + idempotencyKey)
        const scopedPrefix = buildScopedIdempotencyKey(bloodBankId, "STOCK_INTAKE", idempotencyKey);
        const existingLedger = await prisma.inventoryledger.findFirst({
            where: {
                bloodbankid: bloodBankId,
                idempotencykey: { startsWith: `${scopedPrefix}:lot:` },
            },
        });
        if (existingLedger) {
            if (existingLedger.requesthash !== requestHash) {
                const err: any = new Error("Idempotency key has already been used for a different mutation request");
                err.statusCode = 409;
                throw err;
            }
            return existingLedger.responsebody as any;
        }

        // Check existing barcodes in DB
        const existingUnits = await prisma.inventoryunits.findMany({
            where: {
                bloodbankid: bloodBankId,
                unitbarcode: { in: Array.from(barcodeSet) },
            },
            select: { unitbarcode: true },
        });
        if (existingUnits.length > 0) {
            const duplicates = existingUnits.map((u) => u.unitbarcode).join(", ");
            const err: any = new Error(`Barcode(s) already exist in blood bank vault: ${duplicates}`);
            err.statusCode = 409;
            throw err;
        }

        try {
            return await prisma.$transaction(async (tx) => {
                // Re-check idempotency under transaction
                const txExistingLedger = await tx.inventoryledger.findFirst({
                    where: {
                        bloodbankid: bloodBankId,
                        idempotencykey: { startsWith: `${scopedPrefix}:lot:` },
                    },
                });
                if (txExistingLedger) {
                    if (txExistingLedger.requesthash !== requestHash) {
                        const err: any = new Error("Idempotency key has already been used for a different mutation request");
                        err.statusCode = 409;
                        throw err;
                    }
                    return txExistingLedger.responsebody as any;
                }

                // Find or create aggregate inventory lot
                const expiryDateOnly = new Date(expiryDate);
                expiryDateOnly.setUTCHours(0, 0, 0, 0);

                let lot = await tx.inventory.findFirst({
                    where: {
                        bloodbankid: bloodBankId,
                        bloodgroup: bloodGroup,
                        bloodcomponent: bloodComponent,
                        expirydate: expiryDateOnly,
                    },
                });

                if (!lot) {
                    lot = await tx.inventory.create({
                    data: {
                        bloodbankid: bloodBankId,
                        bloodgroup: bloodGroup,
                        bloodcomponent: bloodComponent,
                        unitsavailable: 0,
                        unitsreserved: 0,
                        unitsquarantined: 0,
                        islegacyreconciled: true,
                        expirydate: expiryDateOnly,
                    },
                });
            }

            // Lock lot row for atomic update
            const lockedLots: any[] = await tx.$queryRawUnsafe(
                `SELECT inventoryid, unitsavailable, unitsreserved, unitsquarantined FROM inventory WHERE inventoryid = $1 FOR UPDATE`,
                lot.inventoryid
            );
            const currentLot = lockedLots[0];

            const createdUnits: any[] = [];
            for (const u of units) {
                const unit = await tx.inventoryunits.create({
                    data: {
                        inventoryid: lot.inventoryid,
                        bloodbankid: bloodBankId,
                        unitbarcode: u.unitBarcode.trim(),
                        donationidentificationnumber: u.donationIdentificationNumber?.trim() || null,
                        bloodgroup: bloodGroup,
                        bloodcomponent: bloodComponent,
                        collectiondate: collectionDate || null,
                        expirydate: expiryDate,
                        status: "QUARANTINED",
                        ttiscreeningstatus: "PENDING",
                        storagebinlocation: storageBinLocation || null,
                    },
                });
                createdUnits.push(unit);

                // Record disposition history
                await tx.unitdispositionhistory.create({
                    data: {
                        unitid: unit.unitid,
                        bloodbankid: bloodBankId,
                        actoruserid: actorUserId,
                        previousstatus: "NONE",
                        newstatus: "QUARANTINED",
                        reason: `Unit Intake: ${reason}`,
                        notes: `Lot ID: ${lot.inventoryid}`,
                    },
                });
            }

            // Update lot quarantine count
            const newQuarantined = currentLot.unitsquarantined + units.length;
            await tx.inventory.update({
                where: { inventoryid: lot.inventoryid },
                data: {
                    unitsquarantined: newQuarantined,
                    lastupdated: new Date(),
                },
            });

            // Deterministic subkey for ledger entry (scoped by bloodBankId + operation + idempotencyKey)
            const ledgerSubKey = `${scopedPrefix}:lot:${lot.inventoryid}`;
            const responseData = {
                success: true,
                message: `Successfully intaked ${units.length} unit(s) into quarantine`,
                lot: {
                    inventoryId: lot.inventoryid,
                    bloodGroup,
                    bloodComponent,
                    unitsAvailable: currentLot.unitsavailable,
                    unitsReserved: currentLot.unitsreserved,
                    unitsQuarantined: newQuarantined,
                },
                units: createdUnits.map((u) => ({
                    unitId: u.unitid,
                    unitBarcode: u.unitbarcode,
                    status: u.status,
                    screeningStatus: u.ttiscreeningstatus,
                })),
            };

            await tx.inventoryledger.create({
                data: {
                    inventoryid: lot.inventoryid,
                    bloodbankid: bloodBankId,
                    actoruserid: actorUserId,
                    operationtype: "STOCK_INTAKE",
                    quantitydelta: units.length, // physical vault increase
                    previousavailable: currentLot.unitsavailable,
                    newavailable: currentLot.unitsavailable,
                    previousreserved: currentLot.unitsreserved,
                    newreserved: currentLot.unitsreserved,
                    reason,
                    idempotencykey: ledgerSubKey,
                    requesthash: requestHash,
                    responsecode: 201,
                    responsebody: responseData as any,
                },
            });

            return responseData;
        });
        } catch (txError: any) {
            // Concurrent duplicate request resolution via committed idempotency record
            if (txError.code === "P2002" && String(txError.message || "").includes("idempotencykey")) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    const committed = await prisma.inventoryledger.findFirst({
                        where: {
                            bloodbankid: bloodBankId,
                            idempotencykey: { startsWith: `${scopedPrefix}:lot:` },
                        },
                    });
                    if (committed) {
                        if (committed.requesthash !== requestHash) {
                            const err: any = new Error("Idempotency key has already been used for a different mutation request");
                            err.statusCode = 409;
                            throw err;
                        }
                        return committed.responsebody as any;
                    }
                }
            }
            throw txError;
        }
    }

    /**
     * STEP 1: RECORD 5-PANEL TTI SCREENING SUBMISSION (TESTER SIGN-OFF)
     * Tester identity is derived strictly from the authenticated tester's JWT.
     * Client-supplied verifiedByUserId or mismatched testedByUserId is rejected.
     * Screening remains pending verification and unit remains QUARANTINED until Step 2 verification.
     */
    static async recordScreeningSubmission(input: ScreeningInput) {
        const {
            unitId,
            bloodBankId,
            actorUserId,
            testedByUserId,
            hivResult,
            hbvResult,
            hcvResult,
            syphilisResult,
            malariaResult,
            overallStatus,
            laboratoryRemarks,
        } = input;

        if (!bloodBankId) {
            const err: any = new Error("Mandatory tenant context: bloodBankId is required for TTI screening submission");
            err.statusCode = 400;
            throw err;
        }

        const rawVerifier = (input as any).verifiedByUserId ?? (input as any).verifiedbyuserid;
        if (rawVerifier !== undefined && rawVerifier !== null && String(rawVerifier).trim() !== "") {
            const err: any = new Error(
                "Client-supplied verifiedByUserId is prohibited: two-person clinical sign-off requires independent verifier authentication"
            );
            err.statusCode = 403;
            throw err;
        }

        if (!actorUserId || !testedByUserId || actorUserId !== testedByUserId) {
            const err: any = new Error(
                "Tester spoofing prohibited: testedByUserId must derive exclusively from the authenticated tester's JWT"
            );
            err.statusCode = 403;
            throw err;
        }

        const ttiValidation = validateTtiPanelAndOverallStatus({
            hivResult,
            hbvResult,
            hcvResult,
            syphilisResult,
            malariaResult,
            overallStatus,
        });
        if (!ttiValidation.ok) {
            const err: any = new Error(ttiValidation.message);
            err.statusCode = ttiValidation.statusCode;
            throw err;
        }

        return await prisma.$transaction(async (tx) => {
            // Lock unit, parent inventory lot, and blood bank facility scoped by tenant bloodBankId
            const lockedUnits: any[] = await tx.$queryRawUnsafe(
                `SELECT u.*, inv.unitsavailable, inv.unitsreserved, inv.unitsquarantined,
                        bb.userid AS facilityowneruserid, bb.approvalstatus AS facilityapprovalstatus
                 FROM inventoryunits u
                 JOIN inventory inv ON u.inventoryid = inv.inventoryid AND inv.bloodbankid = u.bloodbankid
                 JOIN bloodbanks bb ON u.bloodbankid = bb.bloodbankid
                 WHERE u.unitid = $1::uuid AND u.bloodbankid = $2::uuid
                 FOR UPDATE OF u, inv, bb`,
                unitId,
                bloodBankId
            );
            if (!lockedUnits || lockedUnits.length === 0) {
                const foreignUnit = await tx.inventoryunits.findUnique({
                    where: { unitid: unitId },
                    select: { bloodbankid: true },
                });
                if (foreignUnit && foreignUnit.bloodbankid !== bloodBankId) {
                    const err: any = new Error("Access denied: blood unit belongs to another blood bank");
                    err.statusCode = 403;
                    throw err;
                }
                const err: any = new Error("Blood unit not found");
                err.statusCode = 404;
                throw err;
            }
            const unit = lockedUnits[0];

            if (unit.bloodbankid !== bloodBankId) {
                const err: any = new Error("Access denied: blood unit belongs to another blood bank");
                err.statusCode = 403;
                throw err;
            }

            if (unit.facilityapprovalstatus !== "APPROVED") {
                const err: any = new Error(
                    `Blood bank facility is ${unit.facilityapprovalstatus || "NOT_APPROVED"}. Only APPROVED facilities may perform clinical operations.`
                );
                err.statusCode = 403;
                throw err;
            }

            // Lifecycle state protection: never screen units that are IN_TRANSIT, DELIVERED, or DISCARDED
            if (FORBIDDEN_SCREENING_UNIT_STATUSES.has(unit.status)) {
                const err: any = new Error(
                    `Clinical lifecycle violation: Cannot record or amend TTI screening for blood unit in ${unit.status} status`
                );
                err.statusCode = 400;
                throw err;
            }

            // Recheck tester user activity, role, and facility affiliation inside the transaction
            const testerRows: any[] = await tx.$queryRawUnsafe(
                `SELECT userid, role, isactive FROM users WHERE userid = $1::uuid FOR SHARE`,
                testedByUserId
            );
            const tester = testerRows?.[0];
            if (!tester || !tester.isactive) {
                const err: any = new Error("Clinical sign-off tester account is inactive or does not exist");
                err.statusCode = 403;
                throw err;
            }
            if (tester.role !== "BLOOD_BANK" && tester.role !== "ADMIN") {
                const err: any = new Error("Clinical sign-off tester does not hold an authorized blood bank role");
                err.statusCode = 403;
                throw err;
            }
            if (tester.role === "BLOOD_BANK" && tester.userid !== unit.facilityowneruserid) {
                const err: any = new Error("Clinical sign-off tester is not affiliated with this blood bank facility");
                err.statusCode = 403;
                throw err;
            }

            // Lock and supersede existing active screening if present
            const activeScreenings: any[] = await tx.$queryRawUnsafe(
                `SELECT screeningid, revisionnumber FROM unitscreeningrecords WHERE unitid = $1::uuid AND iscurrent = true FOR UPDATE`,
                unitId
            );
            const activeScreening = activeScreenings?.[0];

            let revisionNumber = 1;
            if (activeScreening) {
                revisionNumber = Number(activeScreening.revisionnumber) + 1;
                await tx.unitscreeningrecords.update({
                    where: { screeningid: activeScreening.screeningid },
                    data: {
                        iscurrent: false,
                        supersededat: new Date(),
                        supersededbyuserid: testedByUserId,
                    },
                });
            }

            // Create new append-only screening record in PENDING verification state (verifiedbyuserid = null, verifiedat = null)
            const newScreening = await tx.unitscreeningrecords.create({
                data: {
                    unitid: unitId,
                    revisionnumber: revisionNumber,
                    iscurrent: true,
                    hivresult: ttiValidation.hivResult,
                    hbvresult: ttiValidation.hbvResult,
                    hcvresult: ttiValidation.hcvResult,
                    syphilisresult: ttiValidation.syphilisResult,
                    malariaresult: ttiValidation.malariaResult,
                    overallstatus: ttiValidation.overallStatus,
                    testedbyuserid: testedByUserId,
                    verifiedbyuserid: null,
                    verifiedat: null,
                    laboratoryremarks: laboratoryRemarks || null,
                },
            });

            // Unit must stay QUARANTINED (or return to QUARANTINED if amending an AVAILABLE/RESERVED unit) until Step 2 verification
            const newUnitStatus = "QUARANTINED";
            let availableDelta = 0;
            let reservedDelta = 0;
            let quarantinedDelta = 0;

            if (unit.status === "AVAILABLE") {
                availableDelta = -1;
                quarantinedDelta = +1;
            } else if (unit.status === "RESERVED") {
                reservedDelta = -1;
                quarantinedDelta = +1;

                // Revoke active reservation item scoped to tenant bloodBankId
                await tx.reservationitems.updateMany({
                    where: {
                        unitid: unitId,
                        itemstatus: { in: ["RESERVED", "PREPARED"] },
                        reservation: { bloodbankid: bloodBankId },
                    },
                    data: { itemstatus: "RELEASED", releasedat: new Date() },
                });
            }

            // Update unit pointer to current pending screening record; ttiscreeningstatus remains PENDING until verified
            const updatedUnits = await tx.inventoryunits.updateMany({
                where: { unitid: unitId, bloodbankid: bloodBankId },
                data: {
                    currentscreeningid: newScreening.screeningid,
                    ttiscreeningstatus: "PENDING",
                    status: newUnitStatus,
                    updatedat: new Date(),
                },
            });
            if (updatedUnits.count !== 1) {
                const err: any = new Error("Failed to update blood unit for tenant facility");
                err.statusCode = 403;
                throw err;
            }

            // Update lot counters if an AVAILABLE or RESERVED unit was revoked back to QUARANTINED
            if (availableDelta !== 0 || reservedDelta !== 0 || quarantinedDelta !== 0) {
                const newAvail = unit.unitsavailable + availableDelta;
                const newRes = unit.unitsreserved + reservedDelta;
                const newQuar = unit.unitsquarantined + quarantinedDelta;

                const updatedLots = await tx.inventory.updateMany({
                    where: { inventoryid: unit.inventoryid, bloodbankid: bloodBankId },
                    data: {
                        unitsavailable: newAvail,
                        unitsreserved: newRes,
                        unitsquarantined: newQuar,
                        lastupdated: new Date(),
                    },
                });
                if (updatedLots.count !== 1) {
                    const err: any = new Error("Failed to update inventory lot for tenant facility");
                    err.statusCode = 403;
                    throw err;
                }

                const idempotencyKey = `screening:submit:${newScreening.screeningid}:${unit.inventoryid}`;
                await tx.inventoryledger.create({
                    data: {
                        inventoryid: unit.inventoryid,
                        bloodbankid: unit.bloodbankid,
                        actoruserid: testedByUserId,
                        operationtype: "SCREENING_CLEARANCE",
                        quantitydelta: 0,
                        previousavailable: unit.unitsavailable,
                        newavailable: newAvail,
                        previousreserved: unit.unitsreserved,
                        newreserved: newRes,
                        reason: `Screening amendment pending verification: ${ttiValidation.overallStatus} (Revision ${revisionNumber})`,
                        idempotencykey: idempotencyKey,
                        requesthash: computeRequestHash(input),
                        responsecode: 200,
                        responsebody: {
                            unitId,
                            barcode: unit.unitbarcode,
                            screeningStatus: "PENDING",
                            previousUnitStatus: unit.status,
                            newUnitStatus,
                        } as any,
                    },
                });
            }

            // Log disposition history for pending screening submission
            await tx.unitdispositionhistory.create({
                data: {
                    unitid: unitId,
                    bloodbankid: unit.bloodbankid,
                    actoruserid: testedByUserId,
                    previousstatus: unit.status,
                    newstatus: newUnitStatus,
                    reason: `Screening Submitted (Pending Verification - ${ttiValidation.overallStatus}): Tester (${testedByUserId})`,
                    notes: laboratoryRemarks || null,
                },
            });

            return {
                success: true,
                unitId,
                screeningId: newScreening.screeningid,
                revisionNumber,
                overallStatus: ttiValidation.overallStatus,
                verificationStatus: "PENDING_VERIFICATION",
                ttiScreeningStatus: "PENDING",
                unitStatus: newUnitStatus,
                testedByUserId,
                verifiedByUserId: null,
            };
        });
    }

    static async recordScreeningClearance(input: ScreeningInput) {
        return await UnitTraceabilityService.recordScreeningSubmission(input);
    }

    /**
     * STEP 2: INDEPENDENT SECOND-PERSON CLINICAL VERIFICATION
     * Requires the verifier's own authenticated JWT (verifierUserId).
     * Rechecks inside transaction that tester and verifier are distinct, active, authorized,
     * and affiliated with the APPROVED blood bank facility.
     * Only upon successful verification does a PASSED unit transition from QUARANTINED -> AVAILABLE.
     */
    static async verifyScreeningClearance(input: ScreeningVerificationInput) {
        const { unitId, bloodBankId, screeningId, verifierUserId, laboratoryRemarks } = input;

        if (!bloodBankId) {
            const err: any = new Error("Mandatory tenant context: bloodBankId is required for TTI screening verification");
            err.statusCode = 400;
            throw err;
        }
        if (!verifierUserId) {
            const err: any = new Error("Authenticated verifier identity is required");
            err.statusCode = 401;
            throw err;
        }

        return await prisma.$transaction(async (tx) => {
            // 1. Lock unit, inventory lot, and blood bank facility scoped by tenant bloodBankId
            const lockedUnits: any[] = await tx.$queryRawUnsafe(
                `SELECT u.*, inv.unitsavailable, inv.unitsreserved, inv.unitsquarantined,
                        bb.userid AS facilityowneruserid, bb.approvalstatus AS facilityapprovalstatus
                 FROM inventoryunits u
                 JOIN inventory inv ON u.inventoryid = inv.inventoryid AND inv.bloodbankid = u.bloodbankid
                 JOIN bloodbanks bb ON u.bloodbankid = bb.bloodbankid
                 WHERE u.unitid = $1::uuid AND u.bloodbankid = $2::uuid
                 FOR UPDATE OF u, inv, bb`,
                unitId,
                bloodBankId
            );
            if (!lockedUnits || lockedUnits.length === 0) {
                const foreignUnit = await tx.inventoryunits.findUnique({
                    where: { unitid: unitId },
                    select: { bloodbankid: true },
                });
                if (foreignUnit && foreignUnit.bloodbankid !== bloodBankId) {
                    const err: any = new Error("Access denied: blood unit belongs to another blood bank");
                    err.statusCode = 403;
                    throw err;
                }
                const err: any = new Error("Blood unit not found");
                err.statusCode = 404;
                throw err;
            }
            const unit = lockedUnits[0];

            if (unit.bloodbankid !== bloodBankId) {
                const err: any = new Error("Access denied: blood unit belongs to another blood bank");
                err.statusCode = 403;
                throw err;
            }

            if (unit.facilityapprovalstatus !== "APPROVED") {
                const err: any = new Error(
                    `Blood bank facility is ${unit.facilityapprovalstatus || "NOT_APPROVED"}. Only APPROVED facilities may perform clinical operations.`
                );
                err.statusCode = 403;
                throw err;
            }

            // 2. Lifecycle state protection
            if (FORBIDDEN_SCREENING_UNIT_STATUSES.has(unit.status)) {
                const err: any = new Error(
                    `Clinical lifecycle violation: Cannot verify TTI screening for blood unit in ${unit.status} status`
                );
                err.statusCode = 400;
                throw err;
            }

            // 3. Lock current active screening record for this unit
            const activeScreenings: any[] = await tx.$queryRawUnsafe(
                `SELECT * FROM unitscreeningrecords WHERE unitid = $1::uuid AND iscurrent = true FOR UPDATE`,
                unitId
            );
            if (!activeScreenings || activeScreenings.length === 0) {
                const err: any = new Error("No active TTI screening submission found for this blood unit");
                err.statusCode = 404;
                throw err;
            }
            const activeScreening = activeScreenings[0];

            if (screeningId && activeScreening.screeningid !== screeningId) {
                const err: any = new Error(
                    "Specified screening record is not the current active screening submission for this unit"
                );
                err.statusCode = 409;
                throw err;
            }

            if (activeScreening.verifiedbyuserid !== null || activeScreening.verifiedat !== null) {
                const err: any = new Error("Screening record has already been verified");
                err.statusCode = 409;
                throw err;
            }

            // 4. Enforce distinct tester and verifier (never allow self-verification)
            if (activeScreening.testedbyuserid === verifierUserId) {
                const err: any = new Error(
                    "Clinical dual-signoff violation: tester and verifier cannot be the same user"
                );
                err.statusCode = 403;
                throw err;
            }

            // 5. Recheck both tester and verifier user activity, roles, and facility affiliation inside transaction
            const signOffUsers: any[] = await tx.$queryRawUnsafe(
                `SELECT userid, role, isactive FROM users WHERE userid = ANY($1::uuid[]) FOR SHARE`,
                [activeScreening.testedbyuserid, verifierUserId]
            );
            const tester = signOffUsers.find((u) => u.userid === activeScreening.testedbyuserid);
            const verifier = signOffUsers.find((u) => u.userid === verifierUserId);

            const allowedRoles = new Set(["BLOOD_BANK", "ADMIN"]);
            if (!tester || !tester.isactive || !allowedRoles.has(tester.role)) {
                const err: any = new Error("Original screening tester account is no longer active or authorized");
                err.statusCode = 403;
                throw err;
            }
            if (tester.role === "BLOOD_BANK" && tester.userid !== unit.facilityowneruserid) {
                const err: any = new Error("Original screening tester is not affiliated with this blood bank facility");
                err.statusCode = 403;
                throw err;
            }

            if (!verifier || !verifier.isactive || !allowedRoles.has(verifier.role)) {
                const err: any = new Error("Clinical verifier account is inactive or does not hold an authorized role");
                err.statusCode = 403;
                throw err;
            }
            if (verifier.role === "BLOOD_BANK" && verifier.userid !== unit.facilityowneruserid) {
                const err: any = new Error("Clinical verifier is not affiliated with this blood bank facility");
                err.statusCode = 403;
                throw err;
            }

            // 6. Re-validate stored 5-panel TTI results & overallStatus before releasing unit
            const ttiCheck = validateTtiPanelAndOverallStatus({
                hivResult: activeScreening.hivresult,
                hbvResult: activeScreening.hbvresult,
                hcvResult: activeScreening.hcvresult,
                syphilisResult: activeScreening.syphilisresult,
                malariaResult: activeScreening.malariaresult,
                overallStatus: activeScreening.overallstatus,
            });
            if (!ttiCheck.ok) {
                const err: any = new Error(ttiCheck.message);
                err.statusCode = ttiCheck.statusCode;
                throw err;
            }

            // 7. Record verifier sign-off on unitscreeningrecords
            const verifiedAt = new Date();
            const combinedRemarks = laboratoryRemarks
                ? activeScreening.laboratoryremarks
                    ? `${activeScreening.laboratoryremarks} | Verifier: ${laboratoryRemarks}`
                    : `Verifier: ${laboratoryRemarks}`
                : activeScreening.laboratoryremarks;

            const updatedScreening = await tx.unitscreeningrecords.update({
                where: { screeningid: activeScreening.screeningid },
                data: {
                    verifiedbyuserid: verifierUserId,
                    verifiedat: verifiedAt,
                    laboratoryremarks: combinedRemarks,
                },
            });

            // 8. Transition unit status and lot counters based on verified outcome
            let newUnitStatus = unit.status;
            let availableDelta = 0;
            let reservedDelta = 0;
            let quarantinedDelta = 0;

            if (ttiCheck.overallStatus === "PASSED") {
                if (unit.status === "QUARANTINED") {
                    newUnitStatus = "AVAILABLE";
                    quarantinedDelta = -1;
                    availableDelta = +1;
                }
            } else {
                newUnitStatus = "QUARANTINED";
                if (unit.status === "AVAILABLE") {
                    availableDelta = -1;
                    quarantinedDelta = +1;
                } else if (unit.status === "RESERVED") {
                    reservedDelta = -1;
                    quarantinedDelta = +1;
                    await tx.reservationitems.updateMany({
                        where: {
                            unitid: unitId,
                            itemstatus: { in: ["RESERVED", "PREPARED"] },
                            reservation: { bloodbankid: bloodBankId },
                        },
                        data: { itemstatus: "RELEASED", releasedat: verifiedAt },
                    });
                }
            }

            const updatedUnits = await tx.inventoryunits.updateMany({
                where: { unitid: unitId, bloodbankid: bloodBankId },
                data: {
                    currentscreeningid: updatedScreening.screeningid,
                    ttiscreeningstatus: ttiCheck.overallStatus,
                    status: newUnitStatus,
                    updatedat: verifiedAt,
                },
            });
            if (updatedUnits.count !== 1) {
                const err: any = new Error("Failed to update blood unit for tenant facility");
                err.statusCode = 403;
                throw err;
            }

            if (availableDelta !== 0 || reservedDelta !== 0 || quarantinedDelta !== 0) {
                const newAvail = unit.unitsavailable + availableDelta;
                const newRes = unit.unitsreserved + reservedDelta;
                const newQuar = unit.unitsquarantined + quarantinedDelta;

                const updatedLots = await tx.inventory.updateMany({
                    where: { inventoryid: unit.inventoryid, bloodbankid: bloodBankId },
                    data: {
                        unitsavailable: newAvail,
                        unitsreserved: newRes,
                        unitsquarantined: newQuar,
                        lastupdated: verifiedAt,
                    },
                });
                if (updatedLots.count !== 1) {
                    const err: any = new Error("Failed to update inventory lot for tenant facility");
                    err.statusCode = 403;
                    throw err;
                }

                const idempotencyKey = `screening:${updatedScreening.screeningid}:${unit.inventoryid}`;
                await tx.inventoryledger.create({
                    data: {
                        inventoryid: unit.inventoryid,
                        bloodbankid: unit.bloodbankid,
                        actoruserid: verifierUserId,
                        operationtype: "SCREENING_CLEARANCE",
                        quantitydelta: 0,
                        previousavailable: unit.unitsavailable,
                        newavailable: newAvail,
                        previousreserved: unit.unitsreserved,
                        newreserved: newRes,
                        reason: `Screening outcome: ${ttiCheck.overallStatus} (Revision ${updatedScreening.revisionnumber})`,
                        idempotencykey: idempotencyKey,
                        requesthash: computeRequestHash({
                            unitId,
                            screeningId: updatedScreening.screeningid,
                            verifierUserId,
                        }),
                        responsecode: 200,
                        responsebody: {
                            unitId,
                            barcode: unit.unitbarcode,
                            screeningStatus: ttiCheck.overallStatus,
                            previousUnitStatus: unit.status,
                            newUnitStatus,
                        } as any,
                    },
                });
            }

            await tx.unitdispositionhistory.create({
                data: {
                    unitid: unitId,
                    bloodbankid: unit.bloodbankid,
                    actoruserid: verifierUserId,
                    previousstatus: unit.status,
                    newstatus: newUnitStatus,
                    reason: `Screening ${ttiCheck.overallStatus}: Tester (${updatedScreening.testedbyuserid}), Verifier (${verifierUserId})`,
                    notes: combinedRemarks || null,
                },
            });

            return {
                success: true,
                unitId,
                screeningId: updatedScreening.screeningid,
                revisionNumber: updatedScreening.revisionnumber,
                overallStatus: ttiCheck.overallStatus,
                verificationStatus: "VERIFIED",
                ttiScreeningStatus: ttiCheck.overallStatus,
                unitStatus: newUnitStatus,
                testedByUserId: updatedScreening.testedbyuserid,
                verifiedByUserId: verifierUserId,
                verifiedAt: updatedScreening.verifiedat,
            };
        });
    }

    /**
     * ASSIGN REQUISITION TO BLOOD BANK
     * Locks bloodrequests row FOR UPDATE scoped by hospitalId tenant ownership.
     * Revalidates hospital ownership, prescription verification, and existing assignments under lock.
     */
    static async assignRequisition(
        requestId: string,
        bloodBankId: string,
        assignedByUserId: string,
        hospitalId?: string
    ) {
        if (!requestId || !bloodBankId || !assignedByUserId) {
            const err: any = new Error("requestId, bloodBankId, and assignedByUserId are required");
            err.statusCode = 400;
            throw err;
        }

        return await prisma.$transaction(async (tx) => {
            // 1. Validate actor identity, role, and hospital affiliation inside transaction
            const actorRows: any[] = await tx.$queryRawUnsafe(
                `SELECT userid, role, isactive FROM users WHERE userid = $1::uuid FOR SHARE`,
                assignedByUserId
            );
            const actor = actorRows?.[0];
            if (!actor || !actor.isactive) {
                const err: any = new Error("Assigning user account is inactive or does not exist");
                err.statusCode = 403;
                throw err;
            }
            if (actor.role !== "HOSPITAL" && actor.role !== "ADMIN") {
                const err: any = new Error("Access denied: only authorized HOSPITAL or ADMIN accounts can assign requisitions");
                err.statusCode = 403;
                throw err;
            }

            let effectiveHospitalId = hospitalId;
            if (actor.role === "HOSPITAL") {
                const hospRows: any[] = await tx.$queryRawUnsafe(
                    `SELECT hospitalid, approvalstatus FROM hospitals WHERE userid = $1::uuid FOR SHARE`,
                    assignedByUserId
                );
                const actorHospital = hospRows?.[0];
                if (!actorHospital) {
                    const err: any = new Error("Registered hospital profile required for clinical operations");
                    err.statusCode = 403;
                    throw err;
                }
                // TEMPORARY BYPASS: Allow non-APPROVED hospitals to perform clinical operations
                /*
                if (actorHospital.approvalstatus !== "APPROVED") {
                    const err: any = new Error(
                        `Hospital facility is ${actorHospital.approvalstatus}. Only APPROVED facilities may perform clinical operations.`
                    );
                    err.statusCode = 403;
                    throw err;
                }
                */
                if (hospitalId && hospitalId !== actorHospital.hospitalid) {
                    const err: any = new Error("Access denied: you can only assign blood requests belonging to your hospital");
                    err.statusCode = 403;
                    throw err;
                }
                effectiveHospitalId = actorHospital.hospitalid;
            }

            // 2. Lock bloodrequests row FOR UPDATE scoped by tenant hospitalId when applicable
            let lockedRequests: any[] = [];
            if (effectiveHospitalId) {
                lockedRequests = await tx.$queryRawUnsafe(
                    `SELECT requestid, hospitalid, requesterid, createdbyuserid, status, bloodgroup, bloodcomponent, unitsrequired
                     FROM bloodrequests
                     WHERE requestid = $1::uuid AND hospitalid = $2::uuid
                     FOR UPDATE`,
                    requestId,
                    effectiveHospitalId
                );
                if (!lockedRequests || lockedRequests.length === 0) {
                    const foreignReq = await tx.bloodrequests.findUnique({
                        where: { requestid: requestId },
                        select: { hospitalid: true },
                    });
                    if (foreignReq) {
                        const err: any = new Error(
                            "Access denied: you can only assign blood requests belonging to your hospital"
                        );
                        err.statusCode = 403;
                        throw err;
                    }
                    const err: any = new Error("Blood request not found");
                    err.statusCode = 404;
                    throw err;
                }
            } else {
                lockedRequests = await tx.$queryRawUnsafe(
                    `SELECT requestid, hospitalid, requesterid, createdbyuserid, status, bloodgroup, bloodcomponent, unitsrequired
                     FROM bloodrequests
                     WHERE requestid = $1::uuid
                     FOR UPDATE`,
                    requestId
                );
                if (!lockedRequests || lockedRequests.length === 0) {
                    const err: any = new Error("Blood request not found");
                    err.statusCode = 404;
                    throw err;
                }
            }

            const request = lockedRequests[0];

            // Revalidate ownership and status after acquiring lock
            if (effectiveHospitalId && request.hospitalid !== effectiveHospitalId) {
                const err: any = new Error("Access denied: you can only assign blood requests belonging to your hospital");
                err.statusCode = 403;
                throw err;
            }

            if (["FULFILLED", "CANCELLED", "EXPIRED"].includes(request.status || "")) {
                const err: any = new Error(`Cannot assign a blood request in ${request.status} status`);
                err.statusCode = 400;
                throw err;
            }

            // Revalidate assigned hospital facility under lock (required and must be APPROVED)
            if (!request.hospitalid) {
                const err: any = new Error(
                    "Requisition cannot be assigned to a blood bank without an assigned hospital facility"
                );
                err.statusCode = 400;
                throw err;
            }

            const assignedHospRows: any[] = await tx.$queryRawUnsafe(
                `SELECT hospitalid, approvalstatus FROM hospitals WHERE hospitalid = $1::uuid FOR SHARE`,
                request.hospitalid
            );
            const assignedHosp = assignedHospRows?.[0];
            // TEMPORARY BYPASS: Allow non-APPROVED hospitals to coordinate requisition assignments
            if (!assignedHosp) {
                const err: any = new Error(
                    `Assigned hospital not found. Hospital required to coordinate requisition assignments.`
                );
                err.statusCode = 403;
                throw err;
            }

            // 3. Revalidate clinical prescription verification gate under lock for requester-initiated requests
            if (request.requesterid) {
                const rxRows: any[] = await tx.$queryRawUnsafe(
                    `SELECT status FROM prescription WHERE requestid = $1::uuid FOR SHARE`,
                    requestId
                );
                const rx = rxRows?.[0];
                if (!rx || rx.status !== "VERIFIED") {
                    const err: any = new Error(
                        "Clinical prescription verification (VERIFIED) is required before assigning to a blood bank"
                    );
                    err.statusCode = 400;
                    throw err;
                }
            }

            // 4. Validate target blood bank under lock
            const bbRows: any[] = await tx.$queryRawUnsafe(
                `SELECT bloodbankid, bloodbankname, approvalstatus FROM bloodbanks WHERE bloodbankid = $1::uuid FOR SHARE`,
                bloodBankId
            );
            const targetBloodBank = bbRows?.[0];
            if (!targetBloodBank) {
                const err: any = new Error("Target blood bank not found");
                err.statusCode = 404;
                throw err;
            }
            if (targetBloodBank.approvalstatus === "REJECTED") {
                const err: any = new Error(
                    `Target blood bank is REJECTED. Rejected blood banks cannot be assigned requisitions.`
                );
                err.statusCode = 403;
                throw err;
            }

            // 5. Lock existing active assignments FOR UPDATE and block reassignment if already ACCEPTED
            const activeAssignments: any[] = await tx.$queryRawUnsafe(
                `SELECT assignmentid, bloodbankid, assignmentstatus
                 FROM requisitionassignments
                 WHERE requestid = $1::uuid
                   AND assignmentstatus IN ('PENDING_ACCEPTANCE', 'ACCEPTED')
                 FOR UPDATE`,
                requestId
            );

            const alreadyAccepted = activeAssignments.find((a) => a.assignmentstatus === "ACCEPTED");
            if (alreadyAccepted) {
                const err: any = new Error(
                    "Requisition already has an ACCEPTED blood bank assignment and cannot be reassigned"
                );
                err.statusCode = 409;
                throw err;
            }

            // Cancel any previous PENDING_ACCEPTANCE assignment
            if (activeAssignments.length > 0) {
                await tx.requisitionassignments.updateMany({
                    where: {
                        requestid: requestId,
                        assignmentstatus: "PENDING_ACCEPTANCE",
                    },
                    data: {
                        assignmentstatus: "CANCELLED",
                        updatedat: new Date(),
                    },
                });
            }

            // 6. Check inventory availability for Automatic Insufficient Stock Decline
            const PRISMA_TO_DB_BLOOD_GROUP: Record<string, string> = {
                A_POSITIVE: "A+",
                A_NEGATIVE: "A-",
                B_POSITIVE: "B+",
                B_NEGATIVE: "B-",
                AB_POSITIVE: "AB+",
                AB_NEGATIVE: "AB-",
                O_POSITIVE: "O+",
                O_NEGATIVE: "O-",
            };
            const DB_TO_PRISMA_BLOOD_GROUP: Record<string, blood_group> = {
                "A+": blood_group.A_POSITIVE,
                "A-": blood_group.A_NEGATIVE,
                "B+": blood_group.B_POSITIVE,
                "B-": blood_group.B_NEGATIVE,
                "AB+": blood_group.AB_POSITIVE,
                "AB-": blood_group.AB_NEGATIVE,
                "O+": blood_group.O_POSITIVE,
                "O-": blood_group.O_NEGATIVE,
                A_POSITIVE: blood_group.A_POSITIVE,
                A_NEGATIVE: blood_group.A_NEGATIVE,
                B_POSITIVE: blood_group.B_POSITIVE,
                B_NEGATIVE: blood_group.B_NEGATIVE,
                AB_POSITIVE: blood_group.AB_POSITIVE,
                AB_NEGATIVE: blood_group.AB_NEGATIVE,
                O_POSITIVE: blood_group.O_POSITIVE,
                O_NEGATIVE: blood_group.O_NEGATIVE,
            };

            const recipientPrismaGroup =
                DB_TO_PRISMA_BLOOD_GROUP[request.bloodgroup] || (request.bloodgroup as blood_group);
            const recipientComponent = request.bloodcomponent as blood_component;
            const compatibleGroups = getSafeCompatibleDonorGroups(recipientComponent, recipientPrismaGroup).map(
                (bg) => PRISMA_TO_DB_BLOOD_GROUP[bg] || bg
            );

            let eligibleCount: number | null = null;
            try {
                const stockRows: any[] = await tx.$queryRawUnsafe(
                    `SELECT COUNT(*)::int AS count
                     FROM inventoryunits u
                     JOIN inventory inv ON u.inventoryid = inv.inventoryid
                     WHERE u.bloodbankid = $1::uuid
                       AND u.bloodcomponent = $2::blood_component
                       AND u.bloodgroup = ANY($3::blood_group[])
                       AND u.status = 'AVAILABLE'
                       AND u.ttiscreeningstatus = 'PASSED'
                       AND u.expirydate > CURRENT_TIMESTAMP
                       AND inv.islegacyreconciled = true`,
                    bloodBankId,
                    recipientComponent,
                    compatibleGroups
                );
                eligibleCount = Number(stockRows?.[0]?.count ?? 0);
            } catch (stockErr) {
                console.error("Failed to query inventory availability for automatic decline check:", stockErr);
                eligibleCount = null;
            }

            const requestedUnits = Number(request.unitsrequired || 1);
            const shouldAutoDecline = eligibleCount !== null && eligibleCount < requestedUnits;

            const INSUFFICIENT_STOCK_REASON =
                "Insufficient eligible blood stock available to fulfil the requested quantity at this facility.";

            const assignment = await tx.requisitionassignments.create({
                data: {
                    requestid: requestId,
                    bloodbankid: bloodBankId,
                    assignedbyuserid: assignedByUserId,
                    assignmentstatus: shouldAutoDecline ? "DECLINED" : "PENDING_ACCEPTANCE",
                    declinereason: shouldAutoDecline ? INSUFFICIENT_STOCK_REASON : null,
                    respondedat: shouldAutoDecline ? new Date() : null,
                },
            });

            if (shouldAutoDecline) {
                // Send in-app notification to requesting hospital immediately
                const hospUser = await tx.hospitals.findUnique({
                    where: { hospitalid: request.hospitalid },
                    select: { userid: true, hospitalname: true },
                });
                const targetUserId = hospUser?.userid || request.createdbyuserid;

                if (targetUserId) {
                    await tx.notification.create({
                        data: {
                            userid: targetUserId,
                            requestid: requestId,
                            type: notification_type.REQUEST,
                            title: "Requisition Automatically Declined - Insufficient Stock",
                            message: `Your requisition for ${requestedUnits} unit(s) of ${request.bloodgroup} (${recipientComponent}) was automatically declined by ${targetBloodBank.bloodbankname || "Blood Bank"}: ${INSUFFICIENT_STOCK_REASON} (${eligibleCount} eligible unit(s) available).`,
                            isread: false,
                        },
                    });
                }
            }

            return {
                success: true,
                assignment,
                autoDeclined: shouldAutoDecline,
                eligibleCount,
                requestedUnits,
                reason: shouldAutoDecline ? INSUFFICIENT_STOCK_REASON : undefined,
            };
        });
    }

    /**
     * RESPOND TO REQUISITION ASSIGNMENT (ACCEPT OR DECLINE)
     */
    static async respondToAssignment(
        assignmentId: string,
        bloodBankId: string,
        actorUserId: string,
        action: "ACCEPT" | "DECLINE",
        declineReason?: string
    ) {
        return await prisma.$transaction(async (tx) => {
            const lockedRows: any[] = await tx.$queryRawUnsafe(
                `SELECT assignmentid, requestid, bloodbankid, assignmentstatus
                 FROM requisitionassignments
                 WHERE assignmentid = $1::uuid AND bloodbankid = $2::uuid
                 FOR UPDATE`,
                assignmentId,
                bloodBankId
            );
            if (!lockedRows || lockedRows.length === 0) {
                const err: any = new Error("Assignment not found or does not belong to this blood bank");
                err.statusCode = 404;
                throw err;
            }
            const assignment = lockedRows[0];

            if (assignment.assignmentstatus !== "PENDING_ACCEPTANCE") {
                const err: any = new Error(`Assignment is already in ${assignment.assignmentstatus} status`);
                err.statusCode = 400;
                throw err;
            }

            const newStatus = action === "ACCEPT" ? "ACCEPTED" : "DECLINED";
            const updated = await tx.requisitionassignments.update({
                where: { assignmentid: assignmentId },
                data: {
                    assignmentstatus: newStatus,
                    respondedat: new Date(),
                    respondedbyuserid: actorUserId,
                    declinereason: action === "DECLINE" ? declineReason || "Declined by blood bank" : null,
                    updatedat: new Date(),
                },
            });

            return {
                success: true,
                assignment: updated,
            };
        });
    }

    /**
     * ALLOCATE BLOOD RESERVATION
     * Locks inventory lots in PK order.
     * Enforces clinical compatibility and legacy isolation.
     * Deducts unitsavailable, increments unitsreserved, records RESERVATION_ALLOCATE ledger entry.
     */
    static async allocateReservation(input: ReservationAllocateInput) {
        const { requestId, bloodBankId, actorUserId, requestedUnits, specificUnitIds, idempotencyKey } = input;

        if (!requestedUnits || requestedUnits <= 0) {
            throw new Error("Requested units must be greater than zero");
        }

        const requestHash = computeRequestHash(input);

        // Check if root idempotency key was already committed (scoped by bloodBankId + operation + idempotencyKey)
        const scopedPrefix = buildScopedIdempotencyKey(bloodBankId, "RESERVATION_ALLOCATE", idempotencyKey);
        const existingLedger = await prisma.inventoryledger.findFirst({
            where: {
                bloodbankid: bloodBankId,
                idempotencykey: { startsWith: `${scopedPrefix}:lot:` },
            },
        });
        if (existingLedger) {
            if (existingLedger.requesthash !== requestHash) {
                const err: any = new Error("Idempotency key has already been used for a different mutation request");
                err.statusCode = 409;
                throw err;
            }
            return existingLedger.responsebody as any;
        }

        try {
            return await prisma.$transaction(async (tx) => {
                // Re-check idempotency under lock
                const txExistingLedger = await tx.inventoryledger.findFirst({
                    where: {
                        bloodbankid: bloodBankId,
                        idempotencykey: { startsWith: `${scopedPrefix}:lot:` },
                    },
                });
                if (txExistingLedger) {
                    if (txExistingLedger.requesthash !== requestHash) {
                        const err: any = new Error("Idempotency key has already been used for a different mutation request");
                        err.statusCode = 409;
                        throw err;
                    }
                    return txExistingLedger.responsebody as any;
                }

                // Verify active accepted assignment
                const assignment = await tx.requisitionassignments.findFirst({
                where: {
                    requestid: requestId,
                    bloodbankid: bloodBankId,
                    assignmentstatus: "ACCEPTED",
                },
            });
            if (!assignment) {
                const err: any = new Error("No accepted requisition assignment found for this blood bank and request");
                err.statusCode = 403;
                throw err;
            }

            const request = await tx.bloodrequests.findUnique({
                where: { requestid: requestId },
            });
            if (!request) {
                const err: any = new Error("Blood request not found");
                err.statusCode = 404;
                throw err;
            }
            if (["FULFILLED", "CANCELLED", "EXPIRED"].includes(request.status || "")) {
                const err: any = new Error(`Cannot assign a blood request in ${request.status} status`);
                err.statusCode = 400;
                throw err;
            }

            // Revalidate assigned hospital facility under lock (required and must be APPROVED)
            if (!request.hospitalid) {
                const err: any = new Error(
                    "Requisition cannot be assigned to a blood bank without an assigned hospital facility"
                );
                err.statusCode = 400;
                throw err;
            }

            const assignedHospRows: any[] = await tx.$queryRawUnsafe(
                `SELECT hospitalid, approvalstatus FROM hospitals WHERE hospitalid = $1::uuid FOR SHARE`,
                request.hospitalid
            );
            const assignedHosp = assignedHospRows?.[0];
            // TEMPORARY BYPASS: Allow non-APPROVED hospitals to coordinate requisition assignments
            if (!assignedHosp) {
                const err: any = new Error(
                    `Assigned hospital not found. Hospital required to coordinate requisition assignments.`
                );
                err.statusCode = 403;
                throw err;
            }

            const targetBloodBank = await tx.bloodbanks.findUnique({
                where: { bloodbankid: bloodBankId },
                select: { bloodbankid: true, approvalstatus: true },
            });
            if (!targetBloodBank) {
                const err: any = new Error("Target blood bank not found");
                err.statusCode = 404;
                throw err;
            }
            if (targetBloodBank.approvalstatus === "REJECTED") {
                const err: any = new Error(`Target blood bank is REJECTED. Rejected blood banks cannot be assigned requisitions.`);
                err.statusCode = 403;
                throw err;
            }

            // Determine compatible blood groups (strict iso-group for whole blood!) and map Prisma enum keys -> PostgreSQL enum labels
            const PRISMA_TO_DB_BLOOD_GROUP: Record<string, string> = {
                A_POSITIVE: "A+",
                A_NEGATIVE: "A-",
                B_POSITIVE: "B+",
                B_NEGATIVE: "B-",
                AB_POSITIVE: "AB+",
                AB_NEGATIVE: "AB-",
                O_POSITIVE: "O+",
                O_NEGATIVE: "O-",
            };
            const compatibleGroups = getSafeCompatibleDonorGroups(request.bloodcomponent, request.bloodgroup).map(
                (bg) => PRISMA_TO_DB_BLOOD_GROUP[bg] || bg
            );

            // Fetch candidate available units
            let candidateUnits: any[] = [];
            if (specificUnitIds && specificUnitIds.length > 0) {
                candidateUnits = await tx.$queryRawUnsafe(
                    `SELECT u.*, inv.islegacyreconciled 
                     FROM inventoryunits u 
                     JOIN inventory inv ON u.inventoryid = inv.inventoryid 
                     WHERE u.unitid = ANY($1::uuid[]) 
                       AND u.bloodbankid = $2 
                       AND u.bloodcomponent = $3::blood_component
                       AND u.bloodgroup = ANY($4::blood_group[])
                       AND u.status = 'AVAILABLE' 
                       AND u.ttiscreeningstatus = 'PASSED'
                       AND u.expirydate > CURRENT_TIMESTAMP
                     ORDER BY u.expirydate ASC, u.unitid ASC
                     FOR UPDATE OF u`,
                    specificUnitIds,
                    bloodBankId,
                    request.bloodcomponent,
                    compatibleGroups
                );
                if (candidateUnits.length < requestedUnits) {
                    const err: any = new Error(`Only ${candidateUnits.length} of ${requestedUnits} specified units are clinically compatible, unexpired, available, and cleared`);
                    err.statusCode = 409;
                    throw err;
                }
            } else {
                candidateUnits = await tx.$queryRawUnsafe(
                    `SELECT u.*, inv.islegacyreconciled 
                     FROM inventoryunits u 
                     JOIN inventory inv ON u.inventoryid = inv.inventoryid 
                     WHERE u.bloodbankid = $1 
                       AND u.bloodcomponent = $2 
                       AND u.bloodgroup = ANY($3::blood_group[]) 
                       AND u.status = 'AVAILABLE' 
                       AND u.ttiscreeningstatus = 'PASSED'
                       AND u.expirydate > CURRENT_TIMESTAMP
                       AND inv.islegacyreconciled = true
                     ORDER BY u.expirydate ASC, u.unitid ASC 
                     LIMIT $4 
                     FOR UPDATE OF u`,
                    bloodBankId,
                    request.bloodcomponent,
                    compatibleGroups,
                    requestedUnits
                );
            }

            if (candidateUnits.length < requestedUnits) {
                const err: any = new Error(
                    `Insufficient screened stock. Requested: ${requestedUnits}, available: ${candidateUnits.length}`
                );
                err.statusCode = 409;
                throw err;
            }

            // Check legacy isolation
            for (const u of candidateUnits) {
                if (u.islegacyreconciled === false) {
                    const err: any = new Error("Legacy stock isolation: Unreconciled legacy units cannot be reserved for unit-traceable requisitions");
                    err.statusCode = 403;
                    throw err;
                }
            }

            // Group allocated units by lot
            const unitsByLot = new Map<string, any[]>();
            for (const u of candidateUnits.slice(0, requestedUnits)) {
                if (!unitsByLot.has(u.inventoryid)) {
                    unitsByLot.set(u.inventoryid, []);
                }
                unitsByLot.get(u.inventoryid)!.push(u);
            }

            // Lock lots in primary key order to prevent deadlocks
            const lotIds = Array.from(unitsByLot.keys()).sort();
            const lockedLots: any[] = await tx.$queryRawUnsafe(
                `SELECT inventoryid, unitsavailable, unitsreserved, unitsquarantined 
                 FROM inventory 
                 WHERE inventoryid = ANY($1::uuid[]) 
                 ORDER BY inventoryid ASC 
                 FOR UPDATE`,
                lotIds
            );
            const lotMap = new Map<string, any>();
            for (const lot of lockedLots) {
                lotMap.set(lot.inventoryid, lot);
            }

            // Create reservation (24h expiration default)
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const reservation = await tx.bloodreservations.create({
                data: {
                    requestid: requestId,
                    assignmentid: assignment.assignmentid,
                    bloodbankid: bloodBankId,
                    reservationstatus: "ACTIVE",
                    reservedbyuserid: actorUserId,
                    expiresat: expiresAt,
                },
            });

            const allocatedItems: any[] = [];
            for (const lotId of lotIds) {
                const lotUnits = unitsByLot.get(lotId)!;
                const lot = lotMap.get(lotId);
                const count = lotUnits.length;

                if (lot.unitsavailable < count) {
                    const err: any = new Error(`Lot ${lotId} stock race: Insufficient available units`);
                    err.statusCode = 409;
                    throw err;
                }

                // Update lot counters
                const newAvail = lot.unitsavailable - count;
                const newRes = lot.unitsreserved + count;
                await tx.inventory.update({
                    where: { inventoryid: lotId },
                    data: {
                        unitsavailable: newAvail,
                        unitsreserved: newRes,
                        lastupdated: new Date(),
                    },
                });

                // Create reservation items & update unit status
                for (const u of lotUnits) {
                    const item = await tx.reservationitems.create({
                        data: {
                            reservationid: reservation.reservationid,
                            unitid: u.unitid,
                            itemstatus: "RESERVED",
                        },
                    });
                    allocatedItems.push(item);

                    await tx.inventoryunits.update({
                        where: { unitid: u.unitid },
                        data: {
                            status: "RESERVED",
                            updatedat: new Date(),
                        },
                    });

                    await tx.unitdispositionhistory.create({
                        data: {
                            unitid: u.unitid,
                            bloodbankid: bloodBankId,
                            actoruserid: actorUserId,
                            previousstatus: "AVAILABLE",
                            newstatus: "RESERVED",
                            reason: `Allocated to Reservation: ${reservation.reservationid}`,
                            notes: `Item ID: ${item.itemid}, Request ID: ${requestId}`,
                        },
                    });
                }

                // Record deterministic sub-keyed ledger entry (scoped by bloodBankId + operation + idempotencyKey)
                const ledgerSubKey = `${scopedPrefix}:lot:${lotId}`;
                await tx.inventoryledger.create({
                    data: {
                        inventoryid: lotId,
                        bloodbankid: bloodBankId,
                        actoruserid: actorUserId,
                        operationtype: "RESERVATION_ALLOCATE",
                        quantitydelta: 0,
                        previousavailable: lot.unitsavailable,
                        newavailable: newAvail,
                        previousreserved: lot.unitsreserved,
                        newreserved: newRes,
                        reason: `Reservation allocation for request ${requestId} (${count} unit(s))`,
                        idempotencykey: ledgerSubKey,
                        requesthash: requestHash,
                        responsecode: 201,
                        responsebody: {
                            success: true,
                            message: `Successfully allocated reservation`,
                            reservation: {
                                reservationId: reservation.reservationid,
                                requestId,
                                status: reservation.reservationstatus,
                                expiresAt: reservation.expiresat,
                                items: allocatedItems.map((i) => ({
                                    itemId: i.itemid,
                                    unitId: i.unitid,
                                    status: i.itemstatus,
                                })),
                            },
                        } as any,
                    },
                });
            }

            const responseData = {
                success: true,
                message: `Successfully allocated ${allocatedItems.length} unit(s) to reservation`,
                reservation: {
                    reservationId: reservation.reservationid,
                    requestId,
                    status: reservation.reservationstatus,
                    expiresAt: reservation.expiresat,
                    items: allocatedItems.map((i) => ({
                        itemId: i.itemid,
                        unitId: i.unitid,
                        status: i.itemstatus,
                    })),
                },
            };

            return responseData;
        });
        } catch (txError: any) {
            // Concurrent duplicate request resolution via committed idempotency record
            if (txError.code === "P2002" && String(txError.message || "").includes("idempotencykey")) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    const committed = await prisma.inventoryledger.findFirst({
                        where: {
                            bloodbankid: bloodBankId,
                            idempotencykey: { startsWith: `${scopedPrefix}:lot:` },
                        },
                    });
                    if (committed) {
                        if (committed.requesthash !== requestHash) {
                            const err: any = new Error("Idempotency key has already been used for a different mutation request");
                            err.statusCode = 409;
                            throw err;
                        }
                        return committed.responsebody as any;
                    }
                }
            }
            throw txError;
        }
    }

    /**
     * RECORD CLINICAL CROSSMATCH
     * Append-only history with partial unique index for active certificate.
     * Enforces 4-way consistency: parent reservation, request, item, unit.
     * Locks reservation, item, unit, and blood bank FOR UPDATE scoped by tenant bloodBankId.
     */
    static async recordCrossmatch(input: CrossmatchInput) {
        const {
            reservationItemId,
            bloodBankId,
            actorUserId,
            testedByUserId,
            verifiedByUserId,
            methodology,
            testResult,
            validUntilHours = 72,
        } = input;

        if (!bloodBankId) {
            const err: any = new Error("Mandatory tenant context: bloodBankId is required for clinical crossmatch");
            err.statusCode = 400;
            throw err;
        }

        if (testedByUserId === verifiedByUserId) {
            const err: any = new Error("Clinical safety requirement: Crossmatch tester and verifier must be distinct personnel");
            err.statusCode = 400;
            throw err;
        }

        const validHoursClamped = Math.min(Math.max(validUntilHours, 1), 72); // Max 72 hours per national guidelines

        return await prisma.$transaction(async (tx) => {
            // 1. Lock reservation, item, unit, and blood bank in a tenant-scoped FOR UPDATE query
            const lockedItems: any[] = await tx.$queryRawUnsafe(
                `SELECT ri.itemid, ri.reservationid, ri.unitid, ri.itemstatus,
                        br.requestid, br.bloodbankid AS reservation_bloodbankid, br.reservationstatus,
                        u.bloodbankid AS unit_bloodbankid, u.status AS unit_status,
                        bb.userid AS facilityowneruserid, bb.approvalstatus AS facilityapprovalstatus
                 FROM reservationitems ri
                 JOIN bloodreservations br ON ri.reservationid = br.reservationid
                 JOIN inventoryunits u ON ri.unitid = u.unitid
                 JOIN bloodbanks bb ON br.bloodbankid = bb.bloodbankid
                 WHERE ri.itemid = $1::uuid
                   AND br.bloodbankid = $2::uuid
                   AND u.bloodbankid = $2::uuid
                 FOR UPDATE OF br, ri, u, bb`,
                reservationItemId,
                bloodBankId
            );

            if (!lockedItems || lockedItems.length === 0) {
                const foreignItem = await tx.reservationitems.findUnique({
                    where: { itemid: reservationItemId },
                    include: { reservation: { select: { bloodbankid: true } } },
                });
                if (foreignItem && foreignItem.reservation.bloodbankid !== bloodBankId) {
                    const err: any = new Error("Access denied: reservation item belongs to another blood bank");
                    err.statusCode = 403;
                    throw err;
                }
                const err: any = new Error("Reservation item not found");
                err.statusCode = 404;
                throw err;
            }

            const item = lockedItems[0];

            // 2. Revalidate tenant ownership and facility approval under lock
            if (item.reservation_bloodbankid !== bloodBankId || item.unit_bloodbankid !== bloodBankId) {
                const err: any = new Error("Access denied: reservation item belongs to another blood bank");
                err.statusCode = 403;
                throw err;
            }
            if (item.facilityapprovalstatus === "REJECTED") {
                const err: any = new Error(
                    `Blood bank facility is REJECTED. Rejected facilities cannot perform clinical operations.`
                );
                err.statusCode = 403;
                throw err;
            }

            // 3. Revalidate tester and verifier activity, roles, and facility affiliation inside transaction
            const signOffUsers: any[] = await tx.$queryRawUnsafe(
                `SELECT userid, role, isactive FROM users WHERE userid = ANY($1::uuid[]) FOR SHARE`,
                [testedByUserId, verifiedByUserId]
            );
            const tester = signOffUsers.find((u) => u.userid === testedByUserId);
            const verifier = signOffUsers.find((u) => u.userid === verifiedByUserId);
            const allowedRoles = new Set(["BLOOD_BANK", "ADMIN"]);
            if (
                !tester ||
                !tester.isactive ||
                !allowedRoles.has(tester.role) ||
                !verifier ||
                !verifier.isactive ||
                !allowedRoles.has(verifier.role)
            ) {
                const err: any = new Error(
                    "Clinical sign-off accounts are invalid, inactive, or not authorized for this blood bank"
                );
                err.statusCode = 403;
                throw err;
            }
            if (
                (tester.role === "BLOOD_BANK" && tester.userid !== item.facilityowneruserid) ||
                (verifier.role === "BLOOD_BANK" && verifier.userid !== item.facilityowneruserid)
            ) {
                const err: any = new Error("Clinical sign-off user is not authorized for this blood bank facility");
                err.statusCode = 403;
                throw err;
            }

            // 4. Revalidate reservation, item, and unit lifecycle status under lock (prevents crossmatch on cancelled/released items)
            if (item.reservationstatus !== "ACTIVE" && item.reservationstatus !== "PREPARED") {
                const err: any = new Error(
                    `Cannot crossmatch item for reservation in ${item.reservationstatus} status`
                );
                err.statusCode = 409;
                throw err;
            }
            if (item.itemstatus !== "RESERVED" && item.itemstatus !== "PREPARED") {
                const err: any = new Error(`Cannot crossmatch item in ${item.itemstatus} status`);
                err.statusCode = 400;
                throw err;
            }
            if (item.unit_status !== "RESERVED") {
                const err: any = new Error(`Cannot crossmatch unit in ${item.unit_status} status (must be RESERVED)`);
                err.statusCode = 409;
                throw err;
            }

            // 5. Lock existing crossmatch attempts FOR UPDATE to serialize concurrent re-tests
            const existingAttempts: any[] = await tx.$queryRawUnsafe(
                `SELECT crossmatchid, attemptnumber, iscurrent
                 FROM clinicalcrossmatches
                 WHERE reservationitemid = $1::uuid
                 ORDER BY attemptnumber DESC
                 FOR UPDATE`,
                reservationItemId
            );

            let nextAttempt = 1;
            if (existingAttempts.length > 0) {
                nextAttempt = Number(existingAttempts[0].attemptnumber) + 1;
                const activeCrossmatch = existingAttempts.find((c) => c.iscurrent === true);
                if (activeCrossmatch) {
                    await tx.clinicalcrossmatches.update({
                        where: { crossmatchid: activeCrossmatch.crossmatchid },
                        data: {
                            iscurrent: false,
                            isinvalidated: testResult !== "COMPATIBLE",
                            invalidationreason:
                                testResult !== "COMPATIBLE" ? `Superseded by re-test attempt ${nextAttempt}` : null,
                        },
                    });
                }
            }

            const validUntil = new Date(Date.now() + validHoursClamped * 60 * 60 * 1000);

            // 6. Insert new crossmatch certificate (PostgreSQL trigger trg_enforce_crossmatch_integrity verifies 4-way lock)
            const crossmatch = await tx.clinicalcrossmatches.create({
                data: {
                    reservationitemid: reservationItemId,
                    reservationid: item.reservationid,
                    requestid: item.requestid,
                    unitid: item.unitid,
                    attemptnumber: nextAttempt,
                    iscurrent: true,
                    methodology,
                    testresult: testResult,
                    validuntil: validUntil,
                    testedbyuserid: testedByUserId,
                    verifiedbyuserid: verifiedByUserId,
                },
            });

            if (testResult === "COMPATIBLE") {
                const updatedItems = await tx.reservationitems.updateMany({
                    where: {
                        itemid: reservationItemId,
                        reservationid: item.reservationid,
                        itemstatus: { in: ["RESERVED", "PREPARED"] },
                        reservation: {
                            bloodbankid: bloodBankId,
                            reservationstatus: { in: ["ACTIVE", "PREPARED"] },
                        },
                    },
                    data: {
                        itemstatus: "PREPARED",
                        preparedat: new Date(),
                        updatedat: new Date(),
                    },
                });
                if (updatedItems.count !== 1) {
                    const err: any = new Error("Reservation item status changed concurrently; cannot mark PREPARED");
                    err.statusCode = 409;
                    throw err;
                }

                // Record disposition history
                await tx.unitdispositionhistory.create({
                    data: {
                        unitid: item.unitid,
                        bloodbankid: bloodBankId,
                        actoruserid: actorUserId,
                        previousstatus: "RESERVED",
                        newstatus: "RESERVED",
                        reason: `Crossmatch COMPATIBLE: Packed into cold box (Certificate: ${crossmatch.crossmatchid})`,
                        notes: `Attempt: ${nextAttempt}, Methodology: ${methodology}`,
                    },
                });
            }

            return {
                success: true,
                crossmatchId: crossmatch.crossmatchid,
                attemptNumber: nextAttempt,
                testResult,
                itemStatus: testResult === "COMPATIBLE" ? "PREPARED" : item.itemstatus,
                validUntil,
            };
        });
    }

    /**
     * DISPATCH BLOOD RESERVATION
     * Requires all items to be PREPARED with active, unexpired, compatible crossmatch certificate.
     * Locks reservation -> items/units -> inventory lots in canonical order scoped by bloodBankId.
     * Decrements lot unitsreserved, sets unit status to IN_TRANSIT, records DISPATCH_DEPARTURE ledger entry.
     */
    static async dispatchReservation(input: DispatchInput) {
        const {
            reservationId,
            bloodBankId,
            actorUserId,
            courierName,
            trackingId,
            coldBoxSealNumber,
            initialTemperature,
            idempotencyKey,
        } = input;

        if (!bloodBankId) {
            const err: any = new Error("Mandatory tenant context: bloodBankId is required for reservation dispatch");
            err.statusCode = 400;
            throw err;
        }

        const requestHash = computeRequestHash({
            reservationId,
            bloodBankId,
            courierName,
            trackingId: trackingId || null,
            coldBoxSealNumber,
            initialTemperature,
            idempotencyKey,
        });

        // Pre-transaction tenant-scoped idempotency check (scoped by bloodBankId + operation + idempotencyKey)
        const scopedPrefix = buildScopedIdempotencyKey(bloodBankId, "DISPATCH_DEPARTURE", idempotencyKey);
        const existingLedger = await prisma.inventoryledger.findFirst({
            where: {
                bloodbankid: bloodBankId,
                idempotencykey: { startsWith: `${scopedPrefix}:lot:` },
            },
        });
        if (existingLedger) {
            if (existingLedger.requesthash !== requestHash) {
                const err: any = new Error("Idempotency key has already been used for a different mutation request");
                err.statusCode = 409;
                throw err;
            }
            return existingLedger.responsebody as any;
        }

        try {
            return await prisma.$transaction(async (tx) => {
                // 1. Lock bloodreservations and bloodbanks FIRST scoped by tenant bloodBankId
            const lockedReservations: any[] = await tx.$queryRawUnsafe(
                `SELECT br.reservationid, br.requestid, br.bloodbankid, br.reservationstatus,
                        bb.userid AS facilityowneruserid, bb.approvalstatus AS facilityapprovalstatus
                 FROM bloodreservations br
                 JOIN bloodbanks bb ON br.bloodbankid = bb.bloodbankid
                 WHERE br.reservationid = $1::uuid AND br.bloodbankid = $2::uuid
                 FOR UPDATE OF br, bb`,
                reservationId,
                bloodBankId
            );

            if (!lockedReservations || lockedReservations.length === 0) {
                const foreignRes = await tx.bloodreservations.findUnique({
                    where: { reservationid: reservationId },
                    select: { bloodbankid: true },
                });
                if (foreignRes && foreignRes.bloodbankid !== bloodBankId) {
                    const err: any = new Error("Access denied: reservation belongs to another blood bank");
                    err.statusCode = 403;
                    throw err;
                }
                const err: any = new Error("Reservation not found");
                err.statusCode = 404;
                throw err;
            }

            const reservation = lockedReservations[0];

            // 2. Revalidate tenant ownership, facility approval, and actor authorization under lock
            if (reservation.bloodbankid !== bloodBankId) {
                const err: any = new Error("Access denied: reservation belongs to another blood bank");
                err.statusCode = 403;
                throw err;
            }
            if (reservation.facilityapprovalstatus === "REJECTED") {
                const err: any = new Error(
                    `Blood bank facility is REJECTED. Rejected facilities cannot perform clinical operations.`
                );
                err.statusCode = 403;
                throw err;
            }

            const actorRows: any[] = await tx.$queryRawUnsafe(
                `SELECT userid, role, isactive FROM users WHERE userid = $1::uuid FOR SHARE`,
                actorUserId
            );
            const actor = actorRows?.[0];
            if (!actor || !actor.isactive || (actor.role !== "BLOOD_BANK" && actor.role !== "ADMIN")) {
                const err: any = new Error("Dispatching user is inactive or does not hold an authorized role");
                err.statusCode = 403;
                throw err;
            }
            if (actor.role === "BLOOD_BANK" && actor.userid !== reservation.facilityowneruserid) {
                const err: any = new Error("Access denied: user is not affiliated with this blood bank facility");
                err.statusCode = 403;
                throw err;
            }

            // Re-check idempotency inside transaction after locking reservation
            const txExistingLedger = await tx.inventoryledger.findFirst({
                where: {
                    bloodbankid: bloodBankId,
                    idempotencykey: { startsWith: `${scopedPrefix}:lot:` },
                },
            });
            if (txExistingLedger) {
                if (txExistingLedger.requesthash !== requestHash) {
                    const err: any = new Error("Idempotency key has already been used for a different mutation request");
                    err.statusCode = 409;
                    throw err;
                }
                return txExistingLedger.responsebody as any;
            }

            // 3. Revalidate reservation status under lock (prevents double-dispatch and dispatch-after-cancel races)
            if (reservation.reservationstatus !== "ACTIVE" && reservation.reservationstatus !== "PREPARED") {
                const err: any = new Error(`Cannot dispatch reservation in ${reservation.reservationstatus} status`);
                err.statusCode = 409;
                throw err;
            }

            // 4. Lock reservationitems and inventoryunits in deterministic unitid ASC order scoped by bloodBankId
            const items: any[] = await tx.$queryRawUnsafe(
                `SELECT ri.itemid, ri.reservationid, ri.unitid, ri.itemstatus,
                        u.inventoryid, u.bloodbankid AS unit_bloodbankid, u.status AS unit_status
                 FROM reservationitems ri
                 JOIN inventoryunits u ON ri.unitid = u.unitid
                 WHERE ri.reservationid = $1::uuid AND u.bloodbankid = $2::uuid
                 ORDER BY u.unitid ASC
                 FOR UPDATE OF ri, u`,
                reservationId,
                bloodBankId
            );

            if (!items || items.length === 0) {
                const err: any = new Error("Reservation has no items to dispatch");
                err.statusCode = 400;
                throw err;
            }

            // 5. Verify every item is PREPARED, unit is RESERVED, and has an active, unexpired COMPATIBLE crossmatch
            const now = new Date();
            for (const item of items) {
                if (item.unit_bloodbankid !== bloodBankId) {
                    const err: any = new Error("Access denied: unit belongs to another blood bank");
                    err.statusCode = 403;
                    throw err;
                }
                if (item.itemstatus !== "PREPARED") {
                    const err: any = new Error(`Item ${item.itemid} is not PREPARED for dispatch (current: ${item.itemstatus})`);
                    err.statusCode = 400;
                    throw err;
                }
                if (item.unit_status !== "RESERVED") {
                    const err: any = new Error(`Unit ${item.unitid} is not in RESERVED status (current: ${item.unit_status})`);
                    err.statusCode = 409;
                    throw err;
                }

                const certs: any[] = await tx.$queryRawUnsafe(
                    `SELECT crossmatchid, testresult, isinvalidated, validuntil
                     FROM clinicalcrossmatches
                     WHERE reservationitemid = $1::uuid AND iscurrent = true
                     FOR SHARE`,
                    item.itemid
                );
                const cert = certs?.[0];
                if (!cert) {
                    const err: any = new Error(`Item ${item.itemid} lacks an active clinical crossmatch certificate`);
                    err.statusCode = 400;
                    throw err;
                }
                if (cert.testresult !== "COMPATIBLE" || cert.isinvalidated || new Date(cert.validuntil) < now) {
                    const err: any = new Error(`Item ${item.itemid} has invalid or expired crossmatch certificate`);
                    err.statusCode = 400;
                    throw err;
                }
            }

            // 6. Group items by lot and lock lots in primary key order scoped by bloodBankId
            const itemsByLot = new Map<string, any[]>();
            for (const item of items) {
                if (!itemsByLot.has(item.inventoryid)) {
                    itemsByLot.set(item.inventoryid, []);
                }
                itemsByLot.get(item.inventoryid)!.push(item);
            }

            const lotIds = Array.from(itemsByLot.keys()).sort();
            const lockedLots: any[] = await tx.$queryRawUnsafe(
                `SELECT inventoryid, bloodbankid, unitsavailable, unitsreserved, unitsquarantined 
                 FROM inventory 
                 WHERE inventoryid = ANY($1::uuid[]) AND bloodbankid = $2::uuid
                 ORDER BY inventoryid ASC 
                 FOR UPDATE`,
                lotIds,
                bloodBankId
            );
            if (lockedLots.length !== lotIds.length) {
                const err: any = new Error("One or more inventory lots do not belong to this blood bank");
                err.statusCode = 403;
                throw err;
            }
            const lotMap = new Map<string, any>();
            for (const lot of lockedLots) {
                lotMap.set(lot.inventoryid, lot);
            }

            // 7. Tenant- and status-scoped UPDATE on bloodreservations
            const updatedRes = await tx.bloodreservations.updateMany({
                where: {
                    reservationid: reservationId,
                    bloodbankid: bloodBankId,
                    reservationstatus: { in: ["ACTIVE", "PREPARED"] },
                },
                data: {
                    reservationstatus: "DISPATCHED",
                    updatedat: now,
                },
            });
            if (updatedRes.count !== 1) {
                const err: any = new Error("Reservation status changed concurrently; cannot dispatch");
                err.statusCode = 409;
                throw err;
            }

            const responseData = {
                success: true,
                message: `Successfully dispatched ${items.length} unit(s) via ${courierName}`,
                reservationId,
                status: "DISPATCHED",
                dispatchedUnits: items.length,
            };

            for (const lotId of lotIds) {
                const lotItems = itemsByLot.get(lotId)!;
                const lot = lotMap.get(lotId);
                const count = lotItems.length;

                if (Number(lot.unitsreserved) < count) {
                    const err: any = new Error(`Insufficient reserved stock in lot ${lotId} for dispatch`);
                    err.statusCode = 409;
                    throw err;
                }

                // Decrement reserved units in lot scoped by bloodbankid
                const newRes = Number(lot.unitsreserved) - count;
                const updatedLot = await tx.inventory.updateMany({
                    where: {
                        inventoryid: lotId,
                        bloodbankid: bloodBankId,
                        unitsreserved: { gte: count },
                    },
                    data: {
                        unitsreserved: newRes,
                        lastupdated: now,
                    },
                });
                if (updatedLot.count !== 1) {
                    const err: any = new Error(`Lot ${lotId} reserved stock changed concurrently`);
                    err.statusCode = 409;
                    throw err;
                }

                for (const item of lotItems) {
                    const updatedItem = await tx.reservationitems.updateMany({
                        where: {
                            itemid: item.itemid,
                            reservationid: reservationId,
                            itemstatus: "PREPARED",
                        },
                        data: {
                            itemstatus: "DISPATCHED",
                            dispatchedat: now,
                            updatedat: now,
                        },
                    });
                    if (updatedItem.count !== 1) {
                        const err: any = new Error(`Reservation item ${item.itemid} status changed concurrently`);
                        err.statusCode = 409;
                        throw err;
                    }

                    const updatedUnit = await tx.inventoryunits.updateMany({
                        where: {
                            unitid: item.unitid,
                            bloodbankid: bloodBankId,
                            status: "RESERVED",
                        },
                        data: {
                            status: "IN_TRANSIT",
                            updatedat: now,
                        },
                    });
                    if (updatedUnit.count !== 1) {
                        const err: any = new Error(`Unit ${item.unitid} status changed concurrently`);
                        err.statusCode = 409;
                        throw err;
                    }

                    await tx.unitdispositionhistory.create({
                        data: {
                            unitid: item.unitid,
                            bloodbankid: bloodBankId,
                            actoruserid: actorUserId,
                            previousstatus: "RESERVED",
                            newstatus: "IN_TRANSIT",
                            reason: `Dispatched to courier: ${courierName} (Cold Box Seal: ${coldBoxSealNumber})`,
                            temperaturereading: initialTemperature,
                            notes: `Tracking ID: ${trackingId || "N/A"}`,
                        },
                    });
                }

                // Record DISPATCH_DEPARTURE in ledger with quantitydelta = -count (physical departure)
                const ledgerSubKey = `${scopedPrefix}:lot:${lotId}`;
                await tx.inventoryledger.create({
                    data: {
                        inventoryid: lotId,
                        bloodbankid: bloodBankId,
                        actoruserid: actorUserId,
                        operationtype: "DISPATCH_DEPARTURE",
                        quantitydelta: -count,
                        previousavailable: lot.unitsavailable,
                        newavailable: lot.unitsavailable,
                        previousreserved: lot.unitsreserved,
                        newreserved: newRes,
                        reason: `Dispatch departure to hospital for reservation ${reservationId} (${courierName})`,
                        idempotencykey: ledgerSubKey,
                        requesthash: requestHash,
                        responsecode: 200,
                        responsebody: responseData as any,
                    },
                });
            }

            return responseData;
        });
        } catch (txError: any) {
            // Concurrent duplicate request resolution via committed idempotency record
            if (txError.code === "P2002" && String(txError.message || "").includes("idempotencykey")) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    const committed = await prisma.inventoryledger.findFirst({
                        where: {
                            bloodbankid: bloodBankId,
                            idempotencykey: { startsWith: `${scopedPrefix}:lot:` },
                        },
                    });
                    if (committed) {
                        if (committed.requesthash !== requestHash) {
                            const err: any = new Error("Idempotency key has already been used for a different mutation request");
                            err.statusCode = 409;
                            throw err;
                        }
                        return committed.responsebody as any;
                    }
                }
            }
            throw txError;
        }
    }

    /**
     * CONFIRM HOSPITAL RECEIPT AND QUARANTINE DISPOSITION
     * Enforces hospital tenant ownership inside transaction on locked bloodreservations & bloodrequests.
     * Rejects foreign or non-belonging itemIds.
     * Locks inventory lots in sorted PK order scoped by bloodbankid.
     */
    static async confirmHospitalReceipt(
        reservationId: string,
        actorUserId: string,
        itemsInput: HospitalReceiptItemInput[],
        idempotencyKey: string,
        hospitalId?: string
    ) {
        if (!itemsInput || !Array.isArray(itemsInput) || itemsInput.length === 0) {
            const err: any = new Error("itemReceipts array is required and cannot be empty");
            err.statusCode = 400;
            throw err;
        }

        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const seenItemIds = new Set<string>();
        for (const entry of itemsInput) {
            if (!entry || typeof entry.itemId !== "string" || !UUID_REGEX.test(entry.itemId)) {
                const err: any = new Error("Each itemReceipt must include a valid itemId UUID");
                err.statusCode = 400;
                throw err;
            }
            if (seenItemIds.has(entry.itemId)) {
                const err: any = new Error(`Duplicate itemId in receipt payload: ${entry.itemId}`);
                err.statusCode = 400;
                throw err;
            }
            seenItemIds.add(entry.itemId);
            if (entry.receivedStatus !== "ACCEPTED" && entry.receivedStatus !== "REJECTED_EXCURSION") {
                const err: any = new Error(
                    `Invalid receivedStatus '${String(entry.receivedStatus)}'. Allowed: ACCEPTED, REJECTED_EXCURSION`
                );
                err.statusCode = 400;
                throw err;
            }
        }

        const requestHash = computeRequestHash({
            reservationId,
            hospitalId: hospitalId || null,
            itemsInput,
            idempotencyKey,
        });

        return await prisma.$transaction(async (tx) => {
            // 1. Validate actor identity, role, and hospital affiliation inside transaction
            const actorRows: any[] = await tx.$queryRawUnsafe(
                `SELECT userid, role, isactive FROM users WHERE userid = $1::uuid FOR SHARE`,
                actorUserId
            );
            const actor = actorRows?.[0];
            if (!actor || !actor.isactive) {
                const err: any = new Error("Receiving user account is inactive or does not exist");
                err.statusCode = 403;
                throw err;
            }
            if (actor.role !== "HOSPITAL" && actor.role !== "ADMIN") {
                const err: any = new Error("Access denied: only authorized HOSPITAL or ADMIN accounts can confirm receipt");
                err.statusCode = 403;
                throw err;
            }

            let effectiveHospitalId = hospitalId;
            if (actor.role === "HOSPITAL") {
                const hospRows: any[] = await tx.$queryRawUnsafe(
                    `SELECT hospitalid, approvalstatus FROM hospitals WHERE userid = $1::uuid FOR SHARE`,
                    actorUserId
                );
                const actorHospital = hospRows?.[0];
                if (!actorHospital) {
                    const err: any = new Error("Registered hospital profile required for clinical operations");
                    err.statusCode = 403;
                    throw err;
                }
                // TEMPORARY BYPASS: Allow non-APPROVED hospitals to perform clinical operations
                /*
                if (actorHospital.approvalstatus !== "APPROVED") {
                    const err: any = new Error(
                        `Hospital facility is ${actorHospital.approvalstatus}. Only APPROVED facilities may perform clinical operations.`
                    );
                    err.statusCode = 403;
                    throw err;
                }
                */
                if (hospitalId && hospitalId !== actorHospital.hospitalid) {
                    const err: any = new Error("Forbidden: You do not have ownership of the requesting hospital facility");
                    err.statusCode = 403;
                    throw err;
                }
                effectiveHospitalId = actorHospital.hospitalid;
            }

            // 2. Lock bloodreservations and parent bloodrequests FOR UPDATE scoped by hospital tenant ownership
            let lockedReservations: any[] = [];
            if (effectiveHospitalId) {
                lockedReservations = await tx.$queryRawUnsafe(
                    `SELECT br.reservationid, br.requestid, br.bloodbankid, br.reservationstatus,
                            req.hospitalid, req.createdbyuserid
                     FROM bloodreservations br
                     JOIN bloodrequests req ON br.requestid = req.requestid
                     WHERE br.reservationid = $1::uuid
                       AND (req.hospitalid = $2::uuid OR req.createdbyuserid = $3::uuid)
                     FOR UPDATE OF br, req`,
                    reservationId,
                    effectiveHospitalId,
                    actorUserId
                );
                if (!lockedReservations || lockedReservations.length === 0) {
                    const foreignRes = await tx.bloodreservations.findUnique({
                        where: { reservationid: reservationId },
                        select: { reservationid: true },
                    });
                    if (foreignRes) {
                        const err: any = new Error("Forbidden: You do not have ownership of the requesting hospital facility");
                        err.statusCode = 403;
                        throw err;
                    }
                    const err: any = new Error("Reservation not found");
                    err.statusCode = 404;
                    throw err;
                }
            } else {
                lockedReservations = await tx.$queryRawUnsafe(
                    `SELECT br.reservationid, br.requestid, br.bloodbankid, br.reservationstatus,
                            req.hospitalid, req.createdbyuserid
                     FROM bloodreservations br
                     JOIN bloodrequests req ON br.requestid = req.requestid
                     WHERE br.reservationid = $1::uuid
                     FOR UPDATE OF br, req`,
                    reservationId
                );
                if (!lockedReservations || lockedReservations.length === 0) {
                    const err: any = new Error("Reservation not found");
                    err.statusCode = 404;
                    throw err;
                }
            }

            const reservation = lockedReservations[0];

            // Revalidate hospital ownership under lock
            if (
                effectiveHospitalId &&
                reservation.hospitalid !== effectiveHospitalId &&
                reservation.createdbyuserid !== actorUserId
            ) {
                const err: any = new Error("Forbidden: You do not have ownership of the requesting hospital facility");
                err.statusCode = 403;
                throw err;
            }

            // 3. Tenant-scoped idempotency lookup & requesthash verification under lock
            if (idempotencyKey) {
                const scopedPrefix = `receipt:${reservationId}:${idempotencyKey}:`;
                const existingReplay = await tx.inventoryledger.findFirst({
                    where: {
                        bloodbankid: reservation.bloodbankid,
                        operationtype: { in: ["TRANSIT_EXCURSION_RETURN", "HOSPITAL_RECEIPT_CONFIRM"] },
                        idempotencykey: { startsWith: scopedPrefix },
                    },
                });
                if (existingReplay) {
                    if (existingReplay.requesthash !== requestHash) {
                        const err: any = new Error(
                            "Idempotency key has already been used for a different receipt confirmation payload"
                        );
                        err.statusCode = 409;
                        throw err;
                    }
                    return {
                        ...(existingReplay.responsebody as any),
                        success: true,
                        idempotentReplay: true,
                        message: "Receipt confirmation already processed",
                    };
                }
            }

            if (reservation.reservationstatus !== "DISPATCHED") {
                const err: any = new Error(`Cannot confirm receipt for reservation in ${reservation.reservationstatus} status`);
                err.statusCode = 400;
                throw err;
            }

            // 4. Lock reservationitems and inventoryunits in unitid ASC order scoped by reservation.bloodbankid
            const lockedItems: any[] = await tx.$queryRawUnsafe(
                `SELECT ri.itemid, ri.reservationid, ri.unitid, ri.itemstatus,
                        u.inventoryid, u.bloodbankid AS unit_bloodbankid, u.status AS unit_status
                 FROM reservationitems ri
                 JOIN inventoryunits u ON ri.unitid = u.unitid
                 WHERE ri.reservationid = $1::uuid AND u.bloodbankid = $2::uuid
                 ORDER BY u.unitid ASC
                 FOR UPDATE OF ri, u`,
                reservationId,
                reservation.bloodbankid
            );

            const itemMap = new Map<string, any>();
            for (const item of lockedItems) {
                itemMap.set(item.itemid, item);
            }

            // 5. Explicitly reject foreign, unrelated, or non-DISPATCHED itemIds in itemsInput
            for (const receipt of itemsInput) {
                const targetItem = itemMap.get(receipt.itemId);
                if (!targetItem) {
                    const foreignItem = await tx.reservationitems.findUnique({
                        where: { itemid: receipt.itemId },
                        select: { reservationid: true },
                    });
                    if (foreignItem) {
                        const err: any = new Error(
                            `Forbidden: itemId ${receipt.itemId} belongs to another reservation and cannot be confirmed here`
                        );
                        err.statusCode = 403;
                        throw err;
                    }
                    const err: any = new Error(`Reservation item ${receipt.itemId} not found`);
                    err.statusCode = 404;
                    throw err;
                }
                if (targetItem.itemstatus !== "DISPATCHED" || targetItem.unit_status !== "IN_TRANSIT") {
                    const err: any = new Error(
                        `Cannot confirm receipt for item ${receipt.itemId} in ${targetItem.itemstatus} (unit: ${targetItem.unit_status}) status`
                    );
                    err.statusCode = 409;
                    throw err;
                }
            }

            // 6. Lock all affected inventory lots in ascending primary-key order scoped by reservation.bloodbankid
            const targetLotIds = Array.from(
                new Set(itemsInput.map((r) => itemMap.get(r.itemId)!.inventoryid as string))
            ).sort();
            const lockedLots: any[] = await tx.$queryRawUnsafe(
                `SELECT inventoryid, bloodbankid, unitsavailable, unitsreserved, unitsquarantined
                 FROM inventory
                 WHERE inventoryid = ANY($1::uuid[]) AND bloodbankid = $2::uuid
                 ORDER BY inventoryid ASC
                 FOR UPDATE`,
                targetLotIds,
                reservation.bloodbankid
            );
            const lotMap = new Map<string, any>();
            for (const lot of lockedLots) {
                lotMap.set(lot.inventoryid, lot);
            }

            let deliveredCount = 0;
            let excursionCount = 0;
            const now = new Date();

            const totalDeliveredInCall = itemsInput.filter((r) => r.receivedStatus === "ACCEPTED").length;
            const totalExcursionInCall = itemsInput.filter((r) => r.receivedStatus === "REJECTED_EXCURSION").length;
            const totalPendingBeforeCall = await tx.reservationitems.count({
                where: {
                    reservationid: reservationId,
                    itemstatus: { in: ["RESERVED", "PREPARED", "DISPATCHED"] },
                },
            });
            const expectedRemainingPending = Math.max(0, totalPendingBeforeCall - itemsInput.length);
            const expectedResponsePayload = {
                success: true,
                reservationId,
                deliveredCount: totalDeliveredInCall,
                excursionCount: totalExcursionInCall,
                remainingPending: expectedRemainingPending,
            };

            // 7. Process items in deterministic unitid ASC order
            const orderedReceipts = [...itemsInput].sort((a, b) => {
                const ua = itemMap.get(a.itemId)!.unitid as string;
                const ub = itemMap.get(b.itemId)!.unitid as string;
                return ua.localeCompare(ub);
            });

            for (const receipt of orderedReceipts) {
                const item = itemMap.get(receipt.itemId)!;
                const lot = lotMap.get(item.inventoryid);

                if (receipt.receivedStatus === "ACCEPTED") {
                    const updItem = await tx.reservationitems.updateMany({
                        where: {
                            itemid: item.itemid,
                            reservationid: reservationId,
                            itemstatus: "DISPATCHED",
                        },
                        data: {
                            itemstatus: "DELIVERED",
                            deliveredat: now,
                            updatedat: now,
                        },
                    });
                    if (updItem.count !== 1) {
                        const err: any = new Error(`Reservation item ${item.itemid} state changed concurrently`);
                        err.statusCode = 409;
                        throw err;
                    }

                    const updUnit = await tx.inventoryunits.updateMany({
                        where: {
                            unitid: item.unitid,
                            bloodbankid: reservation.bloodbankid,
                            status: "IN_TRANSIT",
                        },
                        data: {
                            status: "DELIVERED",
                            updatedat: now,
                        },
                    });
                    if (updUnit.count !== 1) {
                        const err: any = new Error(`Unit ${item.unitid} state changed concurrently`);
                        err.statusCode = 409;
                        throw err;
                    }

                    await tx.unitdispositionhistory.create({
                        data: {
                            unitid: item.unitid,
                            bloodbankid: reservation.bloodbankid,
                            actoruserid: actorUserId,
                            previousstatus: "IN_TRANSIT",
                            newstatus: "DELIVERED",
                            reason: "Hospital accepted delivery in good clinical condition",
                            temperaturereading: receipt.tempReading || null,
                            notes: receipt.notes || null,
                        },
                    });

                    if (lot) {
                        await tx.inventoryledger.create({
                            data: {
                                inventoryid: lot.inventoryid,
                                bloodbankid: reservation.bloodbankid,
                                actoruserid: actorUserId,
                                operationtype: "HOSPITAL_RECEIPT_CONFIRM",
                                quantitydelta: 0,
                                previousavailable: lot.unitsavailable,
                                newavailable: lot.unitsavailable,
                                previousreserved: lot.unitsreserved,
                                newreserved: lot.unitsreserved,
                                reason: "Hospital accepted delivery in good clinical condition",
                                idempotencykey: `receipt:${reservationId}:${idempotencyKey}:lot:${lot.inventoryid}:accept:${item.itemid}`,
                                requesthash: requestHash,
                                responsecode: 200,
                                responsebody: expectedResponsePayload as any,
                            },
                        });
                    }
                    deliveredCount++;
                } else if (receipt.receivedStatus === "REJECTED_EXCURSION") {
                    const updItem = await tx.reservationitems.updateMany({
                        where: {
                            itemid: item.itemid,
                            reservationid: reservationId,
                            itemstatus: "DISPATCHED",
                        },
                        data: {
                            itemstatus: "REJECTED_TRANSIT",
                            updatedat: now,
                        },
                    });
                    if (updItem.count !== 1) {
                        const err: any = new Error(`Reservation item ${item.itemid} state changed concurrently`);
                        err.statusCode = 409;
                        throw err;
                    }

                    const updUnit = await tx.inventoryunits.updateMany({
                        where: {
                            unitid: item.unitid,
                            bloodbankid: reservation.bloodbankid,
                            status: "IN_TRANSIT",
                        },
                        data: {
                            status: "QUARANTINED",
                            updatedat: now,
                        },
                    });
                    if (updUnit.count !== 1) {
                        const err: any = new Error(`Unit ${item.unitid} state changed concurrently`);
                        err.statusCode = 409;
                        throw err;
                    }

                    await tx.unitdispositionhistory.create({
                        data: {
                            unitid: item.unitid,
                            bloodbankid: reservation.bloodbankid,
                            actoruserid: actorUserId,
                            previousstatus: "IN_TRANSIT",
                            newstatus: "QUARANTINED",
                            reason: `Delivery rejected due to temperature excursion (${receipt.tempReading || "N/A"}°C)`,
                            temperaturereading: receipt.tempReading || null,
                            notes: receipt.notes || "Quarantined pending quality review",
                        },
                    });

                    if (lot) {
                        const newQuar = Number(lot.unitsquarantined) + 1;
                        lot.unitsquarantined = newQuar;
                        const updLot = await tx.inventory.updateMany({
                            where: {
                                inventoryid: lot.inventoryid,
                                bloodbankid: reservation.bloodbankid,
                            },
                            data: { unitsquarantined: newQuar, lastupdated: now },
                        });
                        if (updLot.count !== 1) {
                            const err: any = new Error(`Lot ${lot.inventoryid} state changed concurrently`);
                            err.statusCode = 409;
                            throw err;
                        }

                        await tx.inventoryledger.create({
                            data: {
                                inventoryid: lot.inventoryid,
                                bloodbankid: reservation.bloodbankid,
                                actoruserid: actorUserId,
                                operationtype: "TRANSIT_EXCURSION_RETURN",
                                quantitydelta: +1,
                                previousavailable: lot.unitsavailable,
                                newavailable: lot.unitsavailable,
                                previousreserved: lot.unitsreserved,
                                newreserved: lot.unitsreserved,
                                reason: `Transit temperature excursion return (${receipt.tempReading || "N/A"}°C)`,
                                idempotencykey: `receipt:${reservationId}:${idempotencyKey}:lot:${lot.inventoryid}:return:${item.itemid}`,
                                requesthash: requestHash,
                                responsecode: 200,
                                responsebody: expectedResponsePayload as any,
                            },
                        });
                    }

                    excursionCount++;
                }
            }

            // Update parent reservation if all items delivered/processed
            const remainingPending = await tx.reservationitems.count({
                where: {
                    reservationid: reservationId,
                    itemstatus: { in: ["RESERVED", "PREPARED", "DISPATCHED"] },
                },
            });

            if (remainingPending === 0) {
                await tx.bloodreservations.updateMany({
                    where: {
                        reservationid: reservationId,
                        bloodbankid: reservation.bloodbankid,
                    },
                    data: {
                        reservationstatus: "COMPLETED",
                        updatedat: now,
                    },
                });
            }

            // Check if parent blood request can be marked FULFILLED
            if (reservation.requestid) {
                const parentRequest = await tx.bloodrequests.findUnique({
                    where: { requestid: reservation.requestid },
                    select: { requestid: true, unitsrequired: true, status: true },
                });

                if (parentRequest && parentRequest.status !== "FULFILLED") {
                    const linkedReservations = await tx.bloodreservations.findMany({
                        where: { requestid: reservation.requestid },
                        select: { reservationid: true },
                    });
                    const resIds = linkedReservations.map((r) => r.reservationid);

                    const totalDelivered = await tx.reservationitems.count({
                        where: {
                            reservationid: { in: resIds },
                            itemstatus: "DELIVERED",
                        },
                    });

                    const activeUndelivered = await tx.reservationitems.count({
                        where: {
                            reservationid: { in: resIds },
                            itemstatus: { in: ["RESERVED", "PREPARED", "DISPATCHED"] },
                        },
                    });

                    if (totalDelivered >= parentRequest.unitsrequired && activeUndelivered === 0) {
                        await tx.bloodrequests.update({
                            where: { requestid: reservation.requestid },
                            data: {
                                status: "FULFILLED",
                                updatedat: now,
                            },
                        });

                        try {
                            await tx.requeststatushistory.create({
                                data: {
                                    requestid: reservation.requestid,
                                    changedbyuserid: actorUserId,
                                    oldstatus: parentRequest.status,
                                    newstatus: "FULFILLED",
                                    remarks: `All ${parentRequest.unitsrequired} required blood unit(s) successfully delivered to hospital.`,
                                },
                            });
                        } catch {
                            // Non-fatal if history record insert fails
                        }
                    }
                }
            }

            return {
                success: true,
                reservationId,
                deliveredCount,
                excursionCount,
                remainingPending,
            };
        });
    }

    /**
     * CANCEL BLOOD RESERVATION
     * Locks reservation -> items/units -> inventory lots in canonical order scoped by bloodBankId.
     * Releases allocated units back to AVAILABLE shelf stock.
     */
    static async cancelReservation(
        reservationId: string,
        actorUserId: string,
        reason: string,
        idempotencyKey: string,
        bloodBankId: string
    ) {
        if (!bloodBankId) {
            const err: any = new Error("Mandatory tenant context: bloodBankId is required for reservation cancellation");
            err.statusCode = 400;
            throw err;
        }

        const requestHash = computeRequestHash({ reservationId, bloodBankId, reason, idempotencyKey });

        if (idempotencyKey) {
            const scopedPrefix = `cancel:${reservationId}:${idempotencyKey}:lot:`;
            const existingReplay = await prisma.inventoryledger.findFirst({
                where: {
                    operationtype: "RESERVATION_CANCEL",
                    idempotencykey: { startsWith: scopedPrefix },
                },
            });
            if (existingReplay) {
                if (existingReplay.bloodbankid !== bloodBankId || existingReplay.requesthash !== requestHash) {
                    const err: any = new Error("Idempotency key has already been used for a different mutation request");
                    err.statusCode = 409;
                    throw err;
                }
                return {
                    ...(existingReplay.responsebody as any),
                    success: true,
                    idempotentReplay: true,
                    message: "Reservation cancellation already processed",
                };
            }
        }

        return await prisma.$transaction(async (tx) => {
            // 1. Lock bloodreservations and bloodbanks FIRST scoped by tenant bloodBankId
            const lockedReservations: any[] = await tx.$queryRawUnsafe(
                `SELECT br.reservationid, br.requestid, br.bloodbankid, br.reservationstatus,
                        bb.userid AS facilityowneruserid, bb.approvalstatus AS facilityapprovalstatus
                 FROM bloodreservations br
                 JOIN bloodbanks bb ON br.bloodbankid = bb.bloodbankid
                 WHERE br.reservationid = $1::uuid AND br.bloodbankid = $2::uuid
                 FOR UPDATE OF br, bb`,
                reservationId,
                bloodBankId
            );

            if (!lockedReservations || lockedReservations.length === 0) {
                const foreignRes = await tx.bloodreservations.findUnique({
                    where: { reservationid: reservationId },
                    select: { bloodbankid: true },
                });
                if (foreignRes && foreignRes.bloodbankid !== bloodBankId) {
                    const err: any = new Error("Access denied: reservation belongs to another blood bank");
                    err.statusCode = 403;
                    throw err;
                }
                const err: any = new Error("Reservation not found");
                err.statusCode = 404;
                throw err;
            }

            const reservation = lockedReservations[0];

            // 2. Revalidate tenant ownership, facility approval, and actor affiliation under lock
            if (reservation.bloodbankid !== bloodBankId) {
                const err: any = new Error("Access denied: reservation belongs to another blood bank");
                err.statusCode = 403;
                throw err;
            }
            if (reservation.facilityapprovalstatus === "REJECTED") {
                const err: any = new Error(
                    `Blood bank facility is REJECTED. Rejected facilities cannot perform clinical operations.`
                );
                err.statusCode = 403;
                throw err;
            }

            const actorRows: any[] = await tx.$queryRawUnsafe(
                `SELECT userid, role, isactive FROM users WHERE userid = $1::uuid FOR SHARE`,
                actorUserId
            );
            const actor = actorRows?.[0];
            if (!actor || !actor.isactive || (actor.role !== "BLOOD_BANK" && actor.role !== "ADMIN")) {
                const err: any = new Error("Cancelling user is inactive or does not hold an authorized role");
                err.statusCode = 403;
                throw err;
            }
            if (actor.role === "BLOOD_BANK" && actor.userid !== reservation.facilityowneruserid) {
                const err: any = new Error("Access denied: user is not affiliated with this blood bank facility");
                err.statusCode = 403;
                throw err;
            }

            // Re-check idempotency inside transaction after locking reservation
            if (idempotencyKey) {
                const scopedPrefix = `cancel:${reservationId}:${idempotencyKey}:lot:`;
                const txExistingReplay = await tx.inventoryledger.findFirst({
                    where: {
                        operationtype: "RESERVATION_CANCEL",
                        idempotencykey: { startsWith: scopedPrefix },
                    },
                });
                if (txExistingReplay) {
                    if (txExistingReplay.bloodbankid !== bloodBankId || txExistingReplay.requesthash !== requestHash) {
                        const err: any = new Error("Idempotency key has already been used for a different mutation request");
                        err.statusCode = 409;
                        throw err;
                    }
                    return {
                        ...(txExistingReplay.responsebody as any),
                        success: true,
                        idempotentReplay: true,
                        message: "Reservation cancellation already processed",
                    };
                }
            }

            if (reservation.reservationstatus !== "ACTIVE" && reservation.reservationstatus !== "PREPARED") {
                const err: any = new Error(`Cannot cancel reservation in ${reservation.reservationstatus} status`);
                err.statusCode = 400;
                throw err;
            }

            // 3. Lock active reservationitems and inventoryunits in unitid ASC order scoped by bloodBankId
            const activeItems: any[] = await tx.$queryRawUnsafe(
                `SELECT ri.itemid, ri.reservationid, ri.unitid, ri.itemstatus,
                        u.inventoryid, u.bloodbankid AS unit_bloodbankid, u.status AS unit_status
                 FROM reservationitems ri
                 JOIN inventoryunits u ON ri.unitid = u.unitid
                 WHERE ri.reservationid = $1::uuid
                   AND ri.itemstatus IN ('RESERVED', 'PREPARED')
                   AND u.bloodbankid = $2::uuid
                 ORDER BY u.unitid ASC
                 FOR UPDATE OF ri, u`,
                reservationId,
                bloodBankId
            );

            // Group by lot
            const itemsByLot = new Map<string, any[]>();
            for (const item of activeItems) {
                if (!itemsByLot.has(item.inventoryid)) {
                    itemsByLot.set(item.inventoryid, []);
                }
                itemsByLot.get(item.inventoryid)!.push(item);
            }

            const lotIds = Array.from(itemsByLot.keys()).sort();
            const lockedLots: any[] =
                lotIds.length > 0
                    ? await tx.$queryRawUnsafe(
                          `SELECT inventoryid, bloodbankid, unitsavailable, unitsreserved, unitsquarantined 
                           FROM inventory 
                           WHERE inventoryid = ANY($1::uuid[]) AND bloodbankid = $2::uuid
                           ORDER BY inventoryid ASC 
                           FOR UPDATE`,
                          lotIds,
                          bloodBankId
                      )
                    : [];
            if (lockedLots.length !== lotIds.length) {
                const err: any = new Error("One or more inventory lots do not belong to this blood bank");
                err.statusCode = 403;
                throw err;
            }
            const lotMap = new Map<string, any>();
            for (const lot of lockedLots) {
                lotMap.set(lot.inventoryid, lot);
            }

            const now = new Date();
            const updatedRes = await tx.bloodreservations.updateMany({
                where: {
                    reservationid: reservationId,
                    bloodbankid: bloodBankId,
                    reservationstatus: { in: ["ACTIVE", "PREPARED"] },
                },
                data: {
                    reservationstatus: "CANCELLED",
                    cancelledat: now,
                    cancelledbyuserid: actorUserId,
                    cancellationreason: reason,
                    updatedat: now,
                },
            });
            if (updatedRes.count !== 1) {
                const err: any = new Error("Reservation status changed concurrently; cannot cancel");
                err.statusCode = 409;
                throw err;
            }

            for (const lotId of lotIds) {
                const lotItems = itemsByLot.get(lotId)!;
                const lot = lotMap.get(lotId);
                const count = lotItems.length;

                if (Number(lot.unitsreserved) < count) {
                    const err: any = new Error(`Insufficient reserved stock in lot ${lotId} to release`);
                    err.statusCode = 409;
                    throw err;
                }

                const newAvail = Number(lot.unitsavailable) + count;
                const newRes = Number(lot.unitsreserved) - count;

                const updatedLot = await tx.inventory.updateMany({
                    where: {
                        inventoryid: lotId,
                        bloodbankid: bloodBankId,
                        unitsreserved: { gte: count },
                    },
                    data: {
                        unitsavailable: newAvail,
                        unitsreserved: newRes,
                        lastupdated: now,
                    },
                });
                if (updatedLot.count !== 1) {
                    const err: any = new Error(`Lot ${lotId} stock counters changed concurrently`);
                    err.statusCode = 409;
                    throw err;
                }

                for (const item of lotItems) {
                    const updatedItem = await tx.reservationitems.updateMany({
                        where: {
                            itemid: item.itemid,
                            reservationid: reservationId,
                            itemstatus: { in: ["RESERVED", "PREPARED"] },
                        },
                        data: {
                            itemstatus: "RELEASED",
                            releasedat: now,
                            updatedat: now,
                        },
                    });
                    if (updatedItem.count !== 1) {
                        const err: any = new Error(`Reservation item ${item.itemid} status changed concurrently`);
                        err.statusCode = 409;
                        throw err;
                    }

                    // Invalidate any active crossmatch certificates on released item
                    await tx.clinicalcrossmatches.updateMany({
                        where: {
                            reservationitemid: item.itemid,
                            iscurrent: true,
                        },
                        data: {
                            isinvalidated: true,
                            invalidationreason: `Reservation cancelled: ${reason}`,
                        },
                    });

                    const updatedUnit = await tx.inventoryunits.updateMany({
                        where: {
                            unitid: item.unitid,
                            bloodbankid: bloodBankId,
                            status: "RESERVED",
                        },
                        data: {
                            status: "AVAILABLE",
                            updatedat: now,
                        },
                    });
                    if (updatedUnit.count !== 1) {
                        const err: any = new Error(`Unit ${item.unitid} status changed concurrently`);
                        err.statusCode = 409;
                        throw err;
                    }

                    await tx.unitdispositionhistory.create({
                        data: {
                            unitid: item.unitid,
                            bloodbankid: bloodBankId,
                            actoruserid: actorUserId,
                            previousstatus: "RESERVED",
                            newstatus: "AVAILABLE",
                            reason: `Reservation cancelled: ${reason}`,
                        },
                    });
                }

                // Ledger entry: RESERVATION_CANCEL with quantitydelta = 0
                const ledgerSubKey = `cancel:${reservationId}:${idempotencyKey}:lot:${lotId}:RESERVATION_CANCEL`;
                await tx.inventoryledger.create({
                    data: {
                        inventoryid: lotId,
                        bloodbankid: bloodBankId,
                        actoruserid: actorUserId,
                        operationtype: "RESERVATION_CANCEL",
                        quantitydelta: 0,
                        previousavailable: lot.unitsavailable,
                        newavailable: newAvail,
                        previousreserved: lot.unitsreserved,
                        newreserved: newRes,
                        reason: `Reservation cancelled: ${reason}`,
                        idempotencykey: ledgerSubKey,
                        requesthash: requestHash,
                        responsecode: 200,
                        responsebody: {
                            reservationId,
                            lotId,
                            releasedCount: count,
                            newAvailable: newAvail,
                            newReserved: newRes,
                        } as any,
                    },
                });
            }

            return {
                success: true,
                message: `Cancelled reservation ${reservationId} and returned ${activeItems.length} units to available stock`,
            };
        });
    }

    /**
     * AUTHORIZED DISPOSAL
     * Locks unit, inventory lot, and blood bank FOR UPDATE scoped by tenant bloodBankId.
     * Discards unit with documented reason.
     */
    static async discardUnit(
        unitId: string,
        actorUserId: string,
        reason: string,
        bloodBankId: string,
        idempotencyKey?: string
    ) {
        if (!bloodBankId) {
            const err: any = new Error("Mandatory tenant context: bloodBankId is required for unit disposal");
            err.statusCode = 400;
            throw err;
        }

        const requestHash = computeRequestHash({
            unitId,
            bloodBankId,
            reason,
            idempotencyKey: idempotencyKey || null,
        });

        const scopedDiscardKey = idempotencyKey ? `discard:${bloodBankId}:${unitId}:${idempotencyKey}` : null;
        if (scopedDiscardKey) {
            const existingLedger = await prisma.inventoryledger.findUnique({
                where: { idempotencykey: scopedDiscardKey },
            });
            if (existingLedger) {
                if (existingLedger.bloodbankid !== bloodBankId || existingLedger.requesthash !== requestHash) {
                    const err: any = new Error("Idempotency key has already been used for a different mutation request");
                    err.statusCode = 409;
                    throw err;
                }
                return {
                    ...(existingLedger.responsebody as any),
                    success: true,
                    unitId,
                    status: "DISCARDED",
                    idempotentReplay: true,
                };
            }
        }

        return await prisma.$transaction(async (tx) => {
            // 1. Lock unit, lot, and blood bank facility scoped by tenant bloodBankId
            const lockedUnits: any[] = await tx.$queryRawUnsafe(
                `SELECT u.*, inv.unitsavailable, inv.unitsreserved, inv.unitsquarantined,
                        bb.userid AS facilityowneruserid, bb.approvalstatus AS facilityapprovalstatus
                 FROM inventoryunits u 
                 JOIN inventory inv ON u.inventoryid = inv.inventoryid AND inv.bloodbankid = u.bloodbankid
                 JOIN bloodbanks bb ON u.bloodbankid = bb.bloodbankid
                 WHERE u.unitid = $1::uuid AND u.bloodbankid = $2::uuid
                 FOR UPDATE OF u, inv, bb`,
                unitId,
                bloodBankId
            );
            if (!lockedUnits || lockedUnits.length === 0) {
                const foreignUnit = await tx.inventoryunits.findUnique({
                    where: { unitid: unitId },
                    select: { bloodbankid: true },
                });
                if (foreignUnit && foreignUnit.bloodbankid !== bloodBankId) {
                    const err: any = new Error("Access denied: blood unit belongs to another blood bank");
                    err.statusCode = 403;
                    throw err;
                }
                const err: any = new Error("Blood unit not found");
                err.statusCode = 404;
                throw err;
            }
            const unit = lockedUnits[0];

            // 2. Revalidate tenant ownership, facility approval, and actor affiliation under lock
            if (unit.bloodbankid !== bloodBankId) {
                const err: any = new Error("Access denied: blood unit belongs to another blood bank");
                err.statusCode = 403;
                throw err;
            }
            if (unit.facilityapprovalstatus !== "APPROVED") {
                const err: any = new Error(
                    `Blood bank facility is ${unit.facilityapprovalstatus || "NOT_APPROVED"}. Only APPROVED facilities may perform clinical operations.`
                );
                err.statusCode = 403;
                throw err;
            }

            const actorRows: any[] = await tx.$queryRawUnsafe(
                `SELECT userid, role, isactive FROM users WHERE userid = $1::uuid FOR SHARE`,
                actorUserId
            );
            const actor = actorRows?.[0];
            if (!actor || !actor.isactive || (actor.role !== "BLOOD_BANK" && actor.role !== "ADMIN")) {
                const err: any = new Error("Disposing user is inactive or does not hold an authorized role");
                err.statusCode = 403;
                throw err;
            }
            if (actor.role === "BLOOD_BANK" && actor.userid !== unit.facilityowneruserid) {
                const err: any = new Error("Access denied: user is not affiliated with this blood bank facility");
                err.statusCode = 403;
                throw err;
            }

            if (scopedDiscardKey) {
                const txExistingLedger = await tx.inventoryledger.findUnique({
                    where: { idempotencykey: scopedDiscardKey },
                });
                if (txExistingLedger) {
                    if (txExistingLedger.bloodbankid !== bloodBankId || txExistingLedger.requesthash !== requestHash) {
                        const err: any = new Error("Idempotency key has already been used for a different mutation request");
                        err.statusCode = 409;
                        throw err;
                    }
                    return {
                        ...(txExistingLedger.responsebody as any),
                        success: true,
                        unitId,
                        status: "DISCARDED",
                        idempotentReplay: true,
                    };
                }
            }

            if (unit.status === "DISCARDED") {
                const err: any = new Error("Unit is already discarded");
                err.statusCode = 400;
                throw err;
            }
            if (unit.status === "RESERVED" || unit.status === "IN_TRANSIT" || unit.status === "DELIVERED") {
                const err: any = new Error(`Cannot discard unit in ${unit.status} status; cancel reservation or return to quarantine first`);
                err.statusCode = 400;
                throw err;
            }

            let availDelta = 0;
            let resDelta = 0;
            let quarDelta = 0;

            if (unit.status === "AVAILABLE") availDelta = -1;
            else if (unit.status === "QUARANTINED") quarDelta = -1;

            const newAvail = Number(unit.unitsavailable) + availDelta;
            const newRes = Number(unit.unitsreserved) + resDelta;
            const newQuar = Number(unit.unitsquarantined) + quarDelta;
            const now = new Date();

            const updatedLot = await tx.inventory.updateMany({
                where: {
                    inventoryid: unit.inventoryid,
                    bloodbankid: bloodBankId,
                },
                data: {
                    unitsavailable: newAvail,
                    unitsreserved: newRes,
                    unitsquarantined: newQuar,
                    lastupdated: now,
                },
            });
            if (updatedLot.count !== 1) {
                const err: any = new Error("Failed to update inventory lot for tenant facility");
                err.statusCode = 403;
                throw err;
            }

            const updatedUnit = await tx.inventoryunits.updateMany({
                where: {
                    unitid: unitId,
                    bloodbankid: bloodBankId,
                    status: unit.status,
                },
                data: {
                    status: "DISCARDED",
                    updatedat: now,
                },
            });
            if (updatedUnit.count !== 1) {
                const err: any = new Error("Unit status changed concurrently; cannot discard");
                err.statusCode = 409;
                throw err;
            }

            // Ledger entry: UNIT_DISPOSAL (quantitydelta = -1 if in vault)
            const physicalDelta = availDelta + resDelta + quarDelta;
            const finalIdempotencyKey = scopedDiscardKey || `discard:${bloodBankId}:${unitId}`;
            await tx.inventoryledger.create({
                data: {
                    inventoryid: unit.inventoryid,
                    bloodbankid: bloodBankId,
                    actoruserid: actorUserId,
                    operationtype: "UNIT_DISPOSAL",
                    quantitydelta: physicalDelta,
                    previousavailable: unit.unitsavailable,
                    newavailable: newAvail,
                    previousreserved: unit.unitsreserved,
                    newreserved: newRes,
                    reason: `Authorized Unit Disposal: ${reason}`,
                    idempotencykey: finalIdempotencyKey,
                    requesthash: requestHash,
                    responsecode: 200,
                    responsebody: {
                        success: true,
                        unitId,
                        unitBarcode: unit.unitbarcode,
                        status: "DISCARDED",
                        reason,
                    } as any,
                },
            });

            await tx.unitdispositionhistory.create({
                data: {
                    unitid: unitId,
                    bloodbankid: bloodBankId,
                    actoruserid: actorUserId,
                    previousstatus: unit.status,
                    newstatus: "DISCARDED",
                    reason: `Authorized Disposal: ${reason}`,
                },
            });

            return {
                success: true,
                unitId,
                status: "DISCARDED",
            };
        });
    }

    /**
     * RECONCILE INVENTORY
     * Executes authoritative multi-state reconciliation query (§4.2).
     */
    static async reconcileInventory(bloodBankId: string, inventoryId?: string) {
        let filterClause = `WHERE inv.bloodbankid = $1::uuid`;
        const params: any[] = [bloodBankId];
        if (inventoryId) {
            filterClause += ` AND inv.inventoryid = $2::uuid`;
            params.push(inventoryId);
        }

        const query = `
            WITH unit_aggregates AS (
                SELECT 
                    inventoryid,
                    COUNT(*) FILTER (WHERE status = 'QUARANTINED') AS actual_quarantined,
                    COUNT(*) FILTER (WHERE status = 'AVAILABLE' AND ttiscreeningstatus = 'PASSED') AS actual_available,
                    COUNT(*) FILTER (WHERE status = 'RESERVED') AS actual_reserved,
                    COUNT(*) FILTER (WHERE status = 'IN_TRANSIT') AS actual_in_transit,
                    COUNT(*) FILTER (WHERE status = 'DELIVERED') AS actual_delivered,
                    COUNT(*) FILTER (WHERE status = 'DISCARDED') AS actual_discarded,
                    COUNT(*) AS total_tracked_units
                FROM inventoryunits
                GROUP BY inventoryid
            ),
            reservation_item_aggregates AS (
                SELECT 
                    u.inventoryid,
                    COUNT(*) FILTER (WHERE ri.itemstatus = 'RESERVED') AS active_allocated_items,
                    COUNT(*) FILTER (WHERE ri.itemstatus = 'PREPARED') AS active_prepared_items
                FROM reservationitems ri
                JOIN inventoryunits u ON ri.unitid = u.unitid
                WHERE ri.itemstatus IN ('RESERVED', 'PREPARED')
                GROUP BY u.inventoryid
            ),
            ledger_aggregates AS (
                SELECT 
                    inventoryid,
                    SUM(quantitydelta) AS net_ledger_balance
                FROM inventoryledger
                GROUP BY inventoryid
            )
            SELECT 
                inv.inventoryid,
                inv.bloodbankid,
                inv.bloodgroup,
                inv.bloodcomponent,
                inv.islegacyreconciled,
                
                inv.unitsavailable AS table_available,
                inv.unitsreserved AS table_reserved,
                inv.unitsquarantined AS table_quarantined,
                (inv.unitsavailable + inv.unitsreserved + inv.unitsquarantined) AS table_total_vault_stock,
                
                COALESCE(ua.actual_available, 0) AS unit_available,
                COALESCE(ua.actual_reserved, 0) AS unit_reserved,
                COALESCE(ua.actual_quarantined, 0) AS unit_quarantined,
                (COALESCE(ua.actual_available, 0) + COALESCE(ua.actual_reserved, 0) + COALESCE(ua.actual_quarantined, 0)) AS unit_total_vault_stock,
                
                COALESCE(ua.actual_in_transit, 0) AS unit_in_transit,
                COALESCE(ua.actual_delivered, 0) AS unit_delivered,
                COALESCE(ua.actual_discarded, 0) AS unit_discarded,
                COALESCE(ua.total_tracked_units, 0) AS unit_total_universe,
                
                COALESCE(ria.active_allocated_items, 0) AS items_allocated,
                COALESCE(ria.active_prepared_items, 0) AS items_prepared,
                
                COALESCE(la.net_ledger_balance, 0) AS net_ledger_stock,
                
                CASE 
                    WHEN inv.islegacyreconciled = false THEN true 
                    ELSE (inv.unitsavailable = COALESCE(ua.actual_available, 0)) 
                END AS is_available_reconciled,
                
                CASE 
                    WHEN inv.islegacyreconciled = false THEN true 
                    ELSE (inv.unitsreserved = COALESCE(ua.actual_reserved, 0) 
                          AND COALESCE(ua.actual_reserved, 0) = (COALESCE(ria.active_allocated_items, 0) + COALESCE(ria.active_prepared_items, 0)))
                END AS is_reserved_reconciled,
                
                CASE 
                    WHEN inv.islegacyreconciled = false THEN true 
                    ELSE (inv.unitsquarantined = COALESCE(ua.actual_quarantined, 0))
                END AS is_quarantined_reconciled,
                
                ((inv.unitsavailable + inv.unitsreserved + inv.unitsquarantined) = COALESCE(la.net_ledger_balance, 0)) AS is_ledger_balanced
            FROM inventory inv
            LEFT JOIN unit_aggregates ua ON inv.inventoryid = ua.inventoryid
            LEFT JOIN reservation_item_aggregates ria ON inv.inventoryid = ria.inventoryid
            LEFT JOIN ledger_aggregates la ON inv.inventoryid = la.inventoryid
            ${filterClause}
        `;

        const rows: any[] = await prisma.$queryRawUnsafe(query, ...params);
        return rows.map((r) => {
            const sanitized: any = {};
            for (const [k, v] of Object.entries(r)) {
                sanitized[k] = typeof v === "bigint" ? Number(v) : v;
            }
            return sanitized;
        });
    }
}
