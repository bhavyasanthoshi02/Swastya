/**
 * Swastya API Contracts & Shared Data Types
 */

export type BloodGroupCode =
  | "A_POS"
  | "A_NEG"
  | "B_POS"
  | "B_NEG"
  | "AB_POS"
  | "AB_NEG"
  | "O_POS"
  | "O_NEG";

export type BloodGroupDisplay =
  | "A+"
  | "A-"
  | "B+"
  | "B-"
  | "AB+"
  | "AB-"
  | "O+"
  | "O-";

export type BloodGroup = BloodGroupCode | BloodGroupDisplay;

export type UserRole = "DONOR" | "REQUESTER" | "HOSPITAL" | "BLOODBANK";

export type UrgencyLevel = "NORMAL" | "URGENT" | "CRITICAL";

export type RequestStatus = "PENDING" | "MATCHED" | "FULFILLED" | "CANCELLED";

export type DonorAvailability = "AVAILABLE" | "PAUSED" | "UNAVAILABLE";

export type DonorEligibility = "ELIGIBLE" | "COOLDOWN" | "REVIEW_REQUIRED";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DonorRegistryRecord {
  name: string;
  phone: string;
  bloodGroup: BloodGroup;
  city?: string;
  state?: string;
  pincode?: string;
  lastDonationDate?: string;
}

export interface BloodRequestPayload {
  patientName: string;
  bloodGroup: BloodGroup;
  units: number;
  urgency: UrgencyLevel;
  hospitalName: string;
  location: string;
  city: string;
  contactNumber: string;
  requiredBy?: string;
}

export interface EmergencyMatchingResult {
  requestId: string;
  matchedDonorsCount: number;
  notifiedCount: number;
  status: string;
}
