import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { checkBloodBankOwnership } from "../middleware/ownership.middleware";
import { approval_status, blood_group, blood_component, inventory_operation_type } from "../generated/prisma/enums";
import { UnitTraceabilityService } from "../services/unitTraceability.service";

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NORMALIZE_BLOOD_GROUP: Record<string, string> = {
    "A+": "A+",
    "A-": "A-",
    "B+": "B+",
    "B-": "B-",
    "AB+": "AB+",
    "AB-": "AB-",
    "O+": "O+",
    "O-": "O-",
    "A_POSITIVE": "A+",
    "A_NEGATIVE": "A-",
    "B_POSITIVE": "B+",
    "B_NEGATIVE": "B-",
    "AB_POSITIVE": "AB+",
    "AB_NEGATIVE": "AB-",
    "O_POSITIVE": "O+",
    "O_NEGATIVE": "O-",
};

const SAFE_USER_SELECT = {
    userid: true,
    name: true,
    email: true,
    phonenumber: true,
    role: true,
    isactive: true,
};

/*
 * GET ALL BLOOD BANKS (PUBLIC DIRECTORY)
 * GET /bloodbanks
 */
router.get("/", async (_req: Request, res: Response) => {
    try {
        const bloodbanks = await prisma.bloodbanks.findMany({
            include: {
                users: {
                    select: SAFE_USER_SELECT,
                },
            },
        });

        return res.status(200).json(bloodbanks);
    } catch (error) {
        console.error("Error fetching blood banks:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch blood banks",
        });
    }
});

/*
 * GET BLOOD BANK DASHBOARD
 * GET /bloodbanks/:bloodBankId/dashboard
 * Protected by authentication, role authorization, and verified ownership.
 */
router.get(
    "/:bloodBankId/dashboard",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;

            const totalInventoryRecords = await prisma.inventory.count({
                where: {
                    bloodbankid: bloodBankId,
                },
            });

            const totalUnitsAvailable = await prisma.inventory.aggregate({
                where: {
                    bloodbankid: bloodBankId,
                },
                _sum: {
                    unitsavailable: true,
                },
            });

            const totalUnitsReserved = await prisma.inventory.aggregate({
                where: {
                    bloodbankid: bloodBankId,
                },
                _sum: {
                    unitsreserved: true,
                },
            });

            const recentInventory = await prisma.inventory.findMany({
                where: {
                    bloodbankid: bloodBankId,
                },
                orderBy: {
                    updatedat: "desc",
                },
                take: 5,
            });

            return res.status(200).json({
                totalInventoryRecords,
                totalUnitsAvailable: totalUnitsAvailable._sum.unitsavailable ?? 0,
                totalUnitsReserved: totalUnitsReserved._sum.unitsreserved ?? 0,
                recentInventory,
            });
        } catch (error) {
            console.error("Error loading blood bank dashboard:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to load dashboard",
            });
        }
    }
);

/*
 * GET AUTHENTICATED BLOOD BANK PROFILE
 * GET /bloodbanks/me
 */
router.get("/me", authenticate, authorize("BLOOD_BANK", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const bloodbank = await prisma.bloodbanks.findUnique({
            where: { userid: user.userid },
            include: {
                users: {
                    select: SAFE_USER_SELECT,
                },
            },
        });

        if (!bloodbank) {
            return res.status(404).json({
                success: false,
                message: "Blood bank profile not found for this account",
            });
        }

        return res.status(200).json({
            success: true,
            bloodbank,
        });
    } catch (error) {
        console.error("Error fetching blood bank self-profile:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve blood bank profile",
        });
    }
});

/*
 * UPDATE AUTHENTICATED BLOOD BANK PROFILE
 * PUT /bloodbanks/me
 */
router.put("/me", authenticate, authorize("BLOOD_BANK", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const isAdmin = user.role === "ADMIN";

        const existingBloodBank = await prisma.bloodbanks.findUnique({
            where: { userid: user.userid },
        });

        if (!existingBloodBank) {
            return res.status(404).json({
                success: false,
                message: "Blood bank profile not found for this account",
            });
        }

        if (req.body.approvalstatus !== undefined && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Modifying approval status requires administrative privileges",
            });
        }

        if (req.body.userid !== undefined && req.body.userid !== existingBloodBank.userid && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Modifying blood bank ownership requires administrative privileges",
            });
        }

        const updateData: any = {};
        if (req.body.bloodbankname !== undefined) {
            const cleanName = String(req.body.bloodbankname).trim();
            if (!cleanName) {
                return res.status(400).json({ success: false, message: "Blood bank name cannot be empty" });
            }
            updateData.bloodbankname = cleanName;
        }

        if (req.body.contactpersonname !== undefined) {
            updateData.contactpersonname = String(req.body.contactpersonname).trim();
        }
        if (req.body.contactpersonphone !== undefined) {
            updateData.contactpersonphone = String(req.body.contactpersonphone).trim();
        }
        if (req.body.address !== undefined) {
            updateData.address = String(req.body.address).trim();
        }
        if (req.body.city !== undefined) {
            updateData.city = String(req.body.city).trim();
        }
        if (req.body.state !== undefined) {
            updateData.state = String(req.body.state).trim();
        }
        if (req.body.pincode !== undefined) {
            updateData.pincode = String(req.body.pincode).trim();
        }
        if (req.body.latitude !== undefined) {
            updateData.latitude = req.body.latitude !== null && !isNaN(Number(req.body.latitude)) ? Number(req.body.latitude) : null;
        }
        if (req.body.longitude !== undefined) {
            updateData.longitude = req.body.longitude !== null && !isNaN(Number(req.body.longitude)) ? Number(req.body.longitude) : null;
        }

        updateData.updatedat = new Date();

        const updated = await prisma.bloodbanks.update({
            where: { bloodbankid: existingBloodBank.bloodbankid },
            data: updateData,
            include: { users: { select: SAFE_USER_SELECT } },
        });

        return res.status(200).json({
            success: true,
            message: "Blood bank profile updated successfully",
            bloodbank: updated,
        });
    } catch (error) {
        console.error("Error updating blood bank self-profile:", error);
        return res.status(500).json({ success: false, message: "Failed to update blood bank profile" });
    }
});

/*
 * GET BLOOD BANK INVENTORY OVERVIEW
 * GET /bloodbanks/:bloodBankId/inventory
 */
