/**
 * Swastya Blood Request Event-Driven SMS Dispatcher
 * Decouples SMS notifications from core HTTP request handlers using event-driven dispatch.
 * 
 * Handles:
 * 1. Automatic SMS to matched donors (via clinical matching gates & composite score)
 * 2. Automatic SMS to relevant Hospitals and Blood Banks (location + inventory compatibility)
 * 3. Automatic status-update SMS (donor accept/decline, hospital accept, blood bank confirm, fulfilled, cancelled)
 * 
 * Enforces:
 * - Strict idempotency (no duplicate SMS)
 * - Safe mock mode / Twilio provider integration
 * - Total isolation from Emergency Broadcast
 * - Privacy protection (no confidential medical disclosures in SMS)
 */

import { EventEmitter } from "events";
import { prisma } from "../../../config/prisma";
import { blood_group, blood_component, availability_status } from "../../../generated/prisma/enums";
import { DonorMatchingService } from "../../matching/donorMatching.service";
import { getCompatibleDonorBloodGroups } from "../../../utils/bloodCompatibility";
import { calculateHaversineDistanceKm } from "../../../utils/distance";
import { NotificationSmsDispatcher } from "./notificationSmsDispatcher.service";
import { ActionTokenService } from "./actionToken.service";
import { SmsService } from "./sms.service";

export interface BloodRequestCreatedEvent {
    requestId: string;
    createdByUserId: string;
    hospitalId?: string | null;
    isEmergency?: boolean;
    urgencyLevel?: string;
}

export interface DonorRespondedEvent {
    requestId: string;
    donorUserId: string;
    donorId: string;
    response: "ACCEPTED" | "DECLINED";
    declineReason?: string;
    eta?: string;
}

export interface BloodRequestStatusChangedEvent {
    requestId: string;
    oldStatus: string | null;
    newStatus: string;
    changedByUserId: string;
    remarks?: string;
}

export interface BloodBankAssignmentRespondedEvent {
    assignmentId: string;
    requestId: string;
    bloodBankId: string;
    action: "ACCEPT" | "DECLINE";
    declineReason?: string;
    actorUserId: string;
}

class BloodRequestEventEmitter extends EventEmitter {}

export const bloodRequestEventEmitter = new BloodRequestEventEmitter();

// Event Names
export const EVENTS = {
    REQUEST_CREATED: "BLOOD_REQUEST_CREATED",
    DONOR_RESPONDED: "DONOR_RESPONDED",
    STATUS_CHANGED: "BLOOD_REQUEST_STATUS_CHANGED",
    BLOOD_BANK_RESPONDED: "BLOOD_BANK_ASSIGNMENT_RESPONDED",
} as const;

/**
 * 1. Handler: Requisition Created -> Notify Matched Donors + Relevant Hospitals & Blood Banks
 */
