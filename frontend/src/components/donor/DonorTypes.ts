export interface DonorProfile {
  name: string;
  bloodGroup: string;
  phone: string;
  email: string;
  location: string;
  city: string;
  state?: string;
  pincode?: string;
  availability: "Available" | "Paused";
  eligibility: "Eligible" | "Cooldown" | "Review Required";
  lastDonationDate: string;
  daysSinceLastDonation: number;
  matchingCount: number;
  nearbyCount: number;
  totalDonations: number;
  livesSaved: number;
  donorId: string;
  radiusKm: number;
  emergencySms: boolean;
  quietHours: boolean;
}

export interface RequestPreviewItem {
  id: string;
  rawId?: string;
  hospitalName: string;
  bloodGroup: string;
  distance: string;
  distanceKm: number;
  urgency: "Critical Emergency" | "Urgent" | "Standard";
  units: number;
  location: string;
  postedTime: string;
  caseDetails?: string;
  contactPerson?: string;
  contactPhone?: string;
  requiredWithin?: string;
  patientAgeGroup?: string;
}

export interface RecentActivityItem {
  id: string;
  title: string;
  description: string;
  timeAgo: string;
  type: "response" | "availability" | "donation" | "alert";
}

export interface LastDonationRecord {
  id: string;
  date: string;
  location: string;
  associatedRequest?: string;
  bloodGroup: string;
  status: string;
  recordReference: string;
  units: number;
  componentType: string;
  notes?: string;
}
