import { prisma } from "../../config/prisma";
import crypto from "crypto";
import {
    camp_status,
    camp_registration_availability,
    camp_registration_status,
    camp_attendance_status,
    notification_type,
} from "../../generated/prisma/enums";
import { calculateHaversineDistanceKm } from "../../utils/distance";
import { normalizeLocationFields } from "../../utils/location";
import { CampNotificationService } from "./campNotification.service";

export interface CreateCampInput {
    campname: string;
    description?: string | null;
    organizername: string;
    contactperson: string;
    contactphone?: string | null;
    campdate: string | Date;
    starttime: string;
    endtime: string;
    timezone?: string;
    registrationopeningdate: string | Date;
    registrationdeadline: string | Date;
    venuename: string;
    address: string;
    city: string;
    district?: string | null;
    state: string;
    pincode: string;
    latitude?: number | null;
    longitude?: number | null;
    isregistrationrequired?: boolean;
    maxcapacity?: number | null;
    registrationinstructions?: string | null;
    donorinstructions?: string | null;
    specialinstructions?: string | null;
    eligibilitynotes?: string | null;
    status?: camp_status;
}

export interface UpdateCampInput {
    campname?: string;
    description?: string | null;
    organizername?: string;
    contactperson?: string;
    contactphone?: string | null;
    campdate?: string | Date;
    starttime?: string;
    endtime?: string;
    timezone?: string;
    registrationopeningdate?: string | Date;
    registrationdeadline?: string | Date;
    venuename?: string;
    address?: string;
    city?: string;
    district?: string | null;
    state?: string;
    pincode?: string;
    latitude?: number | null;
    longitude?: number | null;
    isregistrationrequired?: boolean;
    maxcapacity?: number | null;
    registrationinstructions?: string | null;
    donorinstructions?: string | null;
    specialinstructions?: string | null;
    eligibilitynotes?: string | null;
    registrationstatus?: camp_registration_availability;
}

export interface CampListFilters {
    status?: camp_status;
    registrationstatus?: camp_registration_availability;
    city?: string;
    district?: string;
    state?: string;
    search?: string;
    fromDate?: Date;
    toDate?: Date;
    page?: number;
    limit?: number;
}

export interface AttendanceUpdateInput {
    attendancestatus: camp_attendance_status;
    unitsdonated?: number | null;
    attendancenotes?: string | null;
}

export interface CampDiscoveryFilters {
    city?: string;
    district?: string;
    state?: string;
    search?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    page?: number;
    limit?: number;
}

/**
 * Validates camp time format "HH:mm" (24-hour)
 */
function isValidTimeFormat(timeStr: string): boolean {
    if (!timeStr || typeof timeStr !== "string") return false;
    const match = timeStr.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return Boolean(match);
}

/**
 * Converts a time string "HH:mm" or "HH:mm:ss" or Date to a Date object representing PostgreSQL TIME
 */
export function timeStringToDate(timeStr: string | Date): Date {
    if (timeStr instanceof Date) return timeStr;
    const trimmed = String(timeStr).trim();
    const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
    if (!match) {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) return d;
        throw new Error(`Invalid time format: ${timeStr}. Expected HH:mm`);
    }
    const h = match[1].padStart(2, "0");
    const m = match[2];
    const s = match[3] || "00";
    return new Date(`1970-01-01T${h}:${m}:${s}.000Z`);
}

/**
 * Formats a Date or string from PostgreSQL TIME column to "HH:mm"
 */
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

/**
 * Compares two "HH:mm" time strings
 * Returns true if timeA < timeB
 */
function isTimeBefore(timeA: string, timeB: string): boolean {
    const [hA, mA] = timeA.trim().split(":").map(Number);
    const [hB, mB] = timeB.trim().split(":").map(Number);
    return hA * 60 + mA < hB * 60 + mB;
}

/**
 * Validates geographic coordinates
 */
function validateCoordinates(lat?: number | null, lng?: number | null): { valid: boolean; latitude: number | null; longitude: number | null } {
    if (lat === undefined || lat === null || lng === undefined || lng === null) {
        return { valid: true, latitude: null, longitude: null };
    }
    const numLat = Number(lat);
    const numLng = Number(lng);
    if (isNaN(numLat) || isNaN(numLng)) {
        return { valid: false, latitude: null, longitude: null };
    }
    if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
        return { valid: false, latitude: null, longitude: null };
    }
    return { valid: true, latitude: numLat, longitude: numLng };
}