async function onBloodRequestCreated(event: BloodRequestCreatedEvent) {
    try {
        const { requestId } = event;

        // Fetch full blood request with hospital and requester relations
        const request = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            include: {
                hospitals: true,
                requesters: true,
            },
        });

        if (!request) {
            console.warn(`[BloodRequestEvents] Request ${requestId} not found for matching event.`);
            return;
        }

        const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
        if (terminalStatuses.includes(request.status || "")) {
            return;
        }

        const effectiveRadius = request.searchradius && request.searchradius > 0
            ? Math.max(1, Math.min(100, request.searchradius))
            : 25;

        // Execute Donors, Hospitals, and Blood Banks notifications in parallel
        await Promise.allSettled([
            // -------------------------------------------------------------------------
            // A. Automatic SMS to Matched Donors
            // -------------------------------------------------------------------------
            (async () => {
                try {
                    const matchingResult = await DonorMatchingService.getRankedEligibleDonors(
                        {
                            requestid: request.requestid,
                            bloodgroup: request.bloodgroup,
                            bloodcomponent: request.bloodcomponent,
                            searchradius: effectiveRadius,
                            latitude: request.latitude,
                            longitude: request.longitude,
                            hospitals: request.hospitals,
                            requesters: request.requesters,
                        },
                        { radiusKm: effectiveRadius, limit: 50 }
                    );

                    if (matchingResult.success && matchingResult.data.length > 0) {
                        const matchedDonorIds = matchingResult.data.map(d => d.donorId);

                        // Fetch donor records with active user accounts and phone numbers
                        const matchedDonors = await prisma.donors.findMany({
                            where: {
                                donorid: { in: matchedDonorIds },
                                users: {
                                    isactive: true,
                                },
                            },
                            include: {
                                users: {
                                    select: {
                                        userid: true,
                                        name: true,
                                        phonenumber: true,
                                        isactive: true,
                                    },
                                },
                            },
                        });

                        for (const donor of matchedDonors) {
                            if (!donor.users?.phonenumber || donor.users.isactive === false) {
                                continue;
                            }

                            // Dispatch matched donor SMS (idempotency key prevents duplicate dispatch)
                            await NotificationSmsDispatcher.dispatchMatchedDonorAlert({
                                donorUserId: donor.users.userid,
                                requestId: request.requestid,
                                bloodGroup: request.bloodgroup,
                            }).catch(err => {
                                console.error(`[BloodRequestEvents] Failed to dispatch SMS to matched donor ${donor.users.userid}:`, err);
                            });
                        }
                    }
                } catch (donorErr) {
                    console.error(`[BloodRequestEvents] Error matching donors for request ${requestId}:`, donorErr);
                }
            })(),

            // -------------------------------------------------------------------------
            // B. Automatic SMS to Relevant Hospitals
            // -------------------------------------------------------------------------
            (async () => {
                try {
                    // If already assigned to a specific hospital, notify that hospital
                    if (request.hospitalid && request.hospitals?.userid) {
                        if (request.hospitals.userid !== request.createdbyuserid) {
                            await NotificationSmsDispatcher.dispatchRelevantHospitalAlert({
                                hospitalUserId: request.hospitals.userid,
                                requestId: request.requestid,
                            }).catch(err => {
                                console.error(`[BloodRequestEvents] Failed to notify assigned hospital ${request.hospitalid}:`, err);
                            });
                        }
                    } else {
                        // Find nearby approved hospitals within search radius or matching city
                        const reqLat = request.latitude !== null && request.latitude !== undefined
                            ? Number(request.latitude)
                            : (request.requesters?.latitude !== null && request.requesters?.latitude !== undefined ? Number(request.requesters.latitude) : null);
                        const reqLng = request.longitude !== null && request.longitude !== undefined
                            ? Number(request.longitude)
                            : (request.requesters?.longitude !== null && request.requesters?.longitude !== undefined ? Number(request.requesters.longitude) : null);
                        const reqCity = (request.requesters?.city || "").trim().toLowerCase();

                        const nearbyHospitals = await prisma.hospitals.findMany({
                            where: {
                                approvalstatus: "APPROVED",
                                users: { isactive: true },
                                hospitalid: request.hospitalid ? { not: request.hospitalid } : undefined,
                            },
                            include: {
                                users: {
                                    select: { userid: true, phonenumber: true, isactive: true },
                                },
                            },
                            take: 20,
                        });

                        for (const hosp of nearbyHospitals) {
                            if (!hosp.users?.phonenumber || hosp.users.isactive === false) continue;
                            if (hosp.users.userid === request.createdbyuserid) continue;

                            let isRelevant = false;
                            if (reqLat !== null && reqLng !== null && hosp.latitude !== null && hosp.longitude !== null) {
                                const dist = calculateHaversineDistanceKm(reqLat, reqLng, Number(hosp.latitude), Number(hosp.longitude));
                                if (dist <= effectiveRadius) isRelevant = true;
                            } else if (reqCity && hosp.city && hosp.city.trim().toLowerCase() === reqCity) {
                                isRelevant = true;
                            }

                            if (isRelevant) {
                                await NotificationSmsDispatcher.dispatchRelevantHospitalAlert({
                                    hospitalUserId: hosp.users.userid,
                                    requestId: request.requestid,
                                }).catch(() => {});
                            }
                        }
                    }
                } catch (hospErr) {
                    console.error(`[BloodRequestEvents] Error notifying relevant hospitals for request ${requestId}:`, hospErr);
                }
            })(),

            // -------------------------------------------------------------------------
            // C. Automatic SMS to Relevant Blood Banks
            // -------------------------------------------------------------------------
            (async () => {
                try {
                    const requestedGroup = request.bloodgroup;
                    const requestedComponent = request.bloodcomponent || blood_component.WHOLE_BLOOD;
                    const compatibleGroups = getCompatibleDonorBloodGroups(requestedGroup, requestedComponent);

                    if (compatibleGroups && compatibleGroups.length > 0) {
                        const reqLat = request.latitude !== null && request.latitude !== undefined
                            ? Number(request.latitude)
                            : (request.hospitals?.latitude !== null && request.hospitals?.latitude !== undefined
                                ? Number(request.hospitals.latitude)
                                : (request.requesters?.latitude !== null && request.requesters?.latitude !== undefined ? Number(request.requesters.latitude) : null));

                        const reqLng = request.longitude !== null && request.longitude !== undefined
                            ? Number(request.longitude)
                            : (request.hospitals?.longitude !== null && request.hospitals?.longitude !== undefined
                                ? Number(request.hospitals.longitude)
                                : (request.requesters?.longitude !== null && request.requesters?.longitude !== undefined ? Number(request.requesters.longitude) : null));

                        const reqCity = (request.hospitals?.city || request.requesters?.city || "").trim().toLowerCase();

                        // Find approved blood banks that hold available compatible inventory
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        const candidateBloodBanks = await prisma.bloodbanks.findMany({
                            where: {
                                approvalstatus: "APPROVED",
                                users: { isactive: true },
                                inventory: {
                                    some: {
                                        bloodgroup: { in: compatibleGroups },
                                        unitsavailable: { gt: 0 },
                                    },
                                },
                            },
                            include: {
                                users: {
                                    select: { userid: true, phonenumber: true, isactive: true },
                                },
                                inventory: {
                                    where: {
                                        bloodgroup: { in: compatibleGroups },
                                        unitsavailable: { gt: 0 },
                                    },
                                    select: { unitsavailable: true, expirydate: true },
                                },
                            },
                            take: 20,
                        });

                        for (const bb of candidateBloodBanks) {
                            if (!bb.users?.phonenumber || bb.users.isactive === false) continue;
                            if (bb.users.userid === request.createdbyuserid) continue;

                            // Ensure at least one unit is unexpired
                            const hasUnexpiredStock = bb.inventory.some(inv => {
                                if (!inv.expirydate) return true;
                                return new Date(inv.expirydate) >= today;
                            });
                            if (!hasUnexpiredStock) continue;

                            let isRelevant = false;
                            if (reqLat !== null && reqLng !== null && bb.latitude !== null && bb.longitude !== null) {
                                const dist = calculateHaversineDistanceKm(reqLat, reqLng, Number(bb.latitude), Number(bb.longitude));
                                if (dist <= effectiveRadius) isRelevant = true;
                            } else if (reqCity && bb.city && bb.city.trim().toLowerCase() === reqCity) {
                                isRelevant = true;
                            }

                            if (isRelevant) {
                                await NotificationSmsDispatcher.dispatchRelevantBloodBankAlert({
                                    bloodBankUserId: bb.users.userid,
                                    requestId: request.requestid,
                                }).catch(() => {});
                            }
                        }
                    }
                } catch (bbErr) {
                    console.error(`[BloodRequestEvents] Error notifying relevant blood banks for request ${requestId}:`, bbErr);
                }
            })(),
        ]);
    } catch (err) {
        console.error("[BloodRequestEvents] Uncaught error in onBloodRequestCreated:", err);
    }
}

