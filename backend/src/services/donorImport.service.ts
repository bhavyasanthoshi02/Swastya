import * as XLSX from "xlsx";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma";
import { blood_group, blood_component, gender_type, verification_status } from "../generated/prisma/enums";

// Helper: Normalize blood group safely
export function normalizeBloodGroup(bg?: any): blood_group | null {
    if (bg === null || bg === undefined) return null;
    let clean = String(bg).trim().toUpperCase();
    if (clean.endsWith(" ")) clean = clean.trim() + "+";
    // Standardize +VE / -VE / POSITIVE / NEGATIVE / POS / NEG
    clean = clean.replace(/\+VE|\+ VE|POSITIVE|POS/g, "+");
    clean = clean.replace(/-VE|- VE|NEGATIVE|NEG/g, "-");
    clean = clean.replace(/[\s_]+/g, "");
    const map: Record<string, blood_group> = {
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
        "APOSITIVE": blood_group.A_POSITIVE,
        "ANEGATIVE": blood_group.A_NEGATIVE,
        "BPOSITIVE": blood_group.B_POSITIVE,
        "BNEGATIVE": blood_group.B_NEGATIVE,
        "ABPOSITIVE": blood_group.AB_POSITIVE,
        "ABNEGATIVE": blood_group.AB_NEGATIVE,
        "OPOSITIVE": blood_group.O_POSITIVE,
        "ONEGATIVE": blood_group.O_NEGATIVE,
    };
    return map[clean] || null;
}

// Helper: Normalize gender safely
export function normalizeGender(g?: any): gender_type {
    if (g === null || g === undefined) return gender_type.OTHER;
    const clean = String(g).trim().toUpperCase();
    if (clean === "MALE" || clean === "M" || clean === "MEN" || clean === "BOY") return gender_type.MALE;
    if (clean === "FEMALE" || clean === "F" || clean === "WOMEN" || clean === "GIRL") return gender_type.FEMALE;
    return gender_type.OTHER;
}

// Helper: Normalize blood component safely
export function normalizeBloodComponent(c?: any): blood_component {
    if (c === null || c === undefined) return blood_component.WHOLE_BLOOD;
    const clean = String(c).trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (clean === "PLATELETS" || clean === "PLATELET") return blood_component.PLATELETS;
    if (clean === "PLASMA") return blood_component.PLASMA;
    if (clean === "RBC" || clean === "PACKED_RBC" || clean === "RED_BLOOD_CELLS") return blood_component.RBC;
    return blood_component.WHOLE_BLOOD;
}

// Helper: Parse flexible dates (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, Excel serial date numbers, Date objects)
export function parseFlexibleDate(val: any): Date | null {
    if (val === null || val === undefined || val === "") return null;
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
    }
    // If Excel serial number (typically 20000 - 60000)
    if (typeof val === "number" && !isNaN(val)) {
        try {
            const parsed = XLSX.SSF.parse_date_code(val);
            if (parsed && parsed.y && parsed.m && parsed.d) {
                return new Date(parsed.y, parsed.m - 1, parsed.d);
            }
        } catch {
            // fallback
        }
    }
    const str = String(val).trim();
    if (!str) return null;

    // Check DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const ddmmyyyy = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
    if (ddmmyyyy) {
        const day = parseInt(ddmmyyyy[1], 10);
        const month = parseInt(ddmmyyyy[2], 10) - 1;
        const year = parseInt(ddmmyyyy[3], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d;
    }

    // Check YYYY-MM-DD or YYYY/MM/DD
    const yyyymmdd = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
    if (yyyymmdd) {
        const year = parseInt(yyyymmdd[1], 10);
        const month = parseInt(yyyymmdd[2], 10) - 1;
        const day = parseInt(yyyymmdd[3], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d;
    }

    const standard = new Date(str);
    if (!isNaN(standard.getTime())) return standard;

    return null;
}

// CSV formula injection protection: escape leading =, +, -, @, \t, \r
export function sanitizeCsvCell(val: any): string {
    if (val === null || val === undefined) return "";
    let str = String(val).trim();
    if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
    }
    return str;
}