export class CampService {
    /**
     * Creates a new blood donation camp under the authenticated blood bank.
     */
    static async createCamp(bloodBankId: string, userId: string, input: CreateCampInput) {
        // 1. Validate required fields
        if (!input.campname?.trim()) throw new Error("Camp name is required");
        if (!input.organizername?.trim()) throw new Error("Organizer name is required");
        if (!input.contactperson?.trim()) throw new Error("Contact person is required");
        if (!input.venuename?.trim()) throw new Error("Venue name is required");
        if (!input.address?.trim()) throw new Error("Complete address is required");
        if (!input.city?.trim() || !input.state?.trim()) throw new Error("City and state are required");

        // 2. Validate coordinates
        const coordCheck = validateCoordinates(input.latitude, input.longitude);
        if (!coordCheck.valid) {
            throw new Error("Invalid geographic coordinates. Latitude must be between -90 and 90, and longitude between -180 and 180.");
        }

        // 3. Normalize Location
        const normLoc = normalizeLocationFields({
            address: input.address,
            city: input.city,
            district: input.district,
            state: input.state,
            pincode: input.pincode,
        });

        // 4. Validate Date and Time Chronology
        const campDate = new Date(input.campdate);
        if (isNaN(campDate.getTime())) throw new Error("Invalid camp date");

        // Camp date cannot be in the past (midnight comparison)
        const todayUtc = new Date();
        todayUtc.setUTCHours(0, 0, 0, 0);
        const campDateStr = typeof input.campdate === "string" ? input.campdate : (input.campdate as Date).toISOString();
        const campDateParts = campDateStr.split("T")[0].split("-").map(Number);
        const campDateMidnight = new Date(Date.UTC(campDateParts[0], campDateParts[1] - 1, campDateParts[2], 0, 0, 0));
        if (campDateMidnight.getTime() < todayUtc.getTime()) {
            throw new Error("Camp date cannot be scheduled in the past");
        }

        if (!isValidTimeFormat(input.starttime) || !isValidTimeFormat(input.endtime)) {
            throw new Error("Start and end times must be valid 24-hour format (HH:mm)");
        }
        if (!isTimeBefore(input.starttime, input.endtime)) {
            throw new Error("Camp start time must be earlier than end time");
        }

        const regOpening = new Date(input.registrationopeningdate);
        const regDeadline = new Date(input.registrationdeadline);
        if (isNaN(regOpening.getTime()) || isNaN(regDeadline.getTime())) {
            throw new Error("Registration opening date and deadline must be valid dates");
        }
        if (regOpening.getTime() >= regDeadline.getTime()) {
            throw new Error("Registration opening date must be strictly before registration deadline");
        }

        const [sH, sM] = input.starttime.split(":").map(Number);
        const campStartDateTime = new Date(campDateMidnight);
        campStartDateTime.setUTCHours(sH, sM, 0, 0);
        if (regDeadline.getTime() > campStartDateTime.getTime()) {
            throw new Error("Registration deadline cannot be after the camp start time");
        }

        const isRegRequired = input.isregistrationrequired !== false;
        const maxCap = isRegRequired && input.maxcapacity ? Math.max(1, Number(input.maxcapacity)) : null;
        const initialStatus = input.status === camp_status.PUBLISHED ? camp_status.PUBLISHED : camp_status.DRAFT;

        const camp = await prisma.$transaction(async (tx) => {
            const created = await tx.donationcamps.create({
                data: {
                    bloodbankid: bloodBankId,
                    createdbyuserid: userId,
                    campname: input.campname.trim(),
                    description: input.description?.trim() || null,
                    organizername: input.organizername.trim(),
                    contactperson: input.contactperson.trim(),
                    contactphone: input.contactphone?.trim() || null,
                    campdate: campDateMidnight,
                    starttime: timeStringToDate(input.starttime),
                    endtime: timeStringToDate(input.endtime),
                    timezone: input.timezone?.trim() || "Asia/Kolkata",
                    registrationopeningdate: regOpening,
                    registrationdeadline: regDeadline,
                    venuename: input.venuename.trim(),
                    address: normLoc.address,
                    city: normLoc.city,
                    district: normLoc.district,
                    state: normLoc.state,
                    pincode: normLoc.pincode,
                    latitude: coordCheck.latitude !== null ? coordCheck.latitude : null,
                    longitude: coordCheck.longitude !== null ? coordCheck.longitude : null,
                    isregistrationrequired: isRegRequired,
                    maxcapacity: maxCap,
                    registrationinstructions: input.registrationinstructions?.trim() || null,
                    donorinstructions: input.donorinstructions?.trim() || null,
                    eligibilitynotes: input.eligibilitynotes?.trim() || null,
                    status: initialStatus,
                    registrationstatus: camp_registration_availability.OPEN,
                },
            });

            await tx.campstatushistory.create({
                data: {
                    campid: created.campid,
                    oldstatus: null,
                    newstatus: initialStatus,
                    changedbyuserid: userId,
                    reason: `Camp created in ${initialStatus} status`,
                },
            });

            await tx.campaudithistory.create({
                data: {
                    campid: created.campid,
                    action: "CAMP_CREATED",
                    changedbyuserid: userId,
                    details: JSON.stringify({
                        campname: created.campname,
                        campdate: created.campdate,
                        status: created.status,
                        maxcapacity: created.maxcapacity,
                    }),
                },
            });

            return created;
        });

        if (camp.status === camp_status.PUBLISHED) {
            CampNotificationService.notifyNearbyCampPublished(camp.campid).catch((err) => {
                console.error("Failed to notify nearby donors of camp publication:", err);
            });
        }

        return {
            ...camp,
            starttime: formatTime(camp.starttime),
            endtime: formatTime(camp.endtime),
        };
    }

