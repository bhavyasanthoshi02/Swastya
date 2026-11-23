import { getAuthToken, clearAuthToken, AuthUser, AuthDonor, AuthRequester, AuthHospital, AuthBloodBank } from "./auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "http://localhost:5000";

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export interface BloodRequestItem {
  requestid: string;
  createdbyuserid: string;
  requesterid: string | null;
  hospitalid: string | null;
  patientname: string;
  patientage: number;
  patientgender: "MALE" | "FEMALE" | "OTHER" | string;
  patientcontact: string;
  bloodgroup: string;
  bloodcomponent: string;
  unitsrequired: number;
  urgencylevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  isemergency: boolean | null;
  searchradius: number | null;
  requiredby: string;
  status:
  | "DRAFT"
  | "CREATED"
  | "VERIFIED"
  | "HOSPITAL_REVIEW"
  | "BLOOD_BANK_CHECK"
  | "DONOR_MATCHING"
  | "BLOOD_ARRANGED"
  | "FULFILLED"
  | "CANCELLED"
  | "EXPIRED"
  | string;
  isdraft?: boolean | null;
  notes: string | null;
  createdat: string;
  updatedat: string;
  users?: AuthUser;
  requesters?: AuthRequester;
  hospitals?: any;
  prescription?: PrescriptionItem | null;
  prescriptionhistory?: PrescriptionHistoryItem[];
  requeststatushistory?: RequestStatusHistoryItem[];
  volunteers?: VolunteerDonorResponse[];
  requisitionassignments?: RequisitionAssignmentItem[];
}

export interface PrescriptionItem {
  prescriptionid: string;
  requestid: string;
  fileurl: string;
  downloadUrl?: string;
  originalfilename?: string | null;
  mimetype?: string | null;
  filesize?: number | null;
  doctorname: string;
  hospitalname: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  verifiedbyhospitalid?: string | null;
  verificationdate?: string | null;
  remarks?: string | null;
  uploadedat?: string;
  hospitals?: {
    hospitalid: string;
    hospitalname: string;
  } | null;
}

export interface PrescriptionHistoryItem {
  historyid: string;
  prescriptionid: string;
  requestid: string;
  fileurl: string;
  originalfilename?: string | null;
  mimetype?: string | null;
  filesize?: number | null;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  reviewedbyhospitalid?: string | null;
  remarks?: string | null;
  createdat: string;
  hospitals?: {
    hospitalid: string;
    hospitalname: string;
  } | null;
}

export interface ProcedureConfigItem {
  configid: string;
  hospitalid: string | null;
  procedurename: string;
  category: string;
  defaultcomponent: string;
  defaultunits: number;
  secondarycomponent: string | null;
  secondaryunits: number | null;
  typicalbloodlossml: number | null;
  transfusionprobability: number | null;
  guidelinesource: string;
  guidelineversion: string;
  guidelinecitation?: string | null;
  approvalauthority: string;
  effectivedate: string;
  clinicalrationale: string | null;
  requireshospitalapproval?: boolean;
  isHospitalOverride: boolean;
}

export interface MatchingCandidateScoreBreakdown {
  compatibilityScore: number;
  distanceScore: number;
  availabilityScore: number;
  responseScore: number;
  totalScore: number;
}

export interface MatchingCandidateExplanations {
  compatibility: string;
  location: string;
  availability: string;
  responsiveness: string;
}

export interface MatchingCandidateItem {
  donorId: string;
  donorUserId: string;
  donorName: string;
  bloodGroup: string;
  gender: string | null;
  city: string;
  state: string;
  matchScore: number;
  scoreBreakdown: MatchingCandidateScoreBreakdown;
  explanations: MatchingCandidateExplanations;
  distanceKm: number | null;
  distanceDisplay: string;
  matchType: "COORDINATES" | "CITY_FALLBACK";
  availabilityStatus: string;
  isEligible: boolean;
  lastDonationDate: string | null;
  daysSinceLastDonation: number | null;
  cooldownSatisfied: boolean;
  maskedPhone: string;
  maskedEmail: string;
  hasBeenNotified: boolean;
  currentDeliveryStatus: string | null;
  currentResponse: string | null;
}

export interface HospitalMatchingOverviewData {
  activeMatchingRequisitionsCount: number;
  totalCandidatesEvaluated: number;
  totalDonorsNotified: number;
  totalResponsesReceived: number;
  totalAccepted: number;
  totalDeclined: number;
  totalPending: number;
  responseRatePercent: number;
  acceptanceRatePercent: number;
}

export interface RequisitionForMatchingItem {
  requestId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  bloodGroup: string;
  bloodComponent: string;
  unitsRequired: number;
  urgencyLevel: string;
  isEmergency: boolean;
  searchRadiusKm: number;
  requiredBy: string;
  status: string;
  createdAt: string;
  hasActiveBroadcast: boolean;
  broadcastId: string | null;
  totalNotifiedCount: number;
  totalRespondedCount: number;
}

export interface MatchingDonorResponseItem {
  deliveryId: string;
  donorId: string;
  donorName: string;
  bloodGroup: string;
  city: string;
  state: string;
  distanceKm: number | null;
  matchType: string;
  deliveryStatus: string;
  response: "PENDING" | "ACCEPTED" | "DECLINED";
  respondedAt: string | null;
  transitStatus: string | null;
  transitNotes: string | null;
  donorPhone: string;
  donorEmail: string;
  notifiedAt: string | null;
}

export interface DonorEmergencyRequestItem {
  deliveryId: string;
  broadcastId: string;
  requestId: string;
  hospitalName: string;
  hospitalCity: string;
  bloodGroup: string;
  bloodComponent: string;
  unitsRequired: number;
  urgencyLevel: string;
  requiredBy: string;
  distanceKm: number | null;
  distanceDisplay: string;
  matchType: string;
  response: "PENDING" | "ACCEPTED" | "DECLINED";
  respondedAt: string | null;
  transitStatus: string | null;
  createdAt: string;
}

export interface SurgeryPlanItem {
  surgeryid: string;
  hospitalid: string;
  createdbyuserid: string;
  patientreference: string;
  patientage: number;
  patientgender: "MALE" | "FEMALE" | "OTHER" | string;
  patientbloodgroup: string | null;
  procedurename: string;
  category: string | null;
  scheduleddate: string;
  expecteddurationminutes: number | null;
  clinicianspecifiedcomponent: string | null;
  clinicianspecifiedunits: number | null;
  configid: string | null;
  baselinecomponent: string | null;
  baselineunits: number | null;
  secondarybaselinecomponent: string | null;
  secondarybaselineunits: number | null;
  baselinerationale: string | null;
  finalcomponent: string | null;
  finalunits: number | null;
  secondaryfinalcomponent: string | null;
  secondaryfinalunits: number | null;
  adjustmentreason: string | null;
  reviewedbyuserid: string | null;
  reviewedat: string | null;
  status:
    | "PLANNED"
    | "REQUIREMENT_ESTIMATED"
    | "AWAITING_CLINICAL_REVIEW"
    | "BLOOD_AVAILABLE"
    | "SHORTAGE_IDENTIFIED"
    | "BLOOD_REQUESTED"
    | "READY_FOR_SURGERY"
    | "COMPLETED"
    | "CANCELLED"
    | string;
  linkedrequestid: string | null;
  clinicalnotes: string | null;
  lastavailabilitycheckat: string | null;
  createdat: string;
  updatedat: string;
  createdby?: { userid: string; name: string; email: string };
  reviewedby?: { userid: string; name: string; email: string };
  procedureconfig?: ProcedureConfigItem | null;
  linkedrequest?: {
    requestid: string;
    status: string;
    urgencylevel: string;
    unitsrequired: number;
    bloodcomponent?: string;
    bloodgroup?: string;
    requiredby?: string;
  } | null;
  statushistory?: Array<{
    historyid: string;
    oldstatus: string | null;
    newstatus: string;
    changedbyuserid: string | null;
    reason: string | null;
    createdat: string;
    changedby?: { userid: string; name: string; role: string } | null;
  }>;
}

export interface SurgeryPlanSummary {
  upcomingTotal: number;
  awaitingReview: number;
  shortageIdentified: number;
  bloodArranged: number;
  next7Days: number;
}

export interface SurgeryAvailabilityResult {
  surgeryid: string;
  bloodGroupPending: boolean;
  message?: string;
  patientBloodGroup?: string;
  targetComponent?: string | null;
  unitsRequired: number;
  totalAvailable: number;
  isShortage: boolean;
  shortageUnits?: number;
  status: string;
  bloodBankBreakdown: Array<{
    bloodbankid: string;
    bloodbankname: string;
    address: string;
    contactPhone: string;
    city: string;
    eligibleUnitsCount: number;
    byBloodGroup: Record<string, number>;
  }>;
  checkTimestamp: string;
  disclaimer: string;
}

export interface ProcedureEstimateResult {
  estimateAvailable: boolean;
  message?: string;
  configId?: string;
  procedureName?: string;
  category?: string;
  defaultComponent?: string;
  defaultUnits?: number;
  secondaryComponent?: string | null;
  secondaryUnits?: number | null;
  typicalBloodLossMl?: number | null;
  transfusionProbability?: number | null;
  guidelineSource?: string;
  guidelineVersion?: string;
  guidelineCitation?: string | null;
  approvalAuthority?: string;
  effectiveDate?: string;
  clinicalRationale?: string | null;
  requiresHospitalApproval?: boolean;
  isHospitalOverride?: boolean;
}

export interface VolunteerDonorResponse {
  notificationid: string;
  donorId?: string;
  donorUserId?: string;
  donorName: string;
  donorBloodGroup: string;
  donorCity?: string;
  donorState?: string;
  donorPhone?: string;
  donorEmail?: string;
  respondedAt: string;
  deliveryId?: string;
  acceptanceStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | string;
  acceptedAt?: string | null;
  acceptedByUserId?: string | null;
  rejectedAt?: string | null;
  rejectedByUserId?: string | null;
  receiptConfirmedAt?: string | null;
  receiptConfirmedByUserId?: string | null;
  status: string;
  transitStatus?: "DONOR_FOUND" | "STARTED" | "REACHED_LOCATION" | "COMPLETED" | string;
  startedAt?: string | null;
  reachedAt?: string | null;
  completedAt?: string | null;
  estimatedArrival?: string;
  notes?: string;
  screening?: {
    drinksAlcohol?: boolean;
    alcoholInPast24Hours?: boolean;
    feelingHealthy?: boolean;
    recentAntibioticsOrMedication?: boolean;
    recentTattooOrSurgery?: boolean;
    donatedInLast90Days?: boolean;
    chronicIllness?: boolean;
    isPregnantOrBreastfeeding?: boolean;
    alcoholClearance?: string;
    generalHealth?: string;
    medicationCleared?: string;
    cooldownPassed?: boolean;
    eligibilityStatus?: string;
  };
  isEligible?: boolean;
  receiptDocument?: {
    fileName?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
    downloadUrl: string;
  } | null;
}

export interface AvailableDonorItem {
  notificationId: string;
  donorId: string;
  donorUserId?: string;
  donorName: string;
  donorBloodGroup: string;
  donorCity: string;
  donorState: string;
  donorPhone: string;
  donorEmail: string;
  donorGender?: string;
  donorWeight?: number | null;
  lastDonationDate?: string | null;
  respondedAt: string;
  deliveryId?: string;
  acceptanceStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | string;
  acceptedAt?: string | null;
  acceptedByUserId?: string | null;
  rejectedAt?: string | null;
  rejectedByUserId?: string | null;
  receiptConfirmedAt?: string | null;
  receiptConfirmedByUserId?: string | null;
  status: string;
  transitStatus?: "DONOR_FOUND" | "STARTED" | "REACHED_LOCATION" | "COMPLETED" | string;
  startedAt?: string | null;
  reachedAt?: string | null;
  completedAt?: string | null;
  estimatedArrival: string;
  notes: string;
  screening: {
    drinksAlcohol?: boolean;
    alcoholInPast24Hours?: boolean;
    feelingHealthy?: boolean;
    recentAntibioticsOrMedication?: boolean;
    recentTattooOrSurgery?: boolean;
    donatedInLast90Days?: boolean;
    chronicIllness?: boolean;
    isPregnantOrBreastfeeding?: boolean;
    alcoholClearance?: string;
    generalHealth?: string;
    medicationCleared?: string;
    cooldownPassed?: boolean;
    eligibilityStatus?: string;
  };
  isEligible: boolean;
  requestId: string;
  patientName: string;
  requiredBloodGroup: string;
  unitsRequired: number;
  bloodComponent: string;
  urgencyLevel: string;
  hospitalName: string;
  hospitalAddress: string;
  hospitalCity: string;
  requestStatus: string;
}

