/**
 * Swastya Custom SMS Service
 * Role-based authorized custom SMS composition, permitted recipient resolution,
 * anti-abuse/privacy content validation, rate limiting, and outbox integration.
 */

import { prisma } from "../../config/prisma";
import { SmsService, smsEventEmitter, SMS_ENQUEUED_EVENT } from "./sms.service";
import { TwilioProvider } from "./twilio.provider";
import { ActionTokenService } from "./actionToken.service";

export interface PermittedRecipient {
    userId: string;
    displayName: string;
    role: "DONOR" | "REQUESTER" | "HOSPITAL" | "BLOOD_BANK";
    maskedPhone: string;
    relationshipContext: string;
    targetRequestId?: string;
    bloodGroup?: string;
}

export interface CustomSmsSendRequest {
    senderUserId: string;
    senderRole: string;
    recipientUserId: string;
    messageText: string;
    contextRequestId?: string;
    actionUrl?: string;
    idempotencyKey?: string;
}

export interface CustomSmsSendResult {
    success: boolean;
    outboxId: string;
    status: string;
    recipientName: string;
    characterCount: number;
    segmentEstimate: number;
    createdAt: Date;
}

// In-memory rate limiting tracker (max 20 messages per 10 minutes per sender)
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_MESSAGES_PER_WINDOW = 20;
const senderRateLimits = new Map<string, number[]>();

export class CustomSmsService {
    // GSM 7-bit Basic Character Set (1 septet)
    private static readonly GSM_BASIC_SET = new Set(
        "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
    );

    // GSM 7-bit Extended Character Set (2 septets: Escape 0x1B + Character)
    private static readonly GSM_EXTENDED_SET = new Set([
        "|", "^", "€", "{", "}", "[", "~", "]", "\\"
    ]);

    /**
     * Mask phone number for privacy display (e.g. +91 98*****210)
     */
    public static maskPhoneNumber(phone?: string | null): string {
        if (!phone || phone.length < 7) return "+91 ******";
        const clean = phone.trim();
        const start = clean.slice(0, 5);
        const end = clean.slice(-3);
        return `${start}*****${end}`;
    }

    /**
     * Calculate SMS segments according to GSM 03.38 standard and UCS-2 Unicode fallback.
     * Accurately accounts for GSM Extended characters (|^€{}[]~\) which count as 2 septets.
     */
    public static calculateSegments(text: string): {
        characterCount: number;
        septetCount: number;
        segmentCount: number;
        isUnicode: boolean;
        extendedCharCount: number;
    } {
        const characters = Array.from(text);
        const characterCount = characters.length;
        let isUnicode = false;
        let extendedCharCount = 0;
        let septetCount = 0;

        for (const char of characters) {
            if (this.GSM_BASIC_SET.has(char)) {
                septetCount += 1;
            } else if (this.GSM_EXTENDED_SET.has(char)) {
                septetCount += 2;
                extendedCharCount += 1;
            } else {
                isUnicode = true;
                break;
            }
        }

        let segmentCount = 1;
        if (isUnicode) {
            segmentCount = characterCount <= 70 ? 1 : Math.ceil(characterCount / 67);
            return { characterCount, septetCount: characterCount, segmentCount, isUnicode: true, extendedCharCount: 0 };
        } else {
            segmentCount = septetCount <= 160 ? 1 : Math.ceil(septetCount / 153);
            return { characterCount, septetCount, segmentCount, isUnicode: false, extendedCharCount };
        }
    }