    /**
     * Updates an existing camp with lifecycle-aware change detection and notification triggering.
     */
    static async updateCamp(campId: string, bloodBankId: string, userId: string, input: UpdateCampInput) {
        const existing = await prisma.donationcamps.findFirst({
            where: { campid: campId, bloodbankid: bloodBankId },
        });

        if (!existing) {
            throw new Error("Camp not found or unauthorized");
        }

        if (existing.status === camp_status.COMPLETED || existing.status === camp_status.CANCELLED) {
            throw new Error(`Cannot modify camp in terminal status (${existing.status})`);
        }

        const updateData: any = {};
        const changes: Record<string, any> = {};

        if (input.campname !== undefined && input.campname.trim()) {
            updateData.campname = input.campname.trim();
            if (updateData.campname !== existing.campname) changes.campname = { old: existing.campname, new: updateData.campname };
        }
        if (input.description !== undefined) {
            updateData.description = input.description ? input.description.trim() : null;
        }
        if (input.organizername !== undefined && input.organizername.trim()) {
            updateData.organizername = input.organizername.trim();
        }
        if (input.contactperson !== undefined && input.contactperson.trim()) {
            updateData.contactperson = input.contactperson.trim();
        }
        if (input.contactphone !== undefined) {
            updateData.contactphone = input.contactphone ? input.contactphone.trim() : null;
        }

        // Schedule changes
        let campDate = existing.campdate;
        let startTime = formatTime(existing.starttime);
        let endTime = formatTime(existing.endtime);
        let regOpening = existing.registrationopeningdate;
        let regDeadline = existing.registrationdeadline;

        if (input.campdate) {
            campDate = new Date(input.campdate);
            campDate.setHours(0, 0, 0, 0);
            updateData.campdate = campDate;
            if (campDate.getTime() !== existing.campdate.getTime()) {
                changes.campdate = { old: existing.campdate, new: campDate };
            }
        }
        if (input.starttime) {
            if (!isValidTimeFormat(input.starttime)) throw new Error("Invalid start time format (HH:mm)");
            startTime = input.starttime.trim();
            updateData.starttime = timeStringToDate(startTime);
            if (startTime !== formatTime(existing.starttime)) changes.starttime = { old: formatTime(existing.starttime), new: startTime };
        }
        if (input.endtime) {
            if (!isValidTimeFormat(input.endtime)) throw new Error("Invalid end time format (HH:mm)");
            endTime = input.endtime.trim();
            updateData.endtime = timeStringToDate(endTime);
            if (endTime !== formatTime(existing.endtime)) changes.endtime = { old: formatTime(existing.endtime), new: endTime };
        }

        if (!isTimeBefore(startTime, endTime)) {
            throw new Error("Camp start time must be strictly before end time");
        }

        if (input.registrationopeningdate) {
            regOpening = new Date(input.registrationopeningdate);
            updateData.registrationopeningdate = regOpening;
        }
        if (input.registrationdeadline) {
            regDeadline = new Date(input.registrationdeadline);
            updateData.registrationdeadline = regDeadline;
        }
        if (regOpening.getTime() >= regDeadline.getTime()) {
            throw new Error("Registration opening date must be strictly before registration deadline");
        }

        const [sH, sM] = startTime.split(":").map(Number);
        const campStartDateTime = new Date(campDate);
        campStartDateTime.setUTCHours(sH, sM, 0, 0);
        if (regDeadline.getTime() > campStartDateTime.getTime()) {
            throw new Error("Registration deadline cannot be after the camp start time");
        }

        // Location changes
        if (input.venuename !== undefined && input.venuename.trim()) {
            updateData.venuename = input.venuename.trim();
            if (updateData.venuename !== existing.venuename) changes.venuename = { old: existing.venuename, new: updateData.venuename };
        }
        if (input.address !== undefined || input.city !== undefined || input.state !== undefined) {
            const normLoc = normalizeLocationFields({
                address: input.address || existing.address,
                city: input.city || existing.city,
                district: input.district !== undefined ? input.district : existing.district,
                state: input.state || existing.state,
                pincode: input.pincode || existing.pincode,
            });
            updateData.address = normLoc.address;
            updateData.city = normLoc.city;
            updateData.district = normLoc.district;
            updateData.state = normLoc.state;
            updateData.pincode = normLoc.pincode;
            if (updateData.address !== existing.address) changes.address = { old: existing.address, new: updateData.address };
        }

        if (input.latitude !== undefined || input.longitude !== undefined) {
            const coordCheck = validateCoordinates(
                input.latitude !== undefined ? input.latitude : existing.latitude ? Number(existing.latitude) : null,
                input.longitude !== undefined ? input.longitude : existing.longitude ? Number(existing.longitude) : null
            );
            if (!coordCheck.valid) {
                throw new Error("Invalid coordinates");
            }
            updateData.latitude = coordCheck.latitude !== null ? coordCheck.latitude : null;
            updateData.longitude = coordCheck.longitude !== null ? coordCheck.longitude : null;
        }

        if (input.isregistrationrequired !== undefined) {
            updateData.isregistrationrequired = Boolean(input.isregistrationrequired);
        }
        if (input.maxcapacity !== undefined) {
            updateData.maxcapacity = input.maxcapacity ? Math.max(1, Number(input.maxcapacity)) : null;
        }
        if (input.registrationinstructions !== undefined) updateData.registrationinstructions = input.registrationinstructions;
        if (input.donorinstructions !== undefined) updateData.donorinstructions = input.donorinstructions;
        if (input.specialinstructions !== undefined) updateData.donorinstructions = input.specialinstructions;
        if (input.eligibilitynotes !== undefined) updateData.eligibilitynotes = input.eligibilitynotes;
        if (input.registrationstatus !== undefined) updateData.registrationstatus = input.registrationstatus;

        updateData.updatedat = new Date();

        const updated = await prisma.$transaction(async (tx) => {
            const camp = await tx.donationcamps.update({
                where: { campid: campId },
                data: updateData,
            });

            await tx.campaudithistory.create({
                data: {
                    campid: campId,
                    action: "CAMP_EDITED",
                    changedbyuserid: userId,
                    details: JSON.stringify(changes),
                },
            });

            return camp;
        });

        // If published and important schedule, venue, or instruction changed, notify registered donors
        const hasCriticalChange = changes.campdate || changes.starttime || changes.endtime || changes.venuename || changes.address || Boolean(input.donorinstructions) || Boolean(input.specialinstructions);
        if (existing.status === camp_status.PUBLISHED && hasCriticalChange) {
            const instr = input.donorinstructions || input.specialinstructions;
            const summary = `Venue: ${updated.venuename}, Date: ${new Date(updated.campdate).toLocaleDateString()}, Time: ${formatTime(updated.starttime)} - ${formatTime(updated.endtime)}${instr ? `. Instructions: ${instr}` : ""}`;
            try {
                await CampNotificationService.notifyCampUpdated(campId, summary);
            } catch (err) {
                console.error("Failed to notify registered donors of camp update:", err);
            }
            await this.notifyRegisteredDonors(
                campId,
                `Important Update for Blood Camp: ${existing.campname}`,
                `Important details for camp "${existing.campname}" have changed. Venue: ${updated.venuename}, Date: ${new Date(updated.campdate).toLocaleDateString()}, Time: ${formatTime(updated.starttime)} - ${formatTime(updated.endtime)}. Please check your registration details.`
            );
        }

        return {
            ...updated,
            starttime: formatTime(updated.starttime),
            endtime: formatTime(updated.endtime),
        };
    }

