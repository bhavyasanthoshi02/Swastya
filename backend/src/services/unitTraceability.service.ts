import crypto from "crypto";
import { prisma } from "../config/prisma";
import { blood_group, blood_component, inventory_operation_type } from "../generated/prisma/enums";
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

export interface ScreeningInput {
    unitId: string;
    actorUserId: string;
    testedByUserId: string;
    verifiedByUserId: string;
    hivResult: string;
    hbvResult: string;
    hcvResult: string;
    syphilisResult: string;
    malariaResult: string;
    overallStatus: "PASSED" | "FAILED" | "INDETERMINATE";
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
    actorUserId: string;
    testedByUserId: string;
    verifiedByUserId: string;
    methodology: string;
    testResult: "COMPATIBLE" | "INCOMPATIBLE" | "INCONCLUSIVE";
    validUntilHours?: number; // default 72h
}

export interface DispatchInput {
    reservationId: string;
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

        // Check if root idempotency key was already committed
        const existingLedger = await prisma.inventoryledger.findFirst({
            where: {
                idempotencykey: { startsWith: `${idempotencyKey}:lot:` },
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

        return await prisma.$transaction(async (tx) => {
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

            // Deterministic subkey for ledger entry
            const ledgerSubKey = `${idempotencyKey}:lot:${lot.inventoryid}:STOCK_INTAKE`;
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
    }

    /**
     * RECORD 5-PANEL SCREENING AND ATOMIC CLEARANCE
     * Requires distinct tester and verifier.
     * If PASSED: transitions unit from QUARANTINED -> AVAILABLE, lot counters update.
     * If FAILED/INDETERMINATE: cascades unit to QUARANTINED, invalidates reservations.
     * Triggers ensure database-enforced immutability and dual sign-off.
     */
    static async recordScreeningClearance(input: ScreeningInput) {
        const {
            unitId,
            actorUserId,
            testedByUserId,
            verifiedByUserId,
            hivResult,
            hbvResult,
            hcvResult,
            syphilisResult,
            malariaResult,
            overallStatus,
            laboratoryRemarks,
        } = input;

        if (testedByUserId === verifiedByUserId) {
            const err: any = new Error("Clinical safety requirement: Tester and verifier must be distinct authorized personnel");
            err.statusCode = 400;
            throw err;
        }

        return await prisma.$transaction(async (tx) => {
            // Lock unit and lot
            const lockedUnits: any[] = await tx.$queryRawUnsafe(
                `SELECT u.*, inv.unitsavailable, inv.unitsreserved, inv.unitsquarantined 
                 FROM inventoryunits u 
                 JOIN inventory inv ON u.inventoryid = inv.inventoryid 
                 WHERE u.unitid = $1 FOR UPDATE`,
                unitId
            );
            if (!lockedUnits || lockedUnits.length === 0) {
                const err: any = new Error("Blood unit not found");
                err.statusCode = 404;
                throw err;
            }
            const unit = lockedUnits[0];

            // Supersede existing active screening if present
            const activeScreening = await tx.unitscreeningrecords.findFirst({
                where: { unitid: unitId, iscurrent: true },
            });

            let revisionNumber = 1;
            if (activeScreening) {
                revisionNumber = activeScreening.revisionnumber + 1;
                await tx.unitscreeningrecords.update({
                    where: { screeningid: activeScreening.screeningid },
                    data: {
                        iscurrent: false,
                        supersededat: new Date(),
                        supersededbyuserid: actorUserId,
                    },
                });
            }

            // Create new append-only screening record
            const newScreening = await tx.unitscreeningrecords.create({
                data: {
                    unitid: unitId,
                    revisionnumber: revisionNumber,
                    iscurrent: true,
                    hivresult: hivResult,
                    hbvresult: hbvResult,
                    hcvresult: hcvResult,
                    syphilisresult: syphilisResult,
                    malariaresult: malariaResult,
                    overallstatus: overallStatus,
                    testedbyuserid: testedByUserId,
                    verifiedbyuserid: verifiedByUserId,
                    laboratoryremarks: laboratoryRemarks || null,
                },
            });

            let newUnitStatus = unit.status;
            let availableDelta = 0;
            let reservedDelta = 0;
            let quarantinedDelta = 0;

            if (overallStatus === "PASSED") {
                if (unit.status === "QUARANTINED") {
                    newUnitStatus = "AVAILABLE";
                    quarantinedDelta = -1;
                    availableDelta = +1;
                }
            } else {
                // If FAILED or INDETERMINATE, revoke clearance immediately
                if (unit.status === "AVAILABLE") {
                    newUnitStatus = "QUARANTINED";
                    availableDelta = -1;
                    quarantinedDelta = +1;
                } else if (unit.status === "RESERVED") {
                    newUnitStatus = "QUARANTINED";
                    reservedDelta = -1;
                    quarantinedDelta = +1;

                    // Revoke active reservation item
                    await tx.reservationitems.updateMany({
                        where: { unitid: unitId, itemstatus: { in: ["RESERVED", "PREPARED"] } },
                        data: { itemstatus: "RELEASED", releasedat: new Date() },
                    });
                }
            }

            // Update unit pointer to current screening
            await tx.inventoryunits.update({
                where: { unitid: unitId },
                data: {
                    currentscreeningid: newScreening.screeningid,
                    ttiscreeningstatus: overallStatus,
                    status: newUnitStatus,
                    updatedat: new Date(),
                },
            });

            // Update lot counters if changed
            if (availableDelta !== 0 || reservedDelta !== 0 || quarantinedDelta !== 0) {
                const newAvail = unit.unitsavailable + availableDelta;
                const newRes = unit.unitsreserved + reservedDelta;
                const newQuar = unit.unitsquarantined + quarantinedDelta;

                await tx.inventory.update({
                    where: { inventoryid: unit.inventoryid },
                    data: {
                        unitsavailable: newAvail,
                        unitsreserved: newRes,
                        unitsquarantined: newQuar,
                        lastupdated: new Date(),
                    },
                });

                // Record shelf transfer in ledger (quantitydelta = 0)
                const idempotencyKey = `screening:${newScreening.screeningid}:${unit.inventoryid}`;
                await tx.inventoryledger.create({
                    data: {
                        inventoryid: unit.inventoryid,
                        bloodbankid: unit.bloodbankid,
                        actoruserid: actorUserId,
                        operationtype: "SCREENING_CLEARANCE",
                        quantitydelta: 0,
                        previousavailable: unit.unitsavailable,
                        newavailable: newAvail,
                        previousreserved: unit.unitsreserved,
                        newreserved: newRes,
                        reason: `Screening outcome: ${overallStatus} (Revision ${revisionNumber})`,
                        idempotencykey: idempotencyKey,
                        requesthash: computeRequestHash(input),
                        responsecode: 200,
                        responsebody: {
                            unitId,
                            barcode: unit.unitbarcode,
                            screeningStatus: overallStatus,
                            previousUnitStatus: unit.status,
                            newUnitStatus,
                        } as any,
                    },
                });
            }

            // Log disposition history
            await tx.unitdispositionhistory.create({
                data: {
                    unitid: unitId,
                    bloodbankid: unit.bloodbankid,
                    actoruserid: actorUserId,
                    previousstatus: unit.status,
                    newstatus: newUnitStatus,
                    reason: `Screening ${overallStatus}: Tester (${testedByUserId}), Verifier (${verifiedByUserId})`,
                    notes: laboratoryRemarks || null,
                },
            });

            return {
                success: true,
                unitId,
                screeningId: newScreening.screeningid,
                revisionNumber,
                overallStatus,
                unitStatus: newUnitStatus,
            };
        });
    }

    /**
     * ASSIGN REQUISITION TO BLOOD BANK
     */
    static async assignRequisition(requestId: string, bloodBankId: string, assignedByUserId: string) {
        return await prisma.$transaction(async (tx) => {
            const request = await tx.bloodrequests.findUnique({
                where: { requestid: requestId },
            });
            if (!request) {
                const err: any = new Error("Blood request not found");
                err.statusCode = 404;
                throw err;
            }

            // Expire or cancel any previous active pending assignment
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

            const assignment = await tx.requisitionassignments.create({
                data: {
                    requestid: requestId,
                    bloodbankid: bloodBankId,
                    assignedbyuserid: assignedByUserId,
                    assignmentstatus: "PENDING_ACCEPTANCE",
                },
            });

            return {
                success: true,
                assignment,
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
            const assignment = await tx.requisitionassignments.findUnique({
                where: { assignmentid: assignmentId },
            });
            if (!assignment || assignment.bloodbankid !== bloodBankId) {
                const err: any = new Error("Assignment not found or does not belong to this blood bank");
                err.statusCode = 404;
                throw err;
            }

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

        // Check if root idempotency key was already committed
        const existingLedger = await prisma.inventoryledger.findFirst({
            where: {
                idempotencykey: { startsWith: `${idempotencyKey}:lot:` },
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

        return await prisma.$transaction(async (tx) => {
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

            // Determine compatible blood groups (strict iso-group for whole blood!)
            const compatibleGroups = getSafeCompatibleDonorGroups(request.bloodcomponent, request.bloodgroup);

            // Fetch candidate available units
            let candidateUnits: any[] = [];
            if (specificUnitIds && specificUnitIds.length > 0) {
                candidateUnits = await tx.$queryRawUnsafe(
                    `SELECT u.*, inv.islegacyreconciled 
                     FROM inventoryunits u 
                     JOIN inventory inv ON u.inventoryid = inv.inventoryid 
                     WHERE u.unitid = ANY($1::uuid[]) 
                       AND u.bloodbankid = $2 
                       AND u.status = 'AVAILABLE' 
                       AND u.ttiscreeningstatus = 'PASSED'
                     ORDER BY u.expirydate ASC, u.unitid ASC
                     FOR UPDATE OF u`,
                    specificUnitIds,
                    bloodBankId
                );
                if (candidateUnits.length < requestedUnits) {
                    const err: any = new Error(`Only ${candidateUnits.length} of ${requestedUnits} specified units are available and cleared`);
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

                // Record deterministic sub-keyed ledger entry (quantitydelta = 0)
                const ledgerSubKey = `${idempotencyKey}:lot:${lotId}:RESERVATION_ALLOCATE`;
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
    }

    /**
     * RECORD CLINICAL CROSSMATCH
     * Append-only history with partial unique index for active certificate.
     * Enforces 4-way consistency: parent reservation, request, item, unit.
     */
    static async recordCrossmatch(input: CrossmatchInput) {
        const {
            reservationItemId,
            actorUserId,
            testedByUserId,
            verifiedByUserId,
            methodology,
            testResult,
            validUntilHours = 72,
        } = input;

        if (testedByUserId === verifiedByUserId) {
            const err: any = new Error("Clinical safety requirement: Crossmatch tester and verifier must be distinct personnel");
            err.statusCode = 400;
            throw err;
        }

        const validHoursClamped = Math.min(Math.max(validUntilHours, 1), 72); // Max 72 hours per national guidelines

        return await prisma.$transaction(async (tx) => {
            const item = await tx.reservationitems.findUnique({
                where: { itemid: reservationItemId },
                include: {
                    reservation: true,
                    unit: true,
                },
            });
            if (!item) {
                const err: any = new Error("Reservation item not found");
                err.statusCode = 404;
                throw err;
            }

            if (item.itemstatus !== "RESERVED" && item.itemstatus !== "PREPARED") {
                const err: any = new Error(`Cannot crossmatch item in ${item.itemstatus} status`);
                err.statusCode = 400;
                throw err;
            }

            // Find current active crossmatch if re-testing
            const activeCrossmatch = await tx.clinicalcrossmatches.findFirst({
                where: { reservationitemid: reservationItemId, iscurrent: true },
            });

            let nextAttempt = 1;
            if (activeCrossmatch) {
                nextAttempt = activeCrossmatch.attemptnumber + 1;
                await tx.clinicalcrossmatches.update({
                    where: { crossmatchid: activeCrossmatch.crossmatchid },
                    data: {
                        iscurrent: false,
                        isinvalidated: testResult !== "COMPATIBLE",
                        invalidationreason: testResult !== "COMPATIBLE" ? `Superseded by re-test attempt ${nextAttempt}` : null,
                    },
                });
            }

            const validUntil = new Date(Date.now() + validHoursClamped * 60 * 60 * 1000);

            // Insert new crossmatch certificate (PostgreSQL trigger trg_enforce_crossmatch_integrity verifies 4-way lock)
            const crossmatch = await tx.clinicalcrossmatches.create({
                data: {
                    reservationitemid: reservationItemId,
                    reservationid: item.reservationid,
                    requestid: item.reservation.requestid,
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
                await tx.reservationitems.update({
                    where: { itemid: reservationItemId },
                    data: {
                        itemstatus: "PREPARED",
                        preparedat: new Date(),
                        updatedat: new Date(),
                    },
                });

                // Record disposition history
                await tx.unitdispositionhistory.create({
                    data: {
                        unitid: item.unitid,
                        bloodbankid: item.reservation.bloodbankid,
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
     * Decrements lot unitsreserved, sets unit status to IN_TRANSIT, records DISPATCH_DEPARTURE ledger entry.
     */
    static async dispatchReservation(input: DispatchInput) {
        const { reservationId, actorUserId, courierName, trackingId, coldBoxSealNumber, initialTemperature, idempotencyKey } = input;

        const requestHash = computeRequestHash(input);

        // Check if root idempotency key was already committed
        const existingLedger = await prisma.inventoryledger.findFirst({
            where: {
                idempotencykey: { startsWith: `${idempotencyKey}:lot:` },
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

        return await prisma.$transaction(async (tx) => {
            const reservation = await tx.bloodreservations.findUnique({
                where: { reservationid: reservationId },
                include: {
                    reservationitems: {
                        include: {
                            unit: true,
                            clinicalcrossmatches: {
                                where: { iscurrent: true },
                            },
                        },
                    },
                },
            });

            if (!reservation) {
                const err: any = new Error("Reservation not found");
                err.statusCode = 404;
                throw err;
            }

            if (reservation.reservationstatus !== "ACTIVE" && reservation.reservationstatus !== "PREPARED") {
                const err: any = new Error(`Cannot dispatch reservation in ${reservation.reservationstatus} status`);
                err.statusCode = 400;
                throw err;
            }

            const items = reservation.reservationitems;
            if (items.length === 0) {
                const err: any = new Error("Reservation has no items to dispatch");
                err.statusCode = 400;
                throw err;
            }

            // Verify every item is prepared with valid crossmatch
            const now = new Date();
            for (const item of items) {
                if (item.itemstatus !== "PREPARED") {
                    const err: any = new Error(`Item ${item.itemid} is not PREPARED for dispatch (current: ${item.itemstatus})`);
                    err.statusCode = 400;
                    throw err;
                }

                const cert = item.clinicalcrossmatches[0];
                if (!cert) {
                    const err: any = new Error(`Item ${item.itemid} lacks an active clinical crossmatch certificate`);
                    err.statusCode = 400;
                    throw err;
                }

                if (cert.testresult !== "COMPATIBLE" || cert.isinvalidated || cert.validuntil < now) {
                    const err: any = new Error(`Item ${item.itemid} has invalid or expired crossmatch certificate`);
                    err.statusCode = 400;
                    throw err;
                }
            }

            // Group items by lot for balance decrement
            const itemsByLot = new Map<string, any[]>();
            for (const item of items) {
                if (!itemsByLot.has(item.unit.inventoryid)) {
                    itemsByLot.set(item.unit.inventoryid, []);
                }
                itemsByLot.get(item.unit.inventoryid)!.push(item);
            }

            const lotIds = Array.from(itemsByLot.keys()).sort();
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

            // Update reservation status
            await tx.bloodreservations.update({
                where: { reservationid: reservationId },
                data: {
                    reservationstatus: "DISPATCHED",
                    updatedat: new Date(),
                },
            });

            for (const lotId of lotIds) {
                const lotItems = itemsByLot.get(lotId)!;
                const lot = lotMap.get(lotId);
                const count = lotItems.length;

                // Decrement reserved units in lot
                const newRes = lot.unitsreserved - count;
                await tx.inventory.update({
                    where: { inventoryid: lotId },
                    data: {
                        unitsreserved: newRes,
                        lastupdated: new Date(),
                    },
                });

                for (const item of lotItems) {
                    await tx.reservationitems.update({
                        where: { itemid: item.itemid },
                        data: {
                            itemstatus: "DISPATCHED",
                            dispatchedat: new Date(),
                            updatedat: new Date(),
                        },
                    });

                    await tx.inventoryunits.update({
                        where: { unitid: item.unitid },
                        data: {
                            status: "IN_TRANSIT",
                            updatedat: new Date(),
                        },
                    });

                    await tx.unitdispositionhistory.create({
                        data: {
                            unitid: item.unitid,
                            bloodbankid: reservation.bloodbankid,
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
                const ledgerSubKey = `${idempotencyKey}:lot:${lotId}:DISPATCH_DEPARTURE`;
                await tx.inventoryledger.create({
                    data: {
                        inventoryid: lotId,
                        bloodbankid: reservation.bloodbankid,
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
                        responsebody: {
                            reservationId,
                            lotId,
                            dispatchedUnits: count,
                            courierName,
                            coldBoxSealNumber,
                        } as any,
                    },
                });
            }

            const responseData = {
                success: true,
                message: `Successfully dispatched ${items.length} unit(s) via ${courierName}`,
                reservationId,
                status: "DISPATCHED",
                dispatchedUnits: items.length,
            };

            return responseData;
        });
    }

    /**
     * CONFIRM HOSPITAL RECEIPT AND QUARANTINE DISPOSITION
     * Supported outcomes per unit:
     * - ACCEPTED: unit becomes DELIVERED
     * - REJECTED_EXCURSION: temperature excursion policy fails closed to QUARANTINED!
     */
    static async confirmHospitalReceipt(
        reservationId: string,
        actorUserId: string,
        itemsInput: HospitalReceiptItemInput[],
        idempotencyKey: string
    ) {
        const requestHash = computeRequestHash({ reservationId, itemsInput, idempotencyKey });

        return await prisma.$transaction(async (tx) => {
            const reservation = await tx.bloodreservations.findUnique({
                where: { reservationid: reservationId },
                include: {
                    reservationitems: {
                        include: { unit: true },
                    },
                },
            });
            if (!reservation) {
                const err: any = new Error("Reservation not found");
                err.statusCode = 404;
                throw err;
            }

            const inputMap = new Map(itemsInput.map((i) => [i.itemId, i]));
            let deliveredCount = 0;
            let excursionCount = 0;

            for (const item of reservation.reservationitems) {
                const receipt = inputMap.get(item.itemid);
                if (!receipt) continue;

                if (receipt.receivedStatus === "ACCEPTED") {
                    await tx.reservationitems.update({
                        where: { itemid: item.itemid },
                        data: {
                            itemstatus: "DELIVERED",
                            deliveredat: new Date(),
                            updatedat: new Date(),
                        },
                    });

                    await tx.inventoryunits.update({
                        where: { unitid: item.unitid },
                        data: {
                            status: "DELIVERED",
                            updatedat: new Date(),
                        },
                    });

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
                    deliveredCount++;
                } else if (receipt.receivedStatus === "REJECTED_EXCURSION") {
                    // Safe default: Unit routed to QUARANTINED, never auto-discarded
                    await tx.reservationitems.update({
                        where: { itemid: item.itemid },
                        data: {
                            itemstatus: "REJECTED_TRANSIT",
                            updatedat: new Date(),
                        },
                    });

                    await tx.inventoryunits.update({
                        where: { unitid: item.unitid },
                        data: {
                            status: "QUARANTINED",
                            updatedat: new Date(),
                        },
                    });

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

                    // Return to vault quarantine and record TRANSIT_EXCURSION_RETURN in ledger
                    const lot = await tx.inventory.findUnique({ where: { inventoryid: item.unit.inventoryid } });
                    if (lot) {
                        const newQuar = lot.unitsquarantined + 1;
                        await tx.inventory.update({
                            where: { inventoryid: lot.inventoryid },
                            data: { unitsquarantined: newQuar, lastupdated: new Date() },
                        });

                        await tx.inventoryledger.create({
                            data: {
                                inventoryid: lot.inventoryid,
                                bloodbankid: reservation.bloodbankid,
                                actoruserid: actorUserId,
                                operationtype: "TRANSIT_EXCURSION_RETURN",
                                quantitydelta: +1, // returned into vault custody
                                previousavailable: lot.unitsavailable,
                                newavailable: lot.unitsavailable,
                                previousreserved: lot.unitsreserved,
                                newreserved: lot.unitsreserved,
                                reason: `Transit temperature excursion return (${receipt.tempReading || "N/A"}°C)`,
                                idempotencykey: `${idempotencyKey}:lot:${lot.inventoryid}:return:${item.itemid}`,
                                requesthash: requestHash,
                                responsecode: 200,
                                responsebody: {
                                    itemId: item.itemid,
                                    unitId: item.unitid,
                                    tempReading: receipt.tempReading,
                                } as any,
                            },
                        });
                    }

                    excursionCount++;
                }
            }

            // Update parent reservation if all items delivered
            const remainingPending = await tx.reservationitems.count({
                where: {
                    reservationid: reservationId,
                    itemstatus: { in: ["RESERVED", "PREPARED", "DISPATCHED"] },
                },
            });

            if (remainingPending === 0) {
                await tx.bloodreservations.update({
                    where: { reservationid: reservationId },
                    data: {
                        reservationstatus: "COMPLETED",
                        updatedat: new Date(),
                    },
                });
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
     * Releases allocated units back to AVAILABLE shelf stock.
     */
    static async cancelReservation(reservationId: string, actorUserId: string, reason: string, idempotencyKey: string) {
        const requestHash = computeRequestHash({ reservationId, reason, idempotencyKey });

        return await prisma.$transaction(async (tx) => {
            const reservation = await tx.bloodreservations.findUnique({
                where: { reservationid: reservationId },
                include: {
                    reservationitems: {
                        include: { unit: true },
                    },
                },
            });
            if (!reservation) {
                const err: any = new Error("Reservation not found");
                err.statusCode = 404;
                throw err;
            }

            if (reservation.reservationstatus === "DISPATCHED" || reservation.reservationstatus === "COMPLETED") {
                const err: any = new Error(`Cannot cancel reservation in ${reservation.reservationstatus} status`);
                err.statusCode = 400;
                throw err;
            }

            const activeItems = reservation.reservationitems.filter(
                (i) => i.itemstatus === "RESERVED" || i.itemstatus === "PREPARED"
            );

            // Group by lot
            const itemsByLot = new Map<string, any[]>();
            for (const item of activeItems) {
                if (!itemsByLot.has(item.unit.inventoryid)) {
                    itemsByLot.set(item.unit.inventoryid, []);
                }
                itemsByLot.get(item.unit.inventoryid)!.push(item);
            }

            const lotIds = Array.from(itemsByLot.keys()).sort();
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

            await tx.bloodreservations.update({
                where: { reservationid: reservationId },
                data: {
                    reservationstatus: "CANCELLED",
                    cancelledat: new Date(),
                    cancelledbyuserid: actorUserId,
                    cancellationreason: reason,
                    updatedat: new Date(),
                },
            });

            for (const lotId of lotIds) {
                const lotItems = itemsByLot.get(lotId)!;
                const lot = lotMap.get(lotId);
                const count = lotItems.length;

                const newAvail = lot.unitsavailable + count;
                const newRes = lot.unitsreserved - count;

                await tx.inventory.update({
                    where: { inventoryid: lotId },
                    data: {
                        unitsavailable: newAvail,
                        unitsreserved: newRes,
                        lastupdated: new Date(),
                    },
                });

                for (const item of lotItems) {
                    await tx.reservationitems.update({
                        where: { itemid: item.itemid },
                        data: {
                            itemstatus: "RELEASED",
                            releasedat: new Date(),
                            updatedat: new Date(),
                        },
                    });

                    await tx.inventoryunits.update({
                        where: { unitid: item.unitid },
                        data: {
                            status: "AVAILABLE",
                            updatedat: new Date(),
                        },
                    });

                    await tx.unitdispositionhistory.create({
                        data: {
                            unitid: item.unitid,
                            bloodbankid: reservation.bloodbankid,
                            actoruserid: actorUserId,
                            previousstatus: "RESERVED",
                            newstatus: "AVAILABLE",
                            reason: `Reservation cancelled: ${reason}`,
                        },
                    });
                }

                // Ledger entry: RESERVATION_CANCEL with quantitydelta = 0
                const ledgerSubKey = `${idempotencyKey}:lot:${lotId}:RESERVATION_CANCEL`;
                await tx.inventoryledger.create({
                    data: {
                        inventoryid: lotId,
                        bloodbankid: reservation.bloodbankid,
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
     * Discards unit with documented reason.
     */
    static async discardUnit(unitId: string, actorUserId: string, reason: string) {
        return await prisma.$transaction(async (tx) => {
            const lockedUnits: any[] = await tx.$queryRawUnsafe(
                `SELECT u.*, inv.unitsavailable, inv.unitsreserved, inv.unitsquarantined 
                 FROM inventoryunits u 
                 JOIN inventory inv ON u.inventoryid = inv.inventoryid 
                 WHERE u.unitid = $1 FOR UPDATE`,
                unitId
            );
            if (!lockedUnits || lockedUnits.length === 0) {
                const err: any = new Error("Blood unit not found");
                err.statusCode = 404;
                throw err;
            }
            const unit = lockedUnits[0];

            if (unit.status === "DISCARDED") {
                const err: any = new Error("Unit is already discarded");
                err.statusCode = 400;
                throw err;
            }

            let availDelta = 0;
            let resDelta = 0;
            let quarDelta = 0;

            if (unit.status === "AVAILABLE") availDelta = -1;
            else if (unit.status === "RESERVED") resDelta = -1;
            else if (unit.status === "QUARANTINED") quarDelta = -1;

            const newAvail = unit.unitsavailable + availDelta;
            const newRes = unit.unitsreserved + resDelta;
            const newQuar = unit.unitsquarantined + quarDelta;

            await tx.inventory.update({
                where: { inventoryid: unit.inventoryid },
                data: {
                    unitsavailable: newAvail,
                    unitsreserved: newRes,
                    unitsquarantined: newQuar,
                    lastupdated: new Date(),
                },
            });

            await tx.inventoryunits.update({
                where: { unitid: unitId },
                data: {
                    status: "DISCARDED",
                    updatedat: new Date(),
                },
            });

            // Ledger entry: UNIT_DISPOSAL (quantitydelta = -1 if in vault)
            const physicalDelta = availDelta + resDelta + quarDelta;
            const idempotencyKey = `discard:${unitId}:${Date.now()}`;
            await tx.inventoryledger.create({
                data: {
                    inventoryid: unit.inventoryid,
                    bloodbankid: unit.bloodbankid,
                    actoruserid: actorUserId,
                    operationtype: "UNIT_DISPOSAL",
                    quantitydelta: physicalDelta,
                    previousavailable: unit.unitsavailable,
                    newavailable: newAvail,
                    previousreserved: unit.unitsreserved,
                    newreserved: newRes,
                    reason: `Authorized Unit Disposal: ${reason}`,
                    idempotencykey: idempotencyKey,
                    requesthash: computeRequestHash({ unitId, reason }),
                    responsecode: 200,
                    responsebody: {
                        unitId,
                        unitBarcode: unit.unitbarcode,
                        reason,
                    } as any,
                },
            });

            await tx.unitdispositionhistory.create({
                data: {
                    unitid: unitId,
                    bloodbankid: unit.bloodbankid,
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
