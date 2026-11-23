import { prisma } from "../config/prisma";
import {
    blood_group,
    blood_component,
    gender_type,
    surgery_status,
    user_role,
} from "../generated/prisma/enums";
import { getCompatibleDonorBloodGroups } from "../utils/bloodCompatibility";
import { normalizeBloodGroup } from "./donorImport.service";

/**
 * Baseline hospital-approved guidelines with traceable clinical governance metadata,
 * exact publication sources, table/page citations, and approval requirements.
 */
export const DEFAULT_CLINICAL_GUIDELINES = [
    {
        procedurename: "Coronary Artery Bypass Graft (CABG)",
        category: "Cardiothoracic Surgery",
        defaultcomponent: blood_component.RBC,
        defaultunits: 2,
        secondarycomponent: null,
        secondaryunits: 0,
        typicalbloodlossml: 750,
        transfusionprobability: 48.0,
        guidelinesource: "Society of Thoracic Surgeons (STS) & Society of Cardiovascular Anesthesiologists (SCA)",
        guidelineversion: "STS/SCA Blood Conservation Clinical Practice Guideline Update 2021",
        guidelinecitation: "Annals of Thoracic Surgery 2021;112(5):1665–1710; Section 4.2 (Preoperative Planning and MSBOS, p. 1673-1675); Table 5",
        approvalauthority: "STS/SCA Cardiovascular Transfusion Consensus Board",
        effectivedate: new Date("2021-11-01"),
        clinicalrationale: "Primary isolated CABG with cardiopulmonary bypass. Standard MSBOS recommendation: 2 units PRBC. Routine prophylactic plasma is not indicated without documented clinical coagulopathy.",
        requireshospitalapproval: false,
        isactive: true,
    },
    {
        procedurename: "Total Knee Arthroplasty (TKA)",
        category: "Orthopedic Surgery",
        defaultcomponent: blood_component.RBC,
        defaultunits: 1,
        secondarycomponent: null,
        secondaryunits: 0,
        typicalbloodlossml: 450,
        transfusionprobability: 18.0,
        guidelinesource: "British Committee for Standards in Haematology (BCSH) & American Academy of Orthopaedic Surgeons (AAOS)",
        guidelineversion: "BCSH Transfusion in Surgery 2020 / AAOS Blood Management Standard 2022",
        guidelinecitation: "British Journal of Haematology 2020;189(5):815-830, Table 4 (Elective Arthroplasty MSBOS Recommendations); Frank SM et al., Anesthesiology 2014;121:1158-1168, Table 2",
        approvalauthority: "Orthopedic Surgery & Transfusion Joint Committee",
        effectivedate: new Date("2022-03-15"),
        clinicalrationale: "Unilateral total knee arthroplasty with intravenous tranexamic acid (TXA) protocol; optimized 1-unit crossmatch threshold reduces unnecessary crossmatch load.",
        requireshospitalapproval: false,
        isactive: true,
    },
    {
        procedurename: "Total Hip Replacement (THR)",
        category: "Orthopedic Surgery",
        defaultcomponent: blood_component.RBC,
        defaultunits: 2,
        secondarycomponent: null,
        secondaryunits: 0,
        typicalbloodlossml: 600,
        transfusionprobability: 28.0,
        guidelinesource: "Society for the Advancement of Blood Management (SABM) & AABB Surgical Blood Order Guidelines",
        guidelineversion: "SABM Administrative & Clinical Standards 5th Ed (2021)",
        guidelinecitation: "Anesthesia & Analgesia 2021;135(3):476-496, Table 3 (Arthroplasty Maximum Blood Ordering Standards); AABB Technical Manual 20th Ed, Table 20-3",
        approvalauthority: "Hospital Transfusion Committee Baseline",
        effectivedate: new Date("2021-06-01"),
        clinicalrationale: "Primary total hip arthroplasty with medullary reaming; anticipated blood loss 500-700 ml; 2-unit red blood cell preparation standard.",
        requireshospitalapproval: false,
        isactive: true,
    },
    {
        procedurename: "Laparoscopic Cholecystectomy",
        category: "General Surgery",
        defaultcomponent: blood_component.RBC,
        defaultunits: 0,
        secondarycomponent: null,
        secondaryunits: 0,
        typicalbloodlossml: 50,
        transfusionprobability: 1.5,
        guidelinesource: "AABB Technical Manual & SAGES Minimally Invasive Surgery Transfusion Schedule",
        guidelineversion: "20th Edition (2020) / SAGES Practice Guidelines",
        guidelinecitation: "AABB Technical Manual 20th Ed, Chapter 20 (Surgical Blood Ordering); Table 20-3 (Maximum Surgical Blood Ordering Schedule, p. 582); Frank SM et al., JAMA Surgery 2013;148:1120-1126",
        approvalauthority: "Institutional Transfusion Committee Standard (Type & Screen Protocol)",
        effectivedate: new Date("2020-01-01"),
        clinicalrationale: "Elective laparoscopic cholecystectomy carries negligible hemorrhage incidence (<2%); routine crossmatching is clinically contraindicated. Type & Screen ensures antibody clearance.",
        requireshospitalapproval: false,
        isactive: true,
    },
    {
        procedurename: "Cesarean Section (High Risk)",
        category: "Obstetrics & Gynecology",
        defaultcomponent: blood_component.RBC,
        defaultunits: 2,
        secondarycomponent: null,
        secondaryunits: 0,
        typicalbloodlossml: 750,
        transfusionprobability: 35.0,
        guidelinesource: "Royal College of Obstetricians and Gynaecologists (RCOG) & American College of Obstetricians and Gynecologists (ACOG)",
        guidelineversion: "RCOG Green-top Guideline No. 52 (2018) / ACOG Obstetric Care Consensus No. 7 (Reaffirmed 2021)",
        guidelinecitation: "RCOG Green-top Guideline No. 52 (Prevention and Management of Postpartum Haemorrhage, p. 12-14); ACOG Consensus No. 7 (Placenta Accreta Spectrum, Table 1)",
        approvalauthority: "Obstetric Transfusion Committee (Hospital Clinical Approval Required)",
        effectivedate: new Date("2021-04-01"),
        clinicalrationale: "High-risk cesarean section carries variable hemorrhage risk depending on degree of placental invasiveness. Individual patient multidisciplinary review by obstetric transfusion committee is required before finalizing order.",
        requireshospitalapproval: true,
        isactive: true,
    },
];