    /**
     * Retrieves camp details by ID with ownership check, registration counts, and audit history.
     */
    static async getCampById(campId: string, bloodBankId?: string) {
        const whereClause: any = { campid: campId };
        if (bloodBankId) {
            whereClause.bloodbankid = bloodBankId;
        }

        const camp = await prisma.donationcamps.findFirst({
            where: whereClause,
            include: {
                bloodbanks: {
                    select: {
                        bloodbankid: true,
                        bloodbankname: true,
                        licensenumber: true,
                        contactpersonphone: true,
                        city: true,
                        state: true,
                    },
                },
                createdby: {
                    select: {
                        userid: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
                statushistory: {
                    include: {
                        changedby: { select: { userid: true, name: true, role: true } },
                    },
                    orderBy: { createdat: "asc" },
                },
                audithistory: {
                    include: {
                        changedby: { select: { userid: true, name: true } },
                    },
                    orderBy: { createdat: "desc" },
                    take: 20,
                },
            },
        });

        if (!camp) {
            throw new Error("Camp not found");
        }

        // Calculate registration capacity metrics
        const [registeredCount, attendedCount, cancelledCount] = await Promise.all([
            prisma.campregistrations.count({
                where: { campid: campId, registrationstatus: camp_registration_status.REGISTERED },
            }),
            prisma.campregistrations.count({
                where: { campid: campId, attendancestatus: camp_attendance_status.ATTENDED },
            }),
            prisma.campregistrations.count({
                where: { campid: campId, registrationstatus: camp_registration_status.CANCELLED },
            }),
        ]);

        const maxCapacity = camp.maxcapacity;
        const remainingCapacity = maxCapacity !== null ? Math.max(0, maxCapacity - registeredCount) : null;
        const isCapacityReached = maxCapacity !== null ? registeredCount >= maxCapacity : false;

        const now = new Date();
        const isWithinRegistrationWindow =
            now >= new Date(camp.registrationopeningdate) && now <= new Date(camp.registrationdeadline);
        const isRegistrationOpen =
            camp.isregistrationrequired &&
            camp.status === camp_status.PUBLISHED &&
            camp.registrationstatus === camp_registration_availability.OPEN &&
            isWithinRegistrationWindow &&
            !isCapacityReached;

        return {
            ...camp,
            starttime: formatTime(camp.starttime),
            endtime: formatTime(camp.endtime),
            metrics: {
                totalCapacity: maxCapacity,
                registeredCount,
                attendedCount,
                cancelledCount,
                remainingCapacity,
                isCapacityReached,
                isRegistrationOpen,
            },
        };
    }

    /**
     * Lists camps belonging to a blood bank with pagination and filtering.
     */
    static async listCamps(bloodBankId: string, filters: CampListFilters = {}) {
        const whereClause: any = { bloodbankid: bloodBankId };

        if (filters.status) {
            whereClause.status = filters.status;
        }
        if (filters.registrationstatus) {
            whereClause.registrationstatus = filters.registrationstatus;
        }
        if (filters.city) {
            whereClause.city = { contains: filters.city.trim(), mode: "insensitive" };
        }
        if (filters.district) {
            whereClause.district = { contains: filters.district.trim(), mode: "insensitive" };
        }
        if (filters.state) {
            whereClause.state = { contains: filters.state.trim(), mode: "insensitive" };
        }
        if (filters.fromDate || filters.toDate) {
            whereClause.campdate = {};
            if (filters.fromDate) whereClause.campdate.gte = filters.fromDate;
            if (filters.toDate) whereClause.campdate.lte = filters.toDate;
        }
        if (filters.search && filters.search.trim()) {
            const s = filters.search.trim();
            whereClause.OR = [
                { campname: { contains: s, mode: "insensitive" } },
                { venuename: { contains: s, mode: "insensitive" } },
                { organizername: { contains: s, mode: "insensitive" } },
                { city: { contains: s, mode: "insensitive" } },
            ];
        }

        const page = Math.max(1, Number(filters.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(filters.limit) || 10));
        const skip = (page - 1) * limit;

        const [total, camps] = await Promise.all([
            prisma.donationcamps.count({ where: whereClause }),
            prisma.donationcamps.findMany({
                where: whereClause,
                include: {
                    _count: {
                        select: {
                            registrations: {
                                where: { registrationstatus: camp_registration_status.REGISTERED },
                            },
                        },
                    },
                },
                orderBy: { campdate: "asc" },
                skip,
                take: limit,
            }),
        ]);

        const mappedCamps = camps.map((c) => {
            const registeredCount = c._count.registrations;
            const remainingCapacity = c.maxcapacity !== null ? Math.max(0, c.maxcapacity - registeredCount) : null;
            return {
                ...c,
                starttime: formatTime(c.starttime),
                endtime: formatTime(c.endtime),
                registeredCount,
                remainingCapacity,
            };
        });

        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            camps: mappedCamps,
        };
    }

    /**
     * Metrics summary for blood bank dashboard.
     */
    static async getCampSummary(bloodBankId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalCamps,
            upcomingCamps,
            publishedCamps,
            draftCamps,
            registrationOpenCamps,
            registrationClosedCamps,
            completedCamps,
            cancelledCamps,
        ] = await Promise.all([
            prisma.donationcamps.count({ where: { bloodbankid: bloodBankId } }),
            prisma.donationcamps.count({
                where: {
                    bloodbankid: bloodBankId,
                    campdate: { gte: today },
                    status: { notIn: [camp_status.COMPLETED, camp_status.CANCELLED] },
                },
            }),
            prisma.donationcamps.count({
                where: { bloodbankid: bloodBankId, status: camp_status.PUBLISHED },
            }),
            prisma.donationcamps.count({
                where: { bloodbankid: bloodBankId, status: camp_status.DRAFT },
            }),
            prisma.donationcamps.count({
                where: {
                    bloodbankid: bloodBankId,
                    status: camp_status.PUBLISHED,
                    registrationstatus: camp_registration_availability.OPEN,
                },
            }),
            prisma.donationcamps.count({
                where: {
                    bloodbankid: bloodBankId,
                    status: camp_status.PUBLISHED,
                    registrationstatus: camp_registration_availability.CLOSED,
                },
            }),
            prisma.donationcamps.count({
                where: { bloodbankid: bloodBankId, status: camp_status.COMPLETED },
            }),
            prisma.donationcamps.count({
                where: { bloodbankid: bloodBankId, status: camp_status.CANCELLED },
            }),
        ]);

        return {
            totalCamps,
            upcomingCamps,
            publishedCamps,
            draftCamps,
            registrationOpenCamps,
            registrationClosedCamps,
            completedCamps,
            cancelledCamps,
        };
    }