    /**
     * Validate custom message content for safety, medical privacy, and anti-spoofing
     */
    public static validateContent(message: string): { valid: boolean; error?: string } {
        if (!message || typeof message !== "string") {
            return { valid: false, error: "Message content is required." };
        }

        const trimmed = message.trim();
        if (trimmed.length < 5) {
            return { valid: false, error: "Message is too short. Minimum 5 characters required." };
        }
        if (trimmed.length > 320) {
            return { valid: false, error: "Message exceeds maximum permitted length of 320 characters (2 segments)." };
        }

        // Medical privacy safeguard: disallow disclosure of confidential medical diagnoses in SMS
        const medicalKeywords = /\b(cancer|hiv|aids|tested positive|biopsy|malignant|hepatitis|chronic kidney|terminal condition|std|sti)\b/i;
        if (medicalKeywords.test(trimmed)) {
            return {
                valid: false,
                error: "Message rejected: SMS must not include confidential medical diagnoses or disease disclosures.",
            };
        }

        // Impersonation & phishing safeguard: prevent spoofing security OTPs or bank info
        const securityImpersonation = /\b(otp is|verification code is|one time password|password reset link|bank account|cvv)\b/i;
        if (securityImpersonation.test(trimmed)) {
            return {
                valid: false,
                error: "Message rejected: Messages mimicking system security verification codes or financial requests are prohibited.",
            };
        }

        return { valid: true };
    }

    /**
     * Enforce sender rate limits with in-memory fast tracker
     */
    public static checkRateLimit(senderUserId: string): { allowed: boolean; retryAfterSeconds?: number } {
        const now = Date.now();
        const timestamps = senderRateLimits.get(senderUserId) || [];
        const recentTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

        if (recentTimestamps.length >= MAX_MESSAGES_PER_WINDOW) {
            const oldest = recentTimestamps[0];
            const retryAfterSeconds = Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000);
            return { allowed: false, retryAfterSeconds };
        }

