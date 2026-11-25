/**
 * Swastya Shared Constants & Utilities
 */

export const BLOOD_GROUPS_DISPLAY = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

export const BLOOD_GROUPS_CODE = [
  "A_POS",
  "A_NEG",
  "B_POS",
  "B_NEG",
  "AB_POS",
  "AB_NEG",
  "O_POS",
  "O_NEG",
] as const;

/**
 * Mapping from Display representation to Database Enum representation
 */
export const DISPLAY_TO_CODE_BLOOD_GROUP: Record<string, string> = {
  "A+": "A_POS",
  "A-": "A_NEG",
  "B+": "B_POS",
  "B-": "B_NEG",
  "AB+": "AB_POS",
  "AB-": "AB_NEG",
  "O+": "O_POS",
  "O-": "O_NEG",
};

/**
 * Mapping from Database Enum representation to Display representation
 */
export const CODE_TO_DISPLAY_BLOOD_GROUP: Record<string, string> = {
  A_POS: "A+",
  A_NEG: "A-",
  B_POS: "B+",
  B_NEG: "B-",
  AB_POS: "AB+",
  AB_NEG: "AB-",
  O_POS: "O+",
  O_NEG: "O-",
};

/**
 * Compatibility matrix: For a given recipient blood group, who can donate to them?
 */
export const COMPATIBLE_DONOR_MAP: Record<string, string[]> = {
  "O-": ["O-"],
  "O+": ["O-", "O+"],
  "B-": ["O-", "B-"],
  "B+": ["O-", "O+", "B-", "B+"],
  "A-": ["O-", "A-"],
  "A+": ["O-", "O+", "A-", "A+"],
  "AB-": ["O-", "B-", "A-", "AB-"],
  "AB+": ["O-", "O+", "B-", "B+", "A-", "A+", "AB-", "AB+"],
};

export function normalizeBloodGroup(input: string): string {
  if (!input) return "";
  const trimmed = input.trim().toUpperCase();
  if (DISPLAY_TO_CODE_BLOOD_GROUP[trimmed]) {
    return DISPLAY_TO_CODE_BLOOD_GROUP[trimmed];
  }
  return trimmed;
}

export function formatBloodGroupDisplay(input: string): string {
  if (!input) return "";
  const trimmed = input.trim().toUpperCase();
  if (CODE_TO_DISPLAY_BLOOD_GROUP[trimmed]) {
    return CODE_TO_DISPLAY_BLOOD_GROUP[trimmed];
  }
  return trimmed;
}

export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
