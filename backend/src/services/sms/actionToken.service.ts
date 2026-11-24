/**
 * Action Token Service
 * Generates and validates cryptographically secure, single-purpose,
 * expiring links for SMS interactions.
 */

import crypto from "crypto";
import { prisma } from "../../config/prisma";
import { ActionTokenPayload } from "./sms.types";

export interface CreateActionTokenOptions {
    userId: string;
    purpose: "DONOR_PLEDGE" | "DONOR_QUESTIONNAIRE" | "NEXT_STEPS" | "VIEW_REQUEST" | "HOSPITAL_REVIEW" | "BLOOD_BANK_CHECK" | "REQUEST_TRACKING" | "DONOR_MATCH" | string;
    targetId: string;
    redirectUrl: string;
    expiresInHours?: number;
    prismaTx?: any; // For calling within existing transaction
}

export class ActionTokenService {
    /**
     * Get configured frontend base URL for generating SMS links
     */
    public static getBaseUrl(): string {
        const url = process.env.APP_BASE_URL || process.env.FRONTEND_URL || "http://localhost:3000";
        return url.replace(/\/+$/, "");
    }

    /**
     * Hash raw token with SHA-256 for secure storage
     */
    public static hashToken(rawToken: string): string {
        return crypto.createHash("sha256").update(rawToken).digest("hex");
    }

    /**
     * Sanitize and validate internal redirect URL to prevent open redirect vulnerabilities.
     */
    public static sanitizeRedirectUrl(url: string): string {
        if (!url || typeof url !== "string") return "/";
        const trimmed = url.trim();
        // Disallow external protocols, backslashes, double slashes, and protocol-relative URLs
        if (
            !trimmed.startsWith("/") ||
            trimmed.startsWith("//") ||
            trimmed.includes("\\") ||
            /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
        ) {
            return "/";
        }
        return trimmed;
    }

    /**
     * Create a new secure action token and return the full actionable URL
     */
    public static async createActionToken(options: CreateActionTokenOptions): Promise<{
        rawToken: string;
        actionUrl: string;
        tokenId: string;
        expiresAt: Date;
    }> {
        const sanitizedRedirect = this.sanitizeRedirectUrl(options.redirectUrl);
        if (sanitizedRedirect === "/" && options.redirectUrl !== "/") {
            throw new Error("Invalid redirectUrl: Action token redirect must be a safe internal application path");
        }

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = this.hashToken(rawToken);
        const expiresInHours = options.expiresInHours || 24;
        const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

        const db = options.prismaTx || prisma;

        const record = await db.actiontokens.create({
            data: {
                tokenhash: tokenHash,
                userid: options.userId,
                purpose: options.purpose,
                targetid: options.targetId,
                redirecturl: sanitizedRedirect,
                expiresat: expiresAt,
            },
        });

        const actionUrl = `${this.getBaseUrl()}/r/${rawToken}`;

        return {
            rawToken,
            actionUrl,
            tokenId: record.tokenid,
            expiresAt,
        };
    }

    /**
     * Peek action token without consuming it (e.g. to inspect where to redirect after login)
     */
    public static async peekToken(rawToken: string): Promise<ActionTokenPayload | null> {
        if (!rawToken || typeof rawToken !== "string" || rawToken.trim() === "") {
            return null;
        }

        const tokenHash = this.hashToken(rawToken.trim());
        const record = await prisma.actiontokens.findUnique({
            where: { tokenhash: tokenHash },
        });

        if (!record) return null;

        return {
            tokenId: record.tokenid,
            userId: record.userid,
            purpose: record.purpose,
            targetId: record.targetid,
            redirectUrl: record.redirecturl,
            expiresAt: record.expiresat,
            usedAt: record.usedat,
        };
    }

    /**
     * Validate and optionally consume action token
     */
    public static async validateAndConsumeToken(
        rawToken: string,
        options?: {
            requiredPurpose?: string;
            expectedUserId?: string;
            consume?: boolean;
        }
    ): Promise<{
        valid: boolean;
        reason?: "NOT_FOUND" | "EXPIRED" | "ALREADY_USED" | "PURPOSE_MISMATCH" | "USER_MISMATCH";
        token?: ActionTokenPayload;
    }> {
        if (!rawToken || typeof rawToken !== "string" || rawToken.trim() === "") {
            return { valid: false, reason: "NOT_FOUND" };
        }

        const tokenHash = this.hashToken(rawToken.trim());
        const record = await prisma.actiontokens.findUnique({
            where: { tokenhash: tokenHash },
        });

        if (!record) {
            return { valid: false, reason: "NOT_FOUND" };
        }

        // Check expiration
        if (new Date() > record.expiresat) {
            return { valid: false, reason: "EXPIRED" };
        }

        // Check if already used
        if (record.usedat !== null) {
            return { valid: false, reason: "ALREADY_USED" };
        }

        // Check purpose
        if (options?.requiredPurpose && record.purpose !== options.requiredPurpose) {
            return { valid: false, reason: "PURPOSE_MISMATCH" };
        }

        // Check user
        if (options?.expectedUserId && record.userid !== options.expectedUserId) {
            return { valid: false, reason: "USER_MISMATCH" };
        }

        // Consume if requested
        if (options?.consume) {
            await prisma.actiontokens.update({
                where: { tokenid: record.tokenid },
                data: { usedat: new Date() },
            });
        }

        return {
            valid: true,
            token: {
                tokenId: record.tokenid,
                userId: record.userid,
                purpose: record.purpose,
                targetId: record.targetid,
                redirectUrl: record.redirecturl,
                expiresAt: record.expiresat,
                usedAt: options?.consume ? new Date() : record.usedat,
            },
        };
    }
}