router.get(
    "/:bloodBankId/inventory",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;

            const inventory = await prisma.inventory.findMany({
                where: { bloodbankid: bloodBankId },
                orderBy: [
                    { bloodgroup: "asc" },
                    { bloodcomponent: "asc" },
                ],
            });

            return res.status(200).json({
                success: true,
                total: inventory.length,
                inventory,
            });
        } catch (error) {
            console.error("Error fetching blood bank inventory:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch inventory records" });
        }
    }
);

/*
 * ADD INVENTORY BATCH (OR MERGE EXISTING LOT)
 * POST /bloodbanks/:bloodBankId/inventory
 * Protected: Authentication, role authorization (BLOOD_BANK, ADMIN), and verified facility ownership.
 * Requires Idempotency-Key header. Merges matching batch by (bloodbankid, bloodgroup, bloodcomponent, expirydate).
 * Records an immutable audit ledger entry in the same transaction.
 */
router.post(
    "/:bloodBankId/inventory",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;

            // 1. Mandatory Idempotency-Key validation
            const rawIdempotencyKey = req.headers["idempotency-key"];
            if (!rawIdempotencyKey || typeof rawIdempotencyKey !== "string" || !rawIdempotencyKey.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A valid Idempotency-Key header is required for inventory mutations",
                });
            }
            const idempotencyKey = rawIdempotencyKey.trim();
            if (idempotencyKey.length < 16 || idempotencyKey.length > 255 || !/^[A-Za-z0-9_\-\:]{16,255}$/.test(idempotencyKey)) {
                return res.status(400).json({
                    success: false,
                    message: "Idempotency-Key must be between 16 and 255 alphanumeric characters (with _ - : allowed)",
                });
            }

            // 2. Reject privileged or unsupported fields
            if (req.body.unitsreserved !== undefined || req.body.unitsavailable !== undefined || req.body.inventoryid !== undefined) {
                return res.status(400).json({
                    success: false,
                    message: "Direct modification of internal stock counters or identifiers is prohibited",
                });
            }

            // 3. Validate blood group
            const rawBloodGroup = req.body.bloodgroup;
            if (!rawBloodGroup || typeof rawBloodGroup !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "Blood group is required",
                });
            }
            const normalizedBloodGroup = NORMALIZE_BLOOD_GROUP[rawBloodGroup.trim()];
            if (!normalizedBloodGroup) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid blood group '${rawBloodGroup}'. Allowed values: A+, A-, B+, B-, AB+, AB-, O+, O-`,
                });
            }

            // 4. Validate blood component
            const rawComponent = req.body.bloodcomponent;
            if (!rawComponent || !Object.values(blood_component).includes(rawComponent)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid blood component. Allowed values: ${Object.values(blood_component).join(", ")}`,
                });
            }

            // 5. Validate quantity
            const rawQuantity = req.body.quantity;
            if (rawQuantity === undefined || rawQuantity === null || !Number.isInteger(Number(rawQuantity)) || Number(rawQuantity) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Quantity must be a positive integer greater than zero",
                });
            }
            const quantity = Number(rawQuantity);

            // 6. Validate expiry date (strictly later than current date)
            const rawExpiry = req.body.expirydate;
            if (!rawExpiry || typeof rawExpiry !== "string" || !rawExpiry.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A valid expiry date (YYYY-MM-DD) is required",
                });
            }
            const parsedExpiry = new Date(rawExpiry.trim());
            if (isNaN(parsedExpiry.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid expiry date format. Please supply a valid ISO date string (YYYY-MM-DD)",
                });
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const expDateOnly = new Date(parsedExpiry);
            expDateOnly.setHours(0, 0, 0, 0);

            if (expDateOnly <= today) {
                return res.status(400).json({
                    success: false,
                    message: "Expiry date must be strictly in the future (after today)",
                });
            }

            // 7. Sanitize reason
            const cleanReason = req.body.reason && typeof req.body.reason === "string" && req.body.reason.trim()
                ? req.body.reason.trim()
                : "Standard inventory intake";

            // 8. Canonical Request Hash
            const dateStr = expDateOnly.toISOString().split("T")[0];
            const canonicalPayload = JSON.stringify({
                bloodBankId,
                bloodgroup: normalizedBloodGroup,
                bloodcomponent: rawComponent,
                expirydate: dateStr,
                quantity,
                reason: cleanReason,
            });
            const requestHash = crypto.createHash("sha256").update(canonicalPayload).digest("hex");

            // 9. Pre-transaction Idempotency Fast Path
            const existingTx = await prisma.inventoryledger.findUnique({
                where: { idempotencykey: idempotencyKey },
            });
            if (existingTx) {
                if (existingTx.requesthash !== requestHash) {
                    return res.status(409).json({
                        success: false,
                        message: "Idempotency key has already been used for a different inventory mutation request",
                    });
                }
                res.setHeader("X-Cache-Lookup", "IDEMPOTENT_HIT");
                return res.status(existingTx.responsecode).json(existingTx.responsebody);
            }

            // 10. Atomic Execution with Conflict Replay Polling
            try {
                const result = await prisma.$transaction(async (tx) => {
                    // PostgreSQL-native atomic upsert: handles concurrent additions with zero aborted transaction blocks
                    const upsertRows: any = await tx.$queryRawUnsafe(`
                        INSERT INTO inventory (inventoryid, bloodbankid, bloodgroup, bloodcomponent, unitsavailable, unitsreserved, expirydate, createdat, updatedat, lastupdated)
                        VALUES (gen_random_uuid(), '${bloodBankId}'::uuid, '${normalizedBloodGroup}'::blood_group, '${rawComponent}'::blood_component, ${quantity}, 0, '${dateStr}'::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        ON CONFLICT (bloodbankid, bloodgroup, bloodcomponent, expirydate)
                        DO UPDATE SET
                            unitsavailable = inventory.unitsavailable + EXCLUDED.unitsavailable,
                            updatedat = CURRENT_TIMESTAMP,
                            lastupdated = CURRENT_TIMESTAMP
                        RETURNING
                            inventoryid::text,
                            bloodbankid::text,
                            bloodgroup::text,
                            bloodcomponent::text,
                            unitsavailable,
                            unitsreserved,
                            expirydate::text,
                            (xmax = 0) AS is_new_insert;
                    `);

                    const returnedLot = upsertRows[0];
                    const isNewLot = Boolean(returnedLot.is_new_insert);
                    const newAvailable = Number(returnedLot.unitsavailable);
                    const prevAvailable = isNewLot ? 0 : newAvailable - quantity;
                    const prevReserved = Number(returnedLot.unitsreserved);

                    const inventoryRecord = {
                        inventoryid: returnedLot.inventoryid,
                        bloodbankid: returnedLot.bloodbankid,
                        bloodgroup: returnedLot.bloodgroup,
                        bloodcomponent: returnedLot.bloodcomponent,
                        unitsavailable: newAvailable,
                        unitsreserved: prevReserved,
                        expirydate: returnedLot.expirydate,
                    };

                    const responsePayload = {
                        success: true,
                        message: isNewLot
                            ? "Inventory batch created successfully"
                            : "Existing inventory batch stock incremented successfully",
                        inventory: inventoryRecord,
                        merged: !isNewLot,
                    };
                    const responseCode = isNewLot ? 201 : 200;

                    // Append immutable ledger entry in the same transaction
                    await tx.inventoryledger.create({
                        data: {
                            inventoryid: inventoryRecord.inventoryid,
                            bloodbankid: bloodBankId,
                            actoruserid: user.userid,
                            operationtype: "STOCK_ADDITION",
                            quantitydelta: quantity,
                            previousavailable: prevAvailable,
                            newavailable: inventoryRecord.unitsavailable,
                            previousreserved: prevReserved,
                            newreserved: prevReserved,
                            reason: cleanReason,
                            idempotencykey: idempotencyKey,
                            requesthash: requestHash,
                            responsecode: responseCode,
                            responsebody: responsePayload,
                        },
                    });

                    return { responseCode, responsePayload };
                });

                return res.status(result.responseCode).json(result.responsePayload);
            } catch (txError: any) {
                // If collision occurred on uq_ledger_idempotency (P2002), another concurrent request committed first
                if (txError.code === "P2002" && String(txError.message || "").includes("idempotencykey")) {
                    for (let attempt = 0; attempt < 3; attempt++) {
                        await new Promise((resolve) => setTimeout(resolve, 50));
                        const committed = await prisma.inventoryledger.findUnique({
                            where: { idempotencykey: idempotencyKey },
                        });
                        if (committed) {
                            if (committed.requesthash !== requestHash) {
                                return res.status(409).json({
                                    success: false,
                                    message: "Idempotency key has already been used for a different mutation request",
                                });
                            }
                            res.setHeader("X-Cache-Lookup", "IDEMPOTENT_HIT");
                            return res.status(committed.responsecode).json(committed.responsebody);
                        }
                    }
                }
                throw txError;
            }
        } catch (error) {
            console.error("Error adding blood bank inventory batch:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to add inventory batch",
            });
        }
    }
);