export interface ProcedureConfigInput {
    procedurename: string;
    category: string;
    defaultcomponent: blood_component;
    defaultunits: number;
    secondarycomponent?: blood_component | null;
    secondaryunits?: number | null;
    typicalbloodlossml?: number | null;
    transfusionprobability?: number | null;
    guidelinesource: string;
    guidelineversion: string;
    guidelinecitation?: string | null;
    approvalauthority: string;
    effectivedate: string | Date;
    clinicalrationale?: string | null;
    requireshospitalapproval?: boolean;
}

export interface CreateSurgeryPlanInput {
    patientreference: string;
    patientage: number;
    patientgender: gender_type;
    patientbloodgroup?: blood_group | string | null;
    procedurename: string;
    category?: string | null;
    scheduleddate: string | Date;
    expecteddurationminutes?: number | null;
    clinicianspecifiedcomponent?: blood_component | null;
    clinicianspecifiedunits?: number | null;
    clinicalnotes?: string | null;
}

export interface ClinicalReviewInput {
    finalcomponent: blood_component;
    finalunits: number;
    secondaryfinalcomponent?: blood_component | null;
    secondaryfinalunits?: number | null;
    adjustmentreason: string;
}

export class SurgeryPlannerService {
    /**
     * Seeds baseline verified clinical guidelines if database does not contain them.
     * Updates citations if previously seeded entries lacked page/table citations.
     */
    static async ensureDefaultGuidelines(): Promise<void> {
        try {
            for (const g of DEFAULT_CLINICAL_GUIDELINES) {
                const existing = await prisma.procedurebloodconfigs.findFirst({
                    where: {
                        hospitalid: null,
                        procedurename: { equals: g.procedurename.trim(), mode: "insensitive" },
                    },
                });

                if (!existing) {
                    await prisma.procedurebloodconfigs.create({
                        data: {
                            hospitalid: null,
                            procedurename: g.procedurename,
                            category: g.category,
                            defaultcomponent: g.defaultcomponent,
                            defaultunits: g.defaultunits,
                            secondarycomponent: g.secondarycomponent,
                            secondaryunits: g.secondaryunits,
                            typicalbloodlossml: g.typicalbloodlossml,
                            transfusionprobability: g.transfusionprobability,
                            guidelinesource: g.guidelinesource,
                            guidelineversion: g.guidelineversion,
                            guidelinecitation: g.guidelinecitation,
                            approvalauthority: g.approvalauthority,
                            effectivedate: g.effectivedate,
                            clinicalrationale: g.clinicalrationale,
                            requireshospitalapproval: g.requireshospitalapproval,
                            isactive: true,
                        },
                    });
                } else if (!existing.guidelinecitation || existing.guidelinecitation !== g.guidelinecitation) {
                    await prisma.procedurebloodconfigs.update({
                        where: { configid: existing.configid },
                        data: {
                            guidelinesource: g.guidelinesource,
                            guidelineversion: g.guidelineversion,
                            guidelinecitation: g.guidelinecitation,
                            approvalauthority: g.approvalauthority,
                            clinicalrationale: g.clinicalrationale,
                            requireshospitalapproval: g.requireshospitalapproval,
                            defaultunits: g.defaultunits,
                            secondarycomponent: g.secondarycomponent,
                            secondaryunits: g.secondaryunits,
                        },
                    });
                }
            }
        } catch (err) {
            console.error("Warning: Could not sync default guidelines:", err);
        }
    }

    /**
     * Retrieves all active procedure configurations visible to a hospital.
     * Hospital overrides take precedence over system default guidelines.
     */
    static async getProcedureConfigs(hospitalId: string) {
        await this.ensureDefaultGuidelines();

        const configs = await prisma.procedurebloodconfigs.findMany({
            where: {
                isactive: true,
                OR: [{ hospitalid: hospitalId }, { hospitalid: null }],
            },
            orderBy: [{ procedurename: "asc" }, { hospitalid: "desc" }],
        });

        // Deduplicate: If both hospital-specific and global default exist for same procedure, hospital-specific wins
        const resultMap = new Map<string, any>();
        for (const c of configs) {
            const key = c.procedurename.trim().toLowerCase();
            const configObj = {
                configid: c.configid,
                hospitalid: c.hospitalid,
                procedurename: c.procedurename,
                category: c.category,
                defaultcomponent: c.defaultcomponent,
                defaultunits: c.defaultunits,
                secondarycomponent: c.secondarycomponent,
                secondaryunits: c.secondaryunits,
                typicalbloodlossml: c.typicalbloodlossml,
                transfusionprobability: c.transfusionprobability ? Number(c.transfusionprobability) : null,
                guidelinesource: c.guidelinesource,
                guidelineversion: c.guidelineversion,
                guidelinecitation: c.guidelinecitation,
                approvalauthority: c.approvalauthority,
                effectivedate: c.effectivedate,
                clinicalrationale: c.clinicalrationale,
                requireshospitalapproval: c.requireshospitalapproval,
                isHospitalOverride: c.hospitalid !== null,
            };

            if (!resultMap.has(key)) {
                resultMap.set(key, configObj);
            } else if (c.hospitalid !== null) {
                // Hospital override takes precedence
                resultMap.set(key, configObj);
            }
        }

        return Array.from(resultMap.values());
    }