/**
 * 2. Handler: Donor Response (Accepted or Declined)
 */
async function onDonorResponded(event: DonorRespondedEvent) {
    try {
        const { requestId, donorUserId, response, declineReason, eta } = event;

        const request = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            include: { hospitals: true },
        });

        if (!request) return;

        const donorUser = await prisma.users.findUnique({
            where: { userid: donorUserId },
            select: { name: true },
        });
        const donorName = donorUser?.name || "A voluntary donor";

        if (response === "ACCEPTED") {
            // Notify requester
            await NotificationSmsDispatcher.dispatchRequesterDonorVolunteered({
                requesterUserId: request.createdbyuserid,
                requestId,
            }).catch(() => {});

            // Notify assigned hospital if exists
            if (request.hospitals?.userid && request.hospitals.userid !== request.createdbyuserid) {
                await NotificationSmsDispatcher.dispatchHospitalDonorMatched({
                    hospitalUserId: request.hospitals.userid,
                    requestId,
                    donorName,
                    eta: eta || "Immediate (1-2 hours)",
                }).catch(() => {});
            }
        } else if (response === "DECLINED") {
            // Notify requester or coordinator that donor declined, matching continues
            const tokenRes = await ActionTokenService.createActionToken({
                userId: request.createdbyuserid,
                purpose: "REQUEST_TRACKING",
                targetId: requestId,
                redirectUrl: `/requester/requests/${requestId}`,
                expiresInHours: 24,
            });

            const requesterUser = await prisma.users.findUnique({
                where: { userid: request.createdbyuserid },
                select: { phonenumber: true },
            });

            if (requesterUser?.phonenumber) {
                await SmsService.queueSms({
                    to: requesterUser.phonenumber,
                    template: "REQUESTER_STATUS_UPDATE",
                    variables: {
                        requestId: requestId.slice(0, 8).toUpperCase(),
                        statusText: "Matching in progress (donor declined)",
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: request.createdbyuserid,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey: `SMS:DONOR_DECLINED:${requestId}:${donorUserId}`,
                }).catch(() => {});
            }
        }
    } catch (err) {
        console.error("[BloodRequestEvents] Error in onDonorResponded:", err);
    }
}