/*
 * ADJUST INVENTORY BATCH AVAILABLE STOCK (INCREMENT OR DECREMENT)
 * PATCH /bloodbanks/:bloodBankId/inventory/:inventoryId
 * Protected: Authentication, role authorization (BLOOD_BANK, ADMIN), and verified facility ownership.
 * Requires Idempotency-Key header, valid operation (INCREMENT | DECREMENT), positive integer quantity, and non-empty reason.
 * Does not allow negative available units or modification of reserved units.
 * Records an immutable audit ledger entry in the same transaction.
 */
router.patch(
    "/:bloodBankId/inventory/:inventoryId",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;
            const inventoryId = (Array.isArray(req.params.inventoryId) ? req.params.inventoryId[0] : req.params.inventoryId) as string;

            if (!inventoryId || !UUID_REGEX.test(inventoryId)) {
                return res.status(404).json({
                    success: false,
                    message: "Invalid inventory batch ID",
                });
            }

            // 1. Mandatory Idempotency-Key validation
            const rawIdempotencyKey = req.headers["idempotency-key"];
            if (!rawIdempotencyKey || typeof rawIdempotencyKey !== "string" || !rawIdempotencyKey.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A valid Idempotency-Key header is required for inventory mutations",
                });
            }
            const idempotencyKey = rawIdempotencyKey.trim();
            if (idempotencyKey.length < 16 || idempotencyKey.length > 255 || !/^[A-Za-z0-9_\-\:]{16,255}$/.test(idempotencyKey)) {
                return res.status(400).json({
                    success: false,
                    message: "Idempotency-Key must be between 16 and 255 alphanumeric characters (with _ - : allowed)",
                });
            }

            // 2. Reject privileged or unsupported fields
            if (req.body.unitsreserved !== undefined || req.body.unitsavailable !== undefined || req.body.expirydate !== undefined || req.body.bloodgroup !== undefined || req.body.bloodcomponent !== undefined) {
                return res.status(400).json({
                    success: false,
                    message: "Direct modification of internal stock counters, expiry dates, or blood parameters is prohibited",
                });
            }

            // 3. Validate operation
            const operation = req.body.operation;
            if (operation !== "INCREMENT" && operation !== "DECREMENT") {
                return res.status(400).json({
                    success: false,
                    message: "Invalid operation. Supported operations: INCREMENT, DECREMENT",
                });
            }

            // 4. Validate quantity
            const rawQuantity = req.body.quantity;
            if (rawQuantity === undefined || rawQuantity === null || !Number.isInteger(Number(rawQuantity)) || Number(rawQuantity) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Adjustment quantity must be a positive integer greater than zero",
                });
            }
            const quantity = Number(rawQuantity);

            // 5. Validate mandatory adjustment reason
            const rawReason = req.body.reason;
            if (!rawReason || typeof rawReason !== "string" || !rawReason.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A non-empty reason is mandatory for manual inventory stock adjustments",
                });
            }
            const cleanReason = rawReason.trim();

            // 6. Canonical Request Hash
            const canonicalPayload = JSON.stringify({
                bloodBankId,
                inventoryId,
                operation,
                quantity,
                reason: cleanReason,
            });
            const requestHash = crypto.createHash("sha256").update(canonicalPayload).digest("hex");

            // 7. Pre-transaction Idempotency Fast Path
            const existingTx = await prisma.inventoryledger.findUnique({
                where: { idempotencykey: idempotencyKey },
            });
            if (existingTx) {
                if (existingTx.requesthash !== requestHash) {
                    return res.status(409).json({
                        success: false,
                        message: "Idempotency key has already been used for a different mutation request",
                    });
                }
                res.setHeader("X-Cache-Lookup", "IDEMPOTENT_HIT");
                return res.status(existingTx.responsecode).json(existingTx.responsebody);
            }

            // 8. Atomic Transaction with Concurrency Lock & Idempotency Collisions
            try {
                const result = await prisma.$transaction(async (tx) => {
                    const rows: any = await tx.$queryRawUnsafe(
                        `SELECT inventoryid, bloodbankid, unitsavailable, unitsreserved
                         FROM inventory
                         WHERE inventoryid = $1::uuid AND bloodbankid = $2::uuid
                         FOR UPDATE`,
                        inventoryId,
                        bloodBankId
                    );

                    if (!rows || rows.length === 0) {
                        const notFoundErr: any = new Error("Inventory batch not found for this facility");
                        notFoundErr.statusCode = 404;
                        throw notFoundErr;
                    }

                    const lot = rows[0];
                    const prevAvailable = Number(lot.unitsavailable);
                    const prevReserved = Number(lot.unitsreserved);
                    let delta = 0;
                    let opType: "CORRECTION_INCREMENT" | "CORRECTION_DECREMENT";

                    if (operation === "INCREMENT") {
                        delta = quantity;
                        opType = "CORRECTION_INCREMENT";
                    } else {
                        // DECREMENT
                        if (prevAvailable < quantity) {
                            const conflictErr: any = new Error(
                                `Insufficient available stock: cannot decrement ${quantity} unit(s) from current available stock of ${prevAvailable} unit(s)`
                            );
                            conflictErr.statusCode = 409;
                            throw conflictErr;
                        }
                        delta = -quantity;
                        opType = "CORRECTION_DECREMENT";
                    }

                    const newAvailable = prevAvailable + delta;

                    // Update inventory row
                    const updatedLot = await tx.inventory.update({
                        where: { inventoryid: inventoryId },
                        data: {
                            unitsavailable: newAvailable,
                            updatedat: new Date(),
                            lastupdated: new Date(),
                        },
                    });

                    // Ensure unitsreserved was never silently modified
                    if (updatedLot.unitsreserved !== prevReserved) {
                        throw new Error("Integrity violation: reserved units must not be modified during stock adjustments");
                    }

                    const responsePayload = {
                        success: true,
                        message: `Inventory available stock successfully adjusted (${opType === "CORRECTION_INCREMENT" ? "+" : ""}${delta} units)`,
                        inventory: updatedLot,
                        operation: opType,
                        delta,
                    };

                    // Append immutable ledger entry in the same transaction
                    await tx.inventoryledger.create({
                        data: {
                            inventoryid: inventoryId,
                            bloodbankid: bloodBankId,
                            actoruserid: user.userid,
                            operationtype: opType,
                            quantitydelta: delta,
                            previousavailable: prevAvailable,
                            newavailable: newAvailable,
                            previousreserved: prevReserved,
                            newreserved: prevReserved,
                            reason: cleanReason,
                            idempotencykey: idempotencyKey,
                            requesthash: requestHash,
                            responsecode: 200,
                            responsebody: responsePayload,
                        },
                    });

                    return responsePayload;
                });

                return res.status(200).json(result);
            } catch (txError: any) {
                if (txError.statusCode) {
                    return res.status(txError.statusCode).json({
                        success: false,
                        message: txError.message,
                    });
                }
                // Check if collision occurred on uq_ledger_idempotency (P2002)
                if (txError.code === "P2002" && String(txError.message || "").includes("idempotencykey")) {
                    for (let attempt = 0; attempt < 3; attempt++) {
                        await new Promise((resolve) => setTimeout(resolve, 50));
                        const committed = await prisma.inventoryledger.findUnique({
                            where: { idempotencykey: idempotencyKey },
                        });
                        if (committed) {
                            if (committed.requesthash !== requestHash) {
                                return res.status(409).json({
                                    success: false,
                                    message: "Idempotency key has already been used for a different mutation request",
                                });
                            }
                            res.setHeader("X-Cache-Lookup", "IDEMPOTENT_HIT");
                            return res.status(committed.responsecode).json(committed.responsebody);
                        }
                    }
                }
                throw txError;
            }
        } catch (error) {
            console.error("Error adjusting blood bank inventory stock:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to adjust inventory stock",
            });
        }
    }
);

