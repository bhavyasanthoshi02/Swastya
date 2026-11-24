/**
 * Swastya SMS Integration: Type Definitions
 * Phase 2 - Core SMS Engine
 */

export type SmsRole = "DONOR" | "REQUESTER" | "HOSPITAL" | "BLOOD_BANK" | "SYSTEM";

export type SmsTemplateType =
    // Donor Workflows
    | "DONOR_EMERGENCY_MATCH"
    | "DONOR_REQUEST_MATCH"
    | "DONOR_OFFER_ACCEPTED"
    | "DONOR_APPOINTMENT_SCHEDULED"
    | "DONOR_DONATION_CONFIRMED"
    | "DONOR_RECEIPT_CONFIRMED"
    | "DONOR_REQUEST_CANCELLED"
    // Hospital Workflows
    | "HOSPITAL_REQ_ASSIGNED"
    | "HOSPITAL_MATCH_ALERT"
    | "HOSPITAL_DONOR_MATCHED"
    | "HOSPITAL_UNITS_DISPATCHED"
    | "HOSPITAL_REQUEST_APPROVED"
    // Blood Bank Workflows
    | "BLOOD_BANK_REQ_ASSIGNED"
    | "BLOOD_BANK_MATCH_ALERT"
    | "BLOOD_BANK_RESERVATION"
    | "BLOOD_BANK_UNITS_DISPATCHED"
    | "BLOOD_BANK_DISPATCH_CONFIRMED"
    // Requester Workflows
    | "REQUESTER_CONFIRMATION"
    | "REQUESTER_STATUS_UPDATE"
    | "REQUESTER_DONOR_VOLUNTEERED"
    | "REQUESTER_BLOOD_ARRANGED"
    | "REQUESTER_COMPLETED"
    | "REQUESTER_CANCELLED"
    // Custom Communication
    | "CUSTOM_COMMUNICATION";

export interface SmsSendOptions {
    to: string;
    template: SmsTemplateType;
    variables: Record<string, string>;
    userId?: string;
    actionUrl?: string;
    idempotencyKey?: string;
    metadata?: Record<string, any>;
    maxAttempts?: number;
}

export interface SmsDispatchResult {
    success: boolean;
    messageSid: string;
    status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "UNDELIVERED";
    recipientPhone: string;
    renderedMessage: string;
    errorCode?: string;
    errorMessage?: string;
    mock: boolean;
    dispatchedAt: Date;
}

export interface SmsProviderInterface {
    readonly providerName: string;
    send(to: string, messageBody: string, options?: { messageSid?: string }): Promise<SmsDispatchResult>;
}

export interface ActionTokenPayload {
    tokenId: string;
    userId: string;
    purpose: string;
    targetId: string;
    redirectUrl: string;
    expiresAt: Date;
    usedAt: Date | null;
}
