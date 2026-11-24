import { Router, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma";
import { generateToken } from "../utils/jwt";
import { authenticate } from "../middleware/auth.middleware";
import { blood_group, gender_type, user_role, availability_status, approval_status } from "../generated/prisma/enums";
import { validateCoordinates } from "../utils/distance";
import { Msg91Service, getPhoneVariants } from "../services/msg91.service";

const router = Router();

const normalizeBloodGroup = (bg?: string): blood_group | null => {
    if (!bg) return null;
    const clean = bg.trim().toUpperCase();
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
    };
    return map[clean] || null;
};

const normalizeGender = (g?: string): gender_type | null => {
    if (!g) return null;
    const clean = g.trim().toUpperCase();
    const map: Record<string, gender_type> = {
        "MALE": gender_type.MALE,
        "FEMALE": gender_type.FEMALE,
        "OTHER": gender_type.OTHER,
    };
    return map[clean] || null;
};

const PUBLIC_REGISTRATION_ROLES: Record<string, user_role> = {
    "DONOR": user_role.DONOR,
    "REQUESTER": user_role.REQUESTER,
    "HOSPITAL": user_role.HOSPITAL,
    "BLOOD_BANK": user_role.BLOOD_BANK,
    "PATIENT": user_role.REQUESTER,
};

const normalizePublicRole = (r?: string): user_role | null => {
    if (!r) return user_role.DONOR;
    const clean = r.trim().toUpperCase();
    return PUBLIC_REGISTRATION_ROLES[clean] || null;
};

router.get("/test", (_req, res) => {
    if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ success: false, message: "Not found" });
    }
    return res.json({
        message: "Auth route working",
    });
});

/*
 * GET CURRENT AUTHENTICATED USER
 * GET /auth/me
 */