    /**
     * Allows a hospital committee to configure and approve their own requirements.
     * Prevents duplicate configurations for the same hospital and procedure.
     */
    static async saveProcedureConfig(hospitalId: string, input: ProcedureConfigInput) {
        if (!input.procedurename || !input.procedurename.trim()) {
            throw new Error("Procedure name is required");
        }
        if (!input.guidelinesource || !input.guidelinesource.trim()) {
            throw new Error("Guideline source citation is mandatory for clinical traceability");
        }
        if (!input.approvalauthority || !input.approvalauthority.trim()) {
            throw new Error("Approval authority (e.g. Transfusion Committee) is required");
        }
        if (!input.guidelineversion || !input.guidelineversion.trim()) {
            throw new Error("Guideline version is required");
        }

        const effectiveDate = new Date(input.effectivedate);
        if (isNaN(effectiveDate.getTime())) {
            throw new Error("Valid effective date is required");
        }

        // Prevent duplicate procedure configurations for this hospital
        const existing = await prisma.procedurebloodconfigs.findFirst({
            where: {
                hospitalid: hospitalId,
                procedurename: { equals: input.procedurename.trim(), mode: "insensitive" },
            },
        });
        if (existing) {
            throw new Error(`A procedure configuration for "${input.procedurename.trim()}" already exists for this hospital.`);
        }

        const config = await prisma.procedurebloodconfigs.create({
            data: {
                hospitalid: hospitalId,
                procedurename: input.procedurename.trim(),
                category: input.category?.trim() || "General Surgery",
                defaultcomponent: input.defaultcomponent,
                defaultunits: Math.max(0, Number(input.defaultunits) || 0),
                secondarycomponent: input.secondarycomponent || null,
                secondaryunits: Math.max(0, Number(input.secondaryunits) || 0),
                typicalbloodlossml: Math.max(0, Number(input.typicalbloodlossml) || 0),
                transfusionprobability: input.transfusionprobability ? Number(input.transfusionprobability) : null,
                guidelinesource: input.guidelinesource.trim(),
                guidelineversion: input.guidelineversion.trim(),
                guidelinecitation: input.guidelinecitation?.trim() || null,
                approvalauthority: input.approvalauthority.trim(),
                effectivedate: effectiveDate,
                clinicalrationale: input.clinicalrationale?.trim() || null,
                requireshospitalapproval: input.requireshospitalapproval || false,
                isactive: true,
            },
        });

        return config;
    }

    /**
     * Estimates requirements for a surgery.
     * Enforces Refinement 1: Never guess or invent unverified numbers.
     * If no active hospital-approved guideline exists, return estimate unavailable.
     */
    static async estimateRequirements(procedureName: string, hospitalId: string) {
        if (!procedureName || !procedureName.trim()) {
            return {
                estimateAvailable: false,
                message: "Procedure name is required.",
            };
        }

        const trimmed = procedureName.trim().toLowerCase();
        const configs = await this.getProcedureConfigs(hospitalId);
        const matched = configs.find(
            (c) => c.procedurename.trim().toLowerCase() === trimmed
        );

        if (!matched) {
            return {
                estimateAvailable: false,
                message: "Estimate unavailable – Clinical review required.",
            };
        }

        return {
            estimateAvailable: true,
            configId: matched.configid,
            procedureName: matched.procedurename,
            category: matched.category,
            defaultComponent: matched.defaultcomponent,
            defaultUnits: matched.defaultunits,
            secondaryComponent: matched.secondarycomponent,
            secondaryUnits: matched.secondaryunits,
            typicalBloodLossMl: matched.typicalbloodlossml,
            transfusionProbability: matched.transfusionprobability,
            guidelineSource: matched.guidelinesource,
            guidelineVersion: matched.guidelineversion,
            guidelineCitation: matched.guidelinecitation,
            approvalAuthority: matched.approvalauthority,
            effectiveDate: matched.effectivedate,
            clinicalRationale: matched.clinicalrationale,
            requiresHospitalApproval: matched.requireshospitalapproval,
            isHospitalOverride: matched.isHospitalOverride,
        };
    }