/**
 * 3. Handler: Status Changed (Fulfilled, Cancelled, Hospital Accepted, Blood Arranged)
 */
async function onBloodRequestStatusChanged(event: BloodRequestStatusChangedEvent) {
    try {
        const { requestId, newStatus, changedByUserId, remarks } = event;

        const request = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            include: { hospitals: true },
        });

        if (!request) return;

        const facilityName = request.hospitals?.hospitalname || "Care Facility";

        // A. Request Fulfilled / Completed
        if (newStatus === "FULFILLED" || newStatus === "BLOOD_ARRANGED") {
            // Notify Requester
            const tokenRes = await ActionTokenService.createActionToken({
                userId: request.createdbyuserid,
                purpose: "REQUEST_TRACKING",
                targetId: requestId,
                redirectUrl: `/requester/requests/${requestId}`,
                expiresInHours: 24,
            });

            const requesterUser = await prisma.users.findUnique({
                where: { userid: request.createdbyuserid },
                select: { phonenumber: true },
            });

            if (requesterUser?.phonenumber) {
                await SmsService.queueSms({
                    to: requesterUser.phonenumber,
                    template: "REQUESTER_COMPLETED",
                    variables: {
                        requestId: requestId.slice(0, 8).toUpperCase(),
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: request.createdbyuserid,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey: `SMS:REQ_FULFILLED:${requestId}:${request.createdbyuserid}`,
                }).catch(() => {});
            }

            // Notify accepted volunteer donors
            const acceptedDeliveries = await prisma.broadcastdeliveries.findMany({
                where: {
                    requestid: requestId,
                    response: "ACCEPTED",
                },
                select: { donoruserid: true },
            });

            for (const d of acceptedDeliveries) {
                if (d.donoruserid) {
                    await NotificationSmsDispatcher.dispatchDonorReceiptConfirmed({
                        donorUserId: d.donoruserid,
                        requestId,
                        bloodGroup: request.bloodgroup,
                        facilityName,
                    }).catch(() => {});
                }
            }
        }

        // B. Request Cancelled
        if (newStatus === "CANCELLED" || newStatus === "CLOSED") {
            // Notify Requester if changed by hospital or admin
            if (request.createdbyuserid !== changedByUserId) {
                await NotificationSmsDispatcher.dispatchRequesterStatusUpdate({
                    requesterUserId: request.createdbyuserid,
                    requestId,
                    statusText: "CANCELLED",
                    reason: remarks || "Requisition closed by medical coordinator",
                }).catch(() => {});
            }

            // Notify volunteered donors
            const volunteerDeliveries = await prisma.broadcastdeliveries.findMany({
                where: {
                    requestid: requestId,
                    response: "ACCEPTED",
                },
                select: { donoruserid: true },
            });

            for (const d of volunteerDeliveries) {
                if (d.donoruserid) {
                    const donorUser = await prisma.users.findUnique({
                        where: { userid: d.donoruserid },
                        select: { phonenumber: true },
                    });
                    if (donorUser?.phonenumber) {
                        await SmsService.queueSms({
                            to: donorUser.phonenumber,
                            template: "DONOR_REQUEST_CANCELLED",
                            variables: {
                                bloodGroup: request.bloodgroup,
                                facilityName,
                            },
                            userId: d.donoruserid,
                            idempotencyKey: `SMS:REQ_CANCELLED:${requestId}:${d.donoruserid}`,
                        }).catch(() => {});
                    }
                }
            }
        }
    } catch (err) {
        console.error("[BloodRequestEvents] Error in onBloodRequestStatusChanged:", err);
    }
}

