// Authentication and Token Utilities for Swastya Frontend

export interface AuthUser {
  userid: string;
  name: string;
  email: string;
  phonenumber: string | null;
  role: "DONOR" | "REQUESTER" | "HOSPITAL" | "BLOOD_BANK" | "PATIENT" | "ADMIN";
  createdat?: string;
  updatedat?: string;
}

export interface AuthDonor {
  donorid: string;
  userid: string;
  bloodgroup: string;
  dateofbirth?: string;
  gender?: string;
  weight?: number;
  city: string;
  state: string;
  pincode: string;
  address?: string;
  availabilitystatus: "AVAILABLE" | "TEMPORARILY_UNAVAILABLE" | "PERMANENTLY_UNAVAILABLE";
  lastdonationdate?: string | null;
  createdat?: string;
  updatedat?: string;
}

export interface AuthRequester {
  requesterid: string;
  userid: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  createdat?: string;
  updatedat?: string;
}

const TOKEN_KEY = "swastya_auth_token";
const USER_KEY = "swastya_auth_user";
const DONOR_KEY = "swastya_auth_donor";
const REQUESTER_KEY = "swastya_auth_requester";

export const getAuthToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setAuthToken = (token: string): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event("swastya-auth-change"));
};

export const clearAuthToken = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(DONOR_KEY);
  localStorage.removeItem(REQUESTER_KEY);
  sessionStorage.removeItem("swastya_donor_profile");
  sessionStorage.removeItem("swastya_requester_profile");
  window.dispatchEvent(new Event("swastya-auth-change"));
};

export const getStoredUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const setStoredUser = (
  user: AuthUser,
  donor?: AuthDonor | null,
  requester?: AuthRequester | null
): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (donor) {
    localStorage.setItem(DONOR_KEY, JSON.stringify(donor));
  } else {
    localStorage.removeItem(DONOR_KEY);
  }

  if (requester) {
    localStorage.setItem(REQUESTER_KEY, JSON.stringify(requester));
  } else {
    localStorage.removeItem(REQUESTER_KEY);
  }

  window.dispatchEvent(new Event("swastya-auth-change"));
};

export const getStoredDonor = (): AuthDonor | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(DONOR_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const getStoredRequester = (): AuthRequester | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(REQUESTER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const isAuthenticated = (): boolean => {
  return !!getAuthToken();
};