export interface RequestStatusHistoryItem {
  historyid: string;
  requestid: string;
  oldstatus: string | null;
  newstatus: string;
  changedbyuserid: string | null;
  remarks: string | null;
  changedat: string;
  users?: {
    name: string;
    role: string;
  } | null;
}

export interface MatchedDonorScoreBreakdown {
  distanceScore: number;
  availabilityScore: number;
  responseScore: number;
  totalScore: number;
}

export interface MatchedDonorExplanations {
  compatibility: string;
  location: string;
  availability: string;
  responsiveness: string;
}

export interface MatchedDonorItem {
  donorId: string;
  donorName: string;
  bloodGroup: string;
  gender: string | null;
  city: string;
  state: string;
  matchScore: number;
  scoreBreakdown: MatchedDonorScoreBreakdown;
  explanations: MatchedDonorExplanations;
  distanceKm: number | null;
  distanceDisplay: string;
  matchType: "COORDINATES" | "CITY_FALLBACK";
  availabilityStatus: string;
  lastDonationDate: string | null;
}

export interface HospitalItem {
  hospitalid: string;
  hospitalname: string;
  registrationnumber?: string;
  contactpersonname?: string;
  contactpersonphone?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  approvalstatus?: string;
}

export interface NotificationItem {
  notificationid: string;
  userid?: string;
  requestid?: string | null;
  campid?: string | null;
  registrationid?: string | null;
  actionurl?: string | null;
  type: string;
  title: string;
  message: string;
  isread: boolean;
  sentat?: string;
  createdat?: string;
  readat?: string | null;
  bloodrequests?: {
    requestid: string;
    patientname: string;
    bloodgroup: string;
    urgencylevel: string;
    status: string;
  } | null;
  camp?: {
    campid: string;
    campname: string;
    campdate: string;
    starttime: string;
    endtime: string;
    venuename: string;
    city: string;
    status: string;
  } | null;
}

export interface DonorNotificationPreferences {
  preferenceid?: string | null;
  nearbycamps: boolean;
  campreminders: boolean;
  campupdates: boolean;
  campcancellations: boolean;
  preferredcity?: string | null;
  preferredradiuskm?: number | null;
}

export interface CreateBloodRequestDto {
  patientname: string;
  patientage: number;
  patientgender: "MALE" | "FEMALE" | "OTHER" | string;
  patientcontact: string;
  bloodgroup: string;
  bloodcomponent: string;
  unitsrequired: number;
  urgencylevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  isemergency?: boolean;
  searchradius?: number;
  latitude?: number;
  longitude?: number;
  requiredby: string;
  notes?: string;
  requesterid?: string;
  hospitalid?: string;
  isDraft?: boolean;
  saveAsDraft?: boolean;
}

export interface DocumentRequirementItem {
  documentType: string;
  documentName: string;
  isMandatory: boolean;
  description: string;
}

export interface DocumentChecklistItem {
  documentType: string;
  documentName: string;
  isMandatory: boolean;
  description: string;
  isUploaded: boolean;
  document?: {
    documentid: string;
    originalfilename: string;
    mimetype: string;
    filesize: number;
    version?: number;
    filehash?: string | null;
    uploadedat: string | null;
    updatedat: string | null;
  } | null;
}

export interface RequestCompletenessResponse {
  success: boolean;
  requestId: string;
  totalRequirements: number;
  mandatoryRequired: number;
  mandatoryUploaded: number;
  completionPercentage: number;
  isComplete: boolean;
  missingMandatory: Array<{ documentType: string; documentName: string }>;
  checklist: DocumentChecklistItem[];
  status?: string;
  isdraft?: boolean;
}

export interface VerificationDiscrepancy {
  field: string;
  extractedValue: string;
  expectedValue: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  sourceDocument: string;
}

