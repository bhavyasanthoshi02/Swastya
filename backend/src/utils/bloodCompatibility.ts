/**
 * Clinical Blood Component Compatibility Engine
 *
 * Provides medically differentiated compatibility logic separated by blood component:
 * - RBC (Packed Red Blood Cells): Standard ABO/Rh red-cell antigen matching. O- is universal donor; AB+ is universal recipient.
 * - WHOLE_BLOOD: Red-cell compatible emergency donor pool (permits O- universal emergency whole blood / LTOWB).
 *   NOTE: Clinical domain review is required if institutional protocols mandate strictly isogroup (ABO-identical) whole blood.
 * - PLASMA (Fresh Frozen Plasma / Cryosupernatant): Acellular component where donor antibodies determine compatibility.
 *   AB is the universal plasma donor (no anti-A or anti-B antibodies).
 *   O is the universal plasma recipient (no A or B antigens on RBCs).
 * - PLATELETS: Platelets express ABO antigens and carry suspension plasma.
 *   Conservative Documented Policy: ABO-identical matching enforced to optimize platelet count recovery and prevent isohemagglutinin-mediated hemolysis.
 *   NOTE: This policy is a conservative rule pending formal institutional transfusion committee guidelines.
 */

import { blood_group, blood_component } from "../generated/prisma/enums";

// ============================================================================
// 1. RBC (PACKED RED BLOOD CELLS) COMPATIBILITY MAPS
// ============================================================================

