import { getAuthToken, clearAuthToken, AuthUser, AuthDonor, AuthRequester } from "./auth";

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
  requeststatushistory?: RequestStatusHistoryItem[];
  volunteers?: VolunteerDonorResponse[];
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
  requiredby: string;
  notes?: string;
  requesterid?: string;
  hospitalid?: string;
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

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(headers as Record<string, string>),
  };

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

  post: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

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
        message?: string;
      }>("/auth/login", credentials),

    register: (userData: any) =>
      api.post<{
        success: boolean;
        token: string;
        user: AuthUser;
        donor: AuthDonor | null;
        requester: AuthRequester | null;
        message?: string;
      }>("/auth/register", userData),

    me: () =>
      api.get<{
        success: boolean;
        user: AuthUser;
        donor: AuthDonor | null;
        requester: AuthRequester | null;
      }>("/auth/me"),
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

  bloodRequests: {
    getAll: () => api.get<BloodRequestItem[]>("/bloodrequests"),

    getById: (id: string) => api.get<BloodRequestItem>(`/bloodrequests/${id}`),

    create: (data: CreateBloodRequestDto) =>
      api.post<BloodRequestItem>("/bloodrequests", data),

    update: (
      id: string,
      data: Partial<CreateBloodRequestDto> & { status?: string; remarks?: string }
    ) => api.put<BloodRequestItem>(`/bloodrequests/${id}`, data),

    delete: (id: string) =>
      api.delete<{ success: boolean; message: string }>(`/bloodrequests/${id}`),
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

