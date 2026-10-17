import { getAuthToken, clearAuthToken, AuthUser, AuthDonor, AuthRequester, AuthHospital } from "./auth";

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

export interface VolunteerDonorResponse {
  notificationid: string;
  donorId?: string;
  donorName: string;
  donorBloodGroup: string;
  donorCity?: string;
  donorState?: string;
  donorPhone?: string;
  donorEmail?: string;
  respondedAt: string;
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
        message?: string;
      }>("/auth/register", userData),

    me: () =>
      api.get<{
        success: boolean;
        user: AuthUser;
        donor: AuthDonor | null;
        requester: AuthRequester | null;
        hospital: AuthHospital | null;
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

    updateDonorTransitStatus: (requestId: string, status: string, donorUserId?: string) =>
      api.patch<{
        success: boolean;
        message: string;
        transitStatus: string;
      }>(`/bloodrequests/${requestId}/transit-status`, { status, donorUserId }),
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
      if (!res.ok) {
        throw new Error(`Failed to download template (HTTP ${res.status})`);
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

    uploadReplacementPrescription: (id: string, formData: FormData) =>
      api.post<{ success: boolean; message: string; prescription: PrescriptionItem }>(
        `/bloodrequests/${id}/prescription/replacement`,
        formData
      ),

    getPrescriptionDownloadUrl: (id: string, download: boolean = false) =>
      `${API_BASE_URL}/bloodrequests/${id}/prescription/file${download ? "?download=true" : ""}`,

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
      }>(`/bloodrequests/${requestId}/respond`, payload || {}),

    updateTransitStatus: (requestId: string, status: "DONOR_FOUND" | "STARTED" | "REACHED_LOCATION" | "COMPLETED" | string) =>
      api.patch<{
        success: boolean;
        message: string;
        transitStatus: string;
        meta: any;
      }>(`/bloodrequests/${requestId}/transit-status`, { status }),
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
};