/** Recipient Group -> Compatible Donor Groups for RBC */
export const RBC_RECIPIENT_TO_DONOR_MAP: Record<blood_group, blood_group[]> = {
    [blood_group.O_NEGATIVE]: [blood_group.O_NEGATIVE],
    [blood_group.O_POSITIVE]: [blood_group.O_NEGATIVE, blood_group.O_POSITIVE],
    [blood_group.A_NEGATIVE]: [blood_group.O_NEGATIVE, blood_group.A_NEGATIVE],
    [blood_group.A_POSITIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
    ],
    [blood_group.B_NEGATIVE]: [blood_group.O_NEGATIVE, blood_group.B_NEGATIVE],
    [blood_group.B_POSITIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
    ],
    [blood_group.AB_NEGATIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.A_NEGATIVE,
        blood_group.B_NEGATIVE,
        blood_group.AB_NEGATIVE,
    ],
    [blood_group.AB_POSITIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
};

/** Donor Group -> Compatible Recipient Groups for RBC */
export const RBC_DONOR_TO_RECIPIENT_MAP: Record<blood_group, blood_group[]> = {
    [blood_group.O_NEGATIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.O_POSITIVE]: [
        blood_group.O_POSITIVE,
        blood_group.A_POSITIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.A_NEGATIVE]: [
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.A_POSITIVE]: [blood_group.A_POSITIVE, blood_group.AB_POSITIVE],
    [blood_group.B_NEGATIVE]: [
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.B_POSITIVE]: [blood_group.B_POSITIVE, blood_group.AB_POSITIVE],
    [blood_group.AB_NEGATIVE]: [blood_group.AB_NEGATIVE, blood_group.AB_POSITIVE],
    [blood_group.AB_POSITIVE]: [blood_group.AB_POSITIVE],
};

// ============================================================================
// 2. WHOLE BLOOD COMPATIBILITY MAPS
// ============================================================================

/** Recipient Group -> Compatible Donor Groups for WHOLE_BLOOD */
export const WHOLE_BLOOD_RECIPIENT_TO_DONOR_MAP: Record<blood_group, blood_group[]> = {
    ...RBC_RECIPIENT_TO_DONOR_MAP,
};

/** Donor Group -> Compatible Recipient Groups for WHOLE_BLOOD */
export const WHOLE_BLOOD_DONOR_TO_RECIPIENT_MAP: Record<blood_group, blood_group[]> = {
    ...RBC_DONOR_TO_RECIPIENT_MAP,
};

// ============================================================================
// 3. PLASMA (FFP / CRYOSUPERNATANT) COMPATIBILITY MAPS
// ============================================================================

/**
 * In plasma transfusion:
 * - Recipient red blood cells must not be lysed by donor plasma isohemagglutinins (Anti-A, Anti-B).
 * - AB plasma contains neither Anti-A nor Anti-B antibodies -> AB is the universal plasma donor.
 * - O red cells carry neither A nor B antigens -> O is the universal plasma recipient (can receive O, A, B, AB plasma).
 * - A recipients can receive A and AB plasma.
 * - B recipients can receive B and AB plasma.
 * - AB recipients have both A and B antigens, so they can receive ONLY AB plasma.
 */
export const PLASMA_RECIPIENT_TO_DONOR_MAP: Record<blood_group, blood_group[]> = {
    [blood_group.O_NEGATIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.O_POSITIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.A_NEGATIVE]: [
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.A_POSITIVE]: [
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.B_NEGATIVE]: [
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.B_POSITIVE]: [
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.AB_NEGATIVE]: [blood_group.AB_NEGATIVE, blood_group.AB_POSITIVE],
    [blood_group.AB_POSITIVE]: [blood_group.AB_NEGATIVE, blood_group.AB_POSITIVE],
};

/** Donor Group -> Compatible Recipient Groups for PLASMA */
export const PLASMA_DONOR_TO_RECIPIENT_MAP: Record<blood_group, blood_group[]> = {
    [blood_group.AB_NEGATIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.AB_POSITIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.A_NEGATIVE]: [
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
    ],
    [blood_group.A_POSITIVE]: [
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
    ],
    [blood_group.B_NEGATIVE]: [
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
    ],
    [blood_group.B_POSITIVE]: [
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
    ],
    [blood_group.O_NEGATIVE]: [blood_group.O_NEGATIVE, blood_group.O_POSITIVE],
    [blood_group.O_POSITIVE]: [blood_group.O_NEGATIVE, blood_group.O_POSITIVE],
};

// ============================================================================
// 4. PLATELETS COMPATIBILITY MAPS (CONSERVATIVE ABO-IDENTICAL POLICY)
// ============================================================================

/**
 * Conservative Policy for Emergency Platelet Broadcast:
 * - Enforces ABO-identical matching to maximize platelet recovery and prevent isohemagglutinin-mediated hemolysis.
 * - Rh-negative donors can safely provide platelets to both Rh-positive and Rh-negative recipients of identical ABO.
 * - Rh-positive donors provide platelets to Rh-positive recipients of identical ABO.
 * NOTE: Documented conservative policy pending institutional review.
 */
export const PLATELET_RECIPIENT_TO_DONOR_MAP: Record<blood_group, blood_group[]> = {
    [blood_group.O_NEGATIVE]: [blood_group.O_NEGATIVE],
    [blood_group.O_POSITIVE]: [blood_group.O_NEGATIVE, blood_group.O_POSITIVE],
    [blood_group.A_NEGATIVE]: [blood_group.A_NEGATIVE],
    [blood_group.A_POSITIVE]: [blood_group.A_NEGATIVE, blood_group.A_POSITIVE],
    [blood_group.B_NEGATIVE]: [blood_group.B_NEGATIVE],
    [blood_group.B_POSITIVE]: [blood_group.B_NEGATIVE, blood_group.B_POSITIVE],
    [blood_group.AB_NEGATIVE]: [blood_group.AB_NEGATIVE],
    [blood_group.AB_POSITIVE]: [blood_group.AB_NEGATIVE, blood_group.AB_POSITIVE],
};

/** Donor Group -> Compatible Recipient Groups for PLATELETS */
export const PLATELET_DONOR_TO_RECIPIENT_MAP: Record<blood_group, blood_group[]> = {
    [blood_group.O_NEGATIVE]: [blood_group.O_NEGATIVE, blood_group.O_POSITIVE],
    [blood_group.O_POSITIVE]: [blood_group.O_POSITIVE],
    [blood_group.A_NEGATIVE]: [blood_group.A_NEGATIVE, blood_group.A_POSITIVE],
    [blood_group.A_POSITIVE]: [blood_group.A_POSITIVE],
    [blood_group.B_NEGATIVE]: [blood_group.B_NEGATIVE, blood_group.B_POSITIVE],
    [blood_group.B_POSITIVE]: [blood_group.B_POSITIVE],
    [blood_group.AB_NEGATIVE]: [blood_group.AB_NEGATIVE, blood_group.AB_POSITIVE],
    [blood_group.AB_POSITIVE]: [blood_group.AB_POSITIVE],
};

// ============================================================================
// 5. NORMALIZATION AND VALIDATION HELPERS
// ============================================================================

const VALID_COMPONENTS = new Set<string>([
    blood_component.WHOLE_BLOOD,
    blood_component.RBC,
    blood_component.PLASMA,
    blood_component.PLATELETS,
]);

/**
 * Normalizes input component string to valid blood_component enum or null if invalid
 */
export function normalizeBloodComponent(componentInput?: any): blood_component | null {
    if (!componentInput) return blood_component.WHOLE_BLOOD; // default fallback if unassigned
    const cleaned = String(componentInput).trim().toUpperCase();
    if (VALID_COMPONENTS.has(cleaned)) {
        return cleaned as blood_component;
    }
    // Handle human-readable variants
    if (cleaned === "WHOLE BLOOD" || cleaned === "WHOLEBLOOD") return blood_component.WHOLE_BLOOD;
    if (cleaned === "RED BLOOD CELLS" || cleaned === "PACKED_RBC" || cleaned === "PACKED RBC") return blood_component.RBC;
    if (cleaned === "PLATELET") return blood_component.PLATELETS;
    if (cleaned === "FRESH FROZEN PLASMA" || cleaned === "FFP") return blood_component.PLASMA;

    return null; // Unknown / unsupported component
}

// ============================================================================
// 6. PRIMARY PUBLIC API
// ============================================================================

/**
 * Returns list of donor blood groups compatible with the recipient for the requested component.
 * Direction: Recipient Requirements -> Compatible Candidate Donors
 *
 * @param recipientGroup Requested blood group
 * @param component Requested blood component (WHOLE_BLOOD, RBC, PLASMA, PLATELETS)
 * @returns Array of compatible donor blood_groups, or empty array if component is invalid
 */
export function getCompatibleDonorBloodGroups(
    recipientGroup: blood_group,
    component?: blood_component | string | null
): blood_group[] {
    const normalizedComp = normalizeBloodComponent(component);
    if (!normalizedComp) {
        // Safe fail-closed: unknown/unsupported component returns empty list
        return [];
    }

    switch (normalizedComp) {
        case blood_component.PLASMA:
            return PLASMA_RECIPIENT_TO_DONOR_MAP[recipientGroup] || [recipientGroup];
        case blood_component.PLATELETS:
            return PLATELET_RECIPIENT_TO_DONOR_MAP[recipientGroup] || [recipientGroup];
        case blood_component.RBC:
            return RBC_RECIPIENT_TO_DONOR_MAP[recipientGroup] || [recipientGroup];
        case blood_component.WHOLE_BLOOD:
        default:
            return WHOLE_BLOOD_RECIPIENT_TO_DONOR_MAP[recipientGroup] || [recipientGroup];
    }
}

/**
 * Returns list of recipient blood groups that a donor can donate to for the requested component.
 * Direction: Available Donor Group -> Acceptable Recipient Groups
 *
 * @param donorGroup Donor's blood group
 * @param component Requested blood component
 * @returns Array of acceptable recipient blood_groups, or empty array if component is invalid
 */
export function getCompatibleRecipientBloodGroups(
    donorGroup: blood_group,
    component?: blood_component | string | null
): blood_group[] {
    const normalizedComp = normalizeBloodComponent(component);
    if (!normalizedComp) {
        return [];
    }

    switch (normalizedComp) {
        case blood_component.PLASMA:
            return PLASMA_DONOR_TO_RECIPIENT_MAP[donorGroup] || [donorGroup];
        case blood_component.PLATELETS:
            return PLATELET_DONOR_TO_RECIPIENT_MAP[donorGroup] || [donorGroup];
        case blood_component.RBC:
            return RBC_DONOR_TO_RECIPIENT_MAP[donorGroup] || [donorGroup];
        case blood_component.WHOLE_BLOOD:
        default:
            return WHOLE_BLOOD_DONOR_TO_RECIPIENT_MAP[donorGroup] || [donorGroup];
    }
}

/**
 * Verifies whether a donor blood group is clinically compatible with a recipient for a specific blood component.
 *
 * @param donorGroup Blood group of voluntary donor
 * @param recipientGroup Blood group of blood requisition
 * @param component Blood component being requested
 * @returns true if compatible, false if incompatible or component is unsupported
 */
export function isDonorCompatibleWithRecipient(
    donorGroup: blood_group,
    recipientGroup: blood_group,
    component?: blood_component | string | null
): boolean {
    const compatibleDonors = getCompatibleDonorBloodGroups(recipientGroup, component);
    return compatibleDonors.includes(donorGroup);
}
