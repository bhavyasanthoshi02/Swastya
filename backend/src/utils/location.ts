/**
 * Location Normalization & Geographic Matching Utility
 * 
 * Standardizes Indian districts (represented via city in Swastya's schema)
 * and states to prevent mismatches caused by capitalization, whitespace,
 * or common state abbreviation variants.
 */

// Mapping of common state abbreviations and spelling variations to standard full names
const STATE_SYNONYMS: Record<string, string> = {
    // Abbreviations
    "MH": "MAHARASHTRA",
    "OD": "ODISHA",
    "OR": "ODISHA",
    "KA": "KARNATAKA",
    "TS": "TELANGANA",
    "TG": "TELANGANA",
    "AP": "ANDHRA PRADESH",
    "TN": "TAMIL NADU",
    "DL": "DELHI",
    "NCT": "DELHI",
    "WB": "WEST BENGAL",
    "UP": "UTTAR PRADESH",
    "MP": "MADHYA PRADESH",
    "GJ": "GUJARAT",
    "RJ": "RAJASTHAN",
    "KL": "KERALA",
    "PB": "PUNJAB",
    "HR": "HARYANA",
    "BR": "BIHAR",
    "JH": "JHARKHAND",
    "CT": "CHHATTISGARH",
    "CG": "CHHATTISGARH",
    "AS": "ASSAM",
    "GA": "GOA",
    "UK": "UTTARAKHAND",
    "UA": "UTTARAKHAND",
    "HP": "HIMACHAL PRADESH",
    "TR": "TRIPURA",
    "ML": "MEGHALAYA",
    "MN": "MANIPUR",
    "MZ": "MIZORAM",
    "NL": "NAGALAND",
    "SK": "SIKKIM",
    "AR": "ARUNACHAL PRADESH",
    // Common alternative spellings
    "ORISSA": "ODISHA",
    "PONDICHERRY": "PUDUCHERRY",
    "UTTANCHAL": "UTTARAKHAND",
};

// Common city / district spelling synonyms (e.g. Bangalore -> Bengaluru)
const DISTRICT_SYNONYMS: Record<string, string> = {
    "BANGALORE": "BENGALURU",
    "BENGALURU URBAN": "BENGALURU",
    "BENGALURU RURAL": "BENGALURU",
    "MYSORE": "MYSURU",
    "BOMBAY": "MUMBAI",
    "CALCUTTA": "KOLKATA",
    "MADRAS": "CHENNAI",
    "BARODA": "VADODARA",
    "TRIVANDRUM": "THIRUVANANTHAPURAM",
    "COCHIN": "KOCHI",
    "POONA": "PUNE",
    "BHUBANESHWAR": "BHUBANESWAR",
    "CUTTACK CITY": "CUTTACK",
};

/**
 * Standardize free-form text: trim, collapse internal spaces, convert to uppercase
 */
export const cleanText = (val?: string | null): string => {
    if (!val || typeof val !== "string") return "";
    return val.trim().replace(/\s+/g, " ").toUpperCase();
};

/**
 * Normalize state name, resolving abbreviations and aliases
 */
export const normalizeState = (state?: string | null): string => {
    const cleaned = cleanText(state);
    if (!cleaned) return "";
    return STATE_SYNONYMS[cleaned] || cleaned;
};

/**
 * Normalize district (stored in database as city), resolving aliases
 */
export const normalizeDistrict = (districtOrCity?: string | null): string => {
    const cleaned = cleanText(districtOrCity);
    if (!cleaned) return "";
    return DISTRICT_SYNONYMS[cleaned] || cleaned;
};

/**
 * Format a normalized name into title case for presentation
 * e.g. "MAHARASHTRA" -> "Maharashtra", "BHUBANESWAR" -> "Bhubaneswar"
 */
export const toTitleCase = (val?: string | null): string => {
    if (!val) return "";
    return val
        .toLowerCase()
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
};

export interface NormalizedLocation {
    district: string;        // Normalized uppercase (e.g. "BHUBANESWAR")
    state: string;           // Normalized uppercase (e.g. "ODISHA")
    pincode: string;
    displayDistrict: string; // Title case for UI (e.g. "Bhubaneswar")
    displayState: string;    // Title case for UI (e.g. "Odisha")
    isValid: boolean;        // True if both district and state are non-empty
    missingLocationMessage?: string;
}

/**
 * Extract and validate normalized location coordinates from a facility record
 */
export const getNormalizedLocation = (facility?: {
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
} | null): NormalizedLocation => {
    const district = normalizeDistrict(facility?.city);
    const state = normalizeState(facility?.state);
    const pincode = cleanText(facility?.pincode);
    const isValid = Boolean(district && state);
    const missingLocationMessage = !isValid
        ? "Facility location is incomplete. City or state is missing, so regional comparisons are unavailable."
        : undefined;

    return {
        district,
        state,
        pincode,
        displayDistrict: toTitleCase(district),
        displayState: toTitleCase(state),
        isValid,
        missingLocationMessage,
    };
};

/**
 * Check if two facilities reside within the same district (must match both district and state)
 */
export const isDistrictMatch = (
    loc1?: { city?: string | null; state?: string | null } | null,
    loc2?: { city?: string | null; state?: string | null } | null
): boolean => {
    if (!loc1 || !loc2) return false;
    const l1 = getNormalizedLocation(loc1);
    const l2 = getNormalizedLocation(loc2);
    if (!l1.isValid || !l2.isValid) return false;
    return l1.district === l2.district && l1.state === l2.state;
};

export const isSameDistrict = isDistrictMatch;

/**
 * Check if two facilities reside within the same state
 */
export const isStateMatch = (
    loc1?: { state?: string | null } | null,
    loc2?: { state?: string | null } | null
): boolean => {
    if (!loc1 || !loc2) return false;
    const s1 = normalizeState(loc1.state);
    const s2 = normalizeState(loc2.state);
    if (!s1 || !s2) return false;
    return s1 === s2;
};

export const isSameState = isStateMatch;

/**
 * Normalizes address, city, district, state, and pincode fields into standard title-case presentation
 */
export function normalizeLocationFields(loc: {
    address: string;
    city: string;
    district?: string | null;
    state: string;
    pincode: string;
}) {
    return {
        address: loc.address ? loc.address.trim() : "",
        city: toTitleCase(normalizeDistrict(loc.city)),
        district: loc.district ? toTitleCase(normalizeDistrict(loc.district)) : toTitleCase(normalizeDistrict(loc.city)),
        state: toTitleCase(normalizeState(loc.state)),
        pincode: loc.pincode ? loc.pincode.trim() : "",
    };
}