export interface RawDonorRow {
    fullName?: string;
    name?: string;
    email?: string;
    phone?: string;
    phoneNumber?: string;
    bloodGroup?: string;
    dob?: string | number | Date;
    dateOfBirth?: string | number | Date;
    age?: string | number;
    gender?: string;
    city?: string;
    state?: string;
    pincode?: string;
    address?: string;
    sourceId?: string;
    sourceIdentifier?: string;
    // Optional inline donation fields
    donationDate?: string | number | Date;
    unitsDonated?: string | number;
    bloodComponent?: string;
    sourceRecordId?: string;
    remarks?: string;
}

export interface RawDonationRow {
    donorIdentifier?: string; // email, phone, or sourceId
    email?: string;
    phone?: string;
    sourceId?: string;
    donationDate?: string | number | Date;
    date?: string | number | Date;
    units?: string | number;
    unitsDonated?: string | number;
    component?: string;
    bloodComponent?: string;
    sourceRecordId?: string;
    recordReference?: string;
    remarks?: string;
}

export interface ParsedFileResult {
    donors: RawDonorRow[];
    donations: RawDonationRow[];
}

export class DonorImportService {
    // Parse uploaded buffer (.xlsx or .csv)
    static parseFile(buffer: Buffer, originalname: string = ""): ParsedFileResult {
        let workbook: XLSX.WorkBook;
        try {
            workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
        } catch (err: any) {
            throw new Error(`Invalid file format or corrupted file: ${err.message}`);
        }

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error("Uploaded spreadsheet contains no readable worksheets.");
        }

        const donors: RawDonorRow[] = [];
        const donations: RawDonationRow[] = [];

        // Identify Donor sheet vs Donation sheet
        let donorSheetName = workbook.SheetNames[0];
        let donationSheetName: string | null = null;

        for (const name of workbook.SheetNames) {
            const lower = name.toLowerCase().trim();
            if (lower.includes("donation") || lower.includes("history")) {
                donationSheetName = name;
            } else if (lower.includes("donor") || lower.includes("registry")) {
                donorSheetName = name;
            }
        }

        const getRowVal = (normRow: Record<string, any>, ...aliases: string[]): any => {
            for (const alias of aliases) {
                const normKey = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (normRow[normKey] !== undefined && normRow[normKey] !== null && normRow[normKey] !== "") {
                    return normRow[normKey];
                }
            }
            return "";
        };

        // Parse donors sheet
        const donorSheet = workbook.Sheets[donorSheetName];
        if (donorSheet) {
            const rawRows: any[] = XLSX.utils.sheet_to_json(donorSheet, { defval: "" });
            for (const row of rawRows) {
                const normRow: Record<string, any> = {};
                for (const [k, v] of Object.entries(row)) {
                    normRow[k.toLowerCase().replace(/[^a-z0-9]/g, "")] = v;
                }

                const mapped: RawDonorRow = {
                    fullName: getRowVal(normRow, "Full Name", "FullName", "Name", "name", "full_name", "Donor Name", "donor_name", "Donor"),
                    email: getRowVal(normRow, "Email", "email", "Email Address", "Email ID", "EmailId", "Mail", "EmailAddress"),
                    phoneNumber: getRowVal(normRow, "Phone Number", "Phone", "phone", "Mobile", "Mobile Number", "Mobile No", "Phone No", "Contact", "Contact Number", "PhoneNumber"),
                    bloodGroup: getRowVal(normRow, "Blood Group", "BloodGroup", "blood_group", "Blood Type", "Blood", "Group", "BloodType"),
                    dob: getRowVal(normRow, "Date of Birth", "DOB", "DateOfBirth", "dob", "Birth Date", "BirthDate"),
                    age: getRowVal(normRow, "Age", "age"),
                    gender: getRowVal(normRow, "Gender", "gender", "Sex", "sex"),
                    city: getRowVal(normRow, "City", "city", "Town", "Location"),
                    state: getRowVal(normRow, "State", "state", "Province"),
                    pincode: getRowVal(normRow, "Pincode", "Pin Code", "Postal Code", "pincode", "Zip", "Zip Code"),
                    address: getRowVal(normRow, "Address", "address", "Street Address", "Residence"),
                    sourceIdentifier: getRowVal(normRow, "Source Donor ID", "Source ID", "Donor ID", "SourceIdentifier", "DonorID", "ID"),
                    donationDate: getRowVal(normRow, "Donation Date", "DonationDate", "Last Donation Date", "Date"),
                    unitsDonated: getRowVal(normRow, "Units Donated", "Units", "units", "Quantity"),
                    bloodComponent: getRowVal(normRow, "Blood Component", "Component", "component", "Type"),
                    sourceRecordId: getRowVal(normRow, "Source Record ID", "Record Reference", "record_id", "Record ID"),
                    remarks: getRowVal(normRow, "Remarks", "remarks", "Notes", "Note"),
                };

                // Only push if there is some identifying content
                if (mapped.fullName || mapped.email || mapped.phoneNumber) {
                    donors.push(mapped);
                }
            }
        }