export interface DocumentVerificationReportItem {
  verificationId: string;
  requestId: string;
  documentId: string;
  documentVersion: number;
  documentType: string;
  fileHash: string | null;
  verificationStatus: "CONSISTENT" | "NEEDS_REVIEW" | "MISMATCH" | "PROCESSING_FAILED";
  ocrConfidence: number;
  extractedData: Record<string, any>;
  discrepancies: VerificationDiscrepancy[];
  summary: string;
  processingError: string | null;
  isCurrentVersion: boolean;
  reviewerDecision: string | null;
  reviewerRemarks: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequisitionVerificationReportResponse {
  success: boolean;
  requestId: string;
  totalDocuments: number;
  verifiedDocuments: number;
  overallStatus: "CONSISTENT" | "NEEDS_REVIEW" | "MISMATCH" | "PROCESSING_FAILED";
  reports: DocumentVerificationReportItem[];
}

export interface DonorRegistryItem {
  registryId: string;
  donorId: string;
  userId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  bloodGroup: string;
  gender: string;
  city: string;
  state?: string;
  accountStatus: "ACTIVATED" | "PENDING_ACTIVATION";
  isEligible: boolean;
  donationCount: number;
  lastDonationDate?: string | null;
  historicalVerificationStatus: "NONE" | "PENDING" | "VERIFIED" | "REJECTED";
  sourceIdentifier?: string | null;
  registryStatus?: string;
  createdAt: string;
}

export interface DonorDetailItem {
  registryId: string;
  donorId: string;
  userId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  bloodGroup: string;
  gender: string;
  city: string;
  state?: string;
  pincode?: string;
  address?: string;
  accountStatus: "ACTIVATED" | "PENDING_ACTIVATION";
  isEligible: boolean;
  sourceIdentifier?: string | null;
  registryStatus?: string;
  registeredAt: string;
  donations: Array<{
    donationHistoryId: string;
    donationDate: string;
    unitsDonated: number;
    bloodComponent: string;
    isImported: boolean;
    verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
    sourceRecordId?: string | null;
    remarks?: string | null;
    createdAt: string;
  }>;
}

export interface ImportPreviewResult {
  success: boolean;
  message: string;
  summary: {
    totalRows: number;
    validRowsCount: number;
    invalidRowsCount: number;
    toCreateCount: number;
    toLinkCount: number;
    alreadyLinkedCount: number;
    conflictCount: number;
    historicalDonationsCount: number;
    invalidDonationsCount: number;
  };
  toCreate: any[];
  toLink: any[];
  alreadyLinked: any[];
  conflicts: any[];
  invalidRows: any[];
  validDonations: any[];
  invalidDonations: any[];
}

export interface ImportCommitResult {
  success: boolean;
  message: string;
  importedCount: number;
  linkedCount: number;
  historicalDonationsImported: number;
  deliveryStatus: string;
  deliveryNote: string;
  activationRecords: Array<{
    name: string;
    email: string;
    phoneNumber?: string;
    activationToken: string;
    activationUrl: string;
    expiresAt: string;
  }>;
  errors: any[];
}

export interface InventoryItem {
  inventoryid: string;
  bloodbankid: string;
  bloodgroup: string;
  bloodcomponent: string;
  unitsavailable: number;
  unitsreserved: number;
  expirydate: string;
  lastupdated?: string;
  createdat?: string;
  updatedat?: string;
}

export interface BloodBankDashboardData {
  totalInventoryRecords: number;
  totalUnitsAvailable: number;
  totalUnitsReserved: number;
  recentInventory: InventoryItem[];
}

export interface InventoryUnitItem {
  unitid: string;
  bloodbankid: string;
  inventoryid: string;
  unitbarcode: string;
  donationidentificationnumber?: string | null;
  bloodgroup: string;
  bloodcomponent: string;
  volume_ml?: number;
  status: "QUARANTINED" | "AVAILABLE" | "RESERVED" | "IN_TRANSIT" | "DELIVERED" | "DISCARDED" | string;
  screeningstatus?: "PENDING" | "PASSED" | "FAILED" | string;
  ttiscreeningstatus?: "PENDING" | "PASSED" | "FAILED" | string;
  collectiondate?: string;
  expirydate: string;
  islegacyreconciled?: boolean;
  storagebinlocation?: string | null;
  createdat?: string;
  updatedat?: string;
  currentscreening?: any;
  screeningrecords?: any[];
}

export interface UnitScreeningRecordItem {
  recordid: string;
  unitid: string;
  hivstatus: string;
  hbvstatus: string;
  hcvstatus: string;
  syphilisstatus: string;
  malariastatus: string;
  overallstatus: "PASSED" | "FAILED" | string;
  testedat: string;
  labtechnicianname: string;
  medicalofficername: string;
  verifiedat?: string | null;
  verifiedbyuserid?: string | null;
  testkitdetails?: string | null;
  notes?: string | null;
}

export interface RequisitionAssignmentItem {
  assignmentid: string;
  requestid: string;
  bloodbankid: string;
  assignedbyuserid?: string | null;
  assignmentstatus?: "PENDING_ACCEPTANCE" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "SUPERSEDED" | string;
  status?: "PENDING" | "ACCEPTED" | "REJECTED" | "DECLINED" | "SUPERSEDED" | string;
  assignedat: string;
  respondedat?: string | null;
  declinereason?: string | null;
  rejectionreason?: string | null;
  notes?: string | null;
  bloodrequests?: BloodRequestItem;
  bloodbanks?: AuthBloodBank;
  bloodreservations?: BloodReservationItem[];
}

export interface BloodReservationItem {
  reservationid: string;
  requestid: string;
  bloodbankid: string;
  assignmentid: string;
  reservedbyuserid?: string | null;
  status?: "RESERVED" | "PREPARED" | "DISPATCHED" | "DELIVERED" | "CANCELLED" | string;
  reservationstatus?: "ACTIVE" | "COMPLETED" | "CANCELLED" | string;
  reservedat: string;
  expiresat?: string;
  dispatchedat?: string | null;
  deliveredat?: string | null;
  cancelledat?: string | null;
  cancellationreason?: string | null;
  couriertemperature_c?: number | null;
  items?: ReservationItemDetail[];
  reservationitems?: ReservationItemDetail[];
  bloodrequests?: BloodRequestItem;
  bloodbanks?: AuthBloodBank;
}

export interface ReservationItemDetail {
  reservationitemid: string;
  itemid?: string;
  reservationid: string;
  unitid: string;
  status?: "RESERVED" | "PREPARED" | "DISPATCHED" | "DELIVERED" | "CANCELLED" | "RETURNED_EXCURSION" | string;
  itemstatus?: string;
  unitbarcode?: string;
  bloodgroup?: string;
  bloodcomponent?: string;
  inventoryunits?: InventoryUnitItem;
  crossmatches?: ClinicalCrossmatchItem[];
  clinicalcrossmatches?: ClinicalCrossmatchItem[];
}

export interface ClinicalCrossmatchItem {
  crossmatchid: string;
  reservationid: string;
  reservationitemid: string;
  unitid: string;
  requestid: string;
  crossmatchresult: "COMPATIBLE" | "INCOMPATIBLE" | "INCONCLUSIVE";
  testedat: string;
  technologistname: string;
  method?: string | null;
  notes?: string | null;
}

export interface DonationCampItem {
  campid: string;
  bloodbankid: string;
  createdbyuserid: string;
  campname: string;
  description?: string | null;
  organizername: string;
  contactperson: string;
  contactphone?: string | null;
  campdate: string;
  starttime: string;
  endtime: string;
  timezone: string;
  registrationopeningdate: string;
  registrationdeadline: string;
  venuename: string;
  address: string;
  city: string;
  district?: string | null;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  isregistrationrequired: boolean;
  maxcapacity?: number | null;
  registrationinstructions?: string | null;
  donorinstructions?: string | null;
  eligibilitynotes?: string | null;
  status: "DRAFT" | "PUBLISHED" | "COMPLETED" | "CANCELLED";
  registrationstatus: "OPEN" | "CLOSED";
  cancellationreason?: string | null;
  createdat?: string;
  updatedat?: string;
  registeredCount?: number;
  remainingCapacity?: number | null;
  bloodbanks?: {
    bloodbankid: string;
    bloodbankname: string;
    licensenumber: string;
    contactpersonphone?: string;
    city: string;
    state: string;
  };
  metrics?: {
    totalCapacity: number | null;
    registeredCount: number;
    attendedCount: number;
    cancelledCount: number;
    remainingCapacity: number | null;
    isCapacityReached: boolean;
    isRegistrationOpen: boolean;
  };
  statushistory?: Array<{
    historyid: string;
    oldstatus?: string | null;
    newstatus: string;
    reason?: string | null;
    createdat: string;
    changedby?: { name: string; email: string };
  }>;
  audithistory?: Array<{
    auditid: string;
    action: string;
    details?: string | null;
    createdat: string;
    changedby?: { name: string };
  }>;
}

export interface CampSummary {
  totalCamps: number;
  upcomingCamps: number;
  publishedCamps: number;
  draftCamps: number;
  registrationOpenCamps: number;
  registrationClosedCamps: number;
  completedCamps: number;
  cancelledCamps: number;
}

export interface CampRegistrationItem {
  registrationid: string;
  registrationreference: string;
  registrationdate: string;
  registrationstatus: "REGISTERED" | "CANCELLED";
  attendancestatus: "PENDING" | "ATTENDED" | "NOT_ATTENDED";
  attendedat?: string | null;
  unitsdonated?: number | null;
  attendancenotes?: string | null;
  cancellationreason?: string | null;
  cancelledat?: string | null;
  donor: {
    donorid: string;
    name: string;
    bloodgroup: string;
    gender: string;
    city: string;
    contactphone?: string;
    email?: string;
  };
}

export interface EquipmentItem {
  equipmentid: string;
  bloodbankid: string;
  assetnumber: string;
  equipmentname: string;
  category: string;
  manufacturer?: string | null;
  modelnumber?: string | null;
  serialnumber?: string | null;
  installationdate?: string | null;
  warrantyexpirydate?: string | null;
  location?: string | null;
  department?: string | null;
  responsibleperson?: string | null;
  operationalstatus: "OPERATIONAL" | "UNDER_MAINTENANCE" | "OUT_OF_SERVICE" | "RETIRED";
  iscalibrationrequired: boolean;
  calibrationintervaldays?: number | null;
  lastcalibrationdate?: string | null;
  nextcalibrationdate?: string | null;
  calibrationstatus: "UP_TO_DATE" | "DUE_SOON" | "OVERDUE" | "NOT_APPLICABLE" | "PENDING_VERIFICATION";
  ismaintenancerequired: boolean;
  maintenanceintervaldays?: number | null;
  lastmaintenancedate?: string | null;
  nextmaintenancedate?: string | null;
  maintenancestatus: "UP_TO_DATE" | "DUE_SOON" | "OVERDUE" | "NOT_APPLICABLE";
  notes?: string | null;
  createdbyuserid: string;
  createdat: string;
  updatedat: string;
  calibrations?: EquipmentCalibrationItem[];
  maintenance?: EquipmentMaintenanceItem[];
  breakdowns?: EquipmentBreakdownItem[];
  statushistory?: EquipmentStatusHistoryItem[];
  createdbyuser?: { userid: string; name: string; role: string };
  _count?: {
    calibrations: number;
    maintenance: number;
    breakdowns: number;
  };
}

export interface EquipmentCalibrationItem {
  calibrationid: string;
  equipmentid: string;
  bloodbankid: string;
  scheduleddate?: string | null;
  performeddate: string;
  nextduedate?: string | null;
  performedby: string;
  serviceprovider?: string | null;
  certificatefilepath?: string | null;
  certificatefilename?: string | null;
  result: "PASSED" | "FAILED" | "PASSED_WITH_CONDITIONS";
  standardsused?: string | null;
  readings?: string | null;
  remarks?: string | null;
  verificationstatus: "PENDING" | "VERIFIED" | "REJECTED";
  verifiedbyuserid?: string | null;
  verifiedat?: string | null;
  createdbyuserid: string;
  createdat: string;
  createdbyuser?: { userid: string; name: string; role: string };
  verifiedbyuser?: { userid: string; name: string; role: string };
}

export interface EquipmentMaintenanceItem {
  maintenanceid: string;
  equipmentid: string;
  bloodbankid: string;
  maintenancetype: "PREVENTIVE" | "CORRECTIVE";
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "CANCELLED";
  scheduleddate: string;
  completeddate?: string | null;
  assignedto?: string | null;
  serviceprovider?: string | null;
  workdetails?: string | null;
  partsreplaced?: string | null;
  downtimehours?: number | null;
  cost?: number | null;
  reportfilepath?: string | null;
  reportfilename?: string | null;
  createdbyuserid: string;
  createdat: string;
  updatedat: string;
  createdbyuser?: { userid: string; name: string; role: string };
}

export interface EquipmentBreakdownItem {
  breakdownid: string;
  equipmentid: string;
  bloodbankid: string;
  reportedat: string;
  reportedbyuserid: string;
  issue: string;
  description?: string | null;
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  status: "REPORTED" | "ASSIGNED" | "IN_REPAIR" | "RESOLVED";
  impactonstorage: boolean;
  sopactiontaken?: string | null;
  resolutiondetails?: string | null;
  resolvedat?: string | null;
  resolvedbyuserid?: string | null;
  createdat: string;
  reportedbyuser?: { userid: string; name: string; role: string };
  resolvedbyuser?: { userid: string; name: string; role: string };
  equipment?: { assetnumber: string; equipmentname: string; location?: string | null };
}

export interface EquipmentStatusHistoryItem {
  historyid: string;
  equipmentid: string;
  bloodbankid: string;
  previousstatus: string;
  newstatus: string;
  reason: string;
  changedbyuserid: string;
  createdat: string;
  changedbyuser?: { userid: string; name: string; role: string };
}

export interface EquipmentCategoryItem {
  categoryid: string;
  bloodbankid?: string | null;
  categoryname: string;
  description?: string | null;
  defaultcalibrationinterval?: number | null;
  defaultmaintenanceinterval?: number | null;
  isactive: boolean;
}

export interface EquipmentDashboardMetrics {
  totalEquipment: number;
  operational: number;
  underMaintenance: number;
  outOfService: number;
  retired: number;
  calibration: {
    upToDate: number;
    dueSoon: number;
    overdue: number;
  };
  maintenance: {
    overdue: number;
  };
  activeBreakdownsCount: number;
  activeBreakdowns: EquipmentBreakdownItem[];
  upcomingCalibrations: Array<{
    equipmentid: string;
    assetnumber: string;
    equipmentname: string;
    category: string;
    location?: string | null;
    nextcalibrationdate: string;
    calibrationstatus: string;
  }>;
}

export type ShortageRiskLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export interface BloodGroupPredictionItem {
  bloodGroup: string;
  displayName: string;
  availableUnits: number;
  reservedUnits: number;
  quarantinedUnits: number;
  expiringUnitsInPeriod: number;
  effectiveAvailableUnits: number;
  historicalDailyDemand: number;
  historicalTotalDemand: number;
  predictedDemand: number;
  expectedStockPosition: number;
  deficitUnits: number;
  daysOfSupply: number;
  riskLevel: ShortageRiskLevel;
  explanation: string;
  componentBreakdown: Array<{
    component: string;
    displayName: string;
    availableUnits: number;
    expiringUnits: number;
    predictedDemand: number;
  }>;
}

export interface ShortageTrendPointItem {
  day: number;
  date: string;
  historicalDemand?: number;
  projectedDemand: number;
  projectedStockBalance: number;
}

export interface AiGeneratedInsightItem {
  id: string;
  type: "CRITICAL_DEFICIT" | "EXPIRY_WARNING" | "DEMAND_SURGE" | "SUFFICIENT_STOCK" | "COMPONENT_IMBALANCE";
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  description: string;
  affectedBloodGroups: string[];
  affectedComponents: string[];
  metricValue?: string | number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  suggestedAction: string;
}

export interface ActionableRecommendationItem {
  id: string;
  category: "CAMP_ORGANIZATION" | "TTI_CLEARANCE" | "FEFO_DISPATCH" | "REGIONAL_TRANSFER" | "MONITORING";
  title: string;
  actionText: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  relatedBloodGroup?: string;
  estimatedDeficitAverted?: number;
}

export interface PredictorOverviewSummaryItem {
  totalAvailableUnits: number;
  totalReservedUnits: number;
  totalQuarantinedUnits: number;
  groupsAtRiskCount: number;
  criticalGroupsCount: number;
  highRiskGroupsCount: number;
  predictedShortagesTotalUnits: number;
  unitsApproachingCriticalExpiry: number;
  confidenceScore: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  dataSufficiencyNote: string;
  historicalRequestsAnalyzed: number;
  forecastPeriodDays: 7 | 14 | 30;
  selectedComponent: string;
  facilityId: string;
  facilityName: string;
  generatedAt: string;
}

export interface CompletePredictionPayloadItem {
  overview: PredictorOverviewSummaryItem;
  predictions: BloodGroupPredictionItem[];
  trends: {
    timeline: ShortageTrendPointItem[];
    historicalVsPredictedByGroup: Array<{
      bloodGroup: string;
      historicalAvg: number;
      predicted: number;
      currentStock: number;
    }>;
    riskDistribution: Record<ShortageRiskLevel, number>;
  };
  insights: AiGeneratedInsightItem[];
  recommendations: ActionableRecommendationItem[];
}

export interface CampPlannerOverviewItem {
  totalCampsOrganized: number;
  upcomingCampsCount: number;
  recommendedLocationsCount: number;
  highDemandAreasCount: number;
  predictedDeficitUnits: number;
  criticalShortageGroupsCount: number;
  facilityCity: string;
  facilityName: string;
  dataConfidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface CampPlannerScoreBreakdown {
  shortageScore: number;
  donorScore: number;
  demandScore: number;
  conflictPenalty: number;
}

export interface CampPlannerTargetedGroup {
  bloodGroup: string;
  displayName: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  deficitUnits: number;
  availableUnits: number;
  daysOfSupply: number;
}

export interface CampPlannerLocationItem {
  id: string;
  locationName: string;
  suggestedVenue: string;
  area: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm?: number | null;
  compositeScore: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  scoreBreakdown: CampPlannerScoreBreakdown;
  donorCluster: {
    totalDonorsInArea: number;
    eligibleDonorsInArea: number;
    availableDonorsInArea: number;
    deficitGroupMatchingDonors: number;
  };
  hospitalRequisitions: {
    totalRequestsInArea: number;
    totalUnitsRequested: number;
    associatedHospitalNames: string[];
  };
  estimatedTurnout: number;
  estimatedCollectionUnits: number;
  targetedBloodGroups: CampPlannerTargetedGroup[];
  clinicalRationale: string;
  recommendedSlot: {
    suggestedDate: string;
    formattedDate: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    conflictStatus: "OPTIMAL" | "CONFLICT_FREE" | "SCHEDULED_NEARBY";
  };
}

export interface CampPlannerDateItem {
  date: string;
  formattedDate: string;
  dayOfWeek: string;
  isWeekend: boolean;
  daysAway: number;
  status: "OPTIMAL" | "RECOMMENDED" | "CONFLICT";
  conflictReason: string | null;
  suggestedTiming: {
    startTime: string;
    endTime: string;
  };
  expectedTurnout: number;
  targetUnits: number;
  alignmentReason: string;
}

export interface CampPlannerBloodGroupPriorityItem {
  bloodGroup: string;
  displayName: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  deficitUnits: number;
  availableUnits: number;
  daysOfSupply: number;
  targetCollectionUnits: number;
  rationale: string;
}

export interface CampPlannerInsightItem {
  id: string;
  type: "STRATEGIC_LOCATION" | "CRITICAL_TIMING" | "GROUP_TARGETING" | "DONOR_MOBILIZATION" | "LOGISTICAL_EFFICIENCY";
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  description: string;
  impactScore: number;
  suggestedAction: string;
}

export interface CompleteCampPlannerPayloadItem {
  overview: CampPlannerOverviewItem;
  horizonDays: 7 | 14 | 30;
  locations: CampPlannerLocationItem[];
  dates: CampPlannerDateItem[];
  bloodGroupPriorities: CampPlannerBloodGroupPriorityItem[];
  insights: CampPlannerInsightItem[];
  existingCamps: Array<{
    campid: string;
    campname: string;
    campdate: string;
    venuename: string;
    city: string;
    status: string;
    maxcapacity: number | null;
    registeredCount: number;
    attendedCount: number;
    unitsDonated: number;
  }>;
}

async function request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers, ...customConfig } = options;

