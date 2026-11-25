import { prisma } from "../../config/prisma";
import {
    notification_type,
    camp_status,
    camp_registration_status,
    camp_attendance_status,
} from "../../generated/prisma/enums";

// Haversine formula distance computation
export function calculateHaversineDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371; // Earth radius in km

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function formatTime(val: Date | string | null | undefined): string {
    if (!val) return "";
    if (typeof val === "string") {
        const match = val.trim().match(/^([01]\d|2[0-3]):([0-5]\d)/);
        if (match) return `${match[1]}:${match[2]}`;
        const parsed = new Date(val);
        if (isNaN(parsed.getTime())) return val;
        val = parsed;
    }
    const h = String(val.getUTCHours()).padStart(2, "0");
    const m = String(val.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

export interface DonorPreferencesInput {
    nearbycamps?: boolean;
    campreminders?: boolean;
    campupdates?: boolean;
    campcancellations?: boolean;
    preferredcity?: string | null;
    preferredradiuskm?: number | null;
}

export interface CampReminderSummary {
    checkedCamps: number;
    sent24h: number;
    sent2h: number;
    remindersSent: number;
}

let reminderWorkerInterval: NodeJS.Timeout | null = null;
let isWorkerRunning = false;

export class CampNotificationService {
    /**
     * Helper to safely format camp date string in Indian locale.
     */
    private static formatCampDate(date: Date | string): string {
        const d = new Date(date);
        return d.toLocaleDateString("en-IN", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    /**
     * Resolves the start Date object of a camp using campdate and starttime.
     */
    public static getCampStartDateTime(campDate: Date | string, startTime: string | Date | null | undefined): Date {
        const cd = new Date(campDate);
        const timeStr = typeof startTime === "string" ? startTime : formatTime(startTime);
        const [h, m] = (timeStr || "09:00").split(":").map(Number);
        return new Date(Date.UTC(cd.getUTCFullYear(), cd.getUTCMonth(), cd.getUTCDate(), isNaN(h) ? 9 : h, isNaN(m) ? 0 : m, 0, 0));
    }

    /**
     * Retrieves or creates default notification preferences for an authenticated donor.
     */
    static async getDonorPreferences(donorUserId: string) {
        const donor = await prisma.donors.findUnique({
            where: { userid: donorUserId },
            include: { notificationpreferences: true },
        });

        if (!donor) {
            throw new Error("Donor profile required");
        }

        if (donor.notificationpreferences) {
            return {
                preferenceid: donor.notificationpreferences.preferenceid,
                nearbycamps: donor.notificationpreferences.nearbycamps,
                campreminders: donor.notificationpreferences.campreminders,
                campupdates: donor.notificationpreferences.campupdates,
                campcancellations: donor.notificationpreferences.campcancellations,
                preferredcity: donor.notificationpreferences.preferredcity || donor.city,
                preferredradiuskm: donor.notificationpreferences.preferredradiuskm || 25,
            };
        }

        // Return sensible defaults without requiring an explicit DB write until modified
        return {
            preferenceid: null,
            nearbycamps: true,
            campreminders: true,
            campupdates: true,
            campcancellations: true,
            preferredcity: donor.city,
            preferredradiuskm: 25,
        };
    }

    /**
     * Updates notification preferences for the authenticated donor with validation.
     */
    static async updateDonorPreferences(donorUserId: string, input: DonorPreferencesInput) {
        const donor = await prisma.donors.findUnique({
            where: { userid: donorUserId },
        });

        if (!donor) {
            throw new Error("Donor profile required");
        }

        // Input validation
        let radius = input.preferredradiuskm !== undefined && input.preferredradiuskm !== null
            ? Math.max(5, Math.min(200, Number(input.preferredradiuskm)))
            : 25;

        const city = input.preferredcity?.trim() || donor.city;

        const upserted = await prisma.donornotificationpreferences.upsert({
            where: { donorid: donor.donorid },
            create: {
                donorid: donor.donorid,
                nearbycamps: input.nearbycamps !== false,
                campreminders: input.campreminders !== false,
                campupdates: input.campupdates !== false,
                campcancellations: input.campcancellations !== false,
                preferredcity: city,
                preferredradiuskm: radius,
            },
            update: {
                nearbycamps: input.nearbycamps !== undefined ? input.nearbycamps : undefined,
                campreminders: input.campreminders !== undefined ? input.campreminders : undefined,
                campupdates: input.campupdates !== undefined ? input.campupdates : undefined,
                campcancellations: input.campcancellations !== undefined ? input.campcancellations : undefined,
                preferredcity: city,
                preferredradiuskm: radius,
                updatedat: new Date(),
            },
        });

        return {
            preferenceid: upserted.preferenceid,
            nearbycamps: upserted.nearbycamps,
            campreminders: upserted.campreminders,
            campupdates: upserted.campupdates,
            campcancellations: upserted.campcancellations,
            preferredcity: upserted.preferredcity,
            preferredradiuskm: upserted.preferredradiuskm,
        };
    }

    /**
     * Workflow A: Triggered when a blood bank publishes a camp.
     * Identifies nearby/matching donors based on location and in-app preferences.
     */
    static async notifyNearbyCampPublished(campId: string): Promise<number> {
        try {
            const camp = await prisma.donationcamps.findUnique({
                where: { campid: campId },
                include: { bloodbanks: true },
            });

            if (!camp || camp.status !== camp_status.PUBLISHED) {
                return 0;
            }

            // Find all active donors
            const donors = await prisma.donors.findMany({
                where: {
                    users: { isactive: true },
                },
                include: {
                    users: true,
                    notificationpreferences: true,
                },
            });

            const formattedDate = this.formatCampDate(camp.campdate);
            const campLat = camp.latitude ? Number(camp.latitude) : null;
            const campLng = camp.longitude ? Number(camp.longitude) : null;

            let notifiedCount = 0;

            for (const d of donors) {
                const prefs = d.notificationpreferences;
                // Check if donor opted out of nearby camp notifications
                if (prefs && prefs.nearbycamps === false) {
                    continue;
                }

                // Check location matching:
                const targetCity = (prefs?.preferredcity || d.city || "").trim().toLowerCase();
                const campCity = (camp.city || "").trim().toLowerCase();
                const targetRadius = prefs?.preferredradiuskm || 25;

                let isLocationMatch = false;

                // 1. Direct city equality
                if (targetCity && campCity && (targetCity === campCity || campCity.includes(targetCity) || targetCity.includes(campCity))) {
                    isLocationMatch = true;
                }

                // 2. Geolocation proximity if coordinates exist
                if (!isLocationMatch && campLat !== null && campLng !== null && d.latitude !== null && d.longitude !== null) {
                    const dist = calculateHaversineDistanceKm(
                        Number(d.latitude),
                        Number(d.longitude),
                        campLat,
                        campLng
                    );
                    if (dist <= targetRadius) {
                        isLocationMatch = true;
                    }
                }

                if (isLocationMatch) {
                    const idempotencyKey = `CAMP_PUB:${camp.campid}:${d.users.userid}`;

                    try {
                        await prisma.notification.create({
                            data: {
                                userid: d.users.userid,
                                type: notification_type.CAMP,
                                title: `New Blood Donation Camp: ${camp.campname}`,
                                message: `A voluntary blood donation camp has been scheduled on ${formattedDate} (${camp.starttime} - ${camp.endtime}) at ${camp.venuename}, ${camp.city}. Click to view details and register.`,
                                isread: false,
                                campid: camp.campid,
                                actionurl: `/donor/camps/${camp.campid}`,
                                idempotencykey: idempotencyKey,
                            },
                        });
                        notifiedCount++;
                    } catch (err: any) {
                        // Unique constraint violation (P2002) or foreign key if camp deleted (P2003)
                        if (err?.code === "P2002" || err?.code === "P2003") {
                            continue;
                        }
                        console.warn(`[CampNotification] Failed to send publication alert to user ${d.users.userid}:`, err?.message);
                    }
                }
            }

            return notifiedCount;
        } catch (err: any) {
            console.error("[CampNotification] notifyNearbyCampPublished encountered error:", err?.message);
            return 0;
        }
    }

    /**
     * Workflow B: Triggered upon successful donor camp registration.
     */
    static async notifyRegistrationConfirmed(registrationId: string) {
        try {
            const reg = await prisma.campregistrations.findUnique({
                where: { registrationid: registrationId },
                include: {
                    camp: true,
                    donor: { include: { users: true } },
                },
            });

            if (!reg || reg.registrationstatus !== camp_registration_status.REGISTERED) {
                return null;
            }

            const formattedDate = this.formatCampDate(reg.camp.campdate);
            const idempotencyKey = `CAMP_REG_CONFIRM:${reg.registrationreference}`;

            const notification = await prisma.notification.upsert({
                where: { idempotencykey: idempotencyKey },
                create: {
                    userid: reg.donor.users.userid,
                    type: notification_type.CAMP,
                    title: "Camp Registration Confirmed",
                    message: `Your registration for "${reg.camp.campname}" on ${formattedDate} (${reg.camp.starttime} - ${reg.camp.endtime}) at ${reg.camp.venuename} is confirmed. Registration Reference: ${reg.registrationreference}. Please bring valid government photo ID to the venue.`,
                    isread: false,
                    campid: reg.camp.campid,
                    registrationid: reg.registrationid,
                    actionurl: `/donor/my-camps`,
                    idempotencykey: idempotencyKey,
                },
                update: {},
            });

            return notification;
        } catch (err: any) {
            console.error("[CampNotification] notifyRegistrationConfirmed encountered error:", err?.message);
            return null;
        }
    }

    /**
     * Workflow D: Triggered when a blood bank updates important camp details.
     */
    static async notifyCampUpdated(campId: string, summaryOfChanges: string): Promise<number> {
        try {
            const camp = await prisma.donationcamps.findUnique({
                where: { campid: campId },
                include: {
                    registrations: {
                        where: { registrationstatus: camp_registration_status.REGISTERED },
                        include: {
                            donor: {
                                include: {
                                    users: true,
                                    notificationpreferences: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!camp || camp.registrations.length === 0) {
                return 0;
            }

            let count = 0;
            for (const reg of camp.registrations) {
                const prefs = reg.donor.notificationpreferences;
                if (prefs && prefs.campupdates === false) {
                    continue;
                }

                const idempotencyKey = `CAMP_UPDATE:${camp.campid}:${reg.donor.users.userid}:${Date.now()}`;

                try {
                    await prisma.notification.create({
                        data: {
                            userid: reg.donor.users.userid,
                            type: notification_type.CAMP,
                            title: `Camp Details Updated: ${camp.campname}`,
                            message: `Details for blood donation camp "${camp.campname}" have been updated: ${summaryOfChanges}. Please check your updated schedule.`,
                            isread: false,
                            campid: camp.campid,
                            registrationid: reg.registrationid,
                            actionurl: `/donor/camps/${camp.campid}`,
                            idempotencykey: idempotencyKey,
                        },
                    });
                    count++;
                } catch (err: any) {
                    if (err?.code !== "P2002") {
                        console.warn(`[CampNotification] Update alert failed for user ${reg.donor.users.userid}:`, err?.message);
                    }
                }
            }

            return count;
        } catch (err: any) {
            console.error("[CampNotification] notifyCampUpdated encountered error:", err?.message);
            return 0;
        }
    }

    /**
     * Workflow E: Triggered when a blood bank cancels a camp.
     */
    static async notifyCampCancelled(campId: string, reason: string): Promise<number> {
        try {
            const camp = await prisma.donationcamps.findUnique({
                where: { campid: campId },
                include: {
                    registrations: {
                        include: {
                            donor: {
                                include: {
                                    users: true,
                                    notificationpreferences: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!camp || camp.registrations.length === 0) {
                return 0;
            }

            const formattedDate = this.formatCampDate(camp.campdate);
            let count = 0;

            for (const reg of camp.registrations) {
                const prefs = reg.donor.notificationpreferences;
                if (prefs && prefs.campcancellations === false) {
                    continue;
                }

                const idempotencyKey = `CAMP_CANCELLED:${camp.campid}:${reg.donor.users.userid}`;

                try {
                    await prisma.notification.create({
                        data: {
                            userid: reg.donor.users.userid,
                            type: notification_type.CAMP,
                            title: `Camp Cancelled: ${camp.campname}`,
                            message: `The blood donation camp "${camp.campname}" scheduled for ${formattedDate} has been cancelled by the organizers. Reason: ${reason}. Your registration has been archived.`,
                            isread: false,
                            campid: camp.campid,
                            registrationid: reg.registrationid,
                            actionurl: `/donor/my-camps`,
                            idempotencykey: idempotencyKey,
                        },
                    });
                    count++;
                } catch (err: any) {
                    if (err?.code !== "P2002") {
                        console.warn(`[CampNotification] Cancellation alert failed for user ${reg.donor.users.userid}:`, err?.message);
                    }
                }
            }

            return count;
        } catch (err: any) {
            console.error("[CampNotification] notifyCampCancelled encountered error:", err?.message);
            return 0;
        }
    }

    /**
     * Workflow F: Triggered when a donor cancels their registration.
     */
    static async notifyRegistrationCancelled(registrationId: string, reason?: string) {
        try {
            const reg = await prisma.campregistrations.findUnique({
                where: { registrationid: registrationId },
                include: {
                    camp: true,
                    donor: { include: { users: true } },
                },
            });

            if (!reg) return null;

            const idempotencyKey = `CAMP_REG_CANCELLED:${reg.registrationreference}`;

            const notification = await prisma.notification.upsert({
                where: { idempotencykey: idempotencyKey },
                create: {
                    userid: reg.donor.users.userid,
                    type: notification_type.CAMP,
                    title: "Camp Registration Cancelled",
                    message: `Your registration (${reg.registrationreference}) for "${reg.camp.campname}" has been cancelled. Your slot has been released for other voluntary donors.`,
                    isread: false,
                    campid: reg.camp.campid,
                    registrationid: reg.registrationid,
                    actionurl: `/donor/my-camps`,
                    idempotencykey: idempotencyKey,
                },
                update: {},
            });

            return notification;
        } catch (err: any) {
            console.error("[CampNotification] notifyRegistrationCancelled encountered error:", err?.message);
            return null;
        }
    }

    /**
     * Workflow C & Part 8: Background scheduled reminders.
     * Evaluates upcoming active registrations for 24-hour and 2-hour reminder alerts.
     */
    static async processUpcomingCampReminders(): Promise<CampReminderSummary> {
        const now = new Date();
        const lookaheadHorizon = new Date(now.getTime() + 48 * 60 * 60 * 1000); // next 48 hours

        const summary: CampReminderSummary = {
            checkedCamps: 0,
            sent24h: 0,
            sent2h: 0,
            remindersSent: 0,
        };

        try {
            // Find all PUBLISHED camps occurring between now and next 48 hours
            const camps = await prisma.donationcamps.findMany({
                where: {
                    status: camp_status.PUBLISHED,
                    campdate: {
                        gte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
                        lte: lookaheadHorizon,
                    },
                },
                include: {
                    registrations: {
                        where: {
                            registrationstatus: camp_registration_status.REGISTERED,
                            attendancestatus: camp_attendance_status.PENDING,
                        },
                        include: {
                            donor: {
                                include: {
                                    users: true,
                                    notificationpreferences: true,
                                },
                            },
                        },
                    },
                },
            });

            summary.checkedCamps = camps.length;

            for (const camp of camps) {
                const campStart = this.getCampStartDateTime(camp.campdate, camp.starttime);
                const diffHours = (campStart.getTime() - now.getTime()) / (1000 * 60 * 60);

                // If camp already started or passed, skip reminders
                if (diffHours <= 0) {
                    continue;
                }

                const formattedDate = this.formatCampDate(camp.campdate);

                for (const reg of camp.registrations) {
                    const prefs = reg.donor.notificationpreferences;
                    // Check if donor opted out of reminders
                    if (prefs && prefs.campreminders === false) {
                        continue;
                    }

                    // 1. 24-Hour Tier: Send between 2h and 26h before camp start
                    if (diffHours <= 26 && diffHours > 2) {
                        const idempotencyKey24 = `CAMP_REMINDER_24H:${reg.registrationid}`;
                        try {
                            await prisma.notification.create({
                                data: {
                                    userid: reg.donor.users.userid,
                                    type: notification_type.CAMP,
                                    title: `Upcoming Blood Camp Reminder (24 Hours) - ${camp.campname}`,
                                    message: `Your voluntary blood donation camp is scheduled tomorrow (${formattedDate} from ${formatTime(camp.starttime)} to ${formatTime(camp.endtime)}) at ${camp.venuename}, ${camp.city}. Ref: ${reg.registrationreference}. Please drink water and rest well.`,
                                    isread: false,
                                    campid: camp.campid,
                                    registrationid: reg.registrationid,
                                    actionurl: `/donor/camps/${camp.campid}`,
                                    idempotencykey: idempotencyKey24,
                                },
                            });
                            summary.sent24h++;
                        } catch (err: any) {
                            // Ignored if already sent (P2002 duplicate idempotency key)
                            if (err?.code !== "P2002") {
                                console.warn(`[CampNotification] 24h reminder error for reg ${reg.registrationid}:`, err?.message);
                            }
                        }
                    }

                    // 2. 2-Hour Tier: Send between 0h and 2.5h before camp start
                    if (diffHours <= 2.5 && diffHours > 0) {
                        const idempotencyKey2 = `CAMP_REMINDER_2H:${reg.registrationid}`;
                        try {
                            await prisma.notification.create({
                                data: {
                                    userid: reg.donor.users.userid,
                                    type: notification_type.CAMP,
                                    title: `Camp Starting Soon: ${camp.campname}`,
                                    message: `Your blood donation camp starts in about 2 hours at ${camp.venuename}. Please arrive on time with valid photo ID. Ref: ${reg.registrationreference}.`,
                                    isread: false,
                                    campid: camp.campid,
                                    registrationid: reg.registrationid,
                                    actionurl: `/donor/camps/${camp.campid}`,
                                    idempotencykey: idempotencyKey2,
                                },
                            });
                            summary.sent2h++;
                        } catch (err: any) {
                            if (err?.code !== "P2002") {
                                console.warn(`[CampNotification] 2h reminder error for reg ${reg.registrationid}:`, err?.message);
                            }
                        }
                    }
                }
            }

            summary.remindersSent = summary.sent24h + summary.sent2h;
            return summary;
        } catch (err: any) {
            if (err?.code !== "P2021" && !err?.message?.includes("donationcamps")) {
                console.error("[CampNotification] processUpcomingCampReminders error:", err?.message);
            }
            summary.remindersSent = summary.sent24h + summary.sent2h;
            return summary;
        }
    }
}

/**
 * Starts the durable background reminder worker timer.
 */
export function startCampReminderWorker(intervalMs = 60000) {
    if (reminderWorkerInterval) {
        return;
    }

    console.log(`[CampReminderWorker] Starting camp reminder worker (interval: ${intervalMs}ms)...`);
    reminderWorkerInterval = setInterval(async () => {
        if (isWorkerRunning) return;
        try {
            isWorkerRunning = true;
            await CampNotificationService.processUpcomingCampReminders();
        } catch (err: any) {
            console.error("[CampReminderWorker] Worker iteration failed:", err?.message);
        } finally {
            isWorkerRunning = false;
        }
    }, intervalMs);

    if (reminderWorkerInterval.unref) {
        reminderWorkerInterval.unref();
    }
}

/**
 * Stops the background reminder worker gracefully.
 */
export function stopCampReminderWorker() {
    if (reminderWorkerInterval) {
        clearInterval(reminderWorkerInterval);
        reminderWorkerInterval = null;
        console.log("[CampReminderWorker] Stopped camp reminder worker.");
    }
}
