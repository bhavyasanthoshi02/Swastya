/**
 * Swastya Centralized SMS Templates
 * DLT-Compatible, structured for all 4 user roles.
 */

import { SmsTemplateType, SmsRole } from "./sms.types";

export interface TemplateDefinition {
    templateType: SmsTemplateType;
    targetRole: SmsRole;
    dltTemplateId?: string;
    description: string;
    requiredVariables: string[];
    rawTemplate: string;
}

export const SMS_TEMPLATES: Record<SmsTemplateType, TemplateDefinition> = {
    // -------------------------------------------------------------
    // DONOR WORKFLOWS
    // -------------------------------------------------------------
    DONOR_EMERGENCY_MATCH: {
        templateType: "DONOR_EMERGENCY_MATCH",
        targetRole: "DONOR",
        description: "Emergency requisition match notification sent to eligible donors with actionable questionnaire link",
        requiredVariables: ["bloodGroup", "units", "facilityName", "actionUrl"],
        rawTemplate: "Swastya Emergency: Urgent need for {bloodGroup} blood ({units} units) at {facilityName}. Tap to respond: {actionUrl}",
    },
    DONOR_REQUEST_MATCH: {
        templateType: "DONOR_REQUEST_MATCH",
        targetRole: "DONOR",
        description: "Automatic notification sent to eligible matched donors for a newly created blood requisition",
        requiredVariables: ["actionUrl"],
        rawTemplate: "URGENT: Swastya – A blood request matching your donor profile requires your attention. Please review the request and respond: {actionUrl}",
    },
    DONOR_OFFER_ACCEPTED: {
        templateType: "DONOR_OFFER_ACCEPTED",
        targetRole: "DONOR",
        description: "Notification to donor when hospital or requester selects their donation offer",
        requiredVariables: ["facilityName", "actionUrl"],
        rawTemplate: "Swastya Update: You have been selected to donate blood at {facilityName}. Tap for next steps and transit instructions: {actionUrl}",
    },
    DONOR_APPOINTMENT_SCHEDULED: {
        templateType: "DONOR_APPOINTMENT_SCHEDULED",
        targetRole: "DONOR",
        description: "Appointment confirmation for blood donation",
        requiredVariables: ["facilityName", "dateTime", "actionUrl"],
        rawTemplate: "Swastya Schedule: Your blood donation appointment at {facilityName} is confirmed for {dateTime}. View details: {actionUrl}",
    },
    DONOR_DONATION_CONFIRMED: {
        templateType: "DONOR_DONATION_CONFIRMED",
        targetRole: "DONOR",
        description: "Confirmation after donor successfully completes blood donation",
        requiredVariables: ["facilityName", "actionUrl"],
        rawTemplate: "Swastya: Blood donation confirmed at {facilityName}. Thank you for saving a life! View your certificate & history: {actionUrl}",
    },
    DONOR_RECEIPT_CONFIRMED: {
        templateType: "DONOR_RECEIPT_CONFIRMED",
        targetRole: "DONOR",
        description: "Transfusion receipt acknowledgment to donor",
        requiredVariables: ["bloodGroup", "facilityName", "actionUrl"],
        rawTemplate: "Swastya: Blood unit ({bloodGroup}) receipt confirmed at {facilityName}. Your donation has reached the care facility: {actionUrl}",
    },
    DONOR_REQUEST_CANCELLED: {
        templateType: "DONOR_REQUEST_CANCELLED",
        targetRole: "DONOR",
        description: "Cancellation notice if blood was arranged elsewhere or fulfilled",
        requiredVariables: ["bloodGroup", "facilityName"],
        rawTemplate: "Swastya Notice: The urgent request for {bloodGroup} at {facilityName} has been cancelled or fulfilled. Thank you for your readiness.",
    },

    // -------------------------------------------------------------
    // HOSPITAL WORKFLOWS
    // -------------------------------------------------------------
    HOSPITAL_REQ_ASSIGNED: {
        templateType: "HOSPITAL_REQ_ASSIGNED",
        targetRole: "HOSPITAL",
        description: "Notification to hospital when a requisition is assigned or needs clinical review",
        requiredVariables: ["requestId", "bloodGroup", "actionUrl"],
        rawTemplate: "Swastya Hospital Alert: Blood requisition #{requestId} ({bloodGroup}) is awaiting review. Tap to process: {actionUrl}",
    },
    HOSPITAL_MATCH_ALERT: {
        templateType: "HOSPITAL_MATCH_ALERT",
        targetRole: "HOSPITAL",
        description: "Automatic alert to relevant hospitals matching requisition location and clinical requirements",
        requiredVariables: ["actionUrl"],
        rawTemplate: "Swastya Alert: A new blood request matching your organization's availability and requirements needs attention. View details: {actionUrl}",
    },
    HOSPITAL_DONOR_MATCHED: {
        templateType: "HOSPITAL_DONOR_MATCHED",
        targetRole: "HOSPITAL",
        description: "Alert to hospital when a volunteer donor responds to a requisition",
        requiredVariables: ["requestId", "donorName", "eta", "actionUrl"],
        rawTemplate: "Swastya Alert: Donor {donorName} volunteered for request #{requestId} (ETA: {eta}). Review volunteer: {actionUrl}",
    },
    HOSPITAL_UNITS_DISPATCHED: {
        templateType: "HOSPITAL_UNITS_DISPATCHED",
        targetRole: "HOSPITAL",
        description: "Alert when blood bank dispatches reserved units to hospital",
        requiredVariables: ["units", "bloodGroup", "bloodBankName", "actionUrl"],
        rawTemplate: "Swastya Alert: {units} unit(s) of {bloodGroup} blood dispatched from {bloodBankName}. Track delivery & acknowledge receipt: {actionUrl}",
    },
    HOSPITAL_REQUEST_APPROVED: {
        templateType: "HOSPITAL_REQUEST_APPROVED",
        targetRole: "HOSPITAL",
        description: "Notification that requisition review has been approved",
        requiredVariables: ["requestId", "actionUrl"],
        rawTemplate: "Swastya Update: Requisition #{requestId} clinical verification approved. Blood matching underway: {actionUrl}",
    },

    // -------------------------------------------------------------
    // BLOOD BANK WORKFLOWS
    // -------------------------------------------------------------
    BLOOD_BANK_REQ_ASSIGNED: {
        templateType: "BLOOD_BANK_REQ_ASSIGNED",
        targetRole: "BLOOD_BANK",
        description: "Notification to blood bank when blood inventory check is assigned",
        requiredVariables: ["requestId", "units", "bloodGroup", "actionUrl"],
        rawTemplate: "Swastya Blood Bank Alert: Requirement for {units} unit(s) of {bloodGroup} (Req #{requestId}) assigned to your facility. Check availability: {actionUrl}",
    },
    BLOOD_BANK_MATCH_ALERT: {
        templateType: "BLOOD_BANK_MATCH_ALERT",
        targetRole: "BLOOD_BANK",
        description: "Automatic alert to relevant blood banks with compatible available inventory and location",
        requiredVariables: ["actionUrl"],
        rawTemplate: "Swastya Alert: A new blood request matching your organization's availability and requirements needs attention. View details: {actionUrl}",
    },
    BLOOD_BANK_RESERVATION: {
        templateType: "BLOOD_BANK_RESERVATION",
        targetRole: "BLOOD_BANK",
        description: "Reservation confirmation or update for units",
        requiredVariables: ["requestId", "units", "bloodGroup", "actionUrl"],
        rawTemplate: "Swastya Update: {units} unit(s) of {bloodGroup} reserved for Req #{requestId}. Prepare for crossmatch/dispatch: {actionUrl}",
    },
    BLOOD_BANK_UNITS_DISPATCHED: {
        templateType: "BLOOD_BANK_UNITS_DISPATCHED",
        targetRole: "BLOOD_BANK",
        description: "Dispatch recorded for units",
        requiredVariables: ["requestId", "hospitalName", "actionUrl"],
        rawTemplate: "Swastya: Blood dispatch to {hospitalName} recorded for Req #{requestId}. Monitor transit: {actionUrl}",
    },
    BLOOD_BANK_DISPATCH_CONFIRMED: {
        templateType: "BLOOD_BANK_DISPATCH_CONFIRMED",
        targetRole: "BLOOD_BANK",
        description: "Confirmation that hospital confirmed blood delivery receipt",
        requiredVariables: ["requestId", "hospitalName"],
        rawTemplate: "Swastya: Hospital {hospitalName} confirmed delivery receipt for Req #{requestId}. Requisition completed.",
    },

    // -------------------------------------------------------------
    // REQUESTER WORKFLOWS
    // -------------------------------------------------------------
    REQUESTER_CONFIRMATION: {
        templateType: "REQUESTER_CONFIRMATION",
        targetRole: "REQUESTER",
        description: "Confirmation of blood request submission",
        requiredVariables: ["requestId", "bloodGroup", "actionUrl"],
        rawTemplate: "Swastya: Your blood request #{requestId} for {bloodGroup} blood has been submitted. Track live progress: {actionUrl}",
    },
    REQUESTER_STATUS_UPDATE: {
        templateType: "REQUESTER_STATUS_UPDATE",
        targetRole: "REQUESTER",
        description: "Status progression notification",
        requiredVariables: ["requestId", "statusText", "actionUrl"],
        rawTemplate: "Swastya Update: Your request #{requestId} status is now '{statusText}'. View live details: {actionUrl}",
    },
    REQUESTER_DONOR_VOLUNTEERED: {
        templateType: "REQUESTER_DONOR_VOLUNTEERED",
        targetRole: "REQUESTER",
        description: "Notification that a volunteer donor has stepped forward",
        requiredVariables: ["requestId", "actionUrl"],
        rawTemplate: "Swastya Alert: A volunteer donor has stepped forward for request #{requestId}. Tap to select and coordinate: {actionUrl}",
    },
    REQUESTER_BLOOD_ARRANGED: {
        templateType: "REQUESTER_BLOOD_ARRANGED",
        targetRole: "REQUESTER",
        description: "Blood units arranged notification",
        requiredVariables: ["requestId", "facilityName", "actionUrl"],
        rawTemplate: "Swastya Good News: Blood has been arranged for request #{requestId} at {facilityName}. Tap for next steps: {actionUrl}",
    },
    REQUESTER_COMPLETED: {
        templateType: "REQUESTER_COMPLETED",
        targetRole: "REQUESTER",
        description: "Completion of blood request",
        requiredVariables: ["requestId", "actionUrl"],
        rawTemplate: "Swastya: Blood request #{requestId} has been successfully fulfilled. View summary: {actionUrl}",
    },
    REQUESTER_CANCELLED: {
        templateType: "REQUESTER_CANCELLED",
        targetRole: "REQUESTER",
        description: "Cancellation of blood request",
        requiredVariables: ["requestId", "reason"],
        rawTemplate: "Swastya Notice: Your blood request #{requestId} was cancelled ({reason}). Reach out if urgent help is needed.",
    },

    // -------------------------------------------------------------
    // CUSTOM ROLE-BASED MESSAGING
    // -------------------------------------------------------------
    CUSTOM_COMMUNICATION: {
        templateType: "CUSTOM_COMMUNICATION",
        targetRole: "SYSTEM",
        description: "Authorized custom communication sent by hospital or blood bank",
        requiredVariables: ["senderName", "customMessage", "actionUrl"],
        rawTemplate: "Swastya Message from {senderName}: {customMessage}. Tap to respond: {actionUrl}",
    },
};

/**
 * Render an SMS template with variable interpolation and length sanity checks.
 */
export function renderSmsTemplate(
    templateType: SmsTemplateType,
    variables: Record<string, string>
): string {
    const templateDef = SMS_TEMPLATES[templateType];
    if (!templateDef) {
        throw new Error(`Unknown SMS template type: ${templateType}`);
    }

    // Verify required variables
    for (const requiredVar of templateDef.requiredVariables) {
        if (variables[requiredVar] === undefined || variables[requiredVar] === null) {
            throw new Error(`Missing required template variable '${requiredVar}' for template '${templateType}'`);
        }
    }

    let rendered = templateDef.rawTemplate;
    for (const [key, val] of Object.entries(variables)) {
        const placeholder = new RegExp(`\\{${key}\\}`, "g");
        rendered = rendered.replace(placeholder, String(val).trim());
    }

    // Clean whitespace and linebreaks
    rendered = rendered.replace(/\r\n|\r|\n/g, " ").replace(/\s{2,}/g, " ").trim();

    return rendered;
}