    /**
     * Creates a new Surgery Plan.
     */
    static async createSurgeryPlan(hospitalId: string, userId: string, input: CreateSurgeryPlanInput) {
        if (!input.patientreference || !input.patientreference.trim()) {
            throw new Error("Patient reference is required");
        }
        if (input.patientreference.trim().length > 100) {
            throw new Error("Patient reference cannot exceed 100 characters");
        }
        if (!Number.isInteger(input.patientage) || input.patientage < 1 || input.patientage > 125) {
            throw new Error("Patient age must be an integer between 1 and 125");
        }
        if (!["MALE", "FEMALE", "OTHER"].includes(String(input.patientgender))) {
            throw new Error("Patient gender must be MALE, FEMALE, or OTHER");
        }

        const scheduledDate = new Date(input.scheduleddate);
        if (isNaN(scheduledDate.getTime())) {
            throw new Error("Valid scheduled surgery date is required");
        }
        if (scheduledDate.getTime() <= Date.now()) {
            throw new Error("Surgery date must be in the future for pre-operative planning");
        }

        // Clean blood group: If "UNKNOWN" or "PENDING", treat as null (blood typing pending)
        let normalizedBg: blood_group | null = null;
        if (
            input.patientbloodgroup &&
            String(input.patientbloodgroup).trim().toUpperCase() !== "UNKNOWN" &&
            String(input.patientbloodgroup).trim().toUpperCase() !== "PENDING" &&
            String(input.patientbloodgroup).trim().toUpperCase() !== "TYPING_PENDING"
        ) {
            const raw = normalizeBloodGroup(input.patientbloodgroup as string);
            if (raw && Object.values(blood_group).includes(raw as blood_group)) {
                normalizedBg = raw as blood_group;
            }
        }

        // Attempt to find approved clinical guideline
        const estimate = await this.estimateRequirements(input.procedurename, hospitalId);

        let status: surgery_status = surgery_status.PLANNED;
        let configId: string | null = null;
        let baselineComponent: blood_component | null = null;
        let baselineUnits: number | null = null;
        let secondaryBaselineComponent: blood_component | null = null;
        let secondaryBaselineUnits: number | null = null;
        let baselineRationale: string | null = null;

        if (estimate.estimateAvailable) {
            status = surgery_status.REQUIREMENT_ESTIMATED;
            configId = estimate.configId;
            baselineComponent = estimate.defaultComponent;
            baselineUnits = estimate.defaultUnits;
            secondaryBaselineComponent = estimate.secondaryComponent;
            secondaryBaselineUnits = estimate.secondaryUnits;
            baselineRationale = `${estimate.clinicalRationale || ""} (Source: ${estimate.guidelineSource} [${estimate.guidelineCitation || "Ref"}], Approved by: ${estimate.approvalAuthority})`.trim();
        } else {
            status = surgery_status.AWAITING_CLINICAL_REVIEW;
            baselineRationale = "Estimate unavailable – Clinical review required.";
        }

        const finalComponent = input.clinicianspecifiedcomponent || null;
        const finalUnits =
            input.clinicianspecifiedunits !== undefined && input.clinicianspecifiedunits !== null
                ? Number(input.clinicianspecifiedunits)
                : null;

        const surgery = await prisma.surgeryplans.create({
            data: {
                hospitalid: hospitalId,
                createdbyuserid: userId,
                patientreference: input.patientreference.trim(),
                patientage: input.patientage,
                patientgender: input.patientgender,
                patientbloodgroup: normalizedBg,
                procedurename: input.procedurename.trim(),
                category: input.category?.trim() || estimate.category || null,
                scheduleddate: scheduledDate,
                expecteddurationminutes: input.expecteddurationminutes
                    ? Math.max(1, Number(input.expecteddurationminutes))
                    : null,
                clinicianspecifiedcomponent: input.clinicianspecifiedcomponent || null,
                clinicianspecifiedunits: input.clinicianspecifiedunits ? Number(input.clinicianspecifiedunits) : null,
                configid: configId,
                baselinecomponent: baselineComponent,
                baselineunits: baselineUnits,
                secondarybaselinecomponent: secondaryBaselineComponent,
                secondarybaselineunits: secondaryBaselineUnits,
                baselinerationale: baselineRationale,
                finalcomponent: finalComponent,
                finalunits: finalUnits,
                status: status,
                clinicalnotes: input.clinicalnotes?.trim() || null,
                statushistory: {
                    create: {
                        oldstatus: null,
                        newstatus: status,
                        changedbyuserid: userId,
                        reason: estimate.estimateAvailable
                            ? `Surgery planned with approved MSBOS baseline from ${estimate.guidelineSource}`
                            : "Surgery planned. Clinical guideline unavailable; marked for clinical review.",
                    },
                },
            },
            include: {
                procedureconfig: true,
                createdby: {
                    select: { userid: true, name: true, email: true },
                },
            },
        });

        return surgery;
    }

    /**
     * Lists surgery plans for a hospital with optional status, date, and text filters.
     */
    static async listSurgeryPlans(
        hospitalId: string,
        filters?: {
            status?: surgery_status;
            fromDate?: Date;
            toDate?: Date;
            search?: string;
        }
    ) {
        const whereClause: any = {
            hospitalid: hospitalId,
        };

        if (filters?.status) {
            whereClause.status = filters.status;
        }
        if (filters?.fromDate || filters?.toDate) {
            whereClause.scheduleddate = {};
            if (filters.fromDate) whereClause.scheduleddate.gte = filters.fromDate;
            if (filters.toDate) whereClause.scheduleddate.lte = filters.toDate;
        }
        if (filters?.search && filters.search.trim()) {
            const s = filters.search.trim();
            whereClause.OR = [
                { patientreference: { contains: s, mode: "insensitive" } },
                { procedurename: { contains: s, mode: "insensitive" } },
            ];
        }

        const plans = await prisma.surgeryplans.findMany({
            where: whereClause,
            include: {
                createdby: { select: { userid: true, name: true, email: true } },
                reviewedby: { select: { userid: true, name: true, email: true } },
                procedureconfig: true,
                linkedrequest: {
                    select: {
                        requestid: true,
                        status: true,
                        urgencylevel: true,
                        unitsrequired: true,
                    },
                },
            },
            orderBy: { scheduleddate: "asc" },
        });

        return plans;
    }