    /**
     * Publishes a DRAFT camp.
     */
    static async publishCamp(campId: string, bloodBankId: string, userId: string) {
        const camp = await prisma.donationcamps.findFirst({
            where: { campid: campId, bloodbankid: bloodBankId },
        });

        if (!camp) throw new Error("Camp not found or unauthorized");
        if (camp.status === camp_status.PUBLISHED) return camp;
        if (camp.status !== camp_status.DRAFT) {
            throw new Error(`Cannot publish camp in ${camp.status} status`);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (camp.campdate.getTime() < today.getTime()) {
            throw new Error("Cannot publish a camp scheduled in the past");
        }

        const published = await prisma.$transaction(async (tx) => {
            const updated = await tx.donationcamps.update({
                where: { campid: campId },
                data: {
                    status: camp_status.PUBLISHED,
                    registrationstatus: camp_registration_availability.OPEN,
                    updatedat: new Date(),
                },
            });

            await tx.campstatushistory.create({
                data: {
                    campid: campId,
                    oldstatus: camp_status.DRAFT,
                    newstatus: camp_status.PUBLISHED,
                    changedbyuserid: userId,
                    reason: "Camp officially published for public donor discovery and registration",
                },
            });

            await tx.campaudithistory.create({
                data: {
                    campid: campId,
                    action: "CAMP_PUBLISHED",
                    changedbyuserid: userId,
                    details: "Camp status changed to PUBLISHED",
                },
            });

            return updated;
        });

        // Trigger nearby donor notifications
        try {
            await CampNotificationService.notifyNearbyCampPublished(campId);
        } catch (err) {
            console.error("Failed to notify nearby donors of camp publication:", err);
        }

        return published;
    }

    /**
     * Toggles registration status (OPEN / CLOSED) independently from camp status.
     */
    static async toggleRegistrationStatus(
        campId: string,
        bloodBankId: string,
        userId: string,
        newStatus: camp_registration_availability,
        reason?: string
    ) {
        const camp = await prisma.donationcamps.findFirst({
            where: { campid: campId, bloodbankid: bloodBankId },
        });

        if (!camp) throw new Error("Camp not found or unauthorized");
        if (camp.status === camp_status.COMPLETED || camp.status === camp_status.CANCELLED) {
            throw new Error(`Cannot modify registration availability for ${camp.status} camp`);
        }

        return await prisma.$transaction(async (tx) => {
            const updated = await tx.donationcamps.update({
                where: { campid: campId },
                data: {
                    registrationstatus: newStatus,
                    updatedat: new Date(),
                },
            });

            await tx.campaudithistory.create({
                data: {
                    campid: campId,
                    action: "REGISTRATION_TOGGLED",
                    changedbyuserid: userId,
                    details: JSON.stringify({
                        oldRegistrationStatus: camp.registrationstatus,
                        newRegistrationStatus: newStatus,
                        reason: reason || "Manual organizer toggle",
                    }),
                },
            });

            return updated;
        });
    }

    /**
     * Marks camp as COMPLETED.
     */
    static async completeCamp(campId: string, bloodBankId: string, userId: string, notes?: string) {
        const camp = await prisma.donationcamps.findFirst({
            where: { campid: campId, bloodbankid: bloodBankId },
        });

        if (!camp) throw new Error("Camp not found or unauthorized");
        if (camp.status !== camp_status.PUBLISHED) {
            throw new Error(`Only PUBLISHED camps can be completed (current: ${camp.status})`);
        }

        return await prisma.$transaction(async (tx) => {
            const updated = await tx.donationcamps.update({
                where: { campid: campId },
                data: {
                    status: camp_status.COMPLETED,
                    registrationstatus: camp_registration_availability.CLOSED,
                    updatedat: new Date(),
                },
            });

            await tx.campstatushistory.create({
                data: {
                    campid: campId,
                    oldstatus: camp.status,
                    newstatus: camp_status.COMPLETED,
                    changedbyuserid: userId,
                    reason: notes || "Camp successfully completed",
                },
            });

            await tx.campaudithistory.create({
                data: {
                    campid: campId,
                    action: "CAMP_COMPLETED",
                    changedbyuserid: userId,
                    details: notes || "Camp marked as COMPLETED",
                },
            });

            return updated;
        });
    }

    /**
     * Cancels a camp with mandatory reason and notifies registered donors.
     */
    static async cancelCamp(campId: string, bloodBankId: string, userId: string, reason: string) {
        if (!reason?.trim()) {
            throw new Error("A cancellation reason is mandatory");
        }

        const camp = await prisma.donationcamps.findFirst({
            where: { campid: campId, bloodbankid: bloodBankId },
        });

        if (!camp) throw new Error("Camp not found or unauthorized");
        if (camp.status === camp_status.COMPLETED || camp.status === camp_status.CANCELLED) {
            throw new Error(`Camp is already in terminal state: ${camp.status}`);
        }

        const cancelled = await prisma.$transaction(async (tx) => {
            const updated = await tx.donationcamps.update({
                where: { campid: campId },
                data: {
                    status: camp_status.CANCELLED,
                    registrationstatus: camp_registration_availability.CLOSED,
                    cancellationreason: reason.trim(),
                    updatedat: new Date(),
                },
            });

            await tx.campstatushistory.create({
                data: {
                    campid: campId,
                    oldstatus: camp.status,
                    newstatus: camp_status.CANCELLED,
                    changedbyuserid: userId,
                    reason: reason.trim(),
                },
            });

            await tx.campaudithistory.create({
                data: {
                    campid: campId,
                    action: "CAMP_CANCELLED",
                    changedbyuserid: userId,
                    details: JSON.stringify({ reason: reason.trim() }),
                },
            });

            return updated;
        });

        // Notify all registered donors via Feature 7 CampNotificationService
        try {
            await CampNotificationService.notifyCampCancelled(campId, reason.trim());
        } catch (err) {
            console.error("Failed to notify registered donors of camp cancellation via CampNotificationService:", err);
        }

        // Also notify via existing method for backwards compatibility
        await this.notifyRegisteredDonors(
            campId,
            `Cancellation Notice: ${camp.campname}`,
            `The blood donation camp "${camp.campname}" scheduled for ${new Date(camp.campdate).toLocaleDateString()} has been cancelled by the organizers. Reason: ${reason.trim()}`
        );

        return cancelled;
    }

    /**
     * Retrieves registrations for a camp (organizer view).
     */
    static async listCampRegistrations(
        campId: string,
        bloodBankId: string,
        filters: { status?: camp_registration_status; attendance?: camp_attendance_status; search?: string; page?: number; limit?: number } = {}
    ) {
        const camp = await prisma.donationcamps.findFirst({
            where: { campid: campId, bloodbankid: bloodBankId },
            select: { campid: true, campname: true, maxcapacity: true },
        });

        if (!camp) throw new Error("Camp not found or unauthorized");

        const whereClause: any = { campid: campId };
        if (filters.status) {
            whereClause.registrationstatus = filters.status;
        }
        if (filters.attendance) {
            whereClause.attendancestatus = filters.attendance;
        }
        if (filters.search && filters.search.trim()) {
            const s = filters.search.trim();
            whereClause.OR = [
                { registrationreference: { contains: s, mode: "insensitive" } },
                { donor: { users: { name: { contains: s, mode: "insensitive" } } } },
            ];
        }

        const page = Math.max(1, Number(filters.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
        const skip = (page - 1) * limit;

        const [total, registeredCount, attendedCount, registrations] = await Promise.all([
            prisma.campregistrations.count({ where: whereClause }),
            prisma.campregistrations.count({
                where: { campid: campId, registrationstatus: camp_registration_status.REGISTERED },
            }),
            prisma.campregistrations.count({
                where: { campid: campId, attendancestatus: camp_attendance_status.ATTENDED },
            }),
            prisma.campregistrations.findMany({
                where: whereClause,
                include: {
                    donor: {
                        select: {
                            donorid: true,
                            bloodgroup: true,
                            gender: true,
                            city: true,
                            users: {
                                select: {
                                    name: true,
                                    email: true,
                                    phonenumber: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { registrationdate: "desc" },
                skip,
                take: limit,
            }),
        ]);

        const mapped = registrations.map((r) => ({
            registrationid: r.registrationid,
            registrationreference: r.registrationreference,
            registrationdate: r.registrationdate,
            registrationstatus: r.registrationstatus,
            attendancestatus: r.attendancestatus,
            attendedat: r.attendedat,
            unitsdonated: r.unitsdonated,
            attendancenotes: r.attendancenotes,
            attendanceupdatedbyuserid: r.attendanceupdatedbyuserid,
            cancellationreason: r.cancellationreason,
            cancelledat: r.cancelledat,
            cancelledbyuserid: r.cancelledbyuserid,
            cancellationhistory: (r as any).cancellationhistory || [],
            donor: {
                donorid: r.donor.donorid,
                name: r.donor.users.name,
                bloodgroup: r.donor.bloodgroup,
                gender: r.donor.gender,
                city: r.donor.city,
                contactphone: r.donor.users.phonenumber,
                email: r.donor.users.email,
            },
        }));

        return {
            total,
            registeredCount,
            attendedCount,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            registrations: mapped,
        };
    }

    /**
     * Updates donor attendance for a registration (authorized blood bank staff only).
     */
    static async updateAttendance(
        campId: string,
        bloodBankId: string,
        userId: string,
        registrationId: string,
        input: AttendanceUpdateInput
    ) {
        const camp = await prisma.donationcamps.findFirst({
            where: { campid: campId, bloodbankid: bloodBankId },
        });
        if (!camp) throw new Error("Camp not found or unauthorized");

        const reg = await prisma.campregistrations.findFirst({
            where: { registrationid: registrationId, campid: campId },
        });
        if (!reg) throw new Error("Registration record not found");

        if (reg.registrationstatus === camp_registration_status.CANCELLED) {
            throw new Error("Cannot update attendance for a cancelled registration");
        }

        const attendedAt = input.attendancestatus === camp_attendance_status.ATTENDED ? new Date() : null;
        const units = input.attendancestatus === camp_attendance_status.ATTENDED && input.unitsdonated ? Math.max(1, Number(input.unitsdonated)) : null;

        return await prisma.$transaction(async (tx) => {
            const updated = await tx.campregistrations.update({
                where: { registrationid: registrationId },
                data: {
                    attendancestatus: input.attendancestatus,
                    attendedat: attendedAt,
                    unitsdonated: units,
                    attendancenotes: input.attendancenotes?.trim() || null,
                    attendanceupdatedbyuserid: userId,
                    updatedat: new Date(),
                },
            });

            await tx.campaudithistory.create({
                data: {
                    campid: campId,
                    action: "ATTENDANCE_UPDATED",
                    changedbyuserid: userId,
                    details: JSON.stringify({
                        registrationreference: reg.registrationreference,
                        attendancestatus: input.attendancestatus,
                        unitsdonated: units,
                    }),
                },
            });

            return updated;
        });
    }

    /**
     * Cancels a registration from organizer side.
     */
    static async cancelRegistrationByOrganizer(
        campId: string,
        bloodBankId: string,
        userId: string,
        registrationId: string,
        reason: string
    ) {
        if (!reason?.trim()) throw new Error("Cancellation reason is required");

        const camp = await prisma.donationcamps.findFirst({
            where: { campid: campId, bloodbankid: bloodBankId },
        });
        if (!camp) throw new Error("Camp not found or unauthorized");

        const reg = await prisma.campregistrations.findFirst({
            where: { registrationid: registrationId, campid: campId },
            include: { donor: { include: { users: true } } },
        });
        if (!reg) throw new Error("Registration not found");

        if (reg.registrationstatus === camp_registration_status.CANCELLED) {
            return reg;
        }
        if (reg.attendancestatus === camp_attendance_status.ATTENDED) {
            throw new Error("Cannot cancel a registration that has already been marked as ATTENDED");
        }

        const cancelled = await prisma.$transaction(async (tx) => {
            const existingHistory = Array.isArray((reg as any).cancellationhistory)
                ? [...((reg as any).cancellationhistory as any[])]
                : [];

            existingHistory.push({
                cancelledat: new Date().toISOString(),
                cancelledbyuserid: userId,
                reason: reason.trim(),
                type: "ORGANIZER",
            });

            const updated = await tx.campregistrations.update({
                where: { registrationid: registrationId },
                data: {
                    registrationstatus: camp_registration_status.CANCELLED,
                    cancellationreason: reason.trim(),
                    cancelledat: new Date(),
                    cancelledbyuserid: userId,
                    cancellationhistory: existingHistory,
                    updatedat: new Date(),
                },
            });

            await tx.campaudithistory.create({
                data: {
                    campid: campId,
                    action: "DONOR_CANCELLED_BY_ORGANIZER",
                    changedbyuserid: userId,
                    details: JSON.stringify({
                        registrationreference: reg.registrationreference,
                        reason: reason.trim(),
                    }),
                },
            });

            return updated;
        });

        // Notify donor
        try {
            await prisma.notification.create({
                data: {
                    userid: reg.donor.userid,
                    type: notification_type.SYSTEM,
                    title: `Camp Registration Cancelled: ${camp.campname}`,
                    message: `Your registration (${reg.registrationreference}) for "${camp.campname}" has been cancelled by the organizer. Reason: ${reason.trim()}`,
                },
            });
        } catch (err) {
            console.warn("Could not dispatch cancellation notice to donor:", err);
        }

        return cancelled;
    }

    // =========================================================================
    // FEATURE 6: PUBLIC & DONOR INTEGRATION CONTRACT METHODS
    // =========================================================================

    /**
     * Discover upcoming published camps (Public / Donor Portal).
     * Excludes all donor personal info.
     */
    static async discoverCamps(filters: CampDiscoveryFilters = {}) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const whereClause: any = {
            status: camp_status.PUBLISHED,
            campdate: { gte: today },
        };

        if (filters.dateFrom) {
            const df = new Date(filters.dateFrom);
            df.setHours(0, 0, 0, 0);
            whereClause.campdate = { ...whereClause.campdate, gte: df > today ? df : today };
        }
        if (filters.dateTo) {
            const dt = new Date(filters.dateTo);
            dt.setHours(23, 59, 59, 999);
            whereClause.campdate = { ...whereClause.campdate, lte: dt };
        }

        if (filters.city) {
            whereClause.city = { contains: filters.city.trim(), mode: "insensitive" };
        }
        if (filters.district) {
            whereClause.district = { contains: filters.district.trim(), mode: "insensitive" };
        }
        if (filters.state) {
            whereClause.state = { contains: filters.state.trim(), mode: "insensitive" };
        }
        if (filters.search && filters.search.trim()) {
            const s = filters.search.trim();
            whereClause.OR = [
                { campname: { contains: s, mode: "insensitive" } },
                { venuename: { contains: s, mode: "insensitive" } },
                { organizername: { contains: s, mode: "insensitive" } },
                { city: { contains: s, mode: "insensitive" } },
            ];
        }

        const camps = await prisma.donationcamps.findMany({
            where: whereClause,
            include: {
                bloodbanks: {
                    select: {
                        bloodbankid: true,
                        bloodbankname: true,
                        city: true,
                        state: true,
                        contactpersonphone: true,
                    },
                },
                _count: {
                    select: {
                        registrations: {
                            where: { registrationstatus: camp_registration_status.REGISTERED },
                        },
                    },
                },
            },
            orderBy: { campdate: "asc" },
        });

        const now = new Date();
        let mapped = camps.map((c) => {
            const registeredCount = c._count.registrations;
            const remainingCapacity = c.maxcapacity !== null ? Math.max(0, c.maxcapacity - registeredCount) : null;
            const isCapacityReached = c.maxcapacity !== null ? registeredCount >= c.maxcapacity : false;

            const isWithinRegistrationWindow =
                now >= new Date(c.registrationopeningdate) && now <= new Date(c.registrationdeadline);

            const isRegistrationOpen =
                c.isregistrationrequired &&
                c.registrationstatus === camp_registration_availability.OPEN &&
                isWithinRegistrationWindow &&
                !isCapacityReached;

            let distanceKm: number | null = null;
            if (
                filters.latitude !== undefined &&
                filters.longitude !== undefined &&
                c.latitude !== null &&
                c.longitude !== null
            ) {
                distanceKm = calculateHaversineDistanceKm(
                    Number(filters.latitude),
                    Number(filters.longitude),
                    Number(c.latitude),
                    Number(c.longitude)
                );
            }

            return {
                campid: c.campid,
                campname: c.campname,
                description: c.description,
                organizername: c.organizername,
                organizingbloodbank: c.bloodbanks.bloodbankname,
                contactperson: c.contactperson,
                contactphone: c.contactphone || c.bloodbanks.contactpersonphone,
                campdate: c.campdate,
                starttime: formatTime(c.starttime),
                endtime: formatTime(c.endtime),
                timezone: c.timezone,
                venuename: c.venuename,
                address: c.address,
                city: c.city,
                district: c.district,
                state: c.state,
                pincode: c.pincode,
                latitude: c.latitude ? Number(c.latitude) : null,
                longitude: c.longitude ? Number(c.longitude) : null,
                isregistrationrequired: c.isregistrationrequired,
                registrationstatus: c.registrationstatus,
                isregistrationopen: isRegistrationOpen,
                registrationdeadline: c.registrationdeadline,
                registrationinstructions: c.registrationinstructions,
                donorinstructions: c.donorinstructions,
                eligibilitynotes: c.eligibilitynotes,
                maxcapacity: c.maxcapacity,
                registeredcount: registeredCount,
                remainingcapacity: remainingCapacity,
                distancekm: distanceKm !== null ? Number(distanceKm.toFixed(1)) : null,
            };
        });

        // Filter by radius if requested and coordinates present
        if (filters.radiusKm && filters.latitude !== undefined && filters.longitude !== undefined) {
            const rad = Number(filters.radiusKm);
            mapped = mapped.filter((c) => c.distancekm !== null && c.distancekm <= rad);
            mapped.sort((a, b) => (a.distancekm ?? Infinity) - (b.distancekm ?? Infinity));
        }

        const page = Math.max(1, Number(filters.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
        const total = mapped.length;
        const paginated = mapped.slice((page - 1) * limit, page * limit);

        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            camps: paginated,
        };
    }

    /**
     * Retrieves public camp details without any donor PII.
     */
    static async getPublicCampById(campId: string) {
        const camp = await prisma.donationcamps.findFirst({
            where: { campid: campId, status: camp_status.PUBLISHED },
            include: {
                bloodbanks: {
                    select: {
                        bloodbankid: true,
                        bloodbankname: true,
                        city: true,
                        state: true,
                        contactpersonphone: true,
                    },
                },
                _count: {
                    select: {
                        registrations: {
                            where: { registrationstatus: camp_registration_status.REGISTERED },
                        },
                    },
                },
            },
        });

        if (!camp) throw new Error("Camp not found or not published");

        const registeredCount = camp._count.registrations;
        const remainingCapacity = camp.maxcapacity !== null ? Math.max(0, camp.maxcapacity - registeredCount) : null;
        const isCapacityReached = camp.maxcapacity !== null ? registeredCount >= camp.maxcapacity : false;

        const now = new Date();
        const isWithinRegistrationWindow =
            now >= new Date(camp.registrationopeningdate) && now <= new Date(camp.registrationdeadline);

        const isRegistrationOpen =
            camp.isregistrationrequired &&
            camp.registrationstatus === camp_registration_availability.OPEN &&
            isWithinRegistrationWindow &&
            !isCapacityReached;

        return {
            campid: camp.campid,
            campname: camp.campname,
            description: camp.description,
            organizername: camp.organizername,
            organizingbloodbank: camp.bloodbanks.bloodbankname,
            contactperson: camp.contactperson,
            contactphone: camp.contactphone || camp.bloodbanks.contactpersonphone,
            campdate: camp.campdate,
            starttime: formatTime(camp.starttime),
            endtime: formatTime(camp.endtime),
            timezone: camp.timezone,
            venuename: camp.venuename,
            address: camp.address,
            city: camp.city,
            district: camp.district,
            state: camp.state,
            pincode: camp.pincode,
            latitude: camp.latitude ? Number(camp.latitude) : null,
            longitude: camp.longitude ? Number(camp.longitude) : null,
            isregistrationrequired: camp.isregistrationrequired,
            registrationstatus: camp.registrationstatus,
            isregistrationopen: isRegistrationOpen,
            registrationopeningdate: camp.registrationopeningdate,
            registrationdeadline: camp.registrationdeadline,
            registrationinstructions: camp.registrationinstructions,
            donorinstructions: camp.donorinstructions,
            eligibilitynotes: camp.eligibilitynotes,
            maxcapacity: camp.maxcapacity,
            registeredcount: registeredCount,
            remainingcapacity: remainingCapacity,
        };
    }

    /**
     * Registers a donor for a camp with capacity enforcement, concurrency locks, and safe re-registration.
     */
    static async registerDonorForCamp(campId: string, donorUserId: string) {
        // 1. Resolve donor profile
        const donor = await prisma.donors.findUnique({
            where: { userid: donorUserId },
            include: { users: true },
        });

        if (!donor) {
            throw new Error("Donor profile required to register for blood donation camps");
        }

        // 2. Perform atomic registration check with row-level concurrency lock on camp
        const registration = await prisma.$transaction(async (tx) => {
            // Lock camp row to prevent race conditions during concurrent registrations
            const lockedCamps: any[] = await tx.$queryRawUnsafe(
                `SELECT campid, campname, status, registrationstatus, isregistrationrequired, maxcapacity, registrationopeningdate, registrationdeadline FROM donationcamps WHERE campid = $1::uuid FOR UPDATE`,
                campId
            );

            if (!lockedCamps || lockedCamps.length === 0) {
                throw new Error("Camp not found");
            }

            const c = lockedCamps[0];

            if (c.status !== camp_status.PUBLISHED) {
                throw new Error("Registration is not available for this camp (Camp is not published)");
            }

            if (!c.isregistrationrequired) {
                throw new Error("Advance registration is not required for this camp. Walk-in donors are welcome.");
            }

            if (c.registrationstatus !== camp_registration_availability.OPEN) {
                throw new Error("Registration is currently closed by the organizers");
            }

            const now = new Date();
            const opening = new Date(c.registrationopeningdate);
            const deadline = new Date(c.registrationdeadline);

            if (now < opening) {
                throw new Error(`Registration has not opened yet (Opens on ${opening.toLocaleDateString()})`);
            }
            if (now > deadline) {
                throw new Error(`Registration deadline has passed (${deadline.toLocaleDateString()})`);
            }

            // Check existing registration record for this donor first
            const existingReg = await tx.campregistrations.findUnique({
                where: {
                    campid_donorid: {
                        campid: campId,
                        donorid: donor.donorid,
                    },
                },
            });

            if (existingReg && existingReg.registrationstatus === camp_registration_status.REGISTERED) {
                throw new Error("You are already registered for this blood donation camp");
            }

            // Check current active registered count
            const activeCount = await tx.campregistrations.count({
                where: {
                    campid: campId,
                    registrationstatus: camp_registration_status.REGISTERED,
                },
            });

            if (c.maxcapacity !== null && c.maxcapacity !== undefined && activeCount >= Number(c.maxcapacity)) {
                throw new Error("Camp registration capacity has been reached. No slots remaining.");
            }

            if (existingReg) {

                // Donor previously cancelled -> Reactivate existing record safely
                const previousReason = existingReg.cancellationreason || existingReg.previouscancellationreason;
                const previousDate = existingReg.cancelledat || existingReg.previouscancelledat;

                const reactivated = await tx.campregistrations.update({
                    where: { registrationid: existingReg.registrationid },
                    data: {
                        registrationstatus: camp_registration_status.REGISTERED,
                        attendancestatus: camp_attendance_status.PENDING,
                        previouscancellationreason: previousReason,
                        previouscancelledat: previousDate,
                        cancellationreason: null,
                        cancelledat: null,
                        cancelledbyuserid: null,
                        reregisteredat: new Date(),
                        updatedat: new Date(),
                    },
                });

                await tx.campaudithistory.create({
                    data: {
                        campid: campId,
                        action: "DONOR_REREGISTERED",
                        changedbyuserid: donorUserId,
                        details: JSON.stringify({
                            registrationreference: existingReg.registrationreference,
                            donorid: donor.donorid,
                        }),
                    },
                });

                return reactivated;
            }

            // Create new registration record with collision retry loop
            let created = null;
            let refAttempts = 0;
            const maxRefAttempts = 5;

            while (!created && refAttempts < maxRefAttempts) {
                refAttempts++;
                const refCode = `CAMP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

                const existingRef = await tx.campregistrations.findUnique({
                    where: { registrationreference: refCode },
                });
                if (existingRef) {
                    continue; // Collision detected, regenerate reference
                }

                try {
                    created = await tx.campregistrations.create({
                        data: {
                            campid: campId,
                            donorid: donor.donorid,
                            registrationreference: refCode,
                            registrationdate: new Date(),
                            registrationstatus: camp_registration_status.REGISTERED,
                            attendancestatus: camp_attendance_status.PENDING,
                        },
                    });
                } catch (createErr: any) {
                    if (createErr.code === "P2002" && refAttempts < maxRefAttempts) {
                        continue;
                    }
                    throw createErr;
                }
            }

            if (!created) {
                throw new Error("Failed to allocate a unique registration reference after multiple attempts. Please retry.");
            }

            await tx.campaudithistory.create({
                data: {
                    campid: campId,
                    action: "DONOR_REGISTERED",
                    changedbyuserid: donorUserId,
                    details: JSON.stringify({
                        registrationreference: created.registrationreference,
                        donorid: donor.donorid,
                    }),
                },
            });

            return created;
        });

        // Create persistent confirmation notification for donor via Feature 7 CampNotificationService
        try {
            await CampNotificationService.notifyRegistrationConfirmed(registration.registrationid);
        } catch (err) {
            console.warn("Could not persist donor registration confirmation notification:", err);
        }

        return registration;
    }

    /**
     * Donor self-cancels their camp registration (releases capacity slot immediately, preserves record).
     */
    static async cancelDonorRegistration(donorUserId: string, registrationId: string, reason?: string) {
        const donor = await prisma.donors.findUnique({
            where: { userid: donorUserId },
        });
        if (!donor) throw new Error("Donor profile required");

        const reg = await prisma.campregistrations.findFirst({
            where: { registrationid: registrationId, donorid: donor.donorid },
            include: { camp: true },
        });

        if (!reg) throw new Error("Registration not found or unauthorized");
        if (reg.registrationstatus === camp_registration_status.CANCELLED) return reg;
        if (reg.attendancestatus === camp_attendance_status.ATTENDED) {
            throw new Error("Cannot cancel registration after attendance has been recorded");
        }

        const cancelled = await prisma.$transaction(async (tx) => {
            const existingHistory = Array.isArray((reg as any).cancellationhistory)
                ? [...((reg as any).cancellationhistory as any[])]
                : [];

            existingHistory.push({
                cancelledat: new Date().toISOString(),
                cancelledbyuserid: donorUserId,
                reason: reason?.trim() || "Cancelled by donor",
                type: "DONOR_SELF",
            });

            const updated = await tx.campregistrations.update({
                where: { registrationid: registrationId },
                data: {
                    registrationstatus: camp_registration_status.CANCELLED,
                    cancellationreason: reason?.trim() || "Cancelled by donor",
                    cancelledat: new Date(),
                    cancelledbyuserid: donorUserId,
                    cancellationhistory: existingHistory,
                    updatedat: new Date(),
                },
            });

            await tx.campaudithistory.create({
                data: {
                    campid: reg.campid,
                    action: "DONOR_CANCELLED_SELF",
                    changedbyuserid: donorUserId,
                    details: JSON.stringify({
                        registrationreference: reg.registrationreference,
                        reason: reason?.trim() || "Cancelled by donor",
                    }),
                },
            });

            return updated;
        });

        // Trigger in-app notification confirmation for donor cancellation
        try {
            await CampNotificationService.notifyRegistrationCancelled(cancelled.registrationid, reason);
        } catch (err) {
            console.warn("Could not persist donor registration cancellation notification:", err);
        }

        return cancelled;
    }

    /**
     * Lists all camp registrations for the authenticated donor.
     */
    static async getDonorRegistrations(donorUserId: string) {
        const donor = await prisma.donors.findUnique({
            where: { userid: donorUserId },
        });
        if (!donor) throw new Error("Donor profile required");

        const regs = await prisma.campregistrations.findMany({
            where: { donorid: donor.donorid },
            include: {
                camp: {
                    include: {
                        bloodbanks: {
                            select: {
                                bloodbankname: true,
                                contactpersonphone: true,
                                city: true,
                            },
                        },
                    },
                },
            },
            orderBy: { registrationdate: "desc" },
        });

        return regs.map((r) => ({
            registrationid: r.registrationid,
            registrationreference: r.registrationreference,
            registrationdate: r.registrationdate,
            registrationstatus: r.registrationstatus,
            attendancestatus: r.attendancestatus,
            attendedat: r.attendedat,
            unitsdonated: r.unitsdonated,
            camp: {
                campid: r.camp.campid,
                campname: r.camp.campname,
                organizername: r.camp.organizername,
                organizingbloodbank: r.camp.bloodbanks.bloodbankname,
                campdate: r.camp.campdate,
                starttime: formatTime(r.camp.starttime),
                endtime: formatTime(r.camp.endtime),
                venuename: r.camp.venuename,
                address: r.camp.address,
                city: r.camp.city,
                state: r.camp.state,
                contactphone: r.camp.contactphone || r.camp.bloodbanks.contactpersonphone,
                status: r.camp.status,
            },
        }));
    }

    /**
     * Helper: Dispatches persistent notifications to all registered donors of a camp.
     */
    private static async notifyRegisteredDonors(campId: string, title: string, message: string) {
        try {
            const activeRegs = await prisma.campregistrations.findMany({
                where: {
                    campid: campId,
                    registrationstatus: camp_registration_status.REGISTERED,
                },
                include: {
                    donor: { select: { userid: true } },
                },
            });

            if (activeRegs.length === 0) return;

            const notifications = activeRegs.map((r) => ({
                userid: r.donor.userid,
                type: notification_type.SYSTEM,
                title,
                message,
                sentat: new Date(),
            }));

            await prisma.notification.createMany({
                data: notifications,
            });
        } catch (err) {
            console.error("Failed to notify registered donors of camp update/cancellation:", err);
        }
    }
}