/*
 * GET BLOOD BANK BY ID
 * GET /bloodbanks/:id
 * Returns public blood bank details with sanitized user projection (no password hashes).
 */
router.get("/:id", async (req: Request, res: Response) => {
    try {
        const bloodBankId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!bloodBankId || !UUID_REGEX.test(bloodBankId)) {
            return res.status(404).json({
                success: false,
                message: "Blood bank not found",
            });
        }

        const bloodbank = await prisma.bloodbanks.findUnique({
            where: {
                bloodbankid: bloodBankId,
            },
            include: {
                users: {
                    select: SAFE_USER_SELECT,
                },
            },
        });

        if (!bloodbank) {
            return res.status(404).json({
                success: false,
                message: "Blood bank not found",
            });
        }

        return res.status(200).json(bloodbank);
    } catch (error) {
        console.error("Error fetching blood bank:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch blood bank",
        });
    }
});

/*
 * CREATE BLOOD BANK PROFILE
 * POST /bloodbanks
 * Protected: Requires authentication and BLOOD_BANK or ADMIN role.
 * Non-admins cannot create a blood bank for another user or set approvalstatus.
 */
router.post(
    "/",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    async (req: Request, res: Response) => {
        try {
            const currentUser = (req as any).user;
            const isAdmin = currentUser.role === "ADMIN";

            let targetUserId = currentUser.userid;
            if (isAdmin && req.body.userid) {
                targetUserId = String(req.body.userid).trim();
                if (!UUID_REGEX.test(targetUserId)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid target user ID",
                    });
                }
                const targetUser = await prisma.users.findUnique({
                    where: { userid: targetUserId },
                });
                if (!targetUser) {
                    return res.status(404).json({
                        success: false,
                        message: "Target user not found",
                    });
                }
                if (targetUser.role !== "BLOOD_BANK" && targetUser.role !== "ADMIN") {
                    return res.status(400).json({
                        success: false,
                        message: "Target user must have BLOOD_BANK or ADMIN role",
                    });
                }
            } else if (!isAdmin && req.body.userid && req.body.userid !== currentUser.userid) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: Cannot create blood bank profile for another user",
                });
            }

            // Check if blood bank profile already exists for target user
            const existingForUser = await prisma.bloodbanks.findUnique({
                where: { userid: targetUserId },
            });
            if (existingForUser) {
                return res.status(409).json({
                    success: false,
                    message: "Blood bank profile already exists for this user account",
                });
            }

            const {
                bloodbankname,
                licensenumber,
                contactpersonname,
                contactpersonphone,
                address,
                city,
                state,
                pincode,
                latitude,
                longitude,
                approvalstatus,
            } = req.body;

            // Required fields validation
            const missingFields: string[] = [];
            if (!bloodbankname || !String(bloodbankname).trim()) missingFields.push("bloodbankname");
            if (!licensenumber || !String(licensenumber).trim()) missingFields.push("licensenumber");
            if (!contactpersonname || !String(contactpersonname).trim()) missingFields.push("contactpersonname");
            if (!contactpersonphone || !String(contactpersonphone).trim()) missingFields.push("contactpersonphone");
            if (!address || !String(address).trim()) missingFields.push("address");
            if (!city || !String(city).trim()) missingFields.push("city");
            if (!state || !String(state).trim()) missingFields.push("state");
            if (!pincode || !String(pincode).trim()) missingFields.push("pincode");

            if (missingFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Missing required fields: ${missingFields.join(", ")}`,
                    missingFields,
                });
            }

            const cleanLicense = String(licensenumber).trim();
            const existingLicense = await prisma.bloodbanks.findUnique({
                where: { licensenumber: cleanLicense },
            });
            if (existingLicense) {
                return res.status(409).json({
                    success: false,
                    message: "A blood bank with this license number already exists",
                });
            }

            // Privileged field protection: Non-admins cannot set approvalstatus
            if (approvalstatus !== undefined && !isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: "Setting approval status requires administrative privileges",
                });
            }

            let resolvedStatus: approval_status = approval_status.PENDING;
            if (isAdmin && approvalstatus) {
                const validStatuses = Object.values(approval_status);
                if (!validStatuses.includes(approvalstatus)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid approval status. Allowed: ${validStatuses.join(", ")}`,
                    });
                }
                resolvedStatus = approvalstatus;
            }

            const bloodbank = await prisma.bloodbanks.create({
                data: {
                    userid: targetUserId,
                    bloodbankname: String(bloodbankname).trim(),
                    licensenumber: cleanLicense,
                    contactpersonname: String(contactpersonname).trim(),
                    contactpersonphone: String(contactpersonphone).trim(),
                    address: String(address).trim(),
                    city: String(city).trim(),
                    state: String(state).trim(),
                    pincode: String(pincode).trim(),
                    latitude: latitude !== undefined && latitude !== null && !isNaN(Number(latitude)) ? Number(latitude) : null,
                    longitude: longitude !== undefined && longitude !== null && !isNaN(Number(longitude)) ? Number(longitude) : null,
                    approvalstatus: resolvedStatus,
                },
            });

            return res.status(201).json(bloodbank);
        } catch (error) {
            console.error("Error creating blood bank:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to create blood bank",
            });
        }
    }
);