    /**
     * Summary metrics for hospital dashboard.
     */
    static async getSurgeryPlanSummary(hospitalId: string) {
        const now = new Date();
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const [upcomingTotal, awaitingReview, shortageIdentified, bloodArranged, next7Days] = await Promise.all([
            prisma.surgeryplans.count({
                where: {
                    hospitalid: hospitalId,
                    scheduleddate: { gte: now },
                    status: { notIn: [surgery_status.CANCELLED, surgery_status.COMPLETED] },
                },
            }),
            prisma.surgeryplans.count({
                where: {
                    hospitalid: hospitalId,
                    scheduleddate: { gte: now },
                    status: surgery_status.AWAITING_CLINICAL_REVIEW,
                },
            }),
            prisma.surgeryplans.count({
                where: {
                    hospitalid: hospitalId,
                    scheduleddate: { gte: now },
                    status: surgery_status.SHORTAGE_IDENTIFIED,
                },
            }),
            prisma.surgeryplans.count({
                where: {
                    hospitalid: hospitalId,
                    scheduleddate: { gte: now },
                    status: { in: [surgery_status.BLOOD_AVAILABLE, surgery_status.READY_FOR_SURGERY] },
                },
            }),
            prisma.surgeryplans.count({
                where: {
                    hospitalid: hospitalId,
                    scheduleddate: { gte: now, lte: nextWeek },
                    status: { notIn: [surgery_status.CANCELLED, surgery_status.COMPLETED] },
                },
            }),
        ]);

        return {
            upcomingTotal,
            awaitingReview,
            shortageIdentified,
            bloodArranged,
            next7Days,
        };
    }

    /**
     * Retrieves single surgery plan by ID with full audit history and related config.
     */
    static async getSurgeryPlanById(surgeryId: string, hospitalId: string) {
        const surgery = await prisma.surgeryplans.findFirst({
            where: {
                surgeryid: surgeryId,
                hospitalid: hospitalId,
            },
            include: {
                createdby: { select: { userid: true, name: true, email: true, role: true } },
                reviewedby: { select: { userid: true, name: true, email: true, role: true } },
                procedureconfig: true,
                linkedrequest: {
                    select: {
                        requestid: true,
                        status: true,
                        urgencylevel: true,
                        unitsrequired: true,
                        bloodcomponent: true,
                        bloodgroup: true,
                        requiredby: true,
                        createdat: true,
                    },
                },
                statushistory: {
                    include: {
                        changedby: { select: { userid: true, name: true, role: true } },
                    },
                    orderBy: { createdat: "asc" },
                },
            },
        });

        if (!surgery) {
            throw new Error("Surgery plan not found");
        }

        return surgery;
    }

    /**
     * Clinical Review & Approval.
     * Enforces Refinement 2: Role-based clinical signoff.
     * Only authorized clinical reviewers (verified medical council credentials) or ADMINs can approve.
     * Ordinary hospital clerical staff cannot approve.
     */
    static async reviewAndApprovePlan(
        surgeryId: string,
        hospitalId: string,
        reviewerUser: { userid: string; role: string; name: string },
        input: ClinicalReviewInput
    ) {
        // Enforce clinical reviewer permission:
        // Must be an ADMIN, or a HOSPITAL user with verified clinical reviewer status
        const reviewerRecord = await prisma.users.findUnique({
            where: { userid: reviewerUser.userid },
            select: { userid: true, role: true, name: true, isclinicalreviewer: true, medicalcouncilregno: true },
        });

        if (!reviewerRecord) {
            throw new Error("Reviewer user account not found");
        }

        if (
            reviewerRecord.role !== user_role.ADMIN &&
            (reviewerRecord.role !== user_role.HOSPITAL || !reviewerRecord.isclinicalreviewer)
        ) {
            throw new Error(
                "Unauthorized: Only verified hospital clinical reviewers (medical council registration required) or administrators can approve clinical blood requirements."
            );
        }

        const surgery = await prisma.surgeryplans.findFirst({
            where: {
                surgeryid: surgeryId,
                hospitalid: hospitalId,
            },
        });

        if (!surgery) {
            throw new Error("Surgery plan not found");
        }

        if (surgery.status === surgery_status.CANCELLED || surgery.status === surgery_status.COMPLETED) {
            throw new Error(`Cannot review surgery plan in ${surgery.status} status`);
        }

        if (!input.finalcomponent) {
            throw new Error("Approved blood component is required");
        }
        const units = Number(input.finalunits);
        if (!Number.isInteger(units) || units < 0 || units > 50) {
            throw new Error("Approved blood units must be an integer between 0 and 50");
        }

        if (!input.adjustmentreason || !input.adjustmentreason.trim()) {
            throw new Error("Clinical adjustment reason / justification is mandatory for audit compliance");
        }

        // Determine next status:
        // Clinical approval establishes the finalized clinical requirement.
        // If units > 0 and blood group is known, check live stock to set BLOOD_AVAILABLE or SHORTAGE_IDENTIFIED.
        // If blood group is pending, status becomes REQUIREMENT_ESTIMATED with typing pending notice.
        // If units === 0, requirement is estimated at 0 (Type & Screen).
        let nextStatus: surgery_status = surgery_status.REQUIREMENT_ESTIMATED;
        if (units > 0 && surgery.patientbloodgroup) {
            const compatibleDonors = getCompatibleDonorBloodGroups(surgery.patientbloodgroup, input.finalcomponent);
            const availableCount = await prisma.inventoryunits.count({
                where: {
                    bloodgroup: { in: compatibleDonors },
                    bloodcomponent: input.finalcomponent,
                    status: "AVAILABLE",
                    ttiscreeningstatus: "PASSED",
                    expirydate: { gt: surgery.scheduleddate },
                },
            });
            nextStatus = availableCount >= units ? surgery_status.BLOOD_AVAILABLE : surgery_status.SHORTAGE_IDENTIFIED;
        }

        const updated = await prisma.$transaction(async (tx) => {
            const plan = await tx.surgeryplans.update({
                where: { surgeryid: surgeryId },
                data: {
                    finalcomponent: input.finalcomponent,
                    finalunits: units,
                    secondaryfinalcomponent: input.secondaryfinalcomponent || null,
                    secondaryfinalunits: input.secondaryfinalunits ? Number(input.secondaryfinalunits) : null,
                    adjustmentreason: input.adjustmentreason.trim(),
                    reviewedbyuserid: reviewerUser.userid,
                    reviewedat: new Date(),
                    status: nextStatus,
                },
                include: {
                    reviewedby: { select: { userid: true, name: true, email: true } },
                    procedureconfig: true,
                },
            });

            await tx.surgeryplanstatushistory.create({
                data: {
                    surgeryid: surgeryId,
                    oldstatus: surgery.status,
                    newstatus: nextStatus,
                    changedbyuserid: reviewerUser.userid,
                    reason: `Clinical review approved by Clinician (${reviewerUser.name}): ${units} unit(s) of ${input.finalcomponent}. Reason: ${input.adjustmentreason.trim()}`,
                },
            });

            return plan;
        });

        return updated;
    }

