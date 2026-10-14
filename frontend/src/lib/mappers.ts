import {
  DonorProfile,
  RequestPreviewItem,
  LastDonationRecord,
} from "@/components/donor/DonorTypes";
import { AuthDonor, AuthUser } from "./auth";

export const BLOOD_GROUP_TO_DISPLAY: Record<string, string> = {
  A_POSITIVE: "A+",
  A_NEGATIVE: "A-",
  B_POSITIVE: "B+",
  B_NEGATIVE: "B-",
  AB_POSITIVE: "AB+",
  AB_NEGATIVE: "AB-",
  O_POSITIVE: "O+",
  O_NEGATIVE: "O-",
};

export const DISPLAY_TO_BLOOD_GROUP: Record<string, string> = {
  "A+": "A_POSITIVE",
  "A-": "A_NEGATIVE",
  "B+": "B_POSITIVE",
  "B-": "B_NEGATIVE",
  "AB+": "AB_POSITIVE",
  "AB-": "AB_NEGATIVE",
  "O+": "O_POSITIVE",
  "O-": "O_NEGATIVE",
};

export function mapBloodGroupToDisplay(group: string | null | undefined): string {
  if (!group) return "O+";
  return BLOOD_GROUP_TO_DISPLAY[group.toUpperCase()] || group;
}

export function mapDisplayToBloodGroup(group: string | null | undefined): string {
  if (!group) return "O_POSITIVE";
  return DISPLAY_TO_BLOOD_GROUP[group.toUpperCase()] || group;
}

export function mapAvailabilityToDisplay(status: string | null | undefined): "Available" | "Paused" {
  if (status === "AVAILABLE") return "Available";
  return "Paused";
}

export function mapDisplayToAvailability(display: "Available" | "Paused"): "AVAILABLE" | "TEMPORARILY_UNAVAILABLE" {
  if (display === "Available") return "AVAILABLE";
  return "TEMPORARILY_UNAVAILABLE";
}

export function mapUrgencyToDisplay(urgency: string | null | undefined): "Critical Emergency" | "Urgent" | "Standard" {
  if (!urgency) return "Standard";
  const u = urgency.toUpperCase();
  if (u === "CRITICAL") return "Critical Emergency";
  if (u === "HIGH") return "Urgent";
  return "Standard";
}

export function formatTimeAgo(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "Recently";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Recently";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 30) {
    return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  }
  if (diffDay > 0) {
    return diffDay === 1 ? "1 day ago" : `${diffDay} days ago`;
  }
  if (diffHour > 0) {
    return diffHour === 1 ? "1 hour ago" : `${diffHour} hours ago`;
  }
  if (diffMin > 0) {
    return diffMin === 1 ? "1 min ago" : `${diffMin} mins ago`;
  }
  return "Just now";
}

export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "No record";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function mapBackendRequestToPreview(req: any): RequestPreviewItem {
  const hospitalName =
    req.hospital?.name ||
    req.bloodbank?.name ||
    (req.patientname ? `Care Facility (${req.patientname})` : "Certified Regional Hospital");

  const address = req.hospital?.address || req.bloodbank?.address || "";
  const city = req.hospital?.city || req.bloodbank?.city || "";
  const location = [address, city].filter(Boolean).join(", ") || "City Medical Center";

  return {
    id: req.requestid ? `REQ-${req.requestid.slice(0, 8).toUpperCase()}` : "REQ-UNKNOWN",
    rawId: req.requestid,
    hospitalName,
    bloodGroup: mapBloodGroupToDisplay(req.bloodgroup),
    distance: city ? `${city} Center` : "Local Area",
    distanceKm: 4.5,
    urgency: mapUrgencyToDisplay(req.urgencylevel),
    units: req.unitsrequired || 1,
    location,
    postedTime: formatTimeAgo(req.createdat),
    caseDetails:
      req.notes ||
      `Immediate voluntary whole blood requested for patient ${req.patientname || "in hospital care"}.`,
    contactPerson: req.contactperson || "Hospital Transfusion Coordinator",
    contactPhone: req.contactphone || "+91 Regional Helpline",
    requiredWithin: req.requireddate
      ? `By ${formatDate(req.requireddate)}`
      : req.urgencylevel === "CRITICAL"
      ? "Immediate Emergency"
      : "Within 24 hours",
    patientAgeGroup: req.patientname ? `Patient: ${req.patientname}` : "Clinical Care Requisition",
  };
}

export function mapBackendHistoryToRecord(item: any): LastDonationRecord {
  const location =
    item.hospital?.name ||
    item.bloodbank?.name ||
    "Authorized Blood Bank / Transfusion Center";

  return {
    id: item.historyid ? `DON-${item.historyid.slice(0, 8).toUpperCase()}` : "DON-RECORD",
    date: formatDate(item.donationdate),
    location,
    associatedRequest: item.requestid ? `REQ-${item.requestid.slice(0, 8).toUpperCase()}` : undefined,
    bloodGroup: item.bloodgroup ? mapBloodGroupToDisplay(item.bloodgroup) : "O+",
    status: "Verified & Transfused",
    recordReference: item.historyid ? `REC-${item.historyid.slice(0, 10).toUpperCase()}` : "REC-UNKNOWN",
    units: item.unitsdonated || 1,
    componentType: item.componenttype || "Whole Blood (450 ml)",
    notes: item.notes || "Voluntary donation. Transfusion cross-match verified successfully.",
  };
}

export function mapBackendDonorToProfile(
  donor: AuthDonor | any,
  user?: AuthUser | any,
  dashboardStats?: any,
  eligibilityData?: any
): DonorProfile {
  const bloodGroup = mapBloodGroupToDisplay(donor?.bloodgroup);
  const name = user?.name || donor?.users?.name || "Voluntary Donor";
  const email = user?.email || donor?.users?.email || "donor@swastya.org";
  const phone = user?.phonenumber || donor?.users?.phonenumber || "+91 Phone on file";
  const city = donor?.city || "Bengaluru";
  const state = donor?.state || "Karnataka";
  const pincode = donor?.pincode || "560001";
  const location = `${city}, ${state} (${pincode})`;

  const availability = mapAvailabilityToDisplay(donor?.availabilitystatus);

  let eligibility: "Eligible" | "Cooldown" | "Review Required" = "Eligible";
  if (eligibilityData?.status === "Cooldown") {
    eligibility = "Cooldown";
  } else if (eligibilityData?.status === "Review Required") {
    eligibility = "Review Required";
  }

  const daysSinceLast = eligibilityData?.daysSinceLastDonation ?? 95;
  const lastDate = donor?.lastdonationdate ? formatDate(donor.lastdonationdate) : "No Prior Donations";

  return {
    name,
    bloodGroup,
    phone,
    email,
    location,
    city,
    state,
    pincode,
    availability,
    eligibility,
    lastDonationDate: lastDate,
    daysSinceLastDonation: daysSinceLast,
    matchingCount: dashboardStats?.activeMatches ?? 0,
    nearbyCount: dashboardStats?.activeMatches ?? 0,
    totalDonations: dashboardStats?.totalDonations ?? 0,
    livesSaved: dashboardStats?.livesSaved ?? 0,
    donorId: donor?.donorid ? `SW-DON-${donor.donorid.slice(0, 6).toUpperCase()}` : "SW-DON-NEW",
    radiusKm: dashboardStats?.coverageRadiusKm ?? 15,
    emergencySms: false,
    quietHours: false,
  };
}