/**
 * 4. Handler: Blood Bank Confirms Availability
 */
async function onBloodBankAssignmentResponded(event: BloodBankAssignmentRespondedEvent) {
    try {
        const { requestId, bloodBankId, action } = event;

        if (action !== "ACCEPT") return;

        const [request, bloodBank] = await Promise.all([
            prisma.bloodrequests.findUnique({
                where: { requestid: requestId },
                include: { hospitals: true },
            }),
            prisma.bloodbanks.findUnique({
                where: { bloodbankid: bloodBankId },
                select: { bloodbankname: true, city: true },
            }),
        ]);

        if (!request || !bloodBank) return;

        const bbName = bloodBank.bloodbankname || "Blood Bank Facility";

        // Notify Hospital (if assigned)
        if (request.hospitals?.userid) {
            const hospUser = await prisma.users.findUnique({
                where: { userid: request.hospitals.userid },
                select: { phonenumber: true },
            });
            if (hospUser?.phonenumber) {
                const tokenRes = await ActionTokenService.createActionToken({
                    userId: request.hospitals.userid,
                    purpose: "HOSPITAL_REVIEW",
                    targetId: requestId,
                    redirectUrl: `/hospital/requests/${requestId}`,
                    expiresInHours: 24,
                });

                await SmsService.queueSms({
                    to: hospUser.phonenumber,
                    template: "REQUESTER_BLOOD_ARRANGED",
                    variables: {
                        requestId: requestId.slice(0, 8).toUpperCase(),
                        facilityName: bbName,
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: request.hospitals.userid,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey: `SMS:BB_CONFIRMED_HOSP:${requestId}:${bloodBankId}`,
                }).catch(() => {});
            }
        }

        // Notify Requester
        const requesterUser = await prisma.users.findUnique({
            where: { userid: request.createdbyuserid },
            select: { phonenumber: true },
        });
        if (requesterUser?.phonenumber) {
            const tokenRes = await ActionTokenService.createActionToken({
                userId: request.createdbyuserid,
                purpose: "REQUEST_TRACKING",
                targetId: requestId,
                redirectUrl: `/requester/requests/${requestId}`,
                expiresInHours: 24,
            });

            await SmsService.queueSms({
                to: requesterUser.phonenumber,
                template: "REQUESTER_BLOOD_ARRANGED",
                variables: {
                    requestId: requestId.slice(0, 8).toUpperCase(),
                    facilityName: bbName,
                    actionUrl: tokenRes.actionUrl,
                },
                userId: request.createdbyuserid,
                actionUrl: tokenRes.actionUrl,
                idempotencyKey: `SMS:BB_CONFIRMED_REQ:${requestId}:${bloodBankId}`,
            }).catch(() => {});
        }
    } catch (err) {
        console.error("[BloodRequestEvents] Error in onBloodBankAssignmentResponded:", err);
    }
}

// Register internal subscribers
bloodRequestEventEmitter.on(EVENTS.REQUEST_CREATED, onBloodRequestCreated);
bloodRequestEventEmitter.on(EVENTS.DONOR_RESPONDED, onDonorResponded);
bloodRequestEventEmitter.on(EVENTS.STATUS_CHANGED, onBloodRequestStatusChanged);
bloodRequestEventEmitter.on(EVENTS.BLOOD_BANK_RESPONDED, onBloodBankAssignmentResponded);

console.log("[BloodRequestEvents] Subscribers initialized and active.");