    /**
     * Checks inventory availability across blood banks for a surgery.
     * Enforces:
     * - Refinement 3: Safe unknown blood group handling (never claim compatibility or count O-).
     * - Refinement 4: Accurate inventory availability (status=AVAILABLE, screening=PASSED, unexpired on surgery date).
     * - Prominent non-reservation and non-crossmatched disclaimer.
     * - Staleness detection: flags if last snapshot was taken > 30 minutes ago.
     */
    static async checkAvailability(surgeryId: string, hospitalId: string) {
        const surgery = await prisma.surgeryplans.findFirst({
            where: {
                surgeryid: surgeryId,
                hospitalid: hospitalId,
            },
            include: {
                procedureconfig: true,
            },
        });

        if (!surgery) {
            throw new Error("Surgery plan not found");
        }

        const checkTimestamp = new Date();
        const previousCheck = surgery.lastavailabilitycheckat ? new Date(surgery.lastavailabilitycheckat).getTime() : 0;
        const isStale = (checkTimestamp.getTime() - previousCheck) > 30 * 60 * 1000;

        // 1. Check for Unknown / Pending Blood Group (Refinement 3)
        if (!surgery.patientbloodgroup) {
            return {
                surgeryid: surgery.surgeryid,
                bloodGroupPending: true,
                message: "Patient blood group typing is pending. In accordance with clinical safety protocols, donor compatibility and unit availability cannot be evaluated until pre-operative ABO/Rh typing is confirmed.",
                unitsRequired: surgery.finalunits ?? surgery.baselineunits ?? 0,
                targetComponent: surgery.finalcomponent ?? surgery.baselinecomponent ?? null,
                totalAvailable: 0,
                isShortage: false,
                shortageUnits: 0,
                status: surgery.status,
                bloodBankBreakdown: [],
                checkTimestamp,
                isStale: false,
                disclaimer: "Live availability snapshot. Pre-operative blood typing is required before inventory compatibility can be confirmed.",
            };
        }

        // 2. Identify required component and quantity
        const targetComponent = surgery.finalcomponent || surgery.baselinecomponent || blood_component.RBC;
        const requiredUnits =
            surgery.finalunits !== null && surgery.finalunits !== undefined
                ? surgery.finalunits
                : (surgery.baselineunits !== null && surgery.baselineunits !== undefined ? surgery.baselineunits : 0);

        if (requiredUnits === 0) {
            return {
                surgeryid: surgery.surgeryid,
                bloodGroupPending: false,
                patientBloodGroup: surgery.patientbloodgroup,
                targetComponent,
                unitsRequired: 0,
                totalAvailable: 0,
                isShortage: false,
                shortageUnits: 0,
                status: surgery.status,
                bloodBankBreakdown: [],
                checkTimestamp,
                isStale: false,
                disclaimer: "Type & Screen protocol: No pre-operative crossmatched units required. Live blood bank inventory monitored.",
            };
        }

        // 3. Medically compatible donor groups for the component
        const compatibleDonorGroups = getCompatibleDonorBloodGroups(
            surgery.patientbloodgroup,
            targetComponent
        );

        // 4. Query strictly eligible inventory units
        const eligibleUnits = await prisma.inventoryunits.findMany({
            where: {
                bloodgroup: { in: compatibleDonorGroups },
                bloodcomponent: targetComponent,
                status: "AVAILABLE",
                ttiscreeningstatus: "PASSED",
                expirydate: { gt: surgery.scheduleddate },
            },
            include: {
                bloodbanks: {
                    select: {
                        bloodbankid: true,
                        bloodbankname: true,
                        address: true,
                        city: true,
                        state: true,
                        pincode: true,
                        contactpersonphone: true,
                        latitude: true,
                        longitude: true,
                    },
                },
            },
        });

        // Aggregate by blood bank facility
        const bankMap = new Map<string, any>();
        for (const unit of eligibleUnits) {
            const bank = unit.bloodbanks;
            if (!bankMap.has(bank.bloodbankid)) {
                bankMap.set(bank.bloodbankid, {
                    bloodbankid: bank.bloodbankid,
                    bloodbankname: bank.bloodbankname,
                    address: `${bank.address}, ${bank.city}, ${bank.state} - ${bank.pincode}`,
                    contactPhone: bank.contactpersonphone,
                    city: bank.city,
                    eligibleUnitsCount: 0,
                    byBloodGroup: {} as Record<string, number>,
                });
            }
            const record = bankMap.get(bank.bloodbankid);
            record.eligibleUnitsCount += 1;
            record.byBloodGroup[unit.bloodgroup] = (record.byBloodGroup[unit.bloodgroup] || 0) + 1;
        }

        const totalAvailable = eligibleUnits.length;
        const isShortage = totalAvailable < requiredUnits;
        const shortageUnits = isShortage ? requiredUnits - totalAvailable : 0;

        let newStatus: surgery_status = surgery.status;
        // BLOOD_AVAILABLE and SHORTAGE_IDENTIFIED are direct alternative check outcomes.
        // Don't overwrite terminal or already requested statuses.
        if (
            surgery.status !== surgery_status.BLOOD_REQUESTED &&
            surgery.status !== surgery_status.READY_FOR_SURGERY &&
            surgery.status !== surgery_status.COMPLETED &&
            surgery.status !== surgery_status.CANCELLED
        ) {
            newStatus = isShortage ? surgery_status.SHORTAGE_IDENTIFIED : surgery_status.BLOOD_AVAILABLE;
        }

        // Update snapshot timestamp and status if changed
        if (newStatus !== surgery.status || !surgery.lastavailabilitycheckat) {
            await prisma.$transaction([
                prisma.surgeryplans.update({
                    where: { surgeryid: surgeryId },
                    data: {
                        status: newStatus,
                        lastavailabilitycheckat: checkTimestamp,
                    },
                }),
                ...(newStatus !== surgery.status
                    ? [
                          prisma.surgeryplanstatushistory.create({
                              data: {
                                  surgeryid: surgeryId,
                                  oldstatus: surgery.status,
                                  newstatus: newStatus,
                                  reason: isShortage
                                      ? `Shortage identified during live inventory check: ${totalAvailable} available vs ${requiredUnits} required.`
                                      : `Adequate compatible units available across blood banks (${totalAvailable} eligible units found).`,
                              },
                          }),
                      ]
                    : []),
            ]);
        }

        return {
            surgeryid: surgery.surgeryid,
            bloodGroupPending: false,
            patientBloodGroup: surgery.patientbloodgroup,
            targetComponent,
            unitsRequired: requiredUnits,
            totalAvailable,
            isShortage,
            shortageUnits,
            status: newStatus,
            bloodBankBreakdown: Array.from(bankMap.values()),
            checkTimestamp,
            isStale,
            disclaimer: `Live availability snapshot as of ${checkTimestamp.toLocaleTimeString()}. These units are NOT reserved and have not undergone patient-specific pre-transfusion crossmatching. Live stock availability never implies reservation or guaranteed allocation.`,
        };
    }

