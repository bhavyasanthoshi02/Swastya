import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma";
import { generateToken } from "../utils/jwt";
import { authenticate } from "../middleware/auth.middleware";
import { blood_group, gender_type, user_role, availability_status } from "../generated/prisma/enums";

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

const normalizeRole = (r?: string): user_role | null => {
    if (!r) return null;
    const clean = r.trim().toUpperCase();
    const map: Record<string, user_role> = {
        "ADMIN": user_role.ADMIN,
        "DONOR": user_role.DONOR,
        "REQUESTER": user_role.REQUESTER,
        "HOSPITAL": user_role.HOSPITAL,
        "BLOOD_BANK": user_role.BLOOD_BANK,
        "PATIENT": user_role.REQUESTER,
    };
    return map[clean] || null;
};

router.get("/test", (_req, res) => {
    res.json({
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
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Return only safe fields - never leak password or hash
        const { password: _password, ...safeUser } = user;

        return res.status(200).json({
            success: true,
            user: safeUser,
            donor: user.donors || null,
            requester: user.requesters || null,
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

        const targetRole = normalizeRole(role) || user_role.DONOR;

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
        const contactNumber = (phoneNumber || phone || "").trim() || null;

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
                    },
                });

                const requester = await tx.requesters.create({
                    data: {
                        userid: user.userid,
                        city: reqCity,
                        state: reqState,
                        pincode: reqPincode,
                        address: reqAddress,
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
            });
        }

        // Non-donor, non-requester registration (e.g. Hospital, Blood Bank)
        const user = await prisma.users.create({
            data: {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                phonenumber: contactNumber,
                password: hashedPassword,
                role: targetRole,
            },
        });

        const token = generateToken(user.userid, user.role);
        const { password: _password, ...safeUser } = user;

        return res.status(201).json({
            success: true,
            token,
            user: safeUser,
            donor: null,
            requester: null,
        });
    } catch (error) {
        console.error("Register Error:", error);

        return res.status(500).json({
            success: false,
            message: "Registration failed",
        });
    }
});

/*
 * LOGIN USER
 * POST /auth/login
 */
router.post("/login", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
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
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const isPasswordValid = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid password",
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
        });
    } catch (error) {
        console.error("Login Error:", error);

        return res.status(500).json({
            success: false,
            message: "Login failed",
        });
    }
});

export default router;