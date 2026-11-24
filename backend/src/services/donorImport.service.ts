import ExcelJS from "exceljs";
import { Readable } from "stream";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma";
import { blood_group, blood_component, gender_type, verification_status } from "../generated/prisma/enums";
import { getPhoneVariants } from "./msg91.service";

function extractCellValue(val: any): any {
    if (val === null || val === undefined) return "";
    if (val instanceof Date) return val;
    if (typeof val === "object") {
        if ("result" in val && val.result !== undefined) return val.result;
        if ("text" in val && val.text !== undefined) return val.text;
        if ("richText" in val && Array.isArray(val.richText)) {
            return val.richText.map((r: any) => r.text || "").join("");
        }
    }
    return val;
}

function worksheetToObjects(ws: ExcelJS.Worksheet): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    let headers: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        if (rowNumber === 1) {
            headers = values.map((v) => String(extractCellValue(v) ?? "").trim());
            return;
        }
        if (headers.length === 0) return;
        const obj: Record<string, any> = {};
        let hasData = false;
        headers.forEach((h, idx) => {
            if (!h) return;
            const cellVal = extractCellValue(values[idx]);
            if (cellVal !== "" && cellVal !== null && cellVal !== undefined) {
                hasData = true;
            }
            obj[h] = cellVal ?? "";
        });
        if (hasData) rows.push(obj);
    });
    return rows;
}

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
    if (typeof val === "number" && !isNaN(val) && val > 1000 && val < 100000) {
        const utcMs = Math.round((val - 25569) * 86400 * 1000);
        const dt = new Date(utcMs);
        if (!isNaN(dt.getTime())) {
            return dt;
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
        const d = new Date(Date.UTC(year, month, day));
        if (!isNaN(d.getTime())) return d;
    }

    // Check YYYY-MM-DD or YYYY/MM/DD
    const yyyymmdd = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
    if (yyyymmdd) {
        const year = parseInt(yyyymmdd[1], 10);
        const month = parseInt(yyyymmdd[2], 10) - 1;
        const day = parseInt(yyyymmdd[3], 10);
        const d = new Date(Date.UTC(year, month, day));
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
    // Parse uploaded buffer (.xlsx or .csv) using ExcelJS
    static async parseFile(buffer: Buffer, originalname: string = ""): Promise<ParsedFileResult> {
        const lowerName = originalname.toLowerCase();
        if (lowerName.endsWith(".xls") && !lowerName.endsWith(".xlsx")) {
            throw new Error("Legacy .xls binary format is not supported for security reasons; please upload .xlsx or .csv.");
        }

        const workbook = new ExcelJS.Workbook();
        try {
            if (lowerName.endsWith(".csv")) {
                await workbook.csv.read(Readable.from(buffer), { dateFormats: [] });
            } else {
                // Try XLSX first; if ZIP signature is missing and looks like plain text CSV, fallback to CSV
                const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
                if (isZip) {
                    await workbook.xlsx.load(buffer as any);
                } else {
                    await workbook.csv.read(Readable.from(buffer), { dateFormats: [] });
                }
            }
        } catch (err: any) {
            throw new Error(`Invalid file format or corrupted file: ${err.message}`);
        }

        if (!workbook.worksheets || workbook.worksheets.length === 0) {
            throw new Error("Uploaded spreadsheet contains no readable worksheets.");
        }

        const donors: RawDonorRow[] = [];
        const donations: RawDonationRow[] = [];

        // Identify Donor sheet vs Donation sheet
        let donorSheet: ExcelJS.Worksheet = workbook.worksheets[0];
        let donationSheet: ExcelJS.Worksheet | null = null;

        for (const ws of workbook.worksheets) {
            const lower = (ws.name || "").toLowerCase().trim();
            if (lower.includes("donation") || lower.includes("history")) {
                donationSheet = ws;
            } else if (lower.includes("donor") || lower.includes("registry")) {
                donorSheet = ws;
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
        if (donorSheet) {
            const rawRows = worksheetToObjects(donorSheet);
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
        if (donationSheet) {
            const rawDonationRows = worksheetToObjects(donationSheet);
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
        data: ParsedFileResult,
        db: any = prisma
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
        const hospital = await db.hospitals.findUnique({
            where: { hospitalid: hospitalId },
            select: { hospitalid: true, hospitalname: true, city: true, state: true, pincode: true },
        });

        if (!hospital) {
            throw new Error("Hospital record not found.");
        }

        // Cache all donors currently linked to this hospital
        const existingHospitalDonors = await db.hospitaldonors.findMany({
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
                .map((hd: any) => hd.donors.users.email?.toLowerCase().trim())
                .filter(Boolean)
        );
        const hospitalDonorPhones = new Set<string>();
        for (const hd of existingHospitalDonors) {
            const raw = hd.donors.users.phonenumber?.trim();
            if (raw) {
                getPhoneVariants(raw).forEach((v) => hospitalDonorPhones.add(v));
            }
        }

        const seenPhonesInBatch = new Set<string>();
        const seenEmailsInBatch = new Set<string>();
        let duplicateInBatchCount = 0;

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

            // 2. Email / Phone validation & normalization
            const email = String(row.email || "").trim().toLowerCase();
            const rawPhone = String(row.phoneNumber || row.phone || "").trim();
            const digits = rawPhone.replace(/\D/g, "");

            if (!email && !rawPhone) {
                errors.push("At least one contact identifier (Email or Phone Number) is required.");
            }

            if (rawPhone && digits.length < 10) {
                errors.push(`Invalid phone number '${rawPhone}': minimum 10 digits required.`);
            }

            // Normalize mobile number to standard E.164
            let normalizedPhone = "";
            if (digits.length === 10) {
                normalizedPhone = `+91${digits}`;
            } else if (digits.length === 12 && digits.startsWith("91")) {
                normalizedPhone = `+${digits}`;
            } else if (rawPhone.startsWith("+")) {
                normalizedPhone = rawPhone.replace(/[^\d+]/g, "");
            } else if (digits) {
                normalizedPhone = `+${digits}`;
            }

            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                errors.push(`Invalid email address format: '${email}'.`);
            }

            // 3. In-batch duplicate detection within uploaded spreadsheet
            let isDuplicateInBatch = false;
            if (normalizedPhone) {
                const variants = getPhoneVariants(normalizedPhone);
                if (variants.some((v) => seenPhonesInBatch.has(v))) {
                    isDuplicateInBatch = true;
                }
            }
            if (email && seenEmailsInBatch.has(email)) {
                isDuplicateInBatch = true;
            }

            if (isDuplicateInBatch) {
                duplicateInBatchCount++;
                alreadyLinked.push({
                    rowNumber,
                    name: name || "Unknown",
                    email,
                    phone: normalizedPhone || rawPhone,
                    bloodGroup: normalizeBloodGroup(row.bloodGroup) || "O+",
                    status: "DUPLICATE_IN_FILE",
                    message: `Duplicate record in uploaded file. Only the first entry will be processed.`,
                });
                continue;
            }

            // Register in batch seen sets
            if (normalizedPhone) {
                getPhoneVariants(normalizedPhone).forEach((v) => seenPhonesInBatch.add(v));
            }
            if (email) {
                seenEmailsInBatch.add(email);
            }

            // 4. Blood Group validation
            const bloodGroup = normalizeBloodGroup(row.bloodGroup);
            if (!bloodGroup) {
                errors.push(`Invalid or missing Blood Group: '${row.bloodGroup || ""}'. Must be one of A+, A-, B+, B-, AB+, AB-, O+, O-.`);
            }

            // 5. DOB / Age validation
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
                    phone: normalizedPhone || rawPhone || "",
                    errors,
                });
                continue;
            }

            // Check if already in this hospital's registry
            const isAlreadyInHospital =
                (email && hospitalDonorEmails.has(email)) ||
                (normalizedPhone && getPhoneVariants(normalizedPhone).some((v) => hospitalDonorPhones.has(v)));

            if (isAlreadyInHospital) {
                alreadyLinked.push({
                    rowNumber,
                    name,
                    email,
                    phone: normalizedPhone,
                    bloodGroup,
                    status: "ALREADY_REGISTERED",
                    message: "Donor is already in your hospital registry.",
                });
                validRows.push({
                    rowNumber,
                    action: "SKIP_ALREADY_LINKED",
                    name,
                    email,
                    phone: normalizedPhone,
                    bloodGroup,
                });
                continue;
            }

            // Check if user already exists in Swastya global user base
            let existingUser: any = null;
            if (normalizedPhone) {
                existingUser = await db.users.findFirst({
                    where: { phonenumber: { in: getPhoneVariants(normalizedPhone) } },
                    include: { donors: true },
                });
            }
            if (!existingUser && email) {
                existingUser = await db.users.findUnique({
                    where: { email },
                    include: { donors: true },
                });
            }

            if (existingUser && existingUser.role !== "DONOR" && !existingUser.donors) {
                // Mobile or email belongs to an existing organizational account (Hospital/BloodBank)
                conflicts.push({
                    rowNumber,
                    name,
                    email,
                    phone: normalizedPhone,
                    reason: `Mobile number is already registered under an existing non-donor account (${existingUser.role}).`,
                });
                invalidRows.push({
                    rowNumber,
                    name,
                    email,
                    phone: normalizedPhone,
                    errors: [`Identity conflict: Mobile number belongs to an existing ${existingUser.role} account.`],
                });
            } else if (existingUser && existingUser.donors) {
                // Existing donor account found: reuse account and link to this hospital registry
                toLink.push({
                    rowNumber,
                    donorId: existingUser.donors.donorid,
                    userId: existingUser.userid,
                    name: existingUser.name || name,
                    email: existingUser.email || email,
                    phone: existingUser.phonenumber || normalizedPhone,
                    bloodGroup: existingUser.donors.bloodgroup || bloodGroup,
                    action: "LINK_EXISTING_ACCOUNT",
                    message: "Existing Swastya donor identified by mobile number. Linked to your hospital registry.",
                });
                validRows.push({
                    rowNumber,
                    action: "LINK_EXISTING",
                    donorId: existingUser.donors.donorid,
                    name,
                    email,
                    phone: normalizedPhone,
                    bloodGroup,
                });
            } else {
                // New donor to create and link to hospital
                const generatedEmail = email || `${digits || crypto.randomBytes(4).toString("hex")}@donor.swastya.org`;
                toCreate.push({
                    rowNumber,
                    name,
                    email: generatedEmail,
                    phone: normalizedPhone,
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
                    email: generatedEmail,
                    phone: normalizedPhone,
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

    // Two-step workflow Step 2: Secure Backend Revalidation & Atomic Commit
    static async revalidateAndCommit(
        hospitalId: string,
        hospitalName: string,
        input: {
            parsed?: ParsedFileResult;
            toCreate?: any[];
            toLink?: any[];
            validDonations?: any[];
        }
    ) {
        // Reconstruct raw unvalidated rows from client payload (never trust client-supplied donorId/userId/classifications)
        let rawInput: ParsedFileResult;
        if (input.parsed) {
            rawInput = input.parsed;
        } else {
            const rawDonors: RawDonorRow[] = [];
            for (const item of input.toCreate || []) {
                rawDonors.push({
                    fullName: item?.name ?? item?.fullName ?? "",
                    email: item?.email ?? "",
                    phoneNumber: item?.phone ?? item?.phoneNumber ?? "",
                    bloodGroup: item?.bloodGroup ?? item?.bloodgroup ?? "",
                    dob: item?.dob ?? item?.dateofbirth ?? "",
                    gender: item?.gender ?? "",
                    city: item?.city ?? "",
                    state: item?.state ?? "",
                    pincode: item?.pincode ?? "",
                    address: item?.address ?? "",
                    sourceIdentifier: item?.sourceIdentifier ?? "",
                });
            }
            for (const item of input.toLink || []) {
                rawDonors.push({
                    fullName: item?.name ?? item?.fullName ?? "",
                    email: item?.email ?? "",
                    phoneNumber: item?.phone ?? item?.phoneNumber ?? "",
                    bloodGroup: item?.bloodGroup ?? item?.bloodgroup ?? "O+",
                    dob: item?.dob ?? "1990-01-01",
                    gender: item?.gender ?? "OTHER",
                    city: item?.city ?? "",
                    state: item?.state ?? "",
                    pincode: item?.pincode ?? "",
                    address: item?.address ?? "",
                    sourceIdentifier: item?.sourceIdentifier ?? "",
                });
            }
            const rawDonations: RawDonationRow[] = (input.validDonations || []).map((d: any) => ({
                donorIdentifier: d?.identifier ?? d?.donorIdentifier ?? "",
                donationDate: d?.donationDate ?? "",
                unitsDonated: d?.unitsDonated ?? 1,
                bloodComponent: d?.bloodComponent ?? "WHOLE_BLOOD",
                sourceRecordId: d?.sourceRecordId ?? "",
                remarks: d?.remarks ?? "",
            }));
            rawInput = { donors: rawDonors, donations: rawDonations };
        }

        // Pre-hash random passwords outside transaction lock to keep DB lock duration minimal
        const preHashedSecrets = await Promise.all(
            rawInput.donors.map(async () => {
                const randomSecret = crypto.randomBytes(32).toString("hex");
                return bcrypt.hash(randomSecret, 10);
            })
        );

        return await prisma.$transaction(
            async (tx) => {
                // Serialize concurrent commits for the same hospital
                await tx.$executeRawUnsafe(
                    `SELECT pg_advisory_xact_lock(hashtext($1))`,
                    `donor-import:${hospitalId}`
                );

                // Revalidate every row against live database state inside the locked transaction
                const revalidated = await DonorImportService.validateAndPreview(hospitalId, rawInput, tx);

                const activationRecords: any[] = [];
                const errors: any[] = [
                    ...revalidated.invalidRows.map((r: any) => ({
                        rowNumber: r.rowNumber,
                        name: r.raw?.fullName || "Unknown",
                        error: (r.errors || []).join("; "),
                    })),
                    ...revalidated.conflicts.map((c: any) => ({
                        rowNumber: c.rowNumber,
                        name: c.name,
                        error: c.reason,
                    })),
                ];
                let importedCount = 0;
                let linkedCount = 0;
                let historicalDonationsImported = 0;
                const identifierToDonorId = new Map<string, string>();

                // 1. Create validated new donors atomically
                for (let i = 0; i < revalidated.toCreate.length; i++) {
                    const item = revalidated.toCreate[i];
                    const hashedPassword = preHashedSecrets[i % Math.max(1, preHashedSecrets.length)];

                    const user = await tx.users.create({
                        data: {
                            name: item.name,
                            email: item.email,
                            phonenumber: item.phone || null,
                            password: hashedPassword,
                            role: "DONOR",
                            isactive: false,
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
                            iseligible: true,
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

                    importedCount++;
                    if (item.email) identifierToDonorId.set(item.email.toLowerCase(), donor.donorid);
                    if (item.phone) identifierToDonorId.set(item.phone, donor.donorid);
                    if (item.name) identifierToDonorId.set(item.name.toLowerCase(), donor.donorid);
                    if (item.sourceIdentifier) identifierToDonorId.set(item.sourceIdentifier.toLowerCase(), donor.donorid);

                    activationRecords.push({
                        name: sanitizeCsvCell(item.name),
                        email: sanitizeCsvCell(item.email),
                        phoneNumber: sanitizeCsvCell(item.phone || ""),
                        activationToken: rawToken,
                        activationUrl: `/auth/activate?token=${rawToken}`,
                        expiresAt: expiresAt.toISOString(),
                    });
                }

                // 2. Link validated existing donors atomically
                for (const item of revalidated.toLink) {
                    await tx.hospitaldonors.upsert({
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
                }

                // 3. Insert validated historical donations atomically
                for (const donation of revalidated.validDonations) {
                    const identifier = (donation.identifier || "").trim().toLowerCase();
                    let targetDonorId = identifierToDonorId.get(identifier);

                    if (!targetDonorId) {
                        const matchedHd = await tx.hospitaldonors.findFirst({
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
                            targetDonorId = matchedHd.donorid;
                            identifierToDonorId.set(identifier, targetDonorId);
                        }
                    }

                    if (!targetDonorId) continue;

                    const existing = await tx.donationhistory.findFirst({
                        where: {
                            donorid: targetDonorId,
                            hospitalid: hospitalId,
                            donationdate: new Date(donation.donationDate),
                            isimported: true,
                            sourcerecordid: donation.sourceRecordId || null,
                        },
                    });
                    if (existing) continue;

                    const provenance = `Imported historical record by ${hospitalName} on ${new Date().toISOString()}${
                        donation.remarks ? ` - ${donation.remarks}` : ""
                    }`;

                    await tx.donationhistory.create({
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
                            verificationstatus: verification_status.PENDING,
                        },
                    });

                    // Synchronize donor's last donation date if this historical date is more recent
                    const currentDonor = await tx.donors.findUnique({
                        where: { donorid: targetDonorId },
                        select: { lastdonationdate: true },
                    });
                    const dDate = new Date(donation.donationDate);
                    if (!currentDonor?.lastdonationdate || dDate > new Date(currentDonor.lastdonationdate)) {
                        await tx.donors.update({
                            where: { donorid: targetDonorId },
                            data: { lastdonationdate: dDate },
                        });
                    }

                    historicalDonationsImported++;
                }

                return {
                    successfulCount: importedCount + linkedCount,
                    duplicateCount: revalidated.alreadyLinked.length,
                    failedCount: errors.length,
                    importedCount,
                    linkedCount,
                    historicalDonationsImported,
                    skippedDuplicatesCount: revalidated.alreadyLinked.length,
                    conflictsCount: revalidated.conflicts.length,
                    deliveryStatus: "NO_GATEWAY_CONFIGURED",
                    deliveryNote:
                        "No live SMS/email delivery gateway is configured in this environment. Single-use activation links have been generated securely for hospital staff to distribute directly to eligible donors.",
                    activationRecords,
                    errors,
                };
            },
            { timeout: 30000 }
        );
    }

    // Generate Standard Excel / CSV Template
    static async generateTemplate(format: "csv" | "xlsx" = "csv"): Promise<Buffer | string> {
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
            const wb = new ExcelJS.Workbook();

            // Sheet 1: Donors
            const wsDonors = wb.addWorksheet("Donors");
            wsDonors.addRow(donorHeaders);
            sampleDonorRows.forEach((r) => wsDonors.addRow(r));

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
            const wsDonations = wb.addWorksheet("Historical Donations");
            wsDonations.addRow(donationHeaders);
            sampleDonationRows.forEach((r) => wsDonations.addRow(r));

            const buf = await wb.xlsx.writeBuffer();
            return Buffer.from(buf);
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