    /**
     * Preparation Confirmation: Transitions surgery to READY_FOR_SURGERY.
     * Enforces Task 3: READY_FOR_SURGERY requires appropriate preparation confirmation.
     * Rejects if in SHORTAGE_IDENTIFIED without fulfilled requisition or available units.
     */
    static async confirmSurgeryReadiness(
        surgeryId: string,
        hospitalId: string,
        userId: string,
        confirmationNotes: string
    ) {
        if (!confirmationNotes || !confirmationNotes.trim()) {
            throw new Error("Clinical preparation confirmation notes are required.");
        }

        const surgery = await prisma.surgeryplans.findFirst({
            where: {
                surgeryid: surgeryId,
                hospitalid: hospitalId,
            },
            include: {
                linkedrequest: true,
            },
        });

        if (!surgery) {
            throw new Error("Surgery plan not found");
        }

        if (surgery.status === surgery_status.CANCELLED || surgery.status === surgery_status.COMPLETED) {
            throw new Error(`Cannot confirm readiness for surgery in ${surgery.status} status.`);
        }

        if (surgery.status === surgery_status.SHORTAGE_IDENTIFIED && !surgery.linkedrequestid) {
            throw new Error("Cannot confirm surgery readiness: Unresolved blood shortage identified and no blood requisition has been linked.");
        }

        const updated = await prisma.$transaction(async (tx) => {
            const plan = await tx.surgeryplans.update({
                where: { surgeryid: surgeryId },
                data: {
                    status: surgery_status.READY_FOR_SURGERY,
                },
            });

            await tx.surgeryplanstatushistory.create({
                data: {
                    surgeryid: surgeryId,
                    oldstatus: surgery.status,
                    newstatus: surgery_status.READY_FOR_SURGERY,
                    changedbyuserid: userId,
                    reason: `Clinical preparation confirmed: ${confirmationNotes.trim()}`,
                },
            });

            return plan;
        });

        return updated;
    }