        recentTimestamps.push(now);
        senderRateLimits.set(senderUserId, recentTimestamps);
        return { allowed: true };
    }

    /**
     * Enforce sender rate limits with multi-instance shared database persistence
     */
    public static async checkRateLimitPersistent(senderUserId: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
        const memCheck = this.checkRateLimit(senderUserId);
        if (!memCheck.allowed) {
            return memCheck;
        }

        try {
            const tenMinutesAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
            const recentCount = await prisma.smsoutbox.count({
                where: {
                    templatename: "CUSTOM_COMMUNICATION",
                    createdat: { gte: tenMinutesAgo },
                    payload: {
                        path: ["senderUserId"],
                        equals: senderUserId,
                    },
                },
            });

            if (recentCount >= MAX_MESSAGES_PER_WINDOW) {
                return { allowed: false, retryAfterSeconds: 60 };
            }
        } catch {
            // Graceful fallback to memory check
        }

        return { allowed: true };
    }

    /**
     * Reset rate limit (primarily for testing)
     */
    public static resetRateLimits(): void {
        senderRateLimits.clear();
    }

    /**
     * Retrieve permitted recipients for a given sender role & user ID
     */
    public static async getPermittedRecipients(
        senderUserId: string,
        senderRole: string
    ): Promise<PermittedRecipient[]> {
        const recipients: PermittedRecipient[] = [];

        if (senderRole === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({
                where: { userid: senderUserId },
            });
            if (!hospital) return [];

            // 1. Find all blood requests assigned or created by this hospital
            const requests = await prisma.bloodrequests.findMany({
                where: { hospitalid: hospital.hospitalid },
                select: {
                    requestid: true,
                    createdbyuserid: true,
                    requesterid: true,
                    bloodgroup: true,
                    urgencylevel: true,
                },
                take: 100,
            });

            const requestIds = requests.map(r => r.requestid);
            const createdByUserIds = Array.from(new Set(requests.map(r => r.createdbyuserid).filter(uid => uid !== senderUserId)));

            // 2. Permitted Volunteer Donors who responded to these hospital requests
            if (requestIds.length > 0) {
                const commitments = await prisma.broadcastdeliveries.findMany({
                    where: {
                        requestid: { in: requestIds },
                        response: "ACCEPTED",
                    },
                    include: {
                        donors: {
                            select: {
                                donorid: true,
                                bloodgroup: true,
                                city: true,
                                users: { select: { userid: true, name: true, phonenumber: true, isactive: true } },
                            },
                        },
                    },
                    take: 100,
                });

                for (const c of commitments) {
                    if (c.donors?.users && c.donors.users.isactive && c.donors.users.phonenumber) {
                        recipients.push({
                            userId: c.donors.users.userid,
                            displayName: `${c.donors.users.name || "Volunteer Donor"} (${c.donors.bloodgroup})`,
                            role: "DONOR",
                            maskedPhone: this.maskPhoneNumber(c.donors.users.phonenumber),
                            relationshipContext: `Volunteered for Requisition #${c.requestid.slice(0, 8)}`,
                            targetRequestId: c.requestid,
                            bloodGroup: c.donors.bloodgroup,
                        });
                    }
                }
            }

            // 3. Permitted Requesters for these hospital requests
            if (createdByUserIds.length > 0) {
                const requesterUsers = await prisma.users.findMany({
                    where: {
                        userid: { in: createdByUserIds },
                        isactive: true,
                    },
                    select: {
                        userid: true,
                        name: true,
                        phonenumber: true,
                        role: true,
                    },
                });

                for (const ru of requesterUsers) {
                    const reqObj = requests.find(r => r.createdbyuserid === ru.userid);
                    recipients.push({
                        userId: ru.userid,
                        displayName: `${ru.name || "Patient Requester"} (Req #${reqObj?.requestid.slice(0, 8) || "Active"})`,
                        role: "REQUESTER",
                        maskedPhone: this.maskPhoneNumber(ru.phonenumber),
                        relationshipContext: `Requester for managed blood requisition`,
                        targetRequestId: reqObj?.requestid,
                        bloodGroup: reqObj?.bloodgroup,
                    });
                }
            }

            // 4. Authorized Blood Banks (requisition assignments, reservations, or local operational coordination)
            const assignedBBs = await prisma.requisitionassignments.findMany({
                where: {
                    bloodrequests: { hospitalid: hospital.hospitalid },
                },
                include: {
                    bloodbanks: {
                        select: {
                            bloodbankid: true,
                            bloodbankname: true,
                            city: true,
                            users: { select: { userid: true, name: true, phonenumber: true, isactive: true } },
                        },
                    },
                    bloodrequests: { select: { requestid: true, bloodgroup: true } },
                },
                take: 50,
            });

            for (const a of assignedBBs) {
                const bbUser = a.bloodbanks?.users;
                if (bbUser && bbUser.isactive && bbUser.phonenumber) {
                    recipients.push({
                        userId: bbUser.userid,
                        displayName: `${a.bloodbanks.bloodbankname || "Blood Bank"} (Blood Bank)`,
                        role: "BLOOD_BANK",
                        maskedPhone: this.maskPhoneNumber(bbUser.phonenumber),
                        relationshipContext: `Requisition assignment #${a.bloodrequests?.requestid.slice(0, 8) || "Active"}`,
                        targetRequestId: a.bloodrequests?.requestid,
                        bloodGroup: a.bloodrequests?.bloodgroup,
                    });
                }
            }

            // Also include local approved blood banks in same city for supply coordination
            if (hospital.city) {
                const localBBs = await prisma.bloodbanks.findMany({
                    where: {
                        city: { equals: hospital.city, mode: "insensitive" },
                        approvalstatus: "APPROVED",
                        users: { isactive: true },
                    },
                    select: {
                        bloodbankid: true,
                        bloodbankname: true,
                        city: true,
                        users: { select: { userid: true, name: true, phonenumber: true, isactive: true } },
                    },
                    take: 20,
                });

                for (const bb of localBBs) {
                    if (bb.users && bb.users.isactive && bb.users.phonenumber) {
                        recipients.push({
                            userId: bb.users.userid,
                            displayName: `${bb.bloodbankname || "Blood Bank"} (Blood Bank)`,
                            role: "BLOOD_BANK",
                            maskedPhone: this.maskPhoneNumber(bb.users.phonenumber),
                            relationshipContext: `Regional blood center (${bb.city || hospital.city})`,
                        });
                    }
                }
            }

            // 5. Permitted Donors from Hospital Donor Registry (added via Donor Registry page)
            const hospitalRegistryDonors = await prisma.hospitaldonors.findMany({
                where: {
                    hospitalid: hospital.hospitalid,
                    status: "ACTIVE",
                },
                include: {
                    donors: {
                        select: {
                            donorid: true,
                            bloodgroup: true,
                            city: true,
                            users: {
                                select: {
                                    userid: true,
                                    name: true,
                                    phonenumber: true,
                                    isactive: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { createdat: "desc" },
                take: 200,
            });

            for (const hd of hospitalRegistryDonors) {
                const u = hd.donors?.users;
                if (u && u.phonenumber) {
                    recipients.push({
                        userId: u.userid,
                        displayName: `${u.name || "Registry Donor"} (${hd.donors.bloodgroup})`,
                        role: "DONOR",
                        maskedPhone: this.maskPhoneNumber(u.phonenumber),
                        relationshipContext: "Hospital Donor Registry",
                        bloodGroup: hd.donors.bloodgroup,
                    });
                }
            }

            // Deduplicate by userId
            const seenHospitalRecipients = new Set<string>();
            return recipients.filter(r => {
                if (seenHospitalRecipients.has(r.userId)) return false;
                seenHospitalRecipients.add(r.userId);
                return true;
            });
        }

        if (senderRole === "BLOOD_BANK") {
            const bloodBank = await prisma.bloodbanks.findUnique({
                where: { userid: senderUserId },
            });
            if (!bloodBank) return [];

            // 1. Hospitals with requisition assignments or blood reservations
            const assignments = await prisma.requisitionassignments.findMany({
                where: { bloodbankid: bloodBank.bloodbankid },
                select: {
                    requestid: true,
                    bloodrequests: {
                        select: {
                            requestid: true,
                            bloodgroup: true,
                            hospitals: {
                                select: {
                                    hospitalid: true,
                                    hospitalname: true,
                                    users: { select: { userid: true, name: true, phonenumber: true, isactive: true } },
                                },
                            },
                        },
                    },
                },
                take: 100,
            });

            for (const a of assignments) {
                const hospUser = a.bloodrequests?.hospitals?.users;
                if (hospUser && hospUser.isactive && hospUser.phonenumber) {
                    recipients.push({
                        userId: hospUser.userid,
                        displayName: `${a.bloodrequests?.hospitals?.hospitalname || "Hospital Facility"} (Staff)`,
                        role: "HOSPITAL",
                        maskedPhone: this.maskPhoneNumber(hospUser.phonenumber),
                        relationshipContext: `Assigned blood requisition #${a.requestid.slice(0, 8)}`,
                        targetRequestId: a.requestid,
                        bloodGroup: a.bloodrequests?.bloodgroup,
                    });
                }
            }

            // 2. Donors who have donation history with this blood bank
            const pastDonations = await prisma.donationhistory.findMany({
                where: { bloodbankid: bloodBank.bloodbankid },
                include: {
                    donors: {
                        select: {
                            donorid: true,
                            bloodgroup: true,
                            users: { select: { userid: true, name: true, phonenumber: true, isactive: true } },
                        },
                    },
                },
                take: 50,
            });

            for (const d of pastDonations) {
                if (d.donors?.users && d.donors.users.isactive && d.donors.users.phonenumber) {
                    recipients.push({
                        userId: d.donors.users.userid,
                        displayName: `${d.donors.users.name || "Blood Donor"} (${d.donors.bloodgroup})`,
                        role: "DONOR",
                        maskedPhone: this.maskPhoneNumber(d.donors.users.phonenumber),
                        relationshipContext: `Registered donor at facility`,
                        bloodGroup: d.donors.bloodgroup,
                    });
                }
            }

            // 3. Authorized Hospitals with blood unit reservations or local city coordination
            const reservations = await prisma.bloodreservations.findMany({
                where: { bloodbankid: bloodBank.bloodbankid },
                include: {
                    bloodrequests: {
                        include: {
                            hospitals: {
                                select: {
                                    hospitalid: true,
                                    hospitalname: true,
                                    city: true,
                                    users: { select: { userid: true, name: true, phonenumber: true, isactive: true } },
                                },
                            },
                        },
                    },
                },
                take: 50,
            });

            for (const r of reservations) {
                const hospUser = r.bloodrequests?.hospitals?.users;
                if (hospUser && hospUser.isactive && hospUser.phonenumber) {
                    recipients.push({
                        userId: hospUser.userid,
                        displayName: `${r.bloodrequests?.hospitals?.hospitalname || "Hospital Facility"} (Hospital Staff)`,
                        role: "HOSPITAL",
                        maskedPhone: this.maskPhoneNumber(hospUser.phonenumber),
                        relationshipContext: `Blood unit reservation for Req #${r.requestid.slice(0, 8)}`,
                        targetRequestId: r.requestid,
                        bloodGroup: r.bloodrequests?.bloodgroup,
                    });
                }
            }

            // Also include local approved hospitals in same city for inventory coordination
            if (bloodBank.city) {
                const localHosps = await prisma.hospitals.findMany({
                    where: {
                        city: { equals: bloodBank.city, mode: "insensitive" },
                        approvalstatus: "APPROVED",
                        users: { isactive: true },
                    },
                    select: {
                        hospitalid: true,
                        hospitalname: true,
                        city: true,
                        users: { select: { userid: true, name: true, phonenumber: true, isactive: true } },
                    },
                    take: 20,
                });

                for (const h of localHosps) {
                    if (h.users && h.users.isactive && h.users.phonenumber) {
                        recipients.push({
                            userId: h.users.userid,
                            displayName: `${h.hospitalname || "Hospital Facility"} (Hospital Staff)`,
                            role: "HOSPITAL",
                            maskedPhone: this.maskPhoneNumber(h.users.phonenumber),
                            relationshipContext: `Regional care facility (${h.city || bloodBank.city})`,
                        });
                    }
                }
            }

            // Deduplicate by userId
            const seenBloodBankRecipients = new Set<string>();
            return recipients.filter(r => {
                if (seenBloodBankRecipients.has(r.userId)) return false;
                seenBloodBankRecipients.add(r.userId);
                return true;
            });
        }

        if (senderRole === "ADMIN") {
            // Admins can message any active user within administrative scope
            const activeUsers = await prisma.users.findMany({
                where: { isactive: true, userid: { not: senderUserId } },
                select: {
                    userid: true,
                    name: true,
                    phonenumber: true,
                    role: true,
                },
                take: 100,
            });

            return activeUsers.map(u => ({
                userId: u.userid,
                displayName: `${u.name || "User"} (${u.role})`,
                role: u.role as any,
                maskedPhone: this.maskPhoneNumber(u.phonenumber),
                relationshipContext: "System Administration",
            }));
        }

        // Donors and Requesters do not have unrestricted custom SMS permissions
        return [];
    }

    /**
     * Send an authorized custom SMS through the transactional outbox
     */
    public static async sendCustomSms(req: CustomSmsSendRequest): Promise<CustomSmsSendResult> {
        // 1. RBAC check: only HOSPITAL, BLOOD_BANK, and ADMIN are permitted
        if (req.senderRole !== "HOSPITAL" && req.senderRole !== "BLOOD_BANK" && req.senderRole !== "ADMIN") {
            throw {
                statusCode: 403,
                code: "FORBIDDEN_ROLE",
                message: "Your role does not have authorization to compose custom SMS messages.",
            };
        }

        // 2. Rate limiting check (distributed shared persistence)
        const rateCheck = await this.checkRateLimitPersistent(req.senderUserId);
        if (!rateCheck.allowed) {
            throw {
                statusCode: 429,
                code: "RATE_LIMIT_EXCEEDED",
                message: `SMS sending rate limit exceeded. Please wait ${rateCheck.retryAfterSeconds} seconds before sending another message.`,
            };
        }

        // 3. Content safety check
        const contentValidation = this.validateContent(req.messageText);
        if (!contentValidation.valid) {
            throw {
                statusCode: 400,
                code: "INVALID_CONTENT",
                message: contentValidation.error,
            };
        }

        // 4. Resolve sender facility name
        let senderName = "Swastya Team";
        if (req.senderRole === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({
                where: { userid: req.senderUserId },
                select: { hospitalname: true },
            });
            if (hosp) senderName = hosp.hospitalname;
        } else if (req.senderRole === "BLOOD_BANK") {
            const bb = await prisma.bloodbanks.findUnique({
                where: { userid: req.senderUserId },
                select: { bloodbankname: true },
            });
            if (bb) senderName = bb.bloodbankname;
        } else if (req.senderRole === "ADMIN") {
            senderName = "Swastya Admin";
        }

        // 5. Verify recipient relationship authorization
        const permitted = await this.getPermittedRecipients(req.senderUserId, req.senderRole);
        const authorizedRecipient = permitted.find(p => p.userId === req.recipientUserId);

        if (!authorizedRecipient && req.senderRole !== "ADMIN") {
            throw {
                statusCode: 403,
                code: "RECIPIENT_NOT_PERMITTED",
                message: "Unauthorized recipient: You do not have an active operational relationship with this user.",
            };
        }

        // 6. Fetch recipient user details
        const recipientUser = await prisma.users.findUnique({
            where: { userid: req.recipientUserId },
            select: { userid: true, name: true, phonenumber: true, isactive: true, role: true },
        });

        const isRegistryDonor = authorizedRecipient?.relationshipContext === "Hospital Donor Registry";
        if (!recipientUser || (!recipientUser.isactive && !isRegistryDonor)) {
            throw {
                statusCode: 404,
                code: "RECIPIENT_NOT_FOUND",
                message: "Target recipient does not exist or has been deactivated.",
            };
        }

        const normalizedPhone = recipientUser.phonenumber ? TwilioProvider.normalizeE164(recipientUser.phonenumber) : null;
        if (!normalizedPhone) {
            throw {
                statusCode: 400,
                code: "INVALID_PHONE_NUMBER",
                message: "Recipient does not have a valid telephone number registered.",
            };
        }

        // 7. Sanitize actionUrl if provided
        let safeActionUrl: string | undefined = undefined;
        if (req.actionUrl) {
            safeActionUrl = ActionTokenService.sanitizeRedirectUrl(req.actionUrl);
        }

        // 8. Render formatted message body with Swastya sender attribution
        const sanitizedMsg = req.messageText.replace(/\r\n|\r|\n/g, " ").replace(/\s{2,}/g, " ").trim();
        let renderedBody = "";
        if (safeActionUrl && safeActionUrl !== "/") {
            renderedBody = `Swastya Message from ${senderName}: ${sanitizedMsg}. Details: ${ActionTokenService.getBaseUrl()}${safeActionUrl}`;
        } else {
            renderedBody = `Swastya Update from ${senderName}: ${sanitizedMsg}`;
        }

        const { characterCount, segmentCount } = this.calculateSegments(renderedBody);

        // 9. Check idempotency
        if (req.idempotencyKey) {
            const existing = await prisma.smsoutbox.findUnique({
                where: { idempotencykey: req.idempotencyKey },
            });
            if (existing) {
                return {
                    success: true,
                    outboxId: existing.outboxid,
                    status: existing.status,
                    recipientName: authorizedRecipient?.displayName || recipientUser.name || "Recipient",
                    characterCount: existing.messagebody.length,
                    segmentEstimate: this.calculateSegments(existing.messagebody).segmentCount,
                    createdAt: existing.createdat || new Date(),
                };
            }
        }

        // 10. Atomic insert with transaction-level serialization to prevent concurrent rate limit bypass
        const outboxRecord = await prisma.$transaction(async (tx) => {
            // Acquire transaction-scoped advisory lock on sender ID to serialize concurrent bursts
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.senderUserId}))`;

            const tenMinutesAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
            const recentCount = await tx.smsoutbox.count({
                where: {
                    templatename: "CUSTOM_COMMUNICATION",
                    createdat: { gte: tenMinutesAgo },
                    payload: {
                        path: ["senderUserId"],
                        equals: req.senderUserId,
                    },
                },
            });

            if (recentCount >= MAX_MESSAGES_PER_WINDOW) {
                throw {
                    statusCode: 429,
                    code: "RATE_LIMIT_EXCEEDED",
                    message: "SMS sending rate limit exceeded (maximum 20 messages per 10 minutes).",
                };
            }

            return await tx.smsoutbox.create({
                data: {
                    userid: req.recipientUserId,
                    phonenumber: normalizedPhone,
                    templatename: "CUSTOM_COMMUNICATION",
                    messagebody: renderedBody,
                    actionurl: safeActionUrl || null,
                    idempotencykey: req.idempotencyKey || null,
                    status: "PENDING",
                    attempts: 0,
                    maxattempts: 3,
                    nextattemptat: new Date(),
                    payload: {
                        isCustomSms: true,
                        senderUserId: req.senderUserId,
                        senderRole: req.senderRole,
                        senderName,
                        recipientUserId: req.recipientUserId,
                        recipientRole: recipientUser.role,
                        recipientDisplayName: authorizedRecipient?.displayName || recipientUser.name,
                        contextRequestId: req.contextRequestId || null,
                        customMessage: sanitizedMsg,
                        submittedAt: new Date().toISOString(),
                    },
                },
            });
        });

        // 11. Trigger in-memory background worker
        smsEventEmitter.emit(SMS_ENQUEUED_EVENT, outboxRecord.outboxid);

        return {
            success: true,
            outboxId: outboxRecord.outboxid,
            status: "PENDING",
            recipientName: authorizedRecipient?.displayName || recipientUser.name || "Recipient",
            characterCount,
            segmentEstimate: segmentCount,
            createdAt: outboxRecord.createdat || new Date(),
        };
    }

    /**
     * Get sender's custom SMS history
     */
    public static async getSenderHistory(
        senderUserId: string,
        senderRole: string,
        limit = 50
    ): Promise<Array<{
        outboxId: string;
        recipientName: string;
        recipientRole: string;
        maskedPhone: string;
        messageBody: string;
        status: string;
        createdAt: Date;
        dispatchConfirmedAt?: Date | null;
        errorCode?: string | null;
        attempts: number;
    }>> {
        const outboxItems = await prisma.smsoutbox.findMany({
            where: senderRole === "ADMIN" ? {
                templatename: "CUSTOM_COMMUNICATION",
            } : {
                templatename: "CUSTOM_COMMUNICATION",
                payload: {
                    path: ["senderUserId"],
                    equals: senderUserId,
                },
            },
            orderBy: { createdat: "desc" },
            take: limit,
        });

        return outboxItems.map(item => {
            const p = (item.payload as any) || {};
            return {
                outboxId: item.outboxid,
                recipientName: p.recipientDisplayName || "Recipient",
                recipientRole: p.recipientRole || "USER",
                maskedPhone: this.maskPhoneNumber(item.phonenumber),
                messageBody: item.messagebody,
                status: item.status,
                createdAt: item.createdat || new Date(),
                dispatchConfirmedAt: item.dispatchconfirmedat,
                errorCode: item.errorcode,
                attempts: item.attempts,
            };
        });
    }

    /**
     * Retry an eligible failed custom SMS
     */
    public static async retryCustomSms(
        outboxId: string,
        senderUserId: string,
        senderRole: string
    ): Promise<{ success: boolean; status: string }> {
        const item = await prisma.smsoutbox.findUnique({
            where: { outboxid: outboxId },
        });

        if (!item) {
            throw { statusCode: 404, message: "Custom SMS record not found." };
        }

        const payload = (item.payload as any) || {};
        if (payload.senderUserId !== senderUserId && senderRole !== "ADMIN") {
            throw { statusCode: 403, message: "Unauthorized to retry this message." };
        }

        if (item.status === "SENT") {
            throw { statusCode: 400, message: "Message was already delivered successfully." };
        }

        // Re-queue
        const updated = await prisma.smsoutbox.update({
            where: { outboxid: outboxId },
            data: {
                status: "PENDING",
                attempts: 0,
                nextattemptat: new Date(),
                lockeduntil: null,
                lockedby: null,
                errorcode: null,
                errormessage: null,
            },
        });

        smsEventEmitter.emit(SMS_ENQUEUED_EVENT, updated.outboxid);
        return { success: true, status: "PENDING" };
    }
}