  let url = `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  if (params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        query.append(key, String(val));
      }
    });
    const queryString = query.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  const token = getAuthToken();
  const isFormData = typeof FormData !== "undefined" && customConfig.body instanceof FormData;

  const reqHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string>),
  };

  if (!isFormData && !reqHeaders["Content-Type"]) {
    reqHeaders["Content-Type"] = "application/json";
  }

  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...customConfig,
    headers: reqHeaders,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (error: any) {
    throw new ApiError(
      error?.message || "Network error. Failed to connect to Swastya backend server.",
      0
    );
  }

  if (response.status === 401) {
    // Session expired or invalid token
    clearAuthToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
      window.location.href = "/signin?session=expired";
    }
  }

  let data: any = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMessage =
      data?.message || `HTTP ${response.status}: ${response.statusText || "Request failed"}`;
    throw new ApiError(errorMessage, response.status, data);
  }

  return data as T;
}

export const api = {
  get: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "GET" }),

  post: <T = any>(endpoint: string, body?: any, options?: RequestOptions) => {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    return request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  },

  put: <T = any>(endpoint: string, body?: any, options?: RequestOptions) => {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    return request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  },

  patch: <T = any>(endpoint: string, body?: any, options?: RequestOptions) => {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    return request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  },

  delete: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "DELETE" }),

  // Specific domain API calls
  auth: {
    login: (credentials: { email: string; password: string }) =>
      api.post<{
        success: boolean;
        token: string;
        user: AuthUser;
        donor: AuthDonor | null;
        requester: AuthRequester | null;
        hospital: AuthHospital | null;
        bloodbank: AuthBloodBank | null;
        message?: string;
      }>("/auth/login", credentials),

    register: (userData: any) =>
      api.post<{
        success: boolean;
        token: string;
        user: AuthUser;
        donor: AuthDonor | null;
        requester: AuthRequester | null;
        hospital: AuthHospital | null;
        bloodbank: AuthBloodBank | null;
        message?: string;
      }>("/auth/register", userData),

    me: () =>
      api.get<{
        success: boolean;
        user: AuthUser;
        donor: AuthDonor | null;
        requester: AuthRequester | null;
        hospital: AuthHospital | null;
        bloodbank: AuthBloodBank | null;
      }>("/auth/me"),

    verifyActivationToken: (token: string) =>
      api.get<{
        success: boolean;
        valid: boolean;
        user: { name: string; email: string; phone?: string };
        message?: string;
      }>("/auth/verify-activation-token", { params: { token } }),

    activateDonor: (data: { token: string; password: string }) =>
      api.post<{
        success: boolean;
        message: string;
        token: string;
        user: AuthUser;
        donor?: AuthDonor;
      }>("/auth/activate-donor", data),

    loginWithOtp: (payload: { accessToken: string }) =>
      api.post<{
        success: boolean;
        token: string;
        user: AuthUser;
        donor: AuthDonor | null;
        requester: AuthRequester | null;
        hospital: AuthHospital | null;
        bloodbank: AuthBloodBank | null;
        code?: string;
        verifiedPhone?: string;
        message?: string;
      }>("/auth/login-otp", payload),

    verifyOtp: (payload: { accessToken: string }) =>
      api.post<{
        success: boolean;
        verifiedPhone?: string;
        normalizedPhone?: string;
        message?: string;
      }>("/auth/verify-otp", payload),
  },

  requester: {
    getDashboard: () =>
      api.get<{
        success: boolean;
        requester: AuthRequester;
        totalRequests: number;
        activeRequests: number;
        completedRequests: number;
        recentRequests: BloodRequestItem[];
      }>("/requesters/me/dashboard"),

    getProfile: () =>
      api.get<{
        success: boolean;
        requester: AuthRequester & { users?: AuthUser };
      }>("/requesters/me"),

    updateProfile: (data: {
      name?: string;
      phonenumber?: string;
      address?: string;
      city?: string;
      state?: string;
      pincode?: string;
      latitude?: number;
      longitude?: number;
    }) =>
      api.put<{
        success: boolean;
        message: string;
        requester: AuthRequester & { users?: AuthUser };
      }>("/requesters/me", data),

    getBloodRequests: () =>
      api.get<{
        success: boolean;
        bloodRequests: BloodRequestItem[];
      }>("/requesters/me/bloodrequests"),

    getAvailableDonors: (params?: { requestId?: string }) =>
      api.get<{
        success: boolean;
        count: number;
        availableDonors: AvailableDonorItem[];
      }>("/requesters/me/available-donors", { params }),
  },

  hospital: {
    getProfile: () =>
      api.get<{
        success: boolean;
        hospital: AuthHospital & { users?: AuthUser };
      }>("/hospitals/me"),

    updateProfile: (data: {
      hospitalname?: string;
      contactpersonname?: string;
      contactpersonphone?: string;
      address?: string;
      city?: string;
      state?: string;
      pincode?: string;
      latitude?: number;
      longitude?: number;
    }) =>
      api.put<{
        success: boolean;
        message: string;
        hospital: AuthHospital & { users?: AuthUser };
      }>("/hospitals/me", data),

    getDashboard: () =>
      api.get<{
        success: boolean;
        totalRequests: number;
        emergencyRequests: number;
        fulfilledRequests: number;
        recentRequests: BloodRequestItem[];
      }>("/hospitals/me/dashboard"),

    getDemandForecast: (params?: {
      scope?: "hospital" | "district" | "state";
      timeframeDays?: number;
      bloodGroup?: string;
      bloodComponent?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.scope) query.set("scope", params.scope);
      if (params?.timeframeDays) query.set("timeframeDays", String(params.timeframeDays));
      if (params?.bloodGroup) query.set("bloodGroup", params.bloodGroup);
      if (params?.bloodComponent) query.set("bloodComponent", params.bloodComponent);
      const qs = query.toString() ? `?${query.toString()}` : "";
      return api.get<{
        success: boolean;
        data: any;
      }>(`/hospitals/me/analytics/demand-forecast${qs}`);
    },

    getRegionalInsights: (params?: {
      scope?: "hospital" | "district" | "state";
      timeframeDays?: number;
      bloodGroup?: string;
      bloodComponent?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.scope) query.set("scope", params.scope);
      if (params?.timeframeDays) query.set("timeframeDays", String(params.timeframeDays));
      if (params?.bloodGroup) query.set("bloodGroup", params.bloodGroup);
      if (params?.bloodComponent) query.set("bloodComponent", params.bloodComponent);
      const qs = query.toString() ? `?${query.toString()}` : "";
      return api.get<{
        success: boolean;
        data: any;
      }>(`/hospitals/me/analytics/regional-insights${qs}`);
    },

    getBloodRequests: () =>
      api.get<BloodRequestItem[]>("/hospitals/me/bloodrequests"),

    getRequestDetails: (id: string) =>
      api.get<BloodRequestItem>(`/bloodrequests/${id}`),

    updateBloodRequest: (
      id: string,
      data: { status?: string; remarks?: string; notes?: string }
    ) =>
      api.put<{
        success: boolean;
        message: string;
        bloodRequest: BloodRequestItem;
      }>(`/bloodrequests/${id}`, data),

    createBloodRequest: (data: CreateBloodRequestDto) =>
      api.post<BloodRequestItem>("/hospitals/me/bloodrequests", data),

    getDocumentRequirements: (urgency?: string, isEmergency?: boolean) =>
      api.get<{ success: boolean; requirements: DocumentRequirementItem[] }>(
        "/hospitals/me/requests/document-requirements",
        { params: { urgency, isEmergency: isEmergency ? "true" : "false" } }
      ),

    getRequestDocuments: (requestId: string) =>
      api.get<RequestCompletenessResponse>(`/hospitals/me/requests/${requestId}/documents`),

    uploadRequestDocument: (requestId: string, documentType: string, file: File) => {
      const formData = new FormData();
      formData.append("documentType", documentType);
      formData.append("document", file);
      return api.post<{
        success: boolean;
        message: string;
        document: any;
        completeness: RequestCompletenessResponse;
      }>(`/hospitals/me/requests/${requestId}/documents`, formData);
    },

    deleteRequestDocument: (requestId: string, documentId: string) =>
      api.delete<{
        success: boolean;
        message: string;
        completeness: RequestCompletenessResponse;
      }>(`/hospitals/me/requests/${requestId}/documents/${documentId}`),

    submitDraftRequest: (requestId: string) =>
      api.post<{
        success: boolean;
        message: string;
        bloodRequest: BloodRequestItem;
        completeness: RequestCompletenessResponse;
      }>(`/hospitals/me/bloodrequests/${requestId}/submit`),

    getDocumentDownloadUrl: (requestId: string, documentId: string) =>
      `${API_BASE_URL}/hospitals/me/requests/${requestId}/documents/${documentId}/file`,

    verifyDocument: (requestId: string, documentId: string) =>
      api.post<{ success: boolean; report: DocumentVerificationReportItem }>(
        `/hospitals/me/requests/${requestId}/documents/${documentId}/verify`
      ),

    getDocumentVerification: (requestId: string, documentId: string) =>
      api.get<{ success: boolean; report: DocumentVerificationReportItem }>(
        `/hospitals/me/requests/${requestId}/documents/${documentId}/verification`
      ),

    getVerificationReport: (requestId: string) =>
      api.get<RequisitionVerificationReportResponse>(
        `/hospitals/me/requests/${requestId}/verification-report`
      ),

    getDonors: (params?: {
      search?: string;
      bloodGroup?: string;
      accountStatus?: string;
      verificationStatus?: string;
      page?: number;
      limit?: number;
    }) =>
      api.get<{
        success: boolean;
        page: number;
        limit: number;
        total: number;
        donors: DonorRegistryItem[];
      }>("/hospitals/me/donors", { params }),

    getDonorDetails: (donorId: string) =>
      api.get<{
        success: boolean;
        donor: DonorDetailItem;
      }>(`/hospitals/me/donors/${donorId}`),

    previewImport: (formData: FormData) =>
      api.post<ImportPreviewResult>("/hospitals/me/donors/import/preview", formData),

    commitImport: (data: { toCreate: any[]; toLink: any[]; validDonations?: any[] }) =>
      api.post<ImportCommitResult>("/hospitals/me/donors/import/commit", data),

    getTemplateUrl: (format: "csv" | "xlsx" = "csv") =>
      `${API_BASE_URL}/hospitals/me/donors/import/template?format=${format}`,

    downloadTemplate: async (format: "csv" | "xlsx" = "csv"): Promise<Blob> => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/hospitals/me/donors/import/template?format=${format}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.status === 401) {
        clearAuthToken();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
          window.location.href = "/signin?session=expired";
        }
        throw new ApiError("Your session has expired. Please sign in again.", 401);
      }
      if (!res.ok) {
        throw new ApiError(`Failed to download template (HTTP ${res.status})`, res.status);
      }
      return await res.blob();
    },

    updateDonationStatus: (
      donorId: string,
      historyId: string,
      data: { status: "PENDING" | "VERIFIED" | "REJECTED"; remarks?: string }
    ) =>
      api.patch<{
        success: boolean;
        message: string;
        record: any;
      }>(`/hospitals/me/donors/${donorId}/history/${historyId}`, data),

    assignRequisition: (
      requestId: string,
      data: {
        bloodbankid: string;
        notes?: string;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.post<{
        success: boolean;
        message?: string;
        assignment: RequisitionAssignmentItem;
        autoDeclined?: boolean;
        eligibleCount?: number;
        requestedUnits?: number;
        reason?: string;
      }>(`/bloodrequests/${requestId}/assign`, data, { headers });
    },

    confirmReceipt: (
      reservationId: string,
      data: {
        itemReceipts: Array<{
          itemId: string;
          receivedStatus: "ACCEPTED" | "REJECTED_EXCURSION";
          tempReading?: number;
          notes?: string;
        }>;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.post<{
        success: boolean;
        message?: string;
        deliveredCount: number;
        excursionCount: number;
        reservation?: BloodReservationItem;
      }>(`/bloodrequests/reservations/${reservationId}/receipt`, data, { headers });
    },

    getMatchedDonors: (id: string, params?: { radiusKm?: number; page?: number; limit?: number }) =>
      api.get<{
        success: boolean;
        count: number;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        data: MatchedDonorItem[];
      }>(`/bloodrequests/${id}/matched-donors`, { params }),

    triggerBroadcast: (id: string, data?: { radiusKm?: number; reason?: string }) =>
      api.post<{
        success: boolean;
        message: string;
        broadcast: any;
      }>(`/bloodrequests/${id}/broadcast`, data),

    surgeries: {
      getSummary: () =>
        api.get<{ success: boolean; data: SurgeryPlanSummary }>("/hospitals/me/surgeries/summary"),

      list: (params?: { status?: string; fromDate?: string; toDate?: string; search?: string }) =>
        api.get<{ success: boolean; data: SurgeryPlanItem[] }>("/hospitals/me/surgeries", { params }),

      getById: (id: string) =>
        api.get<{ success: boolean; data: SurgeryPlanItem }>(`/hospitals/me/surgeries/${id}`),

      create: (data: {
        patientreference: string;
        patientage: number;
        patientgender: string;
        patientbloodgroup?: string | null;
        procedurename: string;
        category?: string | null;
        scheduleddate: string;
        expecteddurationminutes?: number | null;
        clinicianspecifiedcomponent?: string | null;
        clinicianspecifiedunits?: number | null;
        clinicalnotes?: string | null;
      }) =>
        api.post<{ success: boolean; data: SurgeryPlanItem; message: string }>("/hospitals/me/surgeries", data),

      getConfigs: () =>
        api.get<{ success: boolean; data: ProcedureConfigItem[] }>("/hospitals/me/surgeries/configs"),

      saveConfig: (data: any) =>
        api.post<{ success: boolean; data: ProcedureConfigItem; message: string }>("/hospitals/me/surgeries/configs", data),

      getEstimate: (procedureName: string) =>
        api.get<{ success: boolean; data: ProcedureEstimateResult }>("/hospitals/me/surgeries/estimate", {
          params: { procedureName },
        }),

      review: (
        id: string,
        data: {
          finalcomponent: string;
          finalunits: number;
          secondaryfinalcomponent?: string | null;
          secondaryfinalunits?: number | null;
          adjustmentreason: string;
        }
      ) =>
        api.put<{ success: boolean; data: SurgeryPlanItem; message: string }>(`/hospitals/me/surgeries/${id}/review`, data),

      checkAvailability: (id: string) =>
        api.post<{ success: boolean; data: SurgeryAvailabilityResult }>(`/hospitals/me/surgeries/${id}/check-availability`),

      createRequest: (id: string) =>
        api.post<{ success: boolean; requestId: string; status: string; message: string }>(`/hospitals/me/surgeries/${id}/create-request`),

      confirmReadiness: (id: string, notes?: string) =>
        api.post<{ success: boolean; data: SurgeryPlanItem; message: string }>(`/hospitals/me/surgeries/${id}/confirm-readiness`, { notes }),

      cancel: (id: string, reason: string) =>
        api.post<{ success: boolean; data: SurgeryPlanItem; message: string }>(`/hospitals/me/surgeries/${id}/cancel`, { reason }),
    },

    emergencyMatching: {
      getOverview: () =>
        api.get<{ success: boolean; overview: HospitalMatchingOverviewData }>(
          "/hospitals/me/emergency-matching/overview"
        ),
      getRequisitions: () =>
        api.get<{ success: boolean; requisitions: RequisitionForMatchingItem[] }>(
          "/hospitals/me/emergency-matching/requisitions"
        ),
      findCandidates: (requestId: string, radiusKm?: number) =>
        api.get<{
          success: boolean;
          requisition: RequisitionForMatchingItem;
          candidates: MatchingCandidateItem[];
          totalCandidates: number;
        }>(`/hospitals/me/emergency-matching/candidates`, {
          params: { requestId, radiusKm },
        }),
      notifyDonors: (data: { requestId: string; donorIds: string[]; notes?: string }) =>
        api.post<{
          success: boolean;
          broadcastId: string;
          totalNotified: number;
          message: string;
        }>("/hospitals/me/emergency-matching/notify", data),
      getResponses: (requestId: string) =>
        api.get<{ success: boolean; responses: MatchingDonorResponseItem[] }>(
          "/hospitals/me/emergency-matching/responses",
          { params: { requestId } }
        ),
      updateTransit: (deliveryId: string, data: { transitStatus: string; notes?: string }) =>
        api.patch<{ success: boolean; deliveryId: string; transitStatus: string; message: string }>(
          `/hospitals/me/emergency-matching/deliveries/${deliveryId}/transit`,
          data
        ),
    },
  },

  bloodRequests: {
    getAll: () => api.get<BloodRequestItem[]>("/bloodrequests"),

    getById: (id: string) => api.get<BloodRequestItem>(`/bloodrequests/${id}`),

    create: (data: CreateBloodRequestDto | FormData) =>
      api.post<BloodRequestItem>("/bloodrequests", data),

    update: (
      id: string,
      data: Partial<CreateBloodRequestDto> & { status?: string; remarks?: string; notes?: string }
    ) => api.put<BloodRequestItem>(`/bloodrequests/${id}`, data),

    delete: (id: string) =>
      api.delete<{ success: boolean; message: string }>(`/bloodrequests/${id}`),

    verifyPrescription: (
      id: string,
      data: { status: "VERIFIED" | "REJECTED"; remarks?: string }
    ) =>
      api.post<{ success: boolean; message: string; prescription: PrescriptionItem }>(
        `/bloodrequests/${id}/prescription/verify`,
        data
      ),

    getDocuments: (requestId: string) =>
      api.get<RequestCompletenessResponse>(`/bloodrequests/${requestId}/documents`),

    getDocumentDownloadUrl: (requestId: string, documentId: string) =>
      `${API_BASE_URL}/bloodrequests/${requestId}/documents/${documentId}/file`,

    getVerificationReport: (requestId: string) =>
      api.get<RequisitionVerificationReportResponse>(
        `/bloodrequests/${requestId}/verification-report`
      ),

    submitReviewerDecision: (
      requestId: string,
      documentId: string,
      data: {
        decision: "VERIFIED_MANUAL" | "CORRECTION_REQUIRED" | "ADDITIONAL_INFO_REQUIRED" | "ESCALATED";
        remarks?: string;
      }
    ) =>
      api.post<{
        success: boolean;
        message: string;
        verification: DocumentVerificationReportItem;
      }>(`/bloodrequests/${requestId}/documents/${documentId}/review-decision`, data),

    uploadReplacementPrescription: (id: string, formData: FormData) =>
      api.post<{ success: boolean; message: string; prescription: PrescriptionItem }>(
        `/bloodrequests/${id}/prescription/replacement`,
        formData
      ),

    getPrescriptionDownloadUrl: (id: string, download: boolean = false) =>
      `${API_BASE_URL}/bloodrequests/${id}/prescription/file${download ? "?download=true" : ""}`,

    fetchPrescriptionBlob: async (
      id: string,
      download: boolean = false
    ): Promise<{ blob: Blob; filename: string; contentType: string }> => {
      const token = getAuthToken();
      if (!token) {
        throw new ApiError("Authentication required to access prescription documents.", 401);
      }

      const url = `${API_BASE_URL}/bloodrequests/${id}/prescription/file${download ? "?download=true" : ""}`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error: any) {
        throw new ApiError(
          error?.message || "Network error while downloading prescription document.",
          0
        );
      }

      if (response.status === 401) {
        clearAuthToken();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
          window.location.href = "/signin?session=expired";
        }
        throw new ApiError("Your session has expired. Please sign in again.", 401);
      }

      if (!response.ok) {
        let message = `Failed to retrieve prescription document (HTTP ${response.status}).`;
        try {
          const errJson = await response.json();
          if (errJson?.message) message = errJson.message;
        } catch {
          // ignore non-JSON error body
        }
        if (response.status === 403) {
          message = message || "Access denied: you are not authorized to view this prescription.";
        } else if (response.status === 404) {
          message = message || "Prescription document not found.";
        }
        throw new ApiError(message, response.status);
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      const filename = match ? decodeURIComponent(match[1]) : `prescription-${id.slice(0, 8)}`;
      const blob = await response.blob();
      return { blob, filename, contentType };
    },

    getMatchedDonors: (id: string, params?: { radiusKm?: number; page?: number; limit?: number }) =>
      api.get<{
        success: boolean;
        count: number;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        data: MatchedDonorItem[];
      }>(`/bloodrequests/${id}/matched-donors`, { params }),

    getBroadcastStatus: (id: string) =>
      api.get<{
        success: boolean;
        hasBroadcast: boolean;
        broadcast: any;
        deliveries: any[];
        history: any[];
      }>(`/bloodrequests/${id}/broadcast`),

    triggerBroadcast: (id: string, data?: { radiusKm?: number; reason?: string }) =>
      api.post<{
        success: boolean;
        message: string;
        broadcast: any;
      }>(`/bloodrequests/${id}/broadcast`, data),

    updateTransitStatus: (
      requestId: string,
      status: "DONOR_FOUND" | "STARTED" | "REACHED_LOCATION" | "COMPLETED" | string,
      options?: { donorUserId?: string; deliveryId?: string }
    ) =>
      api.patch<{
        success: boolean;
        message: string;
        transitStatus: string;
        deliveryId?: string;
        donorUserId?: string;
        completedUnits?: number;
        unitsRequired?: number;
        bloodArranged?: boolean;
        meta: any;
      }>(`/bloodrequests/${requestId}/transit-status`, {
        status,
        ...(options?.donorUserId ? { donorUserId: options.donorUserId } : {}),
        ...(options?.deliveryId ? { deliveryId: options.deliveryId } : {}),
      }),

    decideVolunteer: (
      requestId: string,
      deliveryId: string,
      decision: "ACCEPTED" | "REJECTED",
      reason?: string
    ) =>
      api.post<{
        success: boolean;
        message: string;
        alreadyDecided?: boolean;
        deliveryId: string;
        donorUserId: string;
        acceptanceStatus: "ACCEPTED" | "REJECTED" | string;
        acceptedAt?: string | null;
        rejectedAt?: string | null;
      }>(`/bloodrequests/${requestId}/volunteers/${deliveryId}/decision`, {
        decision,
        ...(reason ? { reason } : {}),
      }),

    confirmBloodReceipt: (requestId: string, deliveryId: string) =>
      api.post<{
        success: boolean;
        message: string;
        transitStatus: string;
        deliveryId: string;
        donorUserId: string;
        completedUnits?: number;
        unitsRequired?: number;
        bloodArranged?: boolean;
        meta: any;
      }>(`/bloodrequests/${requestId}/volunteers/${deliveryId}/confirm-receipt`, {}),

    getVolunteerDetail: (requestId: string, deliveryId: string) =>
      api.get<{
        success: boolean;
        request: {
          requestid: string;
          patientname: string;
          bloodgroup: string;
          bloodcomponent: string;
          unitsrequired: number;
          urgencylevel: string;
          status: string;
          hospitalname: string | null;
          hospitalcity: string | null;
          createdat: string;
        };
        volunteer: VolunteerDonorResponse;
      }>(`/bloodrequests/${requestId}/volunteers/${deliveryId}`),

    uploadDonationReceipt: (requestId: string, deliveryId: string, file: File) => {
      const formData = new FormData();
      formData.append("receipt", file);
      return api.post<{
        success: boolean;
        message: string;
        receiptDocument: {
          fileName: string;
          mimeType: string;
          fileSize: number;
          downloadUrl: string;
        };
      }>(`/bloodrequests/${requestId}/volunteers/${deliveryId}/receipt-document`, formData);
    },

    fetchDonationReceiptBlob: async (requestId: string, deliveryId: string) => {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/bloodrequests/${requestId}/volunteers/${deliveryId}/receipt-document/file`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (response.status === 401) {
        clearAuthToken();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
          window.location.href = "/signin?session=expired";
        }
        throw new ApiError("Your session has expired. Please sign in again.", 401);
      }
      if (!response.ok) {
        let message = "Failed to retrieve donation receipt document.";
        try {
          const errJson = await response.json();
          if (errJson?.message) message = errJson.message;
        } catch {}
        throw new ApiError(message, response.status);
      }
      const blob = await response.blob();
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      return { blob, contentType };
    },
  },

  hospitals: {
    getAll: () => api.get<HospitalItem[]>("/hospitals"),
    getById: (id: string) => api.get<HospitalItem>(`/hospitals/${id}`),
  },

  donor: {
    getDashboard: () =>
      api.get<{
        success: boolean;
        donor: AuthDonor;
        stats: {
          totalDonations: number;
          livesSaved: number;
          activeMatches: number;
          coverageRadiusKm: number;
        };
        eligibility: {
          status: "Eligible" | "Cooldown" | "Review Required";
          cooldownCompleted: boolean;
          daysSinceLastDonation: number | null;
          lastDonationDate: string | null;
          nextEligibleDate: string | null;
          message: string;
        };
        matchingRequests: any[];
        myCommitments?: any[];
        lastDonation: any | null;
        recentActivities: any[];
      }>("/donors/me/dashboard"),

    getProfile: () =>
      api.get<{
        success: boolean;
        donor: AuthDonor & { users?: AuthUser };
        eligibility: any;
      }>("/donors/me"),

    updateProfile: (data: {
      bloodgroup?: string;
      weight?: number;
      city?: string;
      state?: string;
      pincode?: string;
      address?: string;
      availabilitystatus?: string;
    }) =>
      api.put<{
        success: boolean;
        message: string;
        donor: AuthDonor;
        eligibility: any;
      }>("/donors/me", data),

    getMatchingRequests: (params?: { page?: number; limit?: number }) =>
      api.get<{
        success: boolean;
        donorBloodGroup: string;
        compatibleGroups: string[];
        total: number;
        page: number;
        limit: number;
        requests: any[];
        myCommitments?: any[];
      }>("/donors/me/matching-requests", { params }),

    getHistory: (params?: { page?: number; limit?: number }) =>
      api.get<{
        success: boolean;
        stats: {
          totalDonations: number;
          totalUnits: number;
          totalMl: number;
          livesSaved: number;
          cooldownStatus: string;
          nextEligibleDate: string | null;
        };
        page: number;
        limit: number;
        total: number;
        history: any[];
      }>("/donors/me/history", { params }),

    getLastDonation: () =>
      api.get<{
        success: boolean;
        lastDonation: any | null;
        eligibility: any;
      }>("/donors/me/last-donation"),

    updateAvailability: (availabilitystatus?: "AVAILABLE" | "TEMPORARILY_UNAVAILABLE" | "PERMANENTLY_UNAVAILABLE") =>
      api.patch<{
        success: boolean;
        message: string;
        availabilitystatus: string;
        donor: AuthDonor;
      }>("/donors/me/availability", availabilitystatus ? { availabilitystatus } : {}),

    respondToRequest: (
      requestId: string,
      payload?: {
        action?: "ACCEPT" | "DECLINE";
        response?: "ACCEPTED" | "DECLINED";
        declineReason?: string;
        screeningAnswers?: {
          drinksAlcohol?: boolean;
          alcoholInPast24Hours?: boolean;
          feelingHealthy?: boolean;
          recentAntibioticsOrMedication?: boolean;
          recentTattooOrSurgery?: boolean;
          donatedInLast90Days?: boolean;
          chronicIllness?: boolean;
          isPregnantOrBreastfeeding?: boolean;
        };
        estimatedArrival?: string;
        contactPhone?: string;
        notes?: string;
      }
    ) =>
      api.post<{
        success: boolean;
        message: string;
        requestId: string;
        patientName?: string;
        status?: string;
        response?: string;
      }>(`/bloodrequests/${requestId}/respond`, payload || {}),

    declineRequest: (requestId: string, reason?: string) =>
      api.post<{
        success: boolean;
        message: string;
        requestId: string;
        status?: string;
        response?: string;
      }>(`/bloodrequests/${requestId}/respond`, { action: "DECLINE", declineReason: reason }),

    updateTransitStatus: (
      requestId: string,
      status: "DONOR_FOUND" | "STARTED" | "REACHED_LOCATION" | "COMPLETED" | string,
      options?: { donorUserId?: string; deliveryId?: string }
    ) =>
      api.patch<{
        success: boolean;
        message: string;
        transitStatus: string;
        deliveryId?: string;
        donorUserId?: string;
        completedUnits?: number;
        unitsRequired?: number;
        bloodArranged?: boolean;
        meta: any;
      }>(`/bloodrequests/${requestId}/transit-status`, {
        status,
        ...(options?.donorUserId ? { donorUserId: options.donorUserId } : {}),
        ...(options?.deliveryId ? { deliveryId: options.deliveryId } : {}),
      }),

    decideVolunteer: (
      requestId: string,
      deliveryId: string,
      decision: "ACCEPTED" | "REJECTED",
      reason?: string
    ) =>
      api.post<{
        success: boolean;
        message: string;
        alreadyDecided?: boolean;
        deliveryId: string;
        donorUserId: string;
        acceptanceStatus: "ACCEPTED" | "REJECTED" | string;
        acceptedAt?: string | null;
        rejectedAt?: string | null;
      }>(`/bloodrequests/${requestId}/volunteers/${deliveryId}/decision`, {
        decision,
        ...(reason ? { reason } : {}),
      }),

    confirmBloodReceipt: (requestId: string, deliveryId: string) =>
      api.post<{
        success: boolean;
        message: string;
        transitStatus: string;
        deliveryId: string;
        donorUserId: string;
        completedUnits?: number;
        unitsRequired?: number;
        bloodArranged?: boolean;
        meta: any;
      }>(`/bloodrequests/${requestId}/volunteers/${deliveryId}/confirm-receipt`, {}),

    getVolunteerDetail: (requestId: string, deliveryId: string) =>
      api.get<{
        success: boolean;
        request: {
          requestid: string;
          patientname: string;
          bloodgroup: string;
          bloodcomponent: string;
          unitsrequired: number;
          urgencylevel: string;
          status: string;
          hospitalname: string | null;
          hospitalcity: string | null;
          createdat: string;
        };
        volunteer: VolunteerDonorResponse;
      }>(`/bloodrequests/${requestId}/volunteers/${deliveryId}`),

    uploadDonationReceipt: (requestId: string, deliveryId: string, file: File) => {
      const formData = new FormData();
      formData.append("receipt", file);
      return api.post<{
        success: boolean;
        message: string;
        receiptDocument: {
          fileName: string;
          mimeType: string;
          fileSize: number;
          downloadUrl: string;
        };
      }>(`/bloodrequests/${requestId}/volunteers/${deliveryId}/receipt-document`, formData);
    },

    fetchDonationReceiptBlob: async (requestId: string, deliveryId: string) => {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/bloodrequests/${requestId}/volunteers/${deliveryId}/receipt-document/file`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (response.status === 401) {
        clearAuthToken();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
          window.location.href = "/signin?session=expired";
        }
        throw new ApiError("Your session has expired. Please sign in again.", 401);
      }
      if (!response.ok) {
        let message = "Failed to retrieve donation receipt document.";
        try {
          const errJson = await response.json();
          if (errJson?.message) message = errJson.message;
        } catch {}
        throw new ApiError(message, response.status);
      }
      const blob = await response.blob();
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      return { blob, contentType };
    },

    getNotificationPreferences: () =>
      api.get<{ success: boolean; data: DonorNotificationPreferences }>("/donors/me/notification-preferences"),

    updateNotificationPreferences: (data: Partial<DonorNotificationPreferences>) =>
      api.put<{ success: boolean; data: DonorNotificationPreferences; message: string }>(
        "/donors/me/notification-preferences",
        data
      ),

    emergencyRequests: {
      getAll: () =>
        api.get<{ success: boolean; requests: DonorEmergencyRequestItem[] }>(
          "/donors/me/emergency-requests/donor/requests"
        ),
      respond: (deliveryId: string, data: { response: "ACCEPTED" | "DECLINED"; notes?: string }) =>
        api.post<{
          success: boolean;
          deliveryId: string;
          response: string;
          respondedAt: string;
          message: string;
        }>(`/donors/me/emergency-requests/donor/requests/${deliveryId}/respond`, data),
    },
  },

  notifications: {
    getAll: (params?: boolean | { unreadOnly?: boolean; page?: number; limit?: number }) => {
      let unreadOnly = false;
      let page: number | undefined;
      let limit: number | undefined;

      if (typeof params === "boolean") {
        unreadOnly = params;
      } else if (params && typeof params === "object") {
        unreadOnly = Boolean(params.unreadOnly);
        page = params.page;
        limit = params.limit;
      }

      return api.get<{
        success: boolean;
        total: number;
        unreadCount: number;
        page: number;
        limit: number;
        notifications: NotificationItem[];
      }>("/notifications", { params: { unreadOnly, page, limit } });
    },

    markRead: (id: string) =>
      api.patch<{ success: boolean; message: string; notification?: NotificationItem }>(`/notifications/${id}/read`),

    markAllRead: () =>
      api.patch<{ success: boolean; message: string; updatedCount?: number }>("/notifications/mark-all-read"),

    delete: (id: string) =>
      api.delete<{ success: boolean; message: string }>(`/notifications/${id}`),
  },

  bloodbank: {
    getProfile: () =>
      api.get<{
        success: boolean;
        bloodbank: AuthBloodBank;
      }>("/bloodbanks/me"),

    updateProfile: (data: Partial<AuthBloodBank>) =>
      api.put<{
        success: boolean;
        message: string;
        bloodbank: AuthBloodBank;
      }>("/bloodbanks/me", data),

    createProfile: (data: {
      bloodbankname: string;
      licensenumber: string;
      contactpersonname: string;
      contactpersonphone: string;
      address: string;
      city: string;
      state: string;
      pincode: string;
      latitude?: number | null;
      longitude?: number | null;
    }) =>
      api.post<AuthBloodBank>("/bloodbanks", data),

    getDashboard: (bloodBankId: string) =>
      api.get<BloodBankDashboardData>(`/bloodbanks/${bloodBankId}/dashboard`),

    getInventory: (bloodBankId: string) =>
      api.get<{
        success: boolean;
        total: number;
        inventory: InventoryItem[];
      }>(`/bloodbanks/${bloodBankId}/inventory`),

    addInventory: (
      bloodBankId: string,
      data: {
        bloodgroup: string;
        bloodcomponent: string;
        quantity: number;
        expirydate: string;
        reason?: string;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.post<{
        success: boolean;
        message: string;
        inventory: InventoryItem;
        merged: boolean;
      }>(`/bloodbanks/${bloodBankId}/inventory`, data, { headers });
    },

    adjustInventory: (
      bloodBankId: string,
      inventoryId: string,
      data: {
        operation: "INCREMENT" | "DECREMENT";
        quantity: number;
        reason: string;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.patch<{
        success: boolean;
        message: string;
        inventory: InventoryItem;
        operation: string;
        delta: number;
      }>(`/bloodbanks/${bloodBankId}/inventory/${inventoryId}`, data, { headers });
    },

    // Phase 6.2.3 & 6.2.4: Unit Traceability, Screening, Requisitions, Crossmatching, and Dispatch
    getUnits: (
      bloodBankId: string,
      params?: { status?: string; bloodgroup?: string; bloodcomponent?: string }
    ) =>
      api.get<{
        success: boolean;
        total: number;
        units: InventoryUnitItem[];
      }>(`/bloodbanks/${bloodBankId}/units`, { params }),

    intakeUnit: (
      bloodBankId: string,
      data: {
        inventoryid: string;
        unitbarcode: string;
        bloodgroup: string;
        bloodcomponent: string;
        volume_ml?: number;
        collectiondate?: string;
        expirydate: string;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.post<{
        success: boolean;
        message: string;
        unit: InventoryUnitItem;
      }>(`/bloodbanks/${bloodBankId}/units/intake`, data, { headers });
    },

    getVerifiers: (bloodBankId: string) =>
      api.get<{
        success: boolean;
        verifiers: Array<{ userid: string; name: string; email: string; role: string }>;
      }>(`/bloodbanks/${bloodBankId}/verifiers`),

    recordScreening: (
      bloodBankId: string,
      unitId: string,
      data: {
        verifiedByUserId?: string;
        testresults: {
          hiv: string;
          hbv: string;
          hcv: string;
          syphilis: string;
          malaria: string;
        };
        overallstatus: "PASSED" | "FAILED";
        labtechnicianname: string;
        medicalofficername: string;
        testkitdetails?: string;
        notes?: string;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.post<{
        success: boolean;
        message: string;
        record: UnitScreeningRecordItem;
        unit: InventoryUnitItem;
      }>(`/bloodbanks/${bloodBankId}/units/${unitId}/screening`, data, { headers });
    },

    getScreeningHistory: (bloodBankId: string, unitId: string) =>
      api.get<{
        success: boolean;
        unitid: string;
        total: number;
        history: UnitScreeningRecordItem[];
      }>(`/bloodbanks/${bloodBankId}/units/${unitId}/screening-history`),

    getAssignments: (
      bloodBankId: string,
      params?: { status?: string }
    ) =>
      api.get<{
        success: boolean;
        total: number;
        assignments: RequisitionAssignmentItem[];
      }>(`/bloodbanks/${bloodBankId}/assignments`, { params }),

    updateAssignment: (
      bloodBankId: string,
      assignmentId: string,
      data: {
        action?: "ACCEPT" | "DECLINE";
        status?: "ACCEPTED" | "REJECTED" | "DECLINED";
        declineReason?: string;
        rejectionreason?: string;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.patch<{
        success: boolean;
        message: string;
        assignment: RequisitionAssignmentItem;
      }>(`/bloodbanks/${bloodBankId}/assignments/${assignmentId}`, data, { headers });
    },

    createReservation: (
      bloodBankId: string,
      data: {
        assignmentid: string;
        bloodgroup: string;
        bloodcomponent: string;
        quantity: number;
        notes?: string;
        requestedunitids?: string[];
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.post<{
        success: boolean;
        message: string;
        reservation: BloodReservationItem;
      }>(`/bloodbanks/${bloodBankId}/reservations`, data, { headers });
    },

    recordCrossmatch: (
      bloodBankId: string,
      data: {
        verifiedByUserId?: string;
        reservationid: string;
        reservationitemid: string;
        unitid: string;
        crossmatchresult: "COMPATIBLE" | "INCOMPATIBLE" | "INCONCLUSIVE";
        method?: string;
        technologistname: string;
        notes?: string;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.post<{
        success: boolean;
        message: string;
        crossmatch: ClinicalCrossmatchItem;
        item: ReservationItemDetail;
      }>(`/bloodbanks/${bloodBankId}/crossmatches`, data, { headers });
    },

    dispatchReservation: (
      bloodBankId: string,
      reservationId: string,
      data: {
        couriertemperature_c: number;
        dispatchnotes?: string;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.post<{
        success: boolean;
        message: string;
        reservation: BloodReservationItem;
      }>(`/bloodbanks/${bloodBankId}/reservations/${reservationId}/dispatch`, data, { headers });
    },

    cancelReservation: (
      bloodBankId: string,
      reservationId: string,
      data: {
        reason: string;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.post<{
        success: boolean;
        message: string;
        reservation: BloodReservationItem;
      }>(`/bloodbanks/${bloodBankId}/reservations/${reservationId}/cancel`, data, { headers });
    },

    discardUnit: (
      bloodBankId: string,
      unitId: string,
      data: {
        reason: string;
        disposalnotes?: string;
      },
      idempotencyKey?: string
    ) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
      }
      return api.post<{
        success: boolean;
        message: string;
        unit: InventoryUnitItem;
      }>(`/bloodbanks/${bloodBankId}/units/${unitId}/discard`, data, { headers });
    },

    getReconciliation: (bloodBankId: string) =>
      api.get<{
        success: boolean;
        reconciliation: {
          bloodBankId: string;
          aggregateAvailableUnits: number;
          aggregateReservedUnits: number;
          aggregateQuarantinedUnits: number;
          totalVaultPhysicalStock: number;
          activeUnitsTotal: number;
          reconciled: boolean;
        };
      }>(`/bloodbanks/${bloodBankId}/inventory/reconciliation`),

    getDemandForecast: (params?: {
      scope?: "inventory" | "district" | "state";
      timeframeDays?: number;
      bloodGroup?: string;
      bloodComponent?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.scope) query.set("scope", params.scope);
      if (params?.timeframeDays) query.set("timeframeDays", String(params.timeframeDays));
      if (params?.bloodGroup) query.set("bloodGroup", params.bloodGroup);
      if (params?.bloodComponent) query.set("bloodComponent", params.bloodComponent);
      const qs = query.toString() ? `?${query.toString()}` : "";
      return api.get<{
        success: boolean;
        data: any;
      }>(`/bloodbanks/me/analytics/demand-forecast${qs}`);
    },

    getRegionalInsights: (params?: {
      scope?: "inventory" | "district" | "state";
      timeframeDays?: number;
      bloodGroup?: string;
      bloodComponent?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.scope) query.set("scope", params.scope);
      if (params?.timeframeDays) query.set("timeframeDays", String(params.timeframeDays));
      if (params?.bloodGroup) query.set("bloodGroup", params.bloodGroup);
      if (params?.bloodComponent) query.set("bloodComponent", params.bloodComponent);
      const qs = query.toString() ? `?${query.toString()}` : "";
      return api.get<{
        success: boolean;
        data: any;
      }>(`/bloodbanks/me/analytics/regional-insights${qs}`);
    },

    getExpiryPrediction: (params?: {
      bloodGroup?: string;
      bloodComponent?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.bloodGroup) query.set("bloodGroup", params.bloodGroup);
      if (params?.bloodComponent) query.set("bloodComponent", params.bloodComponent);
      const qs = query.toString() ? `?${query.toString()}` : "";
      return api.get<{
        success: boolean;
        data: any;
      }>(`/bloodbanks/me/analytics/expiry-prediction${qs}`);
    },

    validateUnitSafety: (bloodBankId: string, unitId: string) =>
      api.post<{
        success: boolean;
        isSafe: boolean;
        message: string;
        unit?: any;
      }>(`/bloodbanks/${bloodBankId}/units/${unitId}/validate-safety`, {}),

    camps: {
      getSummary: () =>
        api.get<{ success: boolean; data: CampSummary }>("/bloodbanks/me/camps/summary"),

      list: (params?: {
        status?: string;
        registrationstatus?: string;
        city?: string;
        district?: string;
        state?: string;
        search?: string;
        fromDate?: string;
        toDate?: string;
        page?: number;
        limit?: number;
      }) =>
        api.get<{
          success: boolean;
          data: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            camps: DonationCampItem[];
          };
        }>("/bloodbanks/me/camps", { params }),

      getById: (id: string) =>
        api.get<{ success: boolean; data: DonationCampItem }>(`/bloodbanks/me/camps/${id}`),

      create: (data: any) =>
        api.post<{ success: boolean; data: DonationCampItem; message: string }>("/bloodbanks/me/camps", data),

      update: (id: string, data: any) =>
        api.put<{ success: boolean; data: DonationCampItem; message: string }>(`/bloodbanks/me/camps/${id}`, data),

      publish: (id: string) =>
        api.patch<{ success: boolean; data: DonationCampItem; message: string }>(`/bloodbanks/me/camps/${id}/publish`),

      toggleRegistrationStatus: (id: string, data: { status: "OPEN" | "CLOSED"; reason?: string }) =>
        api.patch<{ success: boolean; data: DonationCampItem; message: string }>(`/bloodbanks/me/camps/${id}/registration-status`, data),

      complete: (id: string, notes?: string) =>
        api.patch<{ success: boolean; data: DonationCampItem; message: string }>(`/bloodbanks/me/camps/${id}/complete`, { notes }),

      cancel: (id: string, reason: string) =>
        api.patch<{ success: boolean; data: DonationCampItem; message: string }>(`/bloodbanks/me/camps/${id}/cancel`, { reason }),

      getRegistrations: (
        id: string,
        params?: { status?: string; attendance?: string; search?: string; page?: number; limit?: number }
      ) =>
        api.get<{
          success: boolean;
          data: {
            total: number;
            registeredCount: number;
            attendedCount: number;
            page: number;
            limit: number;
            totalPages: number;
            registrations: CampRegistrationItem[];
          };
        }>(`/bloodbanks/me/camps/${id}/registrations`, { params }),

      updateAttendance: (
        campId: string,
        regId: string,
        data: { attendancestatus: "ATTENDED" | "NOT_ATTENDED"; unitsdonated?: number | null; attendancenotes?: string | null }
      ) =>
        api.patch<{ success: boolean; data: any; message: string }>(`/bloodbanks/me/camps/${campId}/registrations/${regId}/attendance`, data),

      cancelRegistration: (campId: string, regId: string, reason: string) =>
        api.patch<{ success: boolean; data: any; message: string }>(`/bloodbanks/me/camps/${campId}/registrations/${regId}/cancel`, { reason }),
    },

    predictions: {
      get: (params?: { period?: 7 | 14 | 30; component?: string; bloodBankId?: string }) => {
        const query = new URLSearchParams();
        if (params?.period) query.append("period", String(params.period));
        if (params?.component) query.append("component", params.component);
        if (params?.bloodBankId) query.append("bloodBankId", params.bloodBankId);
        const qs = query.toString();
        return api.get<{ success: boolean; data: CompletePredictionPayloadItem }>(
          `/bloodbanks/me/predictions${qs ? `?${qs}` : ""}`
        );
      },

      getOverview: (params?: { period?: 7 | 14 | 30; component?: string }) => {
        const query = new URLSearchParams();
        if (params?.period) query.append("period", String(params.period));
        if (params?.component) query.append("component", params.component);
        const qs = query.toString();
        return api.get<{ success: boolean; data: PredictorOverviewSummaryItem }>(
          `/bloodbanks/me/predictions/overview${qs ? `?${qs}` : ""}`
        );
      },

      getShortages: (params?: { period?: 7 | 14 | 30; component?: string }) => {
        const query = new URLSearchParams();
        if (params?.period) query.append("period", String(params.period));
        if (params?.component) query.append("component", params.component);
        const qs = query.toString();
        return api.get<{
          success: boolean;
          data: {
            forecastPeriodDays: number;
            selectedComponent: string;
            predictions: BloodGroupPredictionItem[];
          };
        }>(`/bloodbanks/me/predictions/shortages${qs ? `?${qs}` : ""}`);
      },

      getTrends: (params?: { period?: 7 | 14 | 30; component?: string }) => {
        const query = new URLSearchParams();
        if (params?.period) query.append("period", String(params.period));
        if (params?.component) query.append("component", params.component);
        const qs = query.toString();
        return api.get<{
          success: boolean;
          data: {
            forecastPeriodDays: number;
            trends: {
              timeline: ShortageTrendPointItem[];
              historicalVsPredictedByGroup: Array<{
                bloodGroup: string;
                historicalAvg: number;
                predicted: number;
                currentStock: number;
              }>;
              riskDistribution: Record<ShortageRiskLevel, number>;
            };
          };
        }>(`/bloodbanks/me/predictions/trends${qs ? `?${qs}` : ""}`);
      },

      getInsights: (params?: { period?: 7 | 14 | 30; component?: string }) => {
        const query = new URLSearchParams();
        if (params?.period) query.append("period", String(params.period));
        if (params?.component) query.append("component", params.component);
        const qs = query.toString();
        return api.get<{
          success: boolean;
          data: {
            forecastPeriodDays: number;
            insights: AiGeneratedInsightItem[];
            recommendations: ActionableRecommendationItem[];
          };
        }>(`/bloodbanks/me/predictions/insights${qs ? `?${qs}` : ""}`);
      },
    },

    campPlanner: {
      get: (params?: { horizon?: 7 | 14 | 30; bloodBankId?: string }) => {
        const query = new URLSearchParams();
        if (params?.horizon) query.append("horizon", String(params.horizon));
        if (params?.bloodBankId) query.append("bloodBankId", params.bloodBankId);
        const qs = query.toString();
        return api.get<{ success: boolean; data: CompleteCampPlannerPayloadItem }>(
          `/bloodbanks/me/camp-planner${qs ? `?${qs}` : ""}`
        );
      },
      getOverview: () =>
        api.get<{ success: boolean; data: CampPlannerOverviewItem }>("/bloodbanks/me/camp-planner/overview"),
      getLocations: (params?: { horizon?: 7 | 14 | 30 }) => {
        const query = new URLSearchParams();
        if (params?.horizon) query.append("horizon", String(params.horizon));
        const qs = query.toString();
        return api.get<{ success: boolean; data: CampPlannerLocationItem[] }>(
          `/bloodbanks/me/camp-planner/locations${qs ? `?${qs}` : ""}`
        );
      },
      getDates: () =>
        api.get<{ success: boolean; data: CampPlannerDateItem[] }>("/bloodbanks/me/camp-planner/dates"),
      getInsights: () =>
        api.get<{ success: boolean; data: CampPlannerInsightItem[] }>("/bloodbanks/me/camp-planner/insights"),
    },
  },

  bloodbanks: {
    getAll: () => api.get<AuthBloodBank[]>("/bloodbanks"),
    getById: (id: string) => api.get<AuthBloodBank>(`/bloodbanks/${id}`),
  },

  camps: {
    discover: (params?: {
      city?: string;
      district?: string;
      state?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      page?: number;
      limit?: number;
    }) =>
      api.get<{
        success: boolean;
        data: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
          camps: any[];
        };
      }>("/camps/discover", { params }),

    getPublicById: (id: string) =>
      api.get<{ success: boolean; data: any }>(`/camps/${id}/public`),

    register: (campId: string) =>
      api.post<{ success: boolean; data: any; message: string }>(`/camps/${campId}/register`),

    getMyRegistrations: () =>
      api.get<{ success: boolean; data: any[] }>("/donors/me/camp-registrations"),

    cancelMyRegistration: (registrationId: string, reason?: string) =>
      api.post<{ success: boolean; data: any; message: string }>(`/donors/me/camp-registrations/${registrationId}/cancel`, { reason }),
  },
  equipment: {
    list: (params?: {
      category?: string;
      operationalStatus?: string;
      calibrationStatus?: string;
      maintenanceStatus?: string;
      search?: string;
      page?: number;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.category) query.set("category", params.category);
      if (params?.operationalStatus) query.set("operationalStatus", params.operationalStatus);
      if (params?.calibrationStatus) query.set("calibrationStatus", params.calibrationStatus);
      if (params?.maintenanceStatus) query.set("maintenanceStatus", params.maintenanceStatus);
      if (params?.search) query.set("search", params.search);
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      const qs = query.toString() ? `?${query.toString()}` : "";
      return api.get<{
        success: boolean;
        items: EquipmentItem[];
        pagination: { total: number; page: number; limit: number; totalPages: number };
      }>(`/equipment${qs}`);
    },

    getById: (id: string) =>
      api.get<{
        success: boolean;
        equipment: EquipmentItem;
      }>(`/equipment/${id}`),

    create: (data: any) =>
      api.post<{
        success: boolean;
        equipment: EquipmentItem;
        message?: string;
      }>("/equipment", data),

    update: (id: string, data: any) =>
      api.put<{
        success: boolean;
        equipment: EquipmentItem;
        message?: string;
      }>(`/equipment/${id}`, data),

    updateStatus: (id: string, data: { operationalStatus: string; reason: string }) =>
      api.patch<{
        success: boolean;
        equipment: EquipmentItem;
        clinicalAdvisory?: string | null;
        message?: string;
      }>(`/equipment/${id}/status`, data),

    getDashboard: () =>
      api.get<{
        success: boolean;
        metrics: EquipmentDashboardMetrics;
      }>("/equipment/dashboard"),

    getCategories: () =>
      api.get<{
        success: boolean;
        categories: EquipmentCategoryItem[];
      }>("/equipment/categories"),

    getReports: () =>
      api.get<{
        success: boolean;
        report: any;
      }>("/equipment/reports"),

    logCalibration: (id: string, formData: FormData) =>
      api.post<{
        success: boolean;
        calibration: EquipmentCalibrationItem;
        clinicalAdvisory?: string | null;
        message?: string;
      }>(`/equipment/${id}/calibrations`, formData),

    verifyCalibration: (id: string, calId: string, data: { decision: "VERIFIED" | "REJECTED"; remarks?: string }) =>
      api.patch<{
        success: boolean;
        calibration: EquipmentCalibrationItem;
        message?: string;
      }>(`/equipment/${id}/calibrations/${calId}/verify`, data),

    scheduleMaintenance: (id: string, formData: FormData) =>
      api.post<{
        success: boolean;
        maintenance: EquipmentMaintenanceItem;
        message?: string;
      }>(`/equipment/${id}/maintenance`, formData),

    reportBreakdown: (id: string, data: {
      issue: string;
      description?: string;
      severity?: string;
      impactOnStorage?: boolean;
      sopActionTaken?: string;
    }) =>
      api.post<{
        success: boolean;
        breakdown: EquipmentBreakdownItem;
        clinicalAdvisory?: string | null;
        message?: string;
      }>(`/equipment/${id}/breakdowns`, data),

    resolveBreakdown: (id: string, breakdownId: string, data: {
      resolutionDetails: string;
      partsReplaced?: string;
      downtimeHours?: number;
      restoreOperational?: boolean;
    }) =>
      api.patch<{
        success: boolean;
        breakdown: EquipmentBreakdownItem;
        message?: string;
      }>(`/equipment/${id}/breakdowns/${breakdownId}/resolve`, data),

    fetchCalibrationCertificateBlob: async (equipmentId: string, calId: string) => {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/equipment/${equipmentId}/calibrations/${calId}/certificate`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (response.status === 401) {
        clearAuthToken();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
          window.location.href = "/signin?session=expired";
        }
        throw new ApiError("Your session has expired. Please sign in again.", 401);
      }
      if (!response.ok) {
        let message = "Failed to download calibration certificate.";
        try {
          const errJson = await response.json();
          if (errJson?.message) message = errJson.message;
        } catch {}
        throw new ApiError(message, response.status);
      }
      return response.blob();
    },

    fetchMaintenanceReportBlob: async (equipmentId: string, maintId: string) => {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/equipment/${equipmentId}/maintenance/${maintId}/report`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (response.status === 401) {
        clearAuthToken();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
          window.location.href = "/signin?session=expired";
        }
        throw new ApiError("Your session has expired. Please sign in again.", 401);
      }
      if (!response.ok) {
        let message = "Failed to download maintenance report.";
        try {
          const errJson = await response.json();
          if (errJson?.message) message = errJson.message;
        } catch {}
        throw new ApiError(message, response.status);
      }
      return response.blob();
    },
  },

  actionRedirect: {
    resolve: (token: string) =>
      api.get<{
        success: boolean;
        valid?: boolean;
        purpose?: string;
        targetId?: string;
        redirectUrl?: string;
        intendedUserId?: string;
        requiresAuth?: boolean;
        code?: string;
        message?: string;
      }>(`/action-redirect/${token}`),

    consume: (token: string) =>
      api.post<{
        success: boolean;
        redirectUrl?: string;
        purpose?: string;
        code?: string;
        message?: string;
      }>(`/action-redirect/${token}/consume`),
  },

  eligibility: {
    getResponses: (requestId: string) =>
      api.get<{
        success: boolean;
        responses: Array<{
          responseid: string;
          requestid: string;
          donorid: string;
          donoruserid: string;
          drinksalcohol: boolean | null;
          alcoholin24h: boolean | null;
          feelinghealthy: boolean | null;
          medicationstatus: boolean | null;
          recenttattoosurgery: boolean | null;
          donatedinlast90days: boolean | null;
          chronicillness: boolean | null;
          pregnantorbreastfeeding: boolean | null;
          additionalnotes: string | null;
          screeningstatus: string;
          unansweredcount: number;
          completionpercent: number;
          clinicaldisclaimeracknowledged: boolean;
          submittedat: string;
          reviewedbyhospitaluserid: string | null;
          reviewedat: string | null;
          reviewdecision: string | null;
          reviewnotes: string | null;
          donors?: {
            donorid: string;
            bloodgroup: string;
            city: string;
            users?: { name: string; phonenumber?: string };
          };
          reviewedbyhospitaluser?: { name: string; email: string };
        }>;
      }>(`/bloodrequests/${requestId}/eligibility-responses`),

    review: (
      requestId: string,
      payload: {
        responseId: string;
        decision: "CLINICALLY_APPROVED" | "CLINICALLY_DEFERRED";
        notes?: string;
      }
    ) =>
      api.post<{
        success: boolean;
        message: string;
        response?: any;
      }>(`/bloodrequests/${requestId}/eligibility-review`, payload),
  },

  customSms: {
    getRecipients: () =>
      api.get<{
        success: boolean;
        count: number;
        recipients: Array<{
          userId: string;
          displayName: string;
          role: "DONOR" | "REQUESTER" | "HOSPITAL" | "BLOOD_BANK";
          maskedPhone: string;
          relationshipContext: string;
          targetRequestId?: string;
          bloodGroup?: string;
        }>;
      }>("/custom-sms/recipients"),

    send: (payload: {
      recipientUserId: string;
      message: string;
      contextRequestId?: string;
      actionUrl?: string;
      idempotencyKey?: string;
    }) =>
      api.post<{
        success: boolean;
        message: string;
        data: {
          outboxId: string;
          status: string;
          recipientName: string;
          characterCount: number;
          segmentEstimate: number;
          createdAt: string;
        };
      }>("/custom-sms/send", payload),

    getHistory: (limit = 50) =>
      api.get<{
        success: boolean;
        count: number;
        history: Array<{
          outboxId: string;
          recipientName: string;
          recipientRole: string;
          maskedPhone: string;
          messageBody: string;
          status: "PENDING" | "SENT" | "FAILED" | "DEAD_LETTER";
          createdAt: string;
          dispatchConfirmedAt?: string | null;
          errorCode?: string | null;
          attempts: number;
        }>;
      }>(`/custom-sms/history?limit=${limit}`),

    getStatus: (outboxId: string) =>
      api.get<{
        success: boolean;
        outboxId: string;
        status: string;
        attempts: number;
        messageSid?: string | null;
        dispatchedAt?: string | null;
        createdAt: string;
        errorCode?: string | null;
        errorMessage?: string | null;
      }>(`/custom-sms/status/${outboxId}`),

    retry: (outboxId: string) =>
      api.post<{
        success: boolean;
        message: string;
        data: { success: boolean; status: string };
      }>(`/custom-sms/retry/${outboxId}`),
  },
};