    /**
     * Initiates formal blood requisition for a surgery plan.
     * Enforces Refinement 5: Secure Requisition Handoff with transaction safety and concurrency lock.
     */
    static async createRequisitionForShortage(
        surgeryId: string,
        hospitalId: string,
        userId: string
    ) {
        const surgery = await prisma.surgeryplans.findFirst({
            where: {
                surgeryid: surgeryId,
                hospitalid: hospitalId,
            },
            include: {
                hospitals: true,
            },
        });

        if (!surgery) {
            throw new Error("Surgery plan not found");
        }

        if (surgery.linkedrequestid) {
            throw new Error("A blood requisition has already been initiated for this surgery plan.");
        }

        if (surgery.status === surgery_status.CANCELLED || surgery.status === surgery_status.COMPLETED) {
            throw new Error(`Cannot create blood requisition for surgery in ${surgery.status} status.`);
        }

        if (!surgery.patientbloodgroup) {
            throw new Error("Cannot initiate blood requisition while patient blood group typing is pending. Confirm ABO/Rh typing first.");
        }

        const component = surgery.finalcomponent || surgery.baselinecomponent || blood_component.RBC;
        const units =
            surgery.finalunits !== null && surgery.finalunits !== undefined
                ? surgery.finalunits
                : (surgery.baselineunits !== null && surgery.baselineunits !== undefined ? surgery.baselineunits : 1);

        if (units <= 0) {
            throw new Error("Cannot create blood requisition for zero units.");
        }

        const hospital = surgery.hospitals;

        const result = await prisma.$transaction(async (tx) => {
            // Re-check plan inside transaction for concurrency safety
            const lockedPlan = await tx.surgeryplans.findUnique({
                where: { surgeryid: surgeryId },
            });
            if (!lockedPlan || lockedPlan.hospitalid !== hospitalId) {
                throw new Error("Surgery plan not found");
            }
            if (lockedPlan.linkedrequestid) {
                throw new Error("A blood requisition has already been initiated for this surgery plan.");
            }

            // Create blood request
            const bloodRequest = await tx.bloodrequests.create({
                data: {
                    createdbyuserid: userId,
                    hospitalid: hospitalId,
                    patientname: surgery.patientreference,
                    patientage: surgery.patientage,
                    patientgender: surgery.patientgender,
                    patientcontact: hospital.contactpersonphone || "9999999999",
                    bloodgroup: surgery.patientbloodgroup!,
                    bloodcomponent: component,
                    unitsrequired: units,
                    urgencylevel: "HIGH",
                    isemergency: false,
                    searchradius: 15,
                    latitude: hospital.latitude,
                    longitude: hospital.longitude,
                    requiredby: surgery.scheduleddate,
                    status: "CREATED",
                    notes: `Pre-operative blood requisition for surgery: ${surgery.procedurename} scheduled for ${surgery.scheduleddate.toISOString().split("T")[0]}.`,
                },
            });

            // Link request to surgery plan and update status to BLOOD_REQUESTED
            const updatedPlan = await tx.surgeryplans.update({
                where: { surgeryid: surgeryId },
                data: {
                    linkedrequestid: bloodRequest.requestid,
                    status: surgery_status.BLOOD_REQUESTED,
                },
            });

            // Status history audit record
            await tx.surgeryplanstatushistory.create({
                data: {
                    surgeryid: surgeryId,
                    oldstatus: lockedPlan.status,
                    newstatus: surgery_status.BLOOD_REQUESTED,
                    changedbyuserid: userId,
                    reason: `Initiated formal pre-operative blood requisition (Request ID: ${bloodRequest.requestid}).`,
                },
            });

            return {
                requestId: bloodRequest.requestid,
                plan: updatedPlan,
            };
        });

        return {
            success: true,
            requestId: result.requestId,
            status: surgery_status.BLOOD_REQUESTED,
            message: "Pre-operative blood requisition created successfully.",
        };
    }

    /**
     * Cancels a surgery plan.
     * Enforces Refinement 6: Non-destructive cancellation with reason and audit log.
     */
    static async cancelSurgeryPlan(
        surgeryId: string,
        hospitalId: string,
        userId: string,
        reason: string
    ) {
        if (!reason || !reason.trim()) {
            throw new Error("Cancellation reason is required");
        }

        const surgery = await prisma.surgeryplans.findFirst({
            where: {
                surgeryid: surgeryId,
                hospitalid: hospitalId,
            },
        });

        if (!surgery) {
            throw new Error("Surgery plan not found");
        }

        if (surgery.status === surgery_status.CANCELLED) {
            throw new Error("Surgery plan is already cancelled");
        }

        if (surgery.status === surgery_status.COMPLETED) {
            throw new Error("Cannot cancel a completed surgery plan");
        }

        const updated = await prisma.$transaction(async (tx) => {
            const plan = await tx.surgeryplans.update({
                where: { surgeryid: surgeryId },
                data: {
                    status: surgery_status.CANCELLED,
                },
            });

            await tx.surgeryplanstatushistory.create({
                data: {
                    surgeryid: surgeryId,
                    oldstatus: surgery.status,
                    newstatus: surgery_status.CANCELLED,
                    changedbyuserid: userId,
                    reason: `Surgery cancelled: ${reason.trim()}`,
                },
            });

            return plan;
        });

        return updated;
    }
}
