/**
 * Swastya: Centralized Notification-to-SMS Dispatcher
 * Bridges existing in-app notification events to the transactional SMS engine.
 * Ensures atomicity, patient privacy, idempotency, and failure isolation.
 */

import { prisma } from "../../config/prisma";
import { SmsService } from "./sms.service";
import { ActionTokenService } from "./actionToken.service";
import { SmsTemplateType } from "./sms.types";

export class NotificationSmsDispatcher {
    /**
     * Helper to lookup user phone number safely
     */
    private static async getUserPhone(
        userId: string,
        prismaTx?: any
    ): Promise<{ phone: string; name: string } | null> {
        try {
            const db = prismaTx || prisma;
            const user = await db.users.findUnique({
                where: { userid: userId },
                select: { phonenumber: true, name: true, isactive: true },
            });
            if (!user || !user.phonenumber || user.isactive === false) {
                return null;
            }
            return { phone: user.phonenumber, name: user.name };
        } catch (err) {
            console.warn(`[NotificationSmsDispatcher] Failed to fetch user ${userId} phone:`, err);
            return null;
        }
    }

    /**
     * 1. DONOR: Emergency Broadcast Match Alert
     * Triggered when emergency broadcast identifies an eligible matching donor.
     * Target: /donor/requests/:requestId/donate (Eligibility questionnaire)
     */
    public static async dispatchEmergencyBroadcastToDonor({
        donorUserId,
        requestId,
        bloodGroup,
        unitsRequired,
        hospitalName,
        prismaTx,
    }: {
        donorUserId: string;
        requestId: string;
        bloodGroup: string;
        unitsRequired: number;
        hospitalName: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(donorUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: donorUserId,
                purpose: "DONOR_PLEDGE",
                targetId: requestId,
                redirectUrl: `/donor/requests/${requestId}/donate`,
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:DONOR_MATCH:${requestId}:${donorUserId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "DONOR_EMERGENCY_MATCH",
                    variables: {
                        bloodGroup,
                        units: String(unitsRequired),
                        facilityName: hospitalName || "Care Facility",
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: donorUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching donor emergency match SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 1b. DONOR: Automated Match Alert for Standard Requisitions
     * Triggered when a new blood request is created and matches donor criteria.
     * Distinct from emergency broadcasts; adheres strictly to clinical matching gates.
     * Target: /donor/requests/:requestId/donate
     */
    public static async dispatchMatchedDonorAlert({
        donorUserId,
        requestId,
        bloodGroup,
        prismaTx,
    }: {
        donorUserId: string;
        requestId: string;
        bloodGroup?: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string; isDuplicate?: boolean }> {
        try {
            const user = await this.getUserPhone(donorUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: donorUserId,
                purpose: "DONOR_MATCH",
                targetId: requestId,
                redirectUrl: `/donor/requests/${requestId}/donate`,
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:MATCHED_DONOR:${requestId}:${donorUserId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "DONOR_REQUEST_MATCH",
                    variables: {
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: donorUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching matched donor alert SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 1c. HOSPITAL: Automated Alert to Relevant Facilities
     * Triggered when a new blood requisition matching geographic/clinical conditions is initiated.
     * Target: /hospital/requests/:requestId
     */
    public static async dispatchRelevantHospitalAlert({
        hospitalUserId,
        requestId,
        prismaTx,
    }: {
        hospitalUserId: string;
        requestId: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string; isDuplicate?: boolean }> {
        try {
            const user = await this.getUserPhone(hospitalUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: hospitalUserId,
                purpose: "HOSPITAL_REVIEW",
                targetId: requestId,
                redirectUrl: `/hospital/requests/${requestId}`,
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:MATCHED_HOSPITAL:${requestId}:${hospitalUserId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "HOSPITAL_MATCH_ALERT",
                    variables: {
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: hospitalUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching relevant hospital alert SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 1d. BLOOD_BANK: Automated Alert to Relevant Blood Banks
     * Triggered when a blood request is created and blood bank holds matching compatible stock.
     * Target: /bloodbank/requisitions
     */
    public static async dispatchRelevantBloodBankAlert({
        bloodBankUserId,
        requestId,
        prismaTx,
    }: {
        bloodBankUserId: string;
        requestId: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string; isDuplicate?: boolean }> {
        try {
            const user = await this.getUserPhone(bloodBankUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: bloodBankUserId,
                purpose: "BLOOD_BANK_CHECK",
                targetId: requestId,
                redirectUrl: `/bloodbank/requisitions`,
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:MATCHED_BLOOD_BANK:${requestId}:${bloodBankUserId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "BLOOD_BANK_MATCH_ALERT",
                    variables: {
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: bloodBankUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching relevant blood bank alert SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 2. DONOR: Volunteer Offer Accepted / Selected
     * Triggered when hospital or requester selects the donor volunteer.
     * Target: /donor/requests/:requestId/donate (Transit instructions & next steps)
     */
    public static async dispatchDonorOfferAccepted({
        donorUserId,
        requestId,
        facilityName,
        prismaTx,
    }: {
        donorUserId: string;
        requestId: string;
        facilityName: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(donorUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: donorUserId,
                purpose: "NEXT_STEPS",
                targetId: requestId,
                redirectUrl: `/donor/requests/${requestId}/donate`,
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:DONOR_ACCEPTED:${requestId}:${donorUserId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "DONOR_OFFER_ACCEPTED",
                    variables: {
                        facilityName: facilityName || "the care facility",
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: donorUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching donor offer accepted SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 2b. DONOR: Volunteer Offer Not Selected / Request Released
     * Informs volunteer donor that another donor was selected or request was fulfilled, releasing them from standby.
     */
    public static async dispatchDonorOfferNotSelected({
        donorUserId,
        requestId,
        bloodGroup,
        facilityName,
        prismaTx,
    }: {
        donorUserId: string;
        requestId: string;
        bloodGroup: string;
        facilityName: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(donorUserId, prismaTx);
            if (!user) return { queued: false };

            const idempotencyKey = `SMS:DONOR_NOT_SELECTED:${requestId}:${donorUserId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "DONOR_REQUEST_CANCELLED",
                    variables: {
                        bloodGroup: bloodGroup || "Blood",
                        facilityName: facilityName || "the care facility",
                    },
                    userId: donorUserId,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching donor not selected SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 3. DONOR: Blood Receipt Confirmed / Completed
     * Target: /donor/history
     */
    public static async dispatchDonorReceiptConfirmed({
        donorUserId,
        requestId,
        bloodGroup,
        facilityName,
        prismaTx,
    }: {
        donorUserId: string;
        requestId: string;
        bloodGroup: string;
        facilityName: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(donorUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: donorUserId,
                purpose: "VIEW_REQUEST",
                targetId: requestId,
                redirectUrl: "/donor/history",
                expiresInHours: 72,
                prismaTx,
            });

            const idempotencyKey = `SMS:DONOR_RECEIPT:${requestId}:${donorUserId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "DONOR_RECEIPT_CONFIRMED",
                    variables: {
                        bloodGroup: bloodGroup || "Blood",
                        facilityName: facilityName || "the care facility",
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: donorUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching donor receipt confirmed SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 4. REQUESTER: Blood Request Submission Confirmation
     * Target: /requester/requests/:requestId
     */
    public static async dispatchRequesterConfirmation({
        requesterUserId,
        requestId,
        bloodGroup,
        prismaTx,
    }: {
        requesterUserId: string;
        requestId: string;
        bloodGroup: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(requesterUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: requesterUserId,
                purpose: "REQUEST_TRACKING",
                targetId: requestId,
                redirectUrl: `/requester/requests/${requestId}`,
                expiresInHours: 72,
                prismaTx,
            });

            const idempotencyKey = `SMS:REQ_CONFIRMED:${requestId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "REQUESTER_CONFIRMATION",
                    variables: {
                        requestId: requestId.slice(0, 8).toUpperCase(),
                        bloodGroup: bloodGroup || "Blood",
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: requesterUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching requester confirmation SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 5. REQUESTER: Volunteer Donor Stepped Forward
     * Target: /requester/requests/:requestId
     */
    public static async dispatchRequesterDonorVolunteered({
        requesterUserId,
        requestId,
        prismaTx,
    }: {
        requesterUserId: string;
        requestId: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(requesterUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: requesterUserId,
                purpose: "REQUEST_TRACKING",
                targetId: requestId,
                redirectUrl: `/requester/requests/${requestId}`,
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:REQ_DONOR_VOLUNTEERED:${requestId}:${Date.now()}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "REQUESTER_DONOR_VOLUNTEERED",
                    variables: {
                        requestId: requestId.slice(0, 8).toUpperCase(),
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: requesterUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching requester donor volunteered SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 6. REQUESTER: Request Status Update / Completed / Cancelled
     */
    public static async dispatchRequesterStatusUpdate({
        requesterUserId,
        requestId,
        statusText,
        reason,
        prismaTx,
    }: {
        requesterUserId: string;
        requestId: string;
        statusText: string;
        reason?: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(requesterUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: requesterUserId,
                purpose: "REQUEST_TRACKING",
                targetId: requestId,
                redirectUrl: `/requester/requests/${requestId}`,
                expiresInHours: 48,
                prismaTx,
            });

            if (statusText === "CANCELLED") {
                const idempotencyKey = `SMS:REQ_CANCELLED:${requestId}`;
                return await SmsService.queueSms(
                    {
                        to: user.phone,
                        template: "REQUESTER_CANCELLED",
                        variables: {
                            requestId: requestId.slice(0, 8).toUpperCase(),
                            reason: reason || "Administrative update",
                        },
                        userId: requesterUserId,
                        idempotencyKey,
                    },
                    prismaTx
                );
            }

            if (statusText === "FULFILLED" || statusText === "COMPLETED") {
                const idempotencyKey = `SMS:REQ_COMPLETED:${requestId}`;
                return await SmsService.queueSms(
                    {
                        to: user.phone,
                        template: "REQUESTER_COMPLETED",
                        variables: {
                            requestId: requestId.slice(0, 8).toUpperCase(),
                            actionUrl: tokenRes.actionUrl,
                        },
                        userId: requesterUserId,
                        actionUrl: tokenRes.actionUrl,
                        idempotencyKey,
                    },
                    prismaTx
                );
            }

            const idempotencyKey = `SMS:REQ_STATUS:${requestId}:${statusText}`;
            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "REQUESTER_STATUS_UPDATE",
                    variables: {
                        requestId: requestId.slice(0, 8).toUpperCase(),
                        statusText,
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: requesterUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching requester status update SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 7. HOSPITAL: Requisition Assigned / Requires Review
     * Target: /hospital/requests/:requestId
     */
    public static async dispatchHospitalReqAssigned({
        hospitalUserId,
        requestId,
        bloodGroup,
        prismaTx,
    }: {
        hospitalUserId: string;
        requestId: string;
        bloodGroup: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(hospitalUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: hospitalUserId,
                purpose: "HOSPITAL_REVIEW",
                targetId: requestId,
                redirectUrl: `/hospital/requests/${requestId}`,
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:HOSP_ASSIGNED:${requestId}:${hospitalUserId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "HOSPITAL_REQ_ASSIGNED",
                    variables: {
                        requestId: requestId.slice(0, 8).toUpperCase(),
                        bloodGroup: bloodGroup || "Blood",
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: hospitalUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching hospital assignment SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 8. HOSPITAL: Volunteer Donor Matched
     * Target: /hospital/requests/:requestId
     */
    public static async dispatchHospitalDonorMatched({
        hospitalUserId,
        requestId,
        donorName,
        eta,
        prismaTx,
    }: {
        hospitalUserId: string;
        requestId: string;
        donorName: string;
        eta?: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(hospitalUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: hospitalUserId,
                purpose: "HOSPITAL_REVIEW",
                targetId: requestId,
                redirectUrl: `/hospital/requests/${requestId}`,
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:HOSP_DONOR_MATCH:${requestId}:${Date.now()}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "HOSPITAL_DONOR_MATCHED",
                    variables: {
                        requestId: requestId.slice(0, 8).toUpperCase(),
                        donorName: donorName || "Volunteer Donor",
                        eta: eta || "1-2 hours",
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: hospitalUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching hospital donor match SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 9. HOSPITAL: Units Dispatched to Facility
     * Target: /hospital/receipt
     */
    public static async dispatchHospitalUnitsDispatched({
        hospitalUserId,
        requestId,
        bloodGroup,
        units,
        bloodBankName,
        prismaTx,
    }: {
        hospitalUserId: string;
        requestId: string;
        bloodGroup: string;
        units: number;
        bloodBankName: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(hospitalUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: hospitalUserId,
                purpose: "VIEW_REQUEST",
                targetId: requestId,
                redirectUrl: "/hospital/receipt",
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:HOSP_DISPATCH:${requestId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "HOSPITAL_UNITS_DISPATCHED",
                    variables: {
                        units: String(units),
                        bloodGroup: bloodGroup || "Blood",
                        bloodBankName: bloodBankName || "Blood Bank",
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: hospitalUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching hospital dispatch alert SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 10. BLOOD BANK: Requisition Assigned for Stock Check
     * Target: /bloodbank/requisitions
     */
    public static async dispatchBloodBankReqAssigned({
        bloodBankUserId,
        requestId,
        bloodGroup,
        units,
        prismaTx,
    }: {
        bloodBankUserId: string;
        requestId: string;
        bloodGroup: string;
        units: number;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(bloodBankUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: bloodBankUserId,
                purpose: "BLOOD_BANK_CHECK",
                targetId: requestId,
                redirectUrl: "/bloodbank/requisitions",
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:BB_ASSIGNED:${requestId}:${bloodBankUserId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "BLOOD_BANK_REQ_ASSIGNED",
                    variables: {
                        requestId: requestId.slice(0, 8).toUpperCase(),
                        units: String(units),
                        bloodGroup: bloodGroup || "Blood",
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: bloodBankUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching blood bank assignment SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 11. BLOOD BANK: Reservation Confirmed
     * Target: /bloodbank/inventory
     */
    public static async dispatchBloodBankReservation({
        bloodBankUserId,
        requestId,
        bloodGroup,
        units,
        prismaTx,
    }: {
        bloodBankUserId: string;
        requestId: string;
        bloodGroup: string;
        units: number;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            const user = await this.getUserPhone(bloodBankUserId, prismaTx);
            if (!user) return { queued: false };

            const tokenRes = await ActionTokenService.createActionToken({
                userId: bloodBankUserId,
                purpose: "BLOOD_BANK_CHECK",
                targetId: requestId,
                redirectUrl: "/bloodbank/inventory",
                expiresInHours: 24,
                prismaTx,
            });

            const idempotencyKey = `SMS:BB_RESERVED:${requestId}:${bloodBankUserId}`;

            return await SmsService.queueSms(
                {
                    to: user.phone,
                    template: "BLOOD_BANK_RESERVATION",
                    variables: {
                        requestId: requestId.slice(0, 8).toUpperCase(),
                        units: String(units),
                        bloodGroup: bloodGroup || "Blood",
                        actionUrl: tokenRes.actionUrl,
                    },
                    userId: bloodBankUserId,
                    actionUrl: tokenRes.actionUrl,
                    idempotencyKey,
                },
                prismaTx
            );
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Error dispatching blood bank reservation SMS:", err);
            return { queued: false };
        }
    }

    /**
     * 12. Universal In-App Notification Hook
     * Fallback that maps relevant in-app notification events to their corresponding SMS workflows
     */
    public static async dispatchForNotification({
        notificationId,
        userId,
        requestId,
        title,
        message,
        prismaTx,
    }: {
        notificationId: string;
        userId: string;
        requestId?: string | null;
        title: string;
        message: string;
        prismaTx?: any;
    }): Promise<{ queued: boolean; outboxId?: string }> {
        try {
            // Avoid internal-only notifications or duplicate broad dispatches
            if (!userId || !title) return { queued: false };

            // Determine if notification title matches key actionable events
            if (title === "Your Donation Offer Was Accepted" && requestId) {
                return await this.dispatchDonorOfferAccepted({
                    donorUserId: userId,
                    requestId,
                    facilityName: "Care Facility",
                    prismaTx,
                });
            }

            if (title === "Blood Receipt Confirmed" && requestId) {
                return await this.dispatchDonorReceiptConfirmed({
                    donorUserId: userId,
                    requestId,
                    bloodGroup: "Blood",
                    facilityName: "Care Facility",
                    prismaTx,
                });
            }

            if (title === "New Blood Requisition Received" && requestId) {
                return await this.dispatchHospitalReqAssigned({
                    hospitalUserId: userId,
                    requestId,
                    bloodGroup: "Blood",
                    prismaTx,
                });
            }

            return { queued: false };
        } catch (err) {
            console.error("[NotificationSmsDispatcher] Universal dispatch error:", err);
            return { queued: false };
        }
    }
}