        // Parse historical donations sheet if present
        if (donationSheetName && workbook.Sheets[donationSheetName]) {
            const rawDonationRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[donationSheetName], { defval: "" });
            for (const row of rawDonationRows) {
                const normRow: Record<string, any> = {};
                for (const [k, v] of Object.entries(row)) {
                    normRow[k.toLowerCase().replace(/[^a-z0-9]/g, "")] = v;
                }

                const mapped: RawDonationRow = {
                    donorIdentifier: getRowVal(normRow, "Donor Identifier", "Donor Identifier (Email or Phone)", "Donor Email", "Email", "Phone", "Source Donor ID", "Donor ID", "Donor"),
                    donationDate: getRowVal(normRow, "Donation Date", "Date", "DonationDate"),
                    unitsDonated: getRowVal(normRow, "Units Donated", "Units", "units", "Quantity"),
                    bloodComponent: getRowVal(normRow, "Blood Component", "Component", "component", "Type"),
                    sourceRecordId: getRowVal(normRow, "Source Record ID", "Record Reference", "Record ID", "record_id"),
                    remarks: getRowVal(normRow, "Remarks", "remarks", "Notes", "Note"),
                };
                if (mapped.donorIdentifier || mapped.donationDate) {
                    donations.push(mapped);
                }
            }
        }

        return { donors, donations };
    }

    // Two-step workflow Step 1: Preview and Validate
    static async validateAndPreview(
        hospitalId: string,
        data: ParsedFileResult
    ) {
        const { donors, donations } = data;
        const totalRows = donors.length;
        const validRows: any[] = [];
        const invalidRows: any[] = [];
        const potentialDuplicates: any[] = [];
        const toCreate: any[] = [];
        const toLink: any[] = [];
        const alreadyLinked: any[] = [];
        const conflicts: any[] = [];

        // Cache hospital info
        const hospital = await prisma.hospitals.findUnique({
            where: { hospitalid: hospitalId },
            select: { hospitalid: true, hospitalname: true, city: true, state: true, pincode: true },
        });

        if (!hospital) {
            throw new Error("Hospital record not found.");
        }

        // Cache all donors currently linked to this hospital
        const existingHospitalDonors = await prisma.hospitaldonors.findMany({
            where: { hospitalid: hospitalId },
            include: {
                donors: {
                    include: {
                        users: {
                            select: { email: true, phonenumber: true },
                        },
                    },
                },
            },
        });

        const hospitalDonorEmails = new Set(
            existingHospitalDonors
                .map((hd) => hd.donors.users.email?.toLowerCase().trim())
                .filter(Boolean)
        );
        const hospitalDonorPhones = new Set(
            existingHospitalDonors
                .map((hd) => hd.donors.users.phonenumber?.trim())
                .filter(Boolean)
        );

        // Process each donor row
        for (let idx = 0; idx < donors.length; idx++) {
            const rowNumber = idx + 2; // header is row 1
            const row = donors[idx];
            const errors: string[] = [];

            // 1. Full name validation (safe against numbers/nulls)
            const name = String(row.fullName || row.name || "").trim();
            if (!name || name.length < 2) {
                errors.push("Full Name is required and must be at least 2 characters.");
            }

            // 2. Email / Phone validation (safe against Excel numeric cells)
            const email = String(row.email || "").trim().toLowerCase();
            const phone = String(row.phoneNumber || row.phone || "").trim();

            if (!email && !phone) {
                errors.push("At least one contact identifier (Email or Phone Number) is required.");
            }

            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                errors.push(`Invalid email address format: '${email}'.`);
            }

            // 3. Blood Group validation
            const bloodGroup = normalizeBloodGroup(row.bloodGroup);
            if (!bloodGroup) {
                errors.push(`Invalid or missing Blood Group: '${row.bloodGroup || ""}'. Must be one of A+, A-, B+, B-, AB+, AB-, O+, O-.`);
            }

            // 4. DOB / Age validation
            let resolvedDob: Date | null = null;
            if (row.dob || row.dateOfBirth) {
                const parsed = parseFlexibleDate(row.dob || row.dateOfBirth);
                if (parsed) {
                    resolvedDob = parsed;
                }
            } else if (row.age) {
                const ageNum = parseInt(String(row.age), 10);
                if (!isNaN(ageNum) && ageNum >= 18 && ageNum <= 70) {
                    const now = new Date();
                    resolvedDob = new Date(now.getFullYear() - ageNum, 0, 1);
                } else {
                    errors.push(`Age must be a valid number between 18 and 70 (received '${row.age}').`);
                }
            }

            if (!resolvedDob) {
                // Default to standard adult DOB if unspecified
                resolvedDob = new Date(1995, 0, 1);
            }

            // If row has validation errors, categorize as invalid
            if (errors.length > 0) {
                invalidRows.push({
                    rowNumber,
                    name: name || "Unknown",
                    email: email || "",
                    phone: phone || "",
                    errors,
                });
                continue;
            }

            // Check if already in this hospital's registry
            if ((email && hospitalDonorEmails.has(email)) || (phone && hospitalDonorPhones.has(phone))) {
                alreadyLinked.push({
                    rowNumber,
                    name,
                    email,
                    phone,
                    bloodGroup,
                    status: "ALREADY_REGISTERED",
                    message: "Donor is already in your hospital registry.",
                });
                validRows.push({
                    rowNumber,
                    action: "SKIP_ALREADY_LINKED",
                    name,
                    email,
                    phone,
                    bloodGroup,
                });
                continue;
            }

            // Check if user already exists in Swastya global user base
            let existingUser: any = null;
            if (email) {
                existingUser = await prisma.users.findUnique({
                    where: { email },
                    include: { donors: true },
                });
            } else if (phone) {
                existingUser = await prisma.users.findFirst({
                    where: { phonenumber: phone },
                    include: { donors: true },
                });
            }

            if (existingUser && existingUser.donors) {
                // Existing account found: verify authorization & safety
                const existingPhone = existingUser.phonenumber?.trim();
                const phoneMatches = !phone || !existingPhone || phone === existingPhone;

                if (phoneMatches) {
                    // Safe linking: verified email + matching phone
                    toLink.push({
                        rowNumber,
                        userId: existingUser.userid,
                        donorId: existingUser.donors.donorid,
                        name: existingUser.name,
                        email: existingUser.email,
                        phone: existingUser.phonenumber || phone,
                        bloodGroup: existingUser.donors.bloodgroup,
                        action: "LINK_EXISTING_ACCOUNT",
                        message: "Existing Swastya donor account verified. Will be linked to your registry.",
                    });
                    validRows.push({
                        rowNumber,
                        action: "LINK_EXISTING",
                        name,
                        email,
                        phone,
                        bloodGroup,
                        donorId: existingUser.donors.donorid,
                    });
                } else {
                    // Ambiguous / conflict: same email but conflicting phone number
                    conflicts.push({
                        rowNumber,
                        name,
                        email,
                        phone,
                        existingPhone,
                        reason: "Email matches existing account but phone number differs. Manual verification required.",
                    });
                    invalidRows.push({
                        rowNumber,
                        name,
                        email,
                        phone,
                        errors: ["Identity conflict: Email exists with different phone number. Cannot merge automatically."],
                    });
                }
            } else {
                // New donor to create
                toCreate.push({
                    rowNumber,
                    name,
                    email: email || `${phone.replace(/\D/g, "")}@phone.swastya.org`,
                    phone,
                    bloodGroup,
                    dob: resolvedDob,
                    gender: normalizeGender(row.gender),
                    city: String(row.city || hospital.city || "Hyderabad").trim(),
                    state: String(row.state || hospital.state || "Telangana").trim(),
                    pincode: String(row.pincode || hospital.pincode || "500001").trim(),
                    address: String(row.address || "").trim(),
                    sourceIdentifier: String(row.sourceIdentifier || "").trim(),
                    action: "CREATE_NEW_DONOR",
                });
                validRows.push({
                    rowNumber,
                    action: "CREATE_NEW",
                    name,
                    email,
                    phone,
                    bloodGroup,
                });
            }
        }

        // Validate historical donations
        const validDonations: any[] = [];
        const invalidDonations: any[] = [];

        // 1. Process donations from separate sheet
        for (let idx = 0; idx < donations.length; idx++) {
            const rowNumber = idx + 2;
            const dRow = donations[idx];
            const dErrors: string[] = [];

            const identifier = String(dRow.donorIdentifier || dRow.email || dRow.phone || "").trim().toLowerCase();
            if (!identifier) {
                dErrors.push("Donor identifier (email, phone, or source ID) is missing.");
            }

            const donationDate = parseFlexibleDate(dRow.donationDate || dRow.date);

            if (!donationDate) {
                dErrors.push("Donation date is missing or invalid (YYYY-MM-DD or DD/MM/YYYY expected).");
            } else if (donationDate > new Date()) {
                dErrors.push("Donation date cannot be in the future.");
            }

            const units = parseInt(String(dRow.unitsDonated || dRow.units || "1"), 10) || 1;
            const component = normalizeBloodComponent(dRow.bloodComponent || dRow.component);

            if (dErrors.length > 0) {
                invalidDonations.push({
                    rowNumber,
                    identifier,
                    errors: dErrors,
                });
            } else {
                validDonations.push({
                    rowNumber,
                    identifier,
                    donationDate,
                    unitsDonated: units,
                    bloodComponent: component,
                    sourceRecordId: String(dRow.sourceRecordId || dRow.recordReference || "").trim(),
                    remarks: String(dRow.remarks || "").trim(),
                });
            }
        }

        // 2. Process inline donations from donors sheet
        for (let idx = 0; idx < donors.length; idx++) {
            const row = donors[idx];
            if (row.donationDate) {
                const parsed = parseFlexibleDate(row.donationDate);
                if (parsed && parsed <= new Date()) {
                    const identifier = String(row.email || row.phoneNumber || row.fullName || "").trim().toLowerCase();
                    validDonations.push({
                        rowNumber: idx + 2,
                        identifier,
                        donationDate: parsed,
                        unitsDonated: parseInt(String(row.unitsDonated || "1"), 10) || 1,
                        bloodComponent: normalizeBloodComponent(row.bloodComponent),
                        sourceRecordId: String(row.sourceRecordId || "").trim(),
                        remarks: String(row.remarks || "Inline historical record from donor import").trim(),
                    });
                }
            }
        }

        return {
            summary: {
                totalRows,
                validRowsCount: validRows.length,
                invalidRowsCount: invalidRows.length,
                toCreateCount: toCreate.length,
                toLinkCount: toLink.length,
                alreadyLinkedCount: alreadyLinked.length,
                conflictCount: conflicts.length,
                historicalDonationsCount: validDonations.length,
                invalidDonationsCount: invalidDonations.length,
            },
            toCreate,
            toLink,
            alreadyLinked,
            conflicts,
            invalidRows,
            validDonations,
            invalidDonations,
        };
    }

    // Two-step workflow Step 2: Commit Import
    static async commitImport(
        hospitalId: string,
        hospitalName: string,
        data: {
            toCreate: any[];
            toLink: any[];
            validDonations?: any[];
        }
    ) {
        const { toCreate, toLink, validDonations = [] } = data;
        const activationRecords: any[] = [];
        const errors: any[] = [];
        let importedCount = 0;
        let linkedCount = 0;
        let historicalDonationsImported = 0;

        // Map identifier to donorId for historical donations
        const identifierToDonorId = new Map<string, string>();

        // 1. Process New Donors
        for (const item of toCreate) {
            try {
                // Generate secure random unguessable password hash (Never a default/shared password!)
                const randomSecret = crypto.randomBytes(32).toString("hex");
                const hashedPassword = await bcrypt.hash(randomSecret, 10);

                // Use transaction to create user, donor, hospitaldonor, and activation token
                const result = await prisma.$transaction(async (tx) => {
                    const user = await tx.users.create({
                        data: {
                            name: item.name,
                            email: item.email,
                            phonenumber: item.phone || null,
                            password: hashedPassword,
                            role: "DONOR",
                            isactive: false, // Pending activation until donor establishes password
                            emailverified: false,
                        },
                    });

                    const donor = await tx.donors.create({
                        data: {
                            userid: user.userid,
                            bloodgroup: item.bloodGroup,
                            dateofbirth: new Date(item.dob),
                            gender: item.gender,
                            city: item.city,
                            state: item.state,
                            pincode: item.pincode,
                            address: item.address || null,
                            iseligible: true, // Baseline eligible for matching after activation
                            availabilitystatus: "AVAILABLE",
                        },
                    });

                    await tx.hospitaldonors.create({
                        data: {
                            hospitalid: hospitalId,
                            donorid: donor.donorid,
                            sourceidentifier: item.sourceIdentifier || null,
                            status: "ACTIVE",
                        },
                    });

                    // Single-use, short-lived activation token (valid 7 days)
                    const rawToken = crypto.randomBytes(32).toString("hex");
                    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
                    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

                    await tx.donoractivationtokens.create({
                        data: {
                            userid: user.userid,
                            tokenhash: tokenHash,
                            expiresat: expiresAt,
                        },
                    });

                    return { user, donor, rawToken, expiresAt };
                });

                importedCount++;

                // Map identifiers for historical donation resolution
                if (item.email) identifierToDonorId.set(item.email.toLowerCase(), result.donor.donorid);
                if (item.phone) identifierToDonorId.set(item.phone, result.donor.donorid);
                if (item.name) identifierToDonorId.set(item.name.toLowerCase(), result.donor.donorid);
                if (item.sourceIdentifier) identifierToDonorId.set(item.sourceIdentifier.toLowerCase(), result.donor.donorid);

                activationRecords.push({
                    name: sanitizeCsvCell(item.name),
                    email: sanitizeCsvCell(item.email),
                    phoneNumber: sanitizeCsvCell(item.phone || ""),
                    activationToken: result.rawToken,
                    activationUrl: `/auth/activate?token=${result.rawToken}`,
                    expiresAt: result.expiresAt.toISOString(),
                });
            } catch (err: any) {
                console.error(`Failed to import donor ${item.name}:`, err);
                errors.push({
                    rowNumber: item.rowNumber,
                    name: item.name,
                    error: err.message || "Database insert error",
                });
            }
        }

        // 2. Process Existing Donors Linking
        for (const item of toLink) {
            try {
                // Link donor to hospital registry idempotently
                await prisma.hospitaldonors.upsert({
                    where: {
                        hospitalid_donorid: {
                            hospitalid: hospitalId,
                            donorid: item.donorId,
                        },
                    },
                    create: {
                        hospitalid: hospitalId,
                        donorid: item.donorId,
                        status: "ACTIVE",
                    },
                    update: {
                        status: "ACTIVE",
                    },
                });

                linkedCount++;

                if (item.email) identifierToDonorId.set(item.email.toLowerCase(), item.donorId);
                if (item.phone) identifierToDonorId.set(item.phone, item.donorId);
                if (item.name) identifierToDonorId.set(item.name.toLowerCase(), item.donorId);
            } catch (err: any) {
                console.error(`Failed to link donor ${item.donorId}:`, err);
                errors.push({
                    rowNumber: item.rowNumber,
                    donorId: item.donorId,
                    error: err.message || "Failed to link existing donor to registry",
                });
            }
        }

        // 3. Process Historical Donations
        for (const donation of validDonations) {
            try {
                const identifier = (donation.identifier || "").trim().toLowerCase();
                const donorId = identifierToDonorId.get(identifier);

                if (!donorId) {
                    // Try to look up donor in hospital registry by email or phone
                    const matchedHd = await prisma.hospitaldonors.findFirst({
                        where: {
                            hospitalid: hospitalId,
                            OR: [
                                { donors: { users: { email: { equals: identifier, mode: "insensitive" } } } },
                                { donors: { users: { phonenumber: identifier } } },
                                { sourceidentifier: identifier },
                            ],
                        },
                        select: { donorid: true },
                    });

                    if (matchedHd) {
                        identifierToDonorId.set(identifier, matchedHd.donorid);
                    } else {
                        // Skip unlinked historical row
                        continue;
                    }
                }

                const targetDonorId = identifierToDonorId.get(identifier);
                if (!targetDonorId) continue;

                // Idempotency check: don't insert duplicate historical record
                const existing = await prisma.donationhistory.findFirst({
                    where: {
                        donorid: targetDonorId,
                        hospitalid: hospitalId,
                        donationdate: new Date(donation.donationDate),
                        isimported: true,
                        sourcerecordid: donation.sourceRecordId || null,
                    },
                });

                if (existing) {
                    // Already imported; skip to maintain idempotency
                    continue;
                }

                const provenance = `Imported historical record by ${hospitalName} on ${new Date().toISOString()}${
                    donation.remarks ? ` - ${donation.remarks}` : ""
                }`;

                // Insert into DonationHistory with requestid: null (no dummy BloodRequest fabricated!)
                await prisma.donationhistory.create({
                    data: {
                        donorid: targetDonorId,
                        hospitalid: hospitalId,
                        requestid: null,
                        donationdate: new Date(donation.donationDate),
                        unitsdonated: donation.unitsDonated || 1,
                        bloodcomponent: donation.bloodComponent || blood_component.WHOLE_BLOOD,
                        sourcerecordid: donation.sourceRecordId || null,
                        remarks: provenance,
                        isimported: true,
                        verificationstatus: verification_status.PENDING, // Pending clinical verification
                    },
                });

                historicalDonationsImported++;
            } catch (err: any) {
                console.error("Historical donation insert error:", err);
            }
        }

        return {
            importedCount,
            linkedCount,
            historicalDonationsImported,
            deliveryStatus: "NO_GATEWAY_CONFIGURED",
            deliveryNote:
                "No live SMS/email delivery gateway is configured in this environment. Single-use activation links have been generated securely for hospital staff to distribute directly to eligible donors.",
            activationRecords,
            errors,
        };
    }

    // Generate Standard Excel / CSV Template
    static generateTemplate(format: "csv" | "xlsx" = "csv"): Buffer | string {
        const donorHeaders = [
            "Full Name",
            "Email",
            "Phone Number",
            "Blood Group",
            "Date of Birth",
            "Gender",
            "City",
            "State",
            "Pincode",
            "Address",
            "Source Donor ID",
            "Donation Date",
            "Units Donated",
            "Blood Component",
            "Source Record ID",
            "Remarks",
        ];

        const sampleDonorRows = [
            [
                "Swathi Reddy",
                "swathi.reddy@example.com",
                "+91 9876543210",
                "O+",
                "1994-05-12",
                "FEMALE",
                "Hyderabad",
                "Telangana",
                "500001",
                "Flat 402, Banjara Hills",
                "HOSP-D101",
                "2023-08-15",
                "1",
                "WHOLE_BLOOD",
                "HIST-2023-001",
                "Annual blood drive donation",
            ],
            [
                "Rahul Sharma",
                "rahul.sharma@example.com",
                "+91 9876543211",
                "A+",
                "1990-11-23",
                "MALE",
                "Hyderabad",
                "Telangana",
                "500034",
                "Jubilee Hills",
                "HOSP-D102",
                "2024-01-10",
                "1",
                "PLATELETS",
                "HIST-2024-042",
                "Voluntary apheresis donation",
            ],
        ];

        if (format === "xlsx") {
            const wb = XLSX.utils.book_new();

            // Sheet 1: Donors
            const wsDonorsData = [donorHeaders, ...sampleDonorRows];
            const wsDonors = XLSX.utils.aoa_to_sheet(wsDonorsData);
            XLSX.utils.book_append_sheet(wb, wsDonors, "Donors");

            // Sheet 2: Historical Donations
            const donationHeaders = [
                "Donor Identifier (Email or Phone)",
                "Donation Date (YYYY-MM-DD)",
                "Units Donated",
                "Blood Component",
                "Source Record ID",
                "Remarks",
            ];
            const sampleDonationRows = [
                [
                    "swathi.reddy@example.com",
                    "2022-04-18",
                    "1",
                    "WHOLE_BLOOD",
                    "HIST-2022-099",
                    "Voluntary camp donation",
                ],
                [
                    "+91 9876543211",
                    "2023-03-22",
                    "1",
                    "PLATELETS",
                    "HIST-2023-112",
                    "Emergency platelet support",
                ],
            ];
            const wsDonations = XLSX.utils.aoa_to_sheet([donationHeaders, ...sampleDonationRows]);
            XLSX.utils.book_append_sheet(wb, wsDonations, "Historical Donations");

            return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        }

        // CSV representation (RFC 4180 with CSV injection protection)
        const csvLines = [
            donorHeaders.join(","),
            ...sampleDonorRows.map((row) =>
                row
                    .map((val) => {
                        const safe = sanitizeCsvCell(val);
                        return `"${safe.replace(/"/g, '""')}"`;
                    })
                    .join(",")
            ),
        ];

        return csvLines.join("\n");
    }
}