router.get("/me", authenticate, async (req: Request, res: Response) => {
    try {
        const userid = (req as any).user?.userid;
        if (!userid) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const user = await prisma.users.findUnique({
            where: { userid },
            include: {
                donors: true,
                requesters: true,
                hospitals: true,
                bloodbanks: true,
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (!user.isactive) {
            return res.status(403).json({
                success: false,
                message: "Account is deactivated or pending activation",
            });
        }

        // Return only safe fields - never leak password or hash
        const { password: _password, ...safeUser } = user;

        return res.status(200).json({
            success: true,
            user: safeUser,
            donor: user.donors || null,
            requester: user.requesters || null,
            hospital: user.hospitals || null,
            bloodbank: user.bloodbanks || null,
        });
    } catch (error) {
        console.error("Auth Me Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve authenticated user",
        });
    }
});

/*
 * REGISTER USER
 * POST /auth/register
 */
router.post("/register", async (req: Request, res: Response) => {
    try {
        const {
            name,
            email,
            password,
            phoneNumber,
            phone,
            role,
            // Donor specific fields
            bloodgroup,
            bloodGroup,
            dateofbirth,
            dateOfBirth,
            dob,
            gender,
            city,
            donorCity,
            state,
            donorState,
            pincode,
            donorPincode,
            weight,
            address,
        } = req.body;

        // Basic user validation
        if (!name || typeof name !== "string" || name.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Full name is required",
            });
        }

        if (!email || typeof email !== "string" || !email.includes("@")) {
            return res.status(400).json({
                success: false,
                message: "Valid email is required",
            });
        }

        if (!password || typeof password !== "string" || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long",
            });
        }

        if (typeof role === "string" && role.trim().toUpperCase() === "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Administrative accounts cannot be self-registered. Contact a system administrator.",
            });
        }

        const targetRole = normalizePublicRole(typeof role === "string" ? role : undefined);
        if (!targetRole) {
            return res.status(400).json({
                success: false,
                message: "Invalid registration role. Allowed roles: DONOR, REQUESTER, HOSPITAL, BLOOD_BANK.",
            });
        }

        let validBloodGroup: blood_group | null = null;
        let parsedDob: Date | null = null;
        let validGender: gender_type | null = null;
        let parsedWeight: number | null = null;
        let rawCity = "";
        let rawState = "";
        let rawPincode = "";

        // When registering as a DONOR, validate required donor schema fields before hitting DB
        if (targetRole === user_role.DONOR) {
            const rawBloodGroup = bloodgroup || bloodGroup;
            const rawDob = dateofbirth || dateOfBirth || dob;
            const rawGender = gender;
            rawCity = (city || donorCity || "").trim();
            rawState = (state || donorState || "").trim();
            rawPincode = (pincode || donorPincode || "").trim();

            const missingDonorFields: string[] = [];
            if (!rawBloodGroup) missingDonorFields.push("bloodgroup");
            if (!rawDob) missingDonorFields.push("dateofbirth");
            if (!rawGender) missingDonorFields.push("gender");
            if (!rawCity) missingDonorFields.push("city");
            if (!rawState) missingDonorFields.push("state");
            if (!rawPincode) missingDonorFields.push("pincode");

            // If required donor fields are missing, return clean validation error without creating partial records
            if (missingDonorFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Donor registration requires: ${missingDonorFields.join(", ")}`,
                    missingFields: missingDonorFields,
                });
            }

            validBloodGroup = normalizeBloodGroup(rawBloodGroup);
            if (!validBloodGroup) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid blood group. Valid values: A+, A-, B+, B-, AB+, AB-, O+, O-",
                });
            }

            parsedDob = new Date(rawDob);
            if (isNaN(parsedDob.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date of birth",
                });
            }

            validGender = normalizeGender(rawGender);
            if (!validGender) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid gender. Valid values: MALE, FEMALE, OTHER",
                });
            }

            if (weight !== undefined && weight !== null && weight !== "") {
                const w = parseFloat(weight);
                if (isNaN(w) || w <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid weight value",
                    });
                }
                parsedWeight = w;
            }
        }

        // Prevent duplicate user account
        const existingUser = await prisma.users.findUnique({
            where: {
                email: email.trim().toLowerCase(),
            },
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email already exists",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        let contactNumber = (phoneNumber || phone || "").trim() || null;

        // Verify MSG91 OTP access token if provided during registration
        const rawOtpToken = req.body?.accessToken || req.body?.otpAccessToken;
        if (rawOtpToken && typeof rawOtpToken === "string" && rawOtpToken.trim() !== "") {
            const otpVerification = await Msg91Service.verifyAccessToken(rawOtpToken.trim());
            if (!otpVerification.success || !otpVerification.identifier) {
                return res.status(400).json({
                    success: false,
                    message: otpVerification.message || "Invalid or expired OTP access token.",
                });
            }
            // Derive trusted verified phone directly from MSG91's verification response
            contactNumber = otpVerification.identifier;
        }

        // Prevent duplicate phone number registration across all accounts
        if (contactNumber) {
            const phoneVariants = getPhoneVariants(contactNumber);
            const existingPhoneUser = await prisma.users.findFirst({
                where: {
                    phonenumber: { in: phoneVariants },
                },
            });

            if (existingPhoneUser) {
                return res.status(400).json({
                    success: false,
                    message: "Phone number is already registered with another account",
                });
            }
        }

        // Optional coordinate validation
        let validatedCoords: { latitude?: number; longitude?: number } = {};
        if (
            (req.body.latitude !== undefined && req.body.latitude !== null && String(req.body.latitude).trim() !== "") ||
            (req.body.longitude !== undefined && req.body.longitude !== null && String(req.body.longitude).trim() !== "")
        ) {
            const coordValidation = validateCoordinates(req.body.latitude, req.body.longitude);
            if (!coordValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: coordValidation.error,
                });
            }
            validatedCoords = {
                latitude: coordValidation.latitude,
                longitude: coordValidation.longitude,
            };
        }

        // When registering as a DONOR, use atomic transaction
        if (targetRole === user_role.DONOR && validBloodGroup && parsedDob && validGender) {

            // Atomic Prisma Transaction: creates User and linked Donor together
            const result = await prisma.$transaction(async (tx) => {
                const user = await tx.users.create({
                    data: {
                        name: name.trim(),
                        email: email.trim().toLowerCase(),
                        phonenumber: contactNumber,
                        password: hashedPassword,
                        role: user_role.DONOR,
                        isactive: true,
                        emailverified: true,
                    },
                });

                const donor = await tx.donors.create({
                    data: {
                        userid: user.userid,
                        bloodgroup: validBloodGroup,
                        dateofbirth: parsedDob,
                        gender: validGender,
                        weight: parsedWeight,
                        city: rawCity.trim(),
                        state: rawState.trim(),
                        pincode: rawPincode.trim(),
                        address: address ? address.trim() : null,
                        latitude: validatedCoords.latitude ?? null,
                        longitude: validatedCoords.longitude ?? null,
                        availabilitystatus: availability_status.AVAILABLE,
                        iseligible: true,
                    },
                });

                return { user, donor };
            });

            const token = generateToken(result.user.userid, result.user.role);
            const { password: _password, ...safeUser } = result.user;

            return res.status(201).json({
                success: true,
                token,
                user: safeUser,
                donor: result.donor,
                requester: null,
                hospital: null,
                bloodbank: null,
            });
        }

        // When registering as a REQUESTER, atomically create linked requester record
        if (targetRole === user_role.REQUESTER) {
            const reqCity = (city || donorCity || (req.body as any).patientCity || "").trim() || "Not Specified";
            const reqState = (state || donorState || "").trim() || "Not Specified";
            const reqPincode = (pincode || donorPincode || "").trim() || "000000";
            const reqAddress = (address || "").trim() || `${reqCity}, ${reqState}`;

            const result = await prisma.$transaction(async (tx) => {
                const user = await tx.users.create({
                    data: {
                        name: name.trim(),
                        email: email.trim().toLowerCase(),
                        phonenumber: contactNumber,
                        password: hashedPassword,
                        role: user_role.REQUESTER,
                        isactive: true,
                        emailverified: true,
                    },
                });

                const requester = await tx.requesters.create({
                    data: {
                        userid: user.userid,
                        city: reqCity,
                        state: reqState,
                        pincode: reqPincode,
                        address: reqAddress,
                        latitude: validatedCoords.latitude ?? null,
                        longitude: validatedCoords.longitude ?? null,
                    },
                });

                return { user, requester };
            });

            const token = generateToken(result.user.userid, result.user.role);
            const { password: _password, ...safeUser } = result.user;

            return res.status(201).json({
                success: true,
                token,
                user: safeUser,
                donor: null,
                requester: result.requester,
                hospital: null,
                bloodbank: null,
            });
        }

        // When registering as a HOSPITAL, atomically create linked hospital record
        if (targetRole === user_role.HOSPITAL) {
            const rawHospitalName = (req.body.hospitalname || req.body.hospitalName || req.body.orgName || (name || "")).trim();
            const rawRegNumber = (req.body.registrationnumber || req.body.registrationNumber || req.body.regNumber || "").trim();
            const rawContactPerson = (req.body.contactpersonname || req.body.contactPersonName || req.body.contactName || name || "").trim();
            const rawContactPhone = (req.body.contactpersonphone || req.body.contactPersonPhone || contactNumber || "").trim();
            const rawAddress = (address || req.body.hospitalAddress || "").trim();
            const rawCityHosp = (city || req.body.hospitalCity || req.body.instCity || "").trim();
            const rawStateHosp = (state || req.body.hospitalState || req.body.instState || "").trim();
            const rawPincodeHosp = (pincode || req.body.hospitalPincode || req.body.instPincode || "").trim();

            const missingHospitalFields: string[] = [];
            if (!rawHospitalName) missingHospitalFields.push("hospitalname");
            if (!rawRegNumber) missingHospitalFields.push("registrationnumber");
            if (!rawContactPerson) missingHospitalFields.push("contactpersonname");
            if (!rawContactPhone) missingHospitalFields.push("contactpersonphone");
            if (!rawAddress) missingHospitalFields.push("address");
            if (!rawCityHosp) missingHospitalFields.push("city");
            if (!rawStateHosp) missingHospitalFields.push("state");
            if (!rawPincodeHosp) missingHospitalFields.push("pincode");

            if (missingHospitalFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Hospital registration requires: ${missingHospitalFields.join(", ")}`,
                    missingFields: missingHospitalFields,
                });
            }

            const existingHospital = await prisma.hospitals.findUnique({
                where: { registrationnumber: rawRegNumber },
            });
            if (existingHospital) {
                return res.status(400).json({
                    success: false,
                    message: "A hospital with this registration number already exists",
                });
            }

            const result = await prisma.$transaction(async (tx) => {
                const user = await tx.users.create({
                    data: {
                        name: rawContactPerson || rawHospitalName,
                        email: email.trim().toLowerCase(),
                        phonenumber: rawContactPhone,
                        password: hashedPassword,
                        role: user_role.HOSPITAL,
                        isactive: true,
                        emailverified: true,
                    },
                });

                const hospital = await tx.hospitals.create({
                    data: {
                        userid: user.userid,
                        hospitalname: rawHospitalName,
                        registrationnumber: rawRegNumber,
                        contactpersonname: rawContactPerson,
                        contactpersonphone: rawContactPhone,
                        address: rawAddress,
                        city: rawCityHosp,
                        state: rawStateHosp,
                        pincode: rawPincodeHosp,
                        latitude: validatedCoords.latitude ?? null,
                        longitude: validatedCoords.longitude ?? null,
                        // TEMPORARY BYPASS: Auto-approve newly registered hospitals
                        approvalstatus: approval_status.APPROVED,
                    },
                });

                return { user, hospital };
            });

            const token = generateToken(result.user.userid, result.user.role);
            const { password: _password, ...safeUser } = result.user;

            return res.status(201).json({
                success: true,
                token,
                user: safeUser,
                donor: null,
                requester: null,
                hospital: result.hospital,
                bloodbank: null,
            });
        }

        if (targetRole === user_role.BLOOD_BANK) {
            const rawBbName = (req.body.bloodbankname || req.body.bloodBankName || req.body.orgName || req.body.facilityName || "").trim();
            const rawLicenseNumber = (req.body.licensenumber || req.body.licenseNumber || req.body.regNumber || req.body.registrationnumber || "").trim();
            const rawContactPerson = (req.body.contactpersonname || req.body.contactPersonName || name || "").trim();
            const rawContactPhone = (req.body.contactpersonphone || req.body.contactPersonPhone || contactNumber || "").trim();
            const rawAddress = (address || req.body.bloodBankAddress || req.body.instAddress || "").trim();
            const rawCityBb = (city || req.body.bloodBankCity || req.body.instCity || "").trim();
            const rawStateBb = (state || req.body.bloodBankState || req.body.instState || "").trim();
            const rawPincodeBb = (pincode || req.body.bloodBankPincode || req.body.instPincode || "").trim();

            const missingBbFields: string[] = [];
            if (!rawBbName) missingBbFields.push("bloodbankname");
            if (!rawLicenseNumber) missingBbFields.push("licensenumber");
            if (!rawContactPerson) missingBbFields.push("contactpersonname");
            if (!rawContactPhone) missingBbFields.push("contactpersonphone");
            if (!rawAddress) missingBbFields.push("address");
            if (!rawCityBb) missingBbFields.push("city");
            if (!rawStateBb) missingBbFields.push("state");
            if (!rawPincodeBb) missingBbFields.push("pincode");

            if (missingBbFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Blood Bank registration requires: ${missingBbFields.join(", ")}`,
                    missingFields: missingBbFields,
                });
            }

            const existingBloodBank = await prisma.bloodbanks.findUnique({
                where: { licensenumber: rawLicenseNumber },
            });
            if (existingBloodBank) {
                return res.status(400).json({
                    success: false,
                    message: "A blood bank with this license number already exists",
                });
            }

            const result = await prisma.$transaction(async (tx) => {
                const user = await tx.users.create({
                    data: {
                        name: rawContactPerson || rawBbName,
                        email: email.trim().toLowerCase(),
                        phonenumber: rawContactPhone,
                        password: hashedPassword,
                        role: user_role.BLOOD_BANK,
                        isactive: true,
                        emailverified: true,
                    },
                });

                const bloodbank = await tx.bloodbanks.create({
                    data: {
                        userid: user.userid,
                        bloodbankname: rawBbName,
                        licensenumber: rawLicenseNumber,
                        contactpersonname: rawContactPerson,
                        contactpersonphone: rawContactPhone,
                        address: rawAddress,
                        city: rawCityBb,
                        state: rawStateBb,
                        pincode: rawPincodeBb,
                        latitude: validatedCoords.latitude ?? null,
                        longitude: validatedCoords.longitude ?? null,
                        approvalstatus: approval_status.APPROVED,
                    },
                });

                return { user, bloodbank };
            });

            const token = generateToken(result.user.userid, result.user.role);
            const { password: _password, ...safeUser } = result.user;

            return res.status(201).json({
                success: true,
                token,
                user: safeUser,
                donor: null,
                requester: null,
                hospital: null,
                bloodbank: result.bloodbank,
            });
        }

        return res.status(400).json({
            success: false,
            message: "Unsupported registration role",
        });
    } catch (error: any) {
        console.error("Register Error:", error);

        if (error?.code === "P2002") {
            const target = String(error?.meta?.target || "");
            if (target.includes("email")) {
                return res.status(400).json({
                    success: false,
                    message: "Email already exists",
                });
            }
            if (target.includes("phonenumber")) {
                return res.status(400).json({
                    success: false,
                    message: "Phone number is already registered with another account",
                });
            }
            if (target.includes("registrationnumber")) {
                return res.status(400).json({
                    success: false,
                    message: "A hospital with this registration number already exists",
                });
            }
            if (target.includes("licensenumber")) {
                return res.status(400).json({
                    success: false,
                    message: "A blood bank with this license number already exists",
                });
            }
        }

        return res.status(500).json({
            success: false,
            message: "Registration failed",
        });
    }
});

/**
 * Shared OTP Login Handler
 * Verifies access token with MSG91, extracts verified phone number, queries
 * active matching account, and issues standard Swastya JWT.
 */
const executeOtpLogin = async (accessToken: string, res: Response) => {
    if (!accessToken || typeof accessToken !== "string" || accessToken.trim() === "") {
        return res.status(400).json({
            success: false,
            message: "OTP access token is required",
        });
    }

    const verification = await Msg91Service.verifyAccessToken(accessToken.trim());
    if (!verification.success || !verification.identifier) {
        return res.status(401).json({
            success: false,
            message: verification.message || "Invalid or expired OTP access token.",
        });
    }

    const phoneVariants = getPhoneVariants(verification.identifier);
    let user = await prisma.users.findFirst({
        where: {
            phonenumber: { in: phoneVariants },
        },
        include: {
            donors: true,
            requesters: true,
            hospitals: true,
            bloodbanks: true,
        },
    });

    if (!user) {
        return res.status(404).json({
            success: false,
            code: "USER_NOT_FOUND",
            verifiedPhone: verification.identifier,
            normalizedPhone: verification.normalizedPhone,
            message: "No account found matching this verified phone number. Please contact your hospital or complete the registration process.",
        });
    }

    // Automatically activate imported donor accounts upon successful MSG91 OTP verification
    if (!user.isactive) {
        user = await prisma.users.update({
            where: { userid: user.userid },
            data: {
                isactive: true,
                emailverified: true,
            },
            include: {
                donors: true,
                requesters: true,
                hospitals: true,
                bloodbanks: true,
            },
        });

        // Mark pending single-use activation tokens as consumed
        await prisma.donoractivationtokens.updateMany({
            where: { userid: user.userid, usedat: null },
            data: { usedat: new Date() },
        });
    }

    // Ensure donor profile exists if user role is DONOR
    if (user.role === "DONOR" && !user.donors) {
        const donor = await prisma.donors.create({
            data: {
                userid: user.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1995-01-01"),
                gender: "OTHER",
                city: "Not Provided",
                state: "Not Provided",
                pincode: "000000",
                iseligible: true,
                availabilitystatus: "AVAILABLE",
            },
        });
        user.donors = donor as any;
    }

    const token = generateToken(user.userid, user.role);
    const { password: _password, ...safeUser } = user;

    return res.status(200).json({
        success: true,
        token,
        user: safeUser,
        donor: user.donors || null,
        requester: user.requesters || null,
        hospital: user.hospitals || null,
        bloodbank: user.bloodbanks || null,
    });
};

/*
 * CHECK DONOR PHONE ELIGIBILITY BEFORE SENDING OTP
 * POST /auth/otp/check-phone
 */
router.post("/otp/check-phone", async (req: Request, res: Response) => {
    try {
        const rawPhone = req.body?.phone;
        if (!rawPhone || typeof rawPhone !== "string" || !rawPhone.trim()) {
            return res.status(400).json({
                success: false,
                message: "Mobile number is required.",
            });
        }

        const phone = rawPhone.trim();
        const digits = phone.replace(/\D/g, "");
        if (digits.length < 10) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid 10-digit mobile number.",
            });
        }

        const phoneVariants = getPhoneVariants(phone);
        const user = await prisma.users.findFirst({
            where: {
                phonenumber: { in: phoneVariants },
            },
            include: {
                donors: true,
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                code: "NOT_REGISTERED",
                message: "This mobile number is not registered in Swastya or any Hospital Donor Registry. Please contact your hospital or complete the registration process.",
            });
        }

        const isDonor = user.role === "DONOR" || Boolean(user.donors);
        const isImported = !user.isactive || !user.emailverified;

        return res.status(200).json({
            success: true,
            registered: true,
            isDonor,
            isImported,
            name: user.name,
            maskedPhone: digits.slice(-4),
        });
    } catch (error: any) {
        console.error("Check donor phone error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to verify registration status. Please try again.",
        });
    }
});

/*
 * VERIFY OTP ACCESS TOKEN
 * POST /auth/verify-otp
 */
router.post("/verify-otp", async (req: Request, res: Response) => {
    try {
        const rawToken = req.body?.accessToken || req.body?.token;
        if (!rawToken || typeof rawToken !== "string" || rawToken.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Access token is required",
            });
        }

        const result = await Msg91Service.verifyAccessToken(rawToken.trim());
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message || "Invalid or expired OTP access token.",
            });
        }

        return res.status(200).json({
            success: true,
            verifiedPhone: result.identifier,
            normalizedPhone: result.normalizedPhone,
            message: result.message || "Phone number verified successfully.",
        });
    } catch (error) {
        console.error("Verify OTP Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to verify OTP access token.",
        });
    }
});

/*
 * LOGIN WITH OTP
 * POST /auth/login-otp
 */
router.post("/login-otp", async (req: Request, res: Response) => {
    try {
        const rawToken = req.body?.accessToken || req.body?.token;
        return await executeOtpLogin(rawToken, res);
    } catch (error) {
        console.error("Login OTP Error:", error);
        return res.status(500).json({
            success: false,
            message: "OTP login failed",
        });
    }
});

/*
 * LOGIN USER
 * POST /auth/login
 */
router.post("/login", async (req: Request, res: Response) => {
    try {
        const { email, password, accessToken, token: legacyToken } = req.body || {};

        // If OTP accessToken is supplied to standard login endpoint, route to OTP login
        const otpToken = accessToken || legacyToken;
        if (otpToken && (!email || !password)) {
            return await executeOtpLogin(otpToken, res);
        }

        if (!email || !password || typeof email !== "string" || typeof password !== "string") {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        const user = await prisma.users.findUnique({
            where: {
                email: email.trim().toLowerCase(),
            },
            include: {
                donors: true,
                requesters: true,
                hospitals: true,
                bloodbanks: true,
            },
        });

        // Constant-time dummy hash to prevent timing-based user enumeration
        const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8w0R/9k7Y0vR5M6d3mJ1Gk8n6U8y1a";
        const passwordHashToCompare = user ? user.password : DUMMY_HASH;
        const isPasswordValid = await bcrypt.compare(password, passwordHashToCompare);

        // Constant error response for both non-existent users and incorrect passwords (prevents account enumeration)
        if (!user || !isPasswordValid) {
            console.warn(
                `[AUTH] Failed login attempt for email: ${email.trim().toLowerCase()} - Reason: ${!user ? "USER_NOT_FOUND" : "INVALID_PASSWORD"}`
            );
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        // Account activation check (only evaluated after valid credential verification)
        if (!user.isactive) {
            return res.status(403).json({
                success: false,
                message: "Account is inactive or pending activation.",
                pendingActivation: user.emailverified === false,
            });
        }

        const token = generateToken(user.userid, user.role);
        const { password: _password, ...safeUser } = user;

        return res.status(200).json({
            success: true,
            token,
            user: safeUser,
            donor: user.donors || null,
            requester: user.requesters || null,
            hospital: user.hospitals || null,
            bloodbank: user.bloodbanks || null,
        });
    } catch (error) {
        console.error("Login Error:", error);

        return res.status(500).json({
            success: false,
            message: "Login failed",
        });
    }
});

/*
 * VERIFY ACTIVATION TOKEN
 * POST /auth/verify-activation-token
 * Body: { token: string }
 * Note: Query parameters are strictly prohibited to prevent token leakage in URL history / server logs.
 */
router.post("/verify-activation-token", async (req: Request, res: Response) => {
    try {
        if (req.query.token) {
            return res.status(400).json({
                success: false,
                message: "Activation token must be provided in request body, not as URL query parameter",
            });
        }

        const rawToken = req.body?.token;
        if (!rawToken || typeof rawToken !== "string") {
            return res.status(400).json({
                success: false,
                message: "Activation token is required",
            });
        }

        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const tokenRecord = await prisma.donoractivationtokens.findFirst({
            where: {
                tokenhash: tokenHash,
                usedat: null,
            },
            include: {
                users: {
                    select: {
                        userid: true,
                        name: true,
                        email: true,
                        phonenumber: true,
                        role: true,
                        isactive: true,
                        emailverified: true,
                    },
                },
            },
        });

        if (!tokenRecord) {
            return res.status(400).json({
                success: false,
                message: "Invalid or already used activation token.",
            });
        }

        if (
            tokenRecord.users.role !== "DONOR" ||
            tokenRecord.users.isactive !== false ||
            tokenRecord.users.emailverified === true
        ) {
            return res.status(400).json({
                success: false,
                message: "Activation token is no longer valid for this account.",
            });
        }

        if (new Date() > new Date(tokenRecord.expiresat)) {
            return res.status(400).json({
                success: false,
                message: "Activation token has expired. Please request a new activation link from your hospital.",
            });
        }

        return res.status(200).json({
            success: true,
            valid: true,
            user: {
                name: tokenRecord.users.name,
                email: tokenRecord.users.email,
                phone: tokenRecord.users.phonenumber,
            },
        });
    } catch (error) {
        console.error("Token verification error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to verify activation token",
        });
    }
});

// Reject GET with query parameters to enforce body transmission
router.get("/verify-activation-token", (_req: Request, res: Response) => {
    return res.status(400).json({
        success: false,
        message: "Transmitting activation tokens via URL query parameters is prohibited. Use POST /auth/verify-activation-token with token in request body.",
    });
});

/*
 * ACTIVATE DONOR ACCOUNT
 * POST /auth/activate-donor and POST /auth/activate
 * Secure account onboarding where the donor establishes their own personal password via request body.
 */
const handleDonorActivation = async (req: Request, res: Response) => {
    try {
        if (req.query.token) {
            return res.status(400).json({
                success: false,
                message: "Activation token must be provided in request body, not as URL query parameter",
            });
        }

        const { token: rawToken, password } = req.body || {};

        if (!rawToken || typeof rawToken !== "string") {
            return res.status(400).json({
                success: false,
                message: "Activation token is required",
            });
        }

        if (!password || typeof password !== "string" || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long",
            });
        }

        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

        // Hash donor's chosen password before transaction
        const hashedPassword = await bcrypt.hash(password, 10);

        // Atomic transaction: verify unused & unexpired token, mark used with usedat: null guard, activate user
        const updatedUser = await prisma.$transaction(async (tx) => {
            const tokenRecord = await tx.donoractivationtokens.findFirst({
                where: {
                    tokenhash: tokenHash,
                    usedat: null,
                },
                include: {
                    users: {
                        select: {
                            userid: true,
                            role: true,
                            isactive: true,
                            emailverified: true,
                        },
                    },
                },
            });

            if (!tokenRecord) {
                throw Object.assign(new Error("Invalid or already used activation token."), { statusCode: 400 });
            }

            if (
                tokenRecord.users.role !== "DONOR" ||
                tokenRecord.users.isactive !== false ||
                tokenRecord.users.emailverified === true
            ) {
                throw Object.assign(new Error("Activation token is no longer valid for this account."), { statusCode: 400 });
            }

            if (new Date() > new Date(tokenRecord.expiresat)) {
                throw Object.assign(
                    new Error("Activation token has expired. Please request a new activation link from your hospital."),
                    { statusCode: 400 }
                );
            }

            const now = new Date();
            const consumed = await tx.donoractivationtokens.updateMany({
                where: {
                    tokenid: tokenRecord.tokenid,
                    usedat: null,
                },
                data: { usedat: now },
            });

            if (consumed.count !== 1) {
                throw Object.assign(new Error("Invalid or already used activation token."), { statusCode: 400 });
            }

            // Revoke any sibling unused activation tokens for this donor
            await tx.donoractivationtokens.updateMany({
                where: {
                    userid: tokenRecord.userid,
                    usedat: null,
                },
                data: { usedat: now },
            });

            const user = await tx.users.update({
                where: { userid: tokenRecord.userid },
                data: {
                    password: hashedPassword,
                    isactive: true,
                    emailverified: true,
                },
                include: {
                    donors: true,
                },
            });

            return user;
        });

        const authToken = generateToken(updatedUser.userid, updatedUser.role);
        const { password: _password, ...safeUser } = updatedUser;

        return res.status(200).json({
            success: true,
            message: "Account successfully activated! You can now log into Swastya.",
            token: authToken,
            user: safeUser,
            donor: updatedUser.donors,
        });
    } catch (error: any) {
        if (error?.statusCode === 400) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
        console.error("Activation error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to activate donor account",
        });
    }
};

router.post("/activate-donor", handleDonorActivation);
router.post("/activate", handleDonorActivation);

export default router;