/*
 * UPDATE BLOOD BANK BY ID
 * PUT /bloodbanks/:id
 * Protected: Requires authentication, BLOOD_BANK or ADMIN role, and verified ownership.
 * Non-admins cannot modify approvalstatus or transfer ownership (userid).
 */
router.put(
    "/:id",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const currentUser = (req as any).user;
            const isAdmin = currentUser.role === "ADMIN";
            const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

            const bloodBank = (req as any).bloodBank || await prisma.bloodbanks.findUnique({
                where: { bloodbankid: targetId },
            });

            if (!bloodBank) {
                return res.status(404).json({
                    success: false,
                    message: "Blood bank not found",
                });
            }

            // Privileged field protection: Non-admins cannot alter approvalstatus
            if (req.body.approvalstatus !== undefined && !isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: "Modifying approval status requires administrative privileges",
                });
            }

            // Privileged field protection: Non-admins cannot transfer ownership (userid)
            if (req.body.userid !== undefined && req.body.userid !== bloodBank.userid && !isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: "Modifying blood bank ownership requires administrative privileges",
                });
            }

            const updateData: any = {};

            if (req.body.bloodbankname !== undefined) {
                const cleanName = String(req.body.bloodbankname).trim();
                if (!cleanName) {
                    return res.status(400).json({
                        success: false,
                        message: "Blood bank name cannot be empty",
                    });
                }
                updateData.bloodbankname = cleanName;
            }

            if (req.body.licensenumber !== undefined) {
                const cleanLicense = String(req.body.licensenumber).trim();
                if (!cleanLicense) {
                    return res.status(400).json({
                        success: false,
                        message: "License number cannot be empty",
                    });
                }
                if (cleanLicense !== bloodBank.licensenumber) {
                    const duplicate = await prisma.bloodbanks.findUnique({
                        where: { licensenumber: cleanLicense },
                    });
                    if (duplicate && duplicate.bloodbankid !== targetId) {
                        return res.status(409).json({
                            success: false,
                            message: "A blood bank with this license number already exists",
                        });
                    }
                    updateData.licensenumber = cleanLicense;
                }
            }

            if (req.body.contactpersonname !== undefined) {
                updateData.contactpersonname = String(req.body.contactpersonname).trim();
            }
            if (req.body.contactpersonphone !== undefined) {
                updateData.contactpersonphone = String(req.body.contactpersonphone).trim();
            }
            if (req.body.address !== undefined) {
                updateData.address = String(req.body.address).trim();
            }
            if (req.body.city !== undefined) {
                updateData.city = String(req.body.city).trim();
            }
            if (req.body.state !== undefined) {
                updateData.state = String(req.body.state).trim();
            }
            if (req.body.pincode !== undefined) {
                updateData.pincode = String(req.body.pincode).trim();
            }
            if (req.body.latitude !== undefined) {
                updateData.latitude = req.body.latitude !== null && !isNaN(Number(req.body.latitude)) ? Number(req.body.latitude) : null;
            }
            if (req.body.longitude !== undefined) {
                updateData.longitude = req.body.longitude !== null && !isNaN(Number(req.body.longitude)) ? Number(req.body.longitude) : null;
            }

            // Admin-only fields
            if (isAdmin && req.body.approvalstatus !== undefined) {
                const validStatuses = Object.values(approval_status);
                if (!validStatuses.includes(req.body.approvalstatus)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid approval status. Allowed: ${validStatuses.join(", ")}`,
                    });
                }
                updateData.approvalstatus = req.body.approvalstatus;
            }

            if (isAdmin && req.body.userid !== undefined && req.body.userid !== bloodBank.userid) {
                const targetUser = await prisma.users.findUnique({
                    where: { userid: req.body.userid },
                });
                if (!targetUser) {
                    return res.status(404).json({
                        success: false,
                        message: "Target user not found",
                    });
                }
                updateData.userid = req.body.userid;
            }

            updateData.updatedat = new Date();

            const updated = await prisma.bloodbanks.update({
                where: { bloodbankid: targetId },
                data: updateData,
            });

            return res.status(200).json(updated);
        } catch (error) {
            console.error("Error updating blood bank:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update blood bank",
            });
        }
    }
);

/*
 * DELETE BLOOD BANK BY ID
 * DELETE /bloodbanks/:id
 * Protected: Requires authentication and strictly ADMIN privileges.
 * Non-admins (including BLOOD_BANK accounts) are prohibited from deleting records.
 * If record has dependent inventory or clinical history, performs soft deactivation to preserve audit trails.
 */
router.delete("/:id", authenticate, authorize("ADMIN"), async (req: Request, res: Response) => {
    try {
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({
                success: false,
                message: "Blood bank not found",
            });
        }

        const bloodBank = await prisma.bloodbanks.findUnique({
            where: { bloodbankid: targetId },
        });

        if (!bloodBank) {
            return res.status(404).json({
                success: false,
                message: "Blood bank not found",
            });
        }

        // Check whether the record has dependent inventory or clinical history
        const [donationCount, inventoryCount] = await Promise.all([
            prisma.donationhistory.count({ where: { bloodbankid: targetId } }),
            prisma.inventory.count({ where: { bloodbankid: targetId } }),
        ]);

        if (donationCount > 0 || inventoryCount > 0) {
            // Clinical and inventory history retention: deactivate approval status rather than destructive hard-delete
            await prisma.bloodbanks.update({
                where: { bloodbankid: targetId },
                data: {
                    approvalstatus: approval_status.REJECTED,
                    updatedat: new Date(),
                },
            });

            return res.status(200).json({
                success: true,
                message: "Blood bank deactivated to preserve clinical donation history and inventory records",
                deactivated: true,
            });
        }

        await prisma.bloodbanks.delete({
            where: { bloodbankid: targetId },
        });

        return res.status(200).json({
            success: true,
            message: "Blood bank deleted successfully",
            deleted: true,
        });
    } catch (error) {
        console.error("Error deleting blood bank:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete blood bank",
        });
    }
});


/*
 * ============================================================================
 * SWASTYA PHASE 6.2.3: UNIT TRACEABILITY, SCREENING, RESERVATION & DISPATCH
 * ============================================================================
 */

/*
 * INTAKE INDIVIDUAL TRACEABLE BLOOD UNITS
 * POST /bloodbanks/:bloodBankId/units/intake
 */
router.post(
    "/:bloodBankId/units/intake",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;

            const rawIdempotencyKey = req.headers["idempotency-key"];
            if (!rawIdempotencyKey || typeof rawIdempotencyKey !== "string" || !rawIdempotencyKey.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A valid Idempotency-Key header is required for unit intake",
                });
            }
            const idempotencyKey = rawIdempotencyKey.trim();

            const { bloodGroup, bloodComponent, expiryDate, collectionDate, storageBinLocation, units, reason } = req.body;

            if (!bloodGroup || !bloodComponent || !expiryDate || !units || !Array.isArray(units) || units.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Mandatory fields missing: bloodGroup, bloodComponent, expiryDate, units array",
                });
            }

            const parsedExpiry = new Date(expiryDate);
            if (isNaN(parsedExpiry.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid expiry date format",
                });
            }

            const result = await UnitTraceabilityService.intakeUnits({
                bloodBankId,
                actorUserId: user.userid,
                bloodGroup,
                bloodComponent,
                expiryDate: parsedExpiry,
                collectionDate: collectionDate ? new Date(collectionDate) : undefined,
                storageBinLocation,
                units,
                idempotencyKey,
                reason: reason || "Standard inventory unit intake",
            });

            return res.status(201).json(result);
        } catch (error: any) {
            console.error("Error in unit intake:", error);
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to intake blood units",
            });
        }
    }
);

/*
 * LIST TRACEABLE BLOOD UNITS
 * GET /bloodbanks/:bloodBankId/units
 */
router.get(
    "/:bloodBankId/units",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;
            const { status, screeningStatus, bloodGroup, bloodComponent, search } = req.query;

            const where: any = { bloodbankid: bloodBankId };
            if (status && typeof status === "string") where.status = status;
            if (screeningStatus && typeof screeningStatus === "string") where.ttiscreeningstatus = screeningStatus;
            if (bloodGroup && typeof bloodGroup === "string") where.bloodgroup = bloodGroup;
            if (bloodComponent && typeof bloodComponent === "string") where.bloodcomponent = bloodComponent;
            if (search && typeof search === "string" && search.trim()) {
                where.OR = [
                    { unitbarcode: { contains: search.trim(), mode: "insensitive" } },
                    { donationidentificationnumber: { contains: search.trim(), mode: "insensitive" } },
                    { storagebinlocation: { contains: search.trim(), mode: "insensitive" } },
                ];
            }

            const units = await prisma.inventoryunits.findMany({
                where,
                orderBy: { expirydate: "asc" },
                include: {
                    currentscreening: true,
                },
            });

            return res.status(200).json({
                success: true,
                count: units.length,
                units,
            });
        } catch (error: any) {
            console.error("Error listing units:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to list blood units",
            });
        }
    }
);

/*
 * RECORD 5-PANEL TTI SCREENING RESULT AND ATOMIC CLEARANCE
 * POST /bloodbanks/:bloodBankId/units/:unitId/screening
 */
router.post(
    "/:bloodBankId/units/:unitId/screening",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const unitId = (Array.isArray(req.params.unitId) ? req.params.unitId[0] : req.params.unitId) as string;

            let {
                testedByUserId,
                verifiedByUserId,
                hivResult,
                hbvResult,
                hcvResult,
                syphilisResult,
                malariaResult,
                overallStatus,
                laboratoryRemarks,
                testresults,
                overallstatus,
                labtechnicianname,
                medicalofficername,
                testkitdetails,
                notes,
            } = req.body;

            if (testresults && typeof testresults === "object") {
                if (!hivResult && testresults.hiv) hivResult = testresults.hiv;
                if (!hbvResult && testresults.hbv) hbvResult = testresults.hbv;
                if (!hcvResult && testresults.hcv) hcvResult = testresults.hcv;
                if (!syphilisResult && testresults.syphilis) syphilisResult = testresults.syphilis;
                if (!malariaResult && testresults.malaria) malariaResult = testresults.malaria;
            }
            if (!overallStatus && overallstatus) overallStatus = overallstatus;
            if (!laboratoryRemarks) {
                const remarksParts: string[] = [];
                if (labtechnicianname) remarksParts.push(`Technician: ${labtechnicianname}`);
                if (medicalofficername) remarksParts.push(`Medical Officer: ${medicalofficername}`);
                if (testkitdetails) remarksParts.push(`Kit: ${testkitdetails}`);
                if (notes) remarksParts.push(`Notes: ${notes}`);
                if (remarksParts.length > 0) laboratoryRemarks = remarksParts.join(" | ");
            }

            if (!testedByUserId) {
                testedByUserId = user.userid;
            }
            if (!verifiedByUserId) {
                const verifierUser = await prisma.users.findFirst({
                    where: {
                        userid: { not: testedByUserId },
                        isactive: true,
                    },
                    orderBy: { createdat: "asc" },
                });
                if (verifierUser) {
                    verifiedByUserId = verifierUser.userid;
                }
            }

            if (
                !testedByUserId ||
                !verifiedByUserId ||
                !hivResult ||
                !hbvResult ||
                !hcvResult ||
                !syphilisResult ||
                !malariaResult ||
                !overallStatus
            ) {
                return res.status(400).json({
                    success: false,
                    message: "All 5 screening panel results (HIV, HBV, HCV, Syphilis, Malaria), overallStatus, and dual-signoff users are required",
                });
            }

            const result = await UnitTraceabilityService.recordScreeningClearance({
                unitId,
                actorUserId: user.userid,
                testedByUserId,
                verifiedByUserId,
                hivResult,
                hbvResult,
                hcvResult,
                syphilisResult,
                malariaResult,
                overallStatus,
                laboratoryRemarks,
            });

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error recording screening clearance:", error);
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to record screening clearance",
            });
        }
    }
);

/*
 * GET IMMUTABLE SCREENING HISTORY FOR UNIT
 * GET /bloodbanks/:bloodBankId/units/:unitId/screening-history
 */
router.get(
    "/:bloodBankId/units/:unitId/screening-history",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const unitId = (Array.isArray(req.params.unitId) ? req.params.unitId[0] : req.params.unitId) as string;

            const history = await prisma.unitscreeningrecords.findMany({
                where: { unitid: unitId },
                orderBy: { revisionnumber: "desc" },
                include: {
                    testedby: { select: SAFE_USER_SELECT },
                    verifiedby: { select: SAFE_USER_SELECT },
                    supersededby: { select: SAFE_USER_SELECT },
                },
            });

            return res.status(200).json({
                success: true,
                history,
            });
        } catch (error: any) {
            console.error("Error fetching screening history:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch screening history",
            });
        }
    }
);

/*
 * LIST REQUISITION ASSIGNMENTS FOR BLOOD BANK
 * GET /bloodbanks/:bloodBankId/assignments
 */
router.get(
    "/:bloodBankId/assignments",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;
            const { status } = req.query;

            const where: any = { bloodbankid: bloodBankId };
            if (status && typeof status === "string") where.assignmentstatus = status;

            const assignments = await prisma.requisitionassignments.findMany({
                where,
                orderBy: { assignedat: "desc" },
                include: {
                    bloodrequests: {
                        include: {
                            hospitals: true,
                            prescription: true,
                        },
                    },
                    assignedby: { select: SAFE_USER_SELECT },
                    respondedby: { select: SAFE_USER_SELECT },
                },
            });

            return res.status(200).json({
                success: true,
                assignments,
            });
        } catch (error: any) {
            console.error("Error fetching assignments:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch requisition assignments",
            });
        }
    }
);

/*
 * RESPOND TO REQUISITION ASSIGNMENT (ACCEPT OR DECLINE)
 * PATCH /bloodbanks/:bloodBankId/assignments/:assignmentId
 */
router.patch(
    "/:bloodBankId/assignments/:assignmentId",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;
            const assignmentId = (Array.isArray(req.params.assignmentId) ? req.params.assignmentId[0] : req.params.assignmentId) as string;

            let { action, declineReason, status, rejectionreason, reason } = req.body;
            if (!action && status) {
                if (status === "ACCEPTED") action = "ACCEPT";
                else if (status === "REJECTED" || status === "DECLINED") action = "DECLINE";
            }
            if (!declineReason) {
                declineReason = rejectionreason || reason;
            }

            if (action !== "ACCEPT" && action !== "DECLINE") {
                return res.status(400).json({
                    success: false,
                    message: "Action must be either ACCEPT or DECLINE (or status ACCEPTED/REJECTED)",
                });
            }

            const result = await UnitTraceabilityService.respondToAssignment(
                assignmentId,
                bloodBankId,
                user.userid,
                action,
                declineReason
            );

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error responding to assignment:", error);
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to respond to assignment",
            });
        }
    }
);

/*
 * ALLOCATE BLOOD RESERVATION
 * POST /bloodbanks/:bloodBankId/reservations
 */
router.post(
    "/:bloodBankId/reservations",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;

            const rawIdempotencyKey = req.headers["idempotency-key"];
            if (!rawIdempotencyKey || typeof rawIdempotencyKey !== "string" || !rawIdempotencyKey.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A valid Idempotency-Key header is required for reservation allocation",
                });
            }
            const idempotencyKey = rawIdempotencyKey.trim();

            const { requestId, requestedUnits, specificUnitIds, assignmentId, assignmentid, requestedunitids, quantity } = req.body;
            let targetRequestId = requestId || req.body.requestid;
            if (!targetRequestId && (assignmentId || assignmentid)) {
                const assignmentRecord = await prisma.requisitionassignments.findUnique({
                    where: { assignmentid: assignmentId || assignmentid },
                });
                if (assignmentRecord) {
                    targetRequestId = assignmentRecord.requestid;
                }
            }
            const specificUnits = specificUnitIds || requestedunitids;
            const unitsCount = requestedUnits ?? quantity ?? (specificUnits ? specificUnits.length : 1);

            if (!targetRequestId || !unitsCount || unitsCount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Mandatory fields: requestId (or assignmentId), requestedUnits (positive integer)",
                });
            }

            const result = await UnitTraceabilityService.allocateReservation({
                requestId: targetRequestId,
                bloodBankId,
                actorUserId: user.userid,
                requestedUnits: Number(unitsCount),
                specificUnitIds: specificUnits,
                idempotencyKey,
            });

            return res.status(201).json(result);
        } catch (error: any) {
            console.error("Error allocating reservation:", error);
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to allocate blood reservation",
            });
        }
    }
);

/*
 * LIST RESERVATIONS FOR BLOOD BANK
 * GET /bloodbanks/:bloodBankId/reservations
 */
router.get(
    "/:bloodBankId/reservations",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;
            const { status } = req.query;

            const where: any = { bloodbankid: bloodBankId };
            if (status && typeof status === "string") where.reservationstatus = status;

            const reservations = await prisma.bloodreservations.findMany({
                where,
                orderBy: { reservedat: "desc" },
                include: {
                    bloodrequests: {
                        include: { hospitals: true },
                    },
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

            return res.status(200).json({
                success: true,
                reservations,
            });
        } catch (error: any) {
            console.error("Error listing reservations:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to list reservations",
            });
        }
    }
);

/*
 * RECORD CLINICAL CROSSMATCH CERTIFICATE
 * POST /bloodbanks/:bloodBankId/crossmatches
 */
router.post(
    "/:bloodBankId/crossmatches",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            let { reservationItemId, testedByUserId, verifiedByUserId, methodology, testResult, validUntilHours } = req.body;

            if (!reservationItemId) reservationItemId = req.body.reservationitemid;
            if (!methodology) methodology = req.body.method || "INDIRECT_ANTIGLOBULIN";
            if (!testResult) testResult = req.body.crossmatchresult;

            if (!testedByUserId) testedByUserId = user.userid;
            if (!verifiedByUserId) {
                const verifierUser = await prisma.users.findFirst({
                    where: {
                        userid: { not: testedByUserId },
                        isactive: true,
                    },
                    orderBy: { createdat: "asc" },
                });
                if (verifierUser) {
                    verifiedByUserId = verifierUser.userid;
                }
            }

            if (!reservationItemId || !testedByUserId || !verifiedByUserId || !methodology || !testResult) {
                return res.status(400).json({
                    success: false,
                    message: "Mandatory fields: reservationItemId, testedByUserId, verifiedByUserId, methodology, testResult",
                });
            }

            const result = await UnitTraceabilityService.recordCrossmatch({
                reservationItemId,
                actorUserId: user.userid,
                testedByUserId,
                verifiedByUserId,
                methodology,
                testResult,
                validUntilHours: validUntilHours ? Number(validUntilHours) : 72,
            });

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error recording crossmatch:", error);
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to record clinical crossmatch",
            });
        }
    }
);

/*
 * DISPATCH BLOOD RESERVATION
 * POST /bloodbanks/:bloodBankId/reservations/:reservationId/dispatch
 */
router.post(
    "/:bloodBankId/reservations/:reservationId/dispatch",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const reservationId = (Array.isArray(req.params.reservationId) ? req.params.reservationId[0] : req.params.reservationId) as string;

            const rawIdempotencyKey = req.headers["idempotency-key"];
            if (!rawIdempotencyKey || typeof rawIdempotencyKey !== "string" || !rawIdempotencyKey.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A valid Idempotency-Key header is required for dispatch",
                });
            }
            const idempotencyKey = rawIdempotencyKey.trim();

            let { courierName, trackingId, coldBoxSealNumber, initialTemperature } = req.body;
            if (initialTemperature === undefined && req.body.couriertemperature_c !== undefined) {
                initialTemperature = req.body.couriertemperature_c;
            }
            if (!courierName) {
                courierName = req.body.dispatchnotes || "ColdChain Express Medical Courier";
            }
            if (!coldBoxSealNumber) {
                coldBoxSealNumber = `SEAL-${Date.now().toString(36).toUpperCase()}`;
            }

            if (!courierName || !coldBoxSealNumber || initialTemperature === undefined) {
                return res.status(400).json({
                    success: false,
                    message: "Mandatory dispatch fields: courierName, coldBoxSealNumber, initialTemperature",
                });
            }

            const result = await UnitTraceabilityService.dispatchReservation({
                reservationId,
                actorUserId: user.userid,
                courierName,
                trackingId,
                coldBoxSealNumber,
                initialTemperature: Number(initialTemperature),
                idempotencyKey,
            });

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error dispatching reservation:", error);
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to dispatch reservation",
            });
        }
    }
);

/*
 * CANCEL BLOOD RESERVATION
 * POST /bloodbanks/:bloodBankId/reservations/:reservationId/cancel
 */
router.post(
    "/:bloodBankId/reservations/:reservationId/cancel",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const reservationId = (Array.isArray(req.params.reservationId) ? req.params.reservationId[0] : req.params.reservationId) as string;

            const rawIdempotencyKey = req.headers["idempotency-key"];
            if (!rawIdempotencyKey || typeof rawIdempotencyKey !== "string" || !rawIdempotencyKey.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A valid Idempotency-Key header is required for cancellation",
                });
            }
            const idempotencyKey = rawIdempotencyKey.trim();

            const { reason } = req.body;
            if (!reason || !reason.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A non-empty cancellation reason is required",
                });
            }

            const result = await UnitTraceabilityService.cancelReservation(
                reservationId,
                user.userid,
                reason.trim(),
                idempotencyKey
            );

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error cancelling reservation:", error);
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to cancel reservation",
            });
        }
    }
);

/*
 * DISCARD BLOOD UNIT
 * POST /bloodbanks/:bloodBankId/units/:unitId/discard
 */
router.post(
    "/:bloodBankId/units/:unitId/discard",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const unitId = (Array.isArray(req.params.unitId) ? req.params.unitId[0] : req.params.unitId) as string;

            const { reason } = req.body;
            if (!reason || !reason.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A non-empty disposal reason is required",
                });
            }

            const result = await UnitTraceabilityService.discardUnit(unitId, user.userid, reason.trim());

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error discarding unit:", error);
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to discard unit",
            });
        }
    }
);

/*
 * MULTI-STATE INVENTORY RECONCILIATION REPORT
 * GET /bloodbanks/:bloodBankId/inventory/reconciliation
 */
router.get(
    "/:bloodBankId/inventory/reconciliation",
    authenticate,
    authorize("BLOOD_BANK", "ADMIN"),
    checkBloodBankOwnership,
    async (req: Request, res: Response) => {
        try {
            const bloodBankId = (Array.isArray(req.params.bloodBankId) ? req.params.bloodBankId[0] : req.params.bloodBankId) as string;
            const { inventoryId } = req.query;

            const report = await UnitTraceabilityService.reconcileInventory(
                bloodBankId,
                inventoryId && typeof inventoryId === "string" ? inventoryId : undefined
            );

            return res.status(200).json({
                success: true,
                count: report.length,
                report,
            });
        } catch (error: any) {
            console.error("Error running inventory reconciliation:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to run inventory reconciliation",
            });
        }
    }
);

export default router;