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
    req.hospitals?.hospitalname ||
    req.hospital?.name ||
    req.bloodbank?.name ||
    (req.patientname ? `Care Facility (${req.patientname})` : "Certified Regional Hospital");

  const address = req.hospitals?.address || req.hospital?.address || req.bloodbank?.address || "";
  const city = req.hospitals?.city || req.hospital?.city || req.bloodbank?.city || "";
  const location = [address, city].filter(Boolean).join(", ") || "City Medical Center";

  return {
    id: req.requestid ? `REQ-${req.requestid.slice(0, 8).toUpperCase()}` : "REQ-UNKNOWN",
    rawId: req.requestid,
    hospitalName,
    bloodGroup: mapBloodGroupToDisplay(req.bloodgroup),
    distance: req.distanceDisplay || (city ? `${city} Center` : "Local Area"),
    distanceKm: req.distanceKm != null ? req.distanceKm : null,
    locationMatch: req.locationMatch || "CITY_FALLBACK",
    searchradius: req.searchradius || 5,
    urgency: mapUrgencyToDisplay(req.urgencylevel),
    units: req.unitsrequired || 1,
    location,
    postedTime: formatTimeAgo(req.createdat),
    caseDetails:
      req.notes ||
      `Immediate voluntary whole blood requested for patient ${req.patientname || "in hospital care"}.`,
    contactPerson: req.hospitals?.contactpersonname || req.contactperson || "Hospital Transfusion Coordinator",
    contactPhone: req.hospitals?.contactpersonphone || req.contactphone || "+91 Regional Helpline",
    requiredWithin: req.requiredby
      ? `By ${formatDate(req.requiredby)}`
      : req.requireddate
      ? `By ${formatDate(req.requireddate)}`
      : req.urgencylevel === "CRITICAL"
      ? "Immediate Emergency"
      : "Within 24 hours",
    patientAgeGroup: req.patientname ? `Patient: ${req.patientname}` : "Clinical Care Requisition",
    hasResponded: Boolean(req.hasResponded),
  };
}

export function mapBackendHistoryToRecord(item: any): LastDonationRecord {
  const isHistorical = Boolean(item.isImported ?? item.isimported);
  const location =
    item.sourceHospital ||
    item.hospitals?.hospitalname ||
    item.hospital?.name ||
    item.bloodbanks?.bloodbankname ||
    item.bloodbank?.name ||
    (isHistorical ? "Historical Facility Record" : "Authorized Transfusion Center");

  const verification =
    item.verificationStatus || item.verificationstatus || (isHistorical ? "PENDING" : "VERIFIED");

  let statusText = "Verified & Transfused";
  if (isHistorical) {
    if (verification === "VERIFIED") statusText = "Verified Historical Record";
    else if (verification === "REJECTED") statusText = "Rejected Historical Record";
    else statusText = "Historical Record (Pending Review)";
  }

  const recordId = item.donationhistoryid || item.historyid;

  return {
    id: recordId ? `DON-${recordId.slice(0, 8).toUpperCase()}` : "DON-RECORD",
    date: formatDate(item.donationdate),
    location,
    associatedRequest: item.requestid ? `REQ-${item.requestid.slice(0, 8).toUpperCase()}` : undefined,
    bloodGroup: item.bloodgroup ? mapBloodGroupToDisplay(item.bloodgroup) : "O+",
    status: statusText,
    recordReference:
      item.sourcerecordid ||
      item.sourceRecordId ||
      (recordId ? `REC-${recordId.slice(0, 10).toUpperCase()}` : "REC-UNKNOWN"),
    units: item.unitsdonated || item.units || 1,
    componentType: mapBloodComponentToDisplay(
      item.bloodcomponent || item.bloodComponent || item.componentType
    ),
    notes:
      item.remarks ||
      item.notes ||
      (isHistorical
        ? "Historical donation record imported by hospital registry."
        : "Voluntary donation. Transfusion cross-match verified successfully."),
    isImported: isHistorical,
    verificationStatus: verification,
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
    latitude: donor?.latitude != null ? Number(donor.latitude) : null,
    longitude: donor?.longitude != null ? Number(donor.longitude) : null,
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

export function mapBloodComponentToDisplay(component: string | null | undefined): string {
  if (!component) return "Whole Blood";
  const c = component.toUpperCase();
  switch (c) {
    case "WHOLE_BLOOD":
      return "Whole Blood";
    case "PLATELETS":
      return "Platelets (PRP/SDP)";
    case "PLASMA":
      return "Fresh Frozen Plasma (FFP)";
    case "RBC":
      return "Packed Red Blood Cells (PRBC)";
    default:
      return component.replace(/_/g, " ");
  }
}

export function mapRequestStatusToDisplay(status: string | null | undefined): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  if (!status) {
    return {
      label: "Created",
      badgeClass: "bg-[#053845]/10 text-[#053845] border-[#053845]/20",
      dotClass: "bg-[#053845]",
    };
  }

  const s = status.toUpperCase();
  switch (s) {
    case "CREATED":
      return {
        label: "Request Created",
        badgeClass: "bg-[#FAF6EE] text-[#053845] border-[#F3E9D1]",
        dotClass: "bg-[#317786]",
      };
    case "VERIFIED":
      return {
        label: "Clinical Verified",
        badgeClass: "bg-[#e8f3f5] text-[#317786] border-[#317786]/30",
        dotClass: "bg-[#317786]",
      };
    case "HOSPITAL_REVIEW":
      return {
        label: "Hospital Review",
        badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
        dotClass: "bg-indigo-600",
      };
    case "BLOOD_BANK_CHECK":
      return {
        label: "Blood Bank Check",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        dotClass: "bg-amber-600",
      };
    case "DONOR_MATCHING":
      return {
        label: "Donor Matching",
        badgeClass: "bg-[#EFA27E]/20 text-[#B94F30] border-[#EFA27E]/40",
        dotClass: "bg-[#B94F30]",
      };
    case "BLOOD_ARRANGED":
      return {
        label: "Blood Arranged",
        badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
        dotClass: "bg-teal-600",
      };
    case "FULFILLED":
      return {
        label: "Fulfilled & Dispatched",
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
        dotClass: "bg-emerald-600",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
        dotClass: "bg-slate-400",
      };
    case "EXPIRED":
      return {
        label: "Expired",
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
        dotClass: "bg-rose-500",
      };
    default:
      return {
        label: status.replace(/_/g, " "),
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
        dotClass: "bg-slate-500",
      };
  }
}

export function mapUrgencyBadge(urgency: string | null | undefined): {
  label: string;
  badgeClass: string;
} {
  if (!urgency) {
    return {
      label: "Standard",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  const u = urgency.toUpperCase();
  switch (u) {
    case "CRITICAL":
      return {
        label: "Critical Emergency",
        badgeClass: "bg-[#fdf2f2] text-[#A2363A] border-[#A2363A]/30 font-bold",
      };
    case "HIGH":
      return {
        label: "Urgent Requisition",
        badgeClass: "bg-[#f9eee9] text-[#B94F30] border-[#B94F30]/30 font-semibold",
      };
    case "MEDIUM":
      return {
        label: "Priority Case",
        badgeClass: "bg-[#e8f3f5] text-[#317786] border-[#317786]/30",
      };
    case "LOW":
    default:
      return {
        label: "Standard",
        badgeClass: "bg-slate-50 text-slate-600 border-slate-200",
      };
  }
}

export function cleanNotificationMessage(message: string | null | undefined): string {
  if (!message) return "";
  return message.replace(/<!--META:[\s\S]*?-->/g, "").trim();
}

