import { getAuthToken, clearAuthToken, AuthUser, AuthDonor } from "./auth";

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
        message?: string;
      }>("/auth/login", credentials),

    register: (userData: any) =>
      api.post<{
        success: boolean;
        token: string;
        user: AuthUser;
        donor: AuthDonor | null;
        message?: string;
      }>("/auth/register", userData),

    me: () =>
      api.get<{
        success: boolean;
        user: AuthUser;
        donor: AuthDonor | null;
      }>("/auth/me"),
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

    respondToRequest: (requestId: string) =>
      api.post<{
        success: boolean;
        message: string;
        requestId: string;
        patientName?: string;
      }>(`/bloodrequests/${requestId}/respond`),
  },

  notifications: {
    getAll: (unreadOnly = false) =>
      api.get<{
        success: boolean;
        total: number;
        unreadCount: number;
        page: number;
        limit: number;
        notifications: Array<{
          notificationid: string;
          title: string;
          message: string;
          type: string;
          isread: boolean;
          createdat: string;
        }>;
      }>("/notifications", { params: { unreadOnly } }),

    markRead: (id: string) =>
      api.patch<{ success: boolean; message: string }>(`/notifications/${id}/read`),

    markAllRead: () =>
      api.patch<{ success: boolean; message: string }>("/notifications/mark-all-read"),

    delete: (id: string) =>
      api.delete<{ success: boolean; message: string }>(`/notifications/${id}`),
  },
};
