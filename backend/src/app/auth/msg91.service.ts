/**
 * MSG91 OTP Verification Service
 * 
 * Verifies access tokens returned by the MSG91 OTP Widget via the official
 * verifyAccessToken endpoint. Extracts and verifies mobile numbers directly
 * from MSG91's trusted response.
 */

export interface Msg91VerificationResult {
    success: boolean;
    identifier?: string;
    normalizedPhone?: string;
    message?: string;
    raw?: any;
}

// In-memory replay cache to prevent duplicate verification token reuse
const consumedTokens = new Map<string, number>();
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

// Periodic cleanup of consumed tokens
const cleanupConsumedTokens = () => {
    const now = Date.now();
    for (const [token, timestamp] of consumedTokens.entries()) {
        if (now - timestamp > TOKEN_TTL_MS) {
            consumedTokens.delete(token);
        }
    }
};

/**
 * Normalizes phone number variants for Indian & International standards.
 * Returns an array of search variants (e.g. ['9876543210', '+919876543210', '919876543210'])
 * to match database records regardless of how the user originally saved their number.
 */
export const getPhoneVariants = (phone: string): string[] => {
    if (!phone) return [];
    const cleaned = phone.replace(/[^\d+]/g, "").trim();
    const digitsOnly = cleaned.replace(/\D/g, "");
    const variants = new Set<string>();

    if (cleaned) variants.add(cleaned);
    if (digitsOnly) variants.add(digitsOnly);

    // If 10 digits (Standard Indian mobile)
    if (digitsOnly.length === 10) {
        variants.add(`+91${digitsOnly}`);
        variants.add(`91${digitsOnly}`);
    } else if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
        const national = digitsOnly.slice(2);
        variants.add(national);
        variants.add(`+91${national}`);
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
        const national = digitsOnly.slice(1);
        variants.add(national);
        variants.add(`+91${national}`);
        variants.add(`91${national}`);
    }

    return Array.from(variants);
};

export class Msg91Service {
    private static readonly VERIFY_URL = "https://control.msg91.com/api/v5/widget/verifyAccessToken";

    /**
     * Get the configured AuthKey securely from environment.
     * Never logs or exposes this key.
     */
    private static getAuthKey(): string {
        const key = process.env.MSG91_AUTH_KEY;
        if (!key || key.trim() === "") {
            throw new Error("MSG91_AUTH_KEY is not configured in environment variables.");
        }
        return key.trim();
    }

    /**
     * Verify an OTP access token obtained from the MSG91 client-side widget.
     * 
     * Request payload matches the exact MSG91 server-side integration snippet:
     * {
     *   "authkey": "<MSG91_AUTH_KEY>",
     *   "access-token": "<jwt_token_from_otp_widget>"
     * }
     */
    public static async verifyAccessToken(accessToken: string): Promise<Msg91VerificationResult> {
        if (!accessToken || typeof accessToken !== "string" || accessToken.trim() === "") {
            return {
                success: false,
                message: "Access token is required for verification.",
            };
        }

        const trimmedToken = accessToken.trim();

        // 1. Replay / Duplicate Prevention Guard
        cleanupConsumedTokens();
        if (consumedTokens.has(trimmedToken)) {
            return {
                success: false,
                message: "This OTP verification token has already been used or expired.",
            };
        }

        let authKey: string;
        try {
            authKey = this.getAuthKey();
        } catch (err: any) {
            console.error("[MSG91 Service] Configuration error:", err.message);
            return {
                success: false,
                message: "Authentication service configuration error.",
            };
        }

        try {
            const response = await fetch(this.VERIFY_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    authkey: authKey,
                    "access-token": trimmedToken,
                }),
            });

            const data: any = await response.json().catch(() => null);

            // Log status without exposing token or authkey
            if (!response.ok || !data) {
                console.warn(`[MSG91 Service] Verification failed with HTTP status ${response.status}`);
                return {
                    success: false,
                    message: data?.message || "Failed to verify token with OTP provider.",
                    raw: data,
                };
            }

            // MSG91 returns { type: "success", message: "<identifier/phone>" } on valid verification
            const isSuccess = data.type === "success" || data.status === "success" || data.type === "SUCCESS";

            if (!isSuccess) {
                const failMsg = typeof data.message === "string" ? data.message : "Invalid or expired OTP token.";
                return {
                    success: false,
                    message: failMsg,
                    raw: data,
                };
            }

            // Extract the verified user identifier directly from MSG91's trusted response
            let verifiedIdentifier: string = "";
            if (typeof data.message === "string" && data.message.trim() !== "") {
                verifiedIdentifier = data.message.trim();
            } else if (typeof data.data === "string" && data.data.trim() !== "") {
                verifiedIdentifier = data.data.trim();
            } else if (data.data?.mobile) {
                verifiedIdentifier = String(data.data.mobile).trim();
            } else if (data.data?.identifier) {
                verifiedIdentifier = String(data.data.identifier).trim();
            }

            if (!verifiedIdentifier) {
                return {
                    success: false,
                    message: "OTP provider succeeded but returned an empty verified identifier.",
                    raw: data,
                };
            }

            // Mark token as consumed in replay cache
            consumedTokens.set(trimmedToken, Date.now());

            // Normalize national 10-digit mobile if it's an Indian number
            const digits = verifiedIdentifier.replace(/\D/g, "");
            let normalized = verifiedIdentifier;
            if (digits.length === 12 && digits.startsWith("91")) {
                normalized = digits.slice(2);
            } else if (digits.length === 10) {
                normalized = digits;
            }

            return {
                success: true,
                identifier: verifiedIdentifier,
                normalizedPhone: normalized,
                message: "OTP verified successfully.",
                raw: data,
            };
        } catch (error: any) {
            console.error("[MSG91 Service] Network or API exception during verification:", error.message);
            return {
                success: false,
                message: "Unable to reach OTP verification service. Please try again.",
            };
        }
    }

    /**
     * Clear the consumed tokens cache (useful for tests)
     */
    public static _resetReplayCache(): void {
        consumedTokens.clear();
    }
}
