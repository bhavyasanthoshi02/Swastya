import { prisma } from "../../config/prisma";
import { OcrEngineService, ExtractedDocumentContent } from "./ocrEngine.service";

export interface VerificationDiscrepancy {
    field: string;
    extractedValue: string;
    expectedValue: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
    sourceDocument: string;
}

export interface ExtractedPrescriptionData {
    patientName: string;
    patientAge: string | number;
    hospitalName: string;
    doctorName: string;
    doctorRegistration: string;
    bloodGroup: string;
    bloodComponent: string;
    units: string | number;
    prescriptionDate: string;
    clinicalIndications: string;
    hasSignatureIndicator: boolean;
}

export interface ExtractedDiagnosticData {
    patientName: string;
    patientIdRef: string;
    bloodGroup: string;
    rhFactor: string;
    reportDate: string;
    laboratoryName: string;
    crossmatchResult: string;
}

export interface ExtractedConsentData {
    patientName: string;
    hospitalName: string;
    consentDate: string;
    hasSignatureIndicator: boolean;
}

export interface DocumentVerificationReport {
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
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Normalizes blood group string into canonical format (e.g., "O+" -> "O_POSITIVE", "B_POS" -> "B_POSITIVE").
 */
export function normalizeExtractedBloodGroup(raw: string): string {
    if (!raw || raw === "NOT_FOUND" || raw === "UNREADABLE") return "NOT_FOUND";
    const cleaned = raw.toUpperCase().replace(/\s+/g, "").replace(/GROUP/g, "");
    const map: Record<string, string> = {
        "A+": "A_POSITIVE",
        "A-": "A_NEGATIVE",
        "B+": "B_POSITIVE",
        "B-": "B_NEGATIVE",
        "AB+": "AB_POSITIVE",
        "AB-": "AB_NEGATIVE",
        "O+": "O_POSITIVE",
        "O-": "O_NEGATIVE",
        "APOSITIVE": "A_POSITIVE",
        "ANEGATIVE": "A_NEGATIVE",
        "BPOSITIVE": "B_POSITIVE",
        "BNEGATIVE": "B_NEGATIVE",
        "ABPOSITIVE": "AB_POSITIVE",
        "ABNEGATIVE": "AB_NEGATIVE",
        "OPOSITIVE": "O_POSITIVE",
        "ONEGATIVE": "O_NEGATIVE",
        "A_POS": "A_POSITIVE",
        "A_NEG": "A_NEGATIVE",
        "B_POS": "B_POSITIVE",
        "B_NEG": "B_NEGATIVE",
        "AB_POS": "AB_POSITIVE",
        "AB_NEG": "AB_NEGATIVE",
        "O_POS": "O_POSITIVE",
        "O_NEG": "O_NEGATIVE",
    };
    return map[cleaned] || cleaned;
}

/**
 * Normalizes blood component string.
 */
export function normalizeExtractedComponent(raw: string): string {
    if (!raw || raw === "NOT_FOUND" || raw === "UNREADABLE") return "NOT_FOUND";
    const upper = raw.toUpperCase();
    if (upper.includes("WHOLE")) return "WHOLE_BLOOD";
    if (upper.includes("PLATELET") || upper.includes("RDP") || upper.includes("SDP")) return "PLATELETS";
    if (upper.includes("PLASMA") || upper.includes("FFP")) return "PLASMA";
    if (upper.includes("RED") || upper.includes("PRBC") || upper.includes("PACKED")) return "PACKED_RED_BLOOD_CELLS";
    return upper;
}

/**
 * Sanitizes and compares patient names with harmless variation tolerance (case, spacing, honorifics).
 */
export function comparePatientNames(nameA: string, nameB: string): { matches: boolean; similarity: number } {
    if (!nameA || !nameB || nameA === "NOT_FOUND" || nameB === "NOT_FOUND") {
        return { matches: false, similarity: 0 };
    }

    const clean = (s: string) =>
        s
            .toLowerCase()
            .replace(/^(mr|mrs|ms|dr|master|patient|patient name|pt|shri|smt)\.?\s+/i, "")
            .replace(/[^a-z0-9]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    const a = clean(nameA);
    const b = clean(nameB);

    if (a === b) return { matches: true, similarity: 1.0 };
    if (!a || !b) return { matches: false, similarity: 0 };

    // Substring or prefix check (e.g. "Rajesh K" vs "Rajesh Kumar")
    if (a.includes(b) || b.includes(a)) {
        return { matches: true, similarity: 0.85 };
    }

    // Levenshtein distance
    const track = Array(b.length + 1)
        .fill(null)
        .map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= b.length; j += 1) track[j][0] = j;
    for (let j = 1; j <= b.length; j += 1) {
        for (let i = 1; i <= a.length; i += 1) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1,
                track[j - 1][i] + 1,
                track[j - 1][i - 1] + indicator
            );
        }
    }
    const distance = track[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    const similarity = 1 - distance / maxLen;

    return { matches: similarity >= 0.75, similarity: Math.round(similarity * 100) / 100 };
}

/**
 * Core AI Document Verification Service.
 * Implements genuine OCR and structured extraction, multi-surface cross-document consistency checks,
 * discrepancies flagging, audit logging, and human reviewer decision recording.
 */
export class DocumentVerificationService {
    /**
     * Extracts structured fields from raw text depending on document type.
     * Never fabricates values; represents missing items as NOT_FOUND.
     */
    public static extractStructuredData(
        rawText: string,
        documentType: string
    ): Record<string, any> {
        if (!rawText || !rawText.trim()) {
            return { rawText: "", error: "UNREADABLE" };
        }

        const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const fullText = rawText;

        const findPattern = (regex: RegExp): string => {
            const m = fullText.match(regex);
            return m && m[1] ? m[1].trim() : "NOT_FOUND";
        };

        if (documentType.toUpperCase() === "PRESCRIPTION") {
            const patientName = findPattern(/(?:patient\s*name|patient|name|pt\.?\s*name)[\s:=]+([a-zA-Z\s.]{2,40})/i);
            const patientAgeRaw = findPattern(/(?:age|patient\s*age)[\s:=]+(\d{1,3})/i);
            const doctorName = findPattern(/(?:dr\.?|doctor|physician|consultant)[\s:=]+([a-zA-Z\s.]{2,40})/i);
            const doctorReg = findPattern(/(?:reg(?:istration)?\.?\s*(?:no|num|#)?)[\s:=]+([a-zA-Z0-9\/-]{3,25})/i);
            const hospitalName = findPattern(/(?:hospital|clinic|medical\s*center|facility)[\s:=]+([a-zA-Z\s.]{3,50})/i);
            const bloodGroupRaw = findPattern(/(?:blood\s*group|blood\s*type|group)[\s:=]+([A-Za-z0-9_+-]{1,12})/i);
            const componentRaw = findPattern(/(?:component|blood\s*component|product)[\s:=]+([A-Za-z\s_]{3,30})/i);
            let unitsRaw = findPattern(/(?:units?|quantity|qty)[\s:=]+(\d{1,2})/i);
            if (unitsRaw === "NOT_FOUND") {
                const reverseUnits = fullText.match(/(\d{1,2})\s*(?:units?|bags?|pints?)/i);
                if (reverseUnits) {
                    unitsRaw = reverseUnits[1];
                }
            }
            const dateRaw = findPattern(/(?:date|dated|rx\s*date)[\s:=]+([0-9]{1,4}[-/.\s][0-9]{1,2}[-/.\s][0-9]{1,4})/i);
            const indications = findPattern(/(?:indication|diagnosis|clinical\s*notes?)[\s:=]+([a-zA-Z0-9\s,.-]{3,80})/i);

            // Signature indicator check: detects presence of signature block / seal line (does NOT authenticate)
            const hasSignatureIndicator = Boolean(
                fullText.match(/(?:signature|signed|doctor'?s\s*sign|authorized\s*signatory|m\.d\.|physician'?s\s*signature)/i)
            );

            const result: ExtractedPrescriptionData = {
                patientName: patientName !== "NOT_FOUND" ? patientName : this.fallbackFirstLineName(lines),
                patientAge: patientAgeRaw !== "NOT_FOUND" ? parseInt(patientAgeRaw, 10) : "NOT_FOUND",
                hospitalName,
                doctorName,
                doctorRegistration: doctorReg,
                bloodGroup: normalizeExtractedBloodGroup(bloodGroupRaw),
                bloodComponent: normalizeExtractedComponent(componentRaw),
                units: unitsRaw !== "NOT_FOUND" ? parseInt(unitsRaw, 10) : "NOT_FOUND",
                prescriptionDate: dateRaw,
                clinicalIndications: indications,
                hasSignatureIndicator,
            };
            return result;
        }

        if (documentType.toUpperCase() === "DIAGNOSTIC_REPORT") {
            const patientName = findPattern(/(?:patient\s*name|patient|name)[\s:=]+([a-zA-Z\s.]{2,40})/i);
            const patientIdRef = findPattern(/(?:patient\s*id|pid|uhid|ref\s*(?:no)?)[\s:=]+([a-zA-Z0-9\/-]{3,25})/i);
            const bloodGroupRaw = findPattern(/(?:blood\s*group|abo\s*group|group)[\s:=]+([A-Za-z0-9_+-]{1,12})/i);
            const rhFactorRaw = findPattern(/(?:rh\s*factor|rh\s*type|rh)[\s:=]+(positive|negative|\+|\-)/i);
            const reportDate = findPattern(/(?:date|tested\s*on|report\s*date)[\s:=]+([0-9]{1,4}[-/.\s][0-9]{1,2}[-/.\s][0-9]{1,4})/i);
            const laboratoryName = findPattern(/(?:lab(?:oratory)?|diagnostics?|pathology)[\s:=]+([a-zA-Z\s.]{3,50})/i);
            const crossmatch = findPattern(/(?:crossmatch|compatibility)[\s:=]+([a-zA-Z\s]{3,30})/i);

            let rh = "NOT_FOUND";
            if (rhFactorRaw !== "NOT_FOUND") {
                rh = rhFactorRaw.toLowerCase().includes("pos") || rhFactorRaw === "+" ? "POSITIVE" : "NEGATIVE";
            }

            const result: ExtractedDiagnosticData = {
                patientName: patientName !== "NOT_FOUND" ? patientName : this.fallbackFirstLineName(lines),
                patientIdRef,
                bloodGroup: normalizeExtractedBloodGroup(bloodGroupRaw),
                rhFactor: rh,
                reportDate,
                laboratoryName,
                crossmatchResult: crossmatch,
            };
            return result;
        }

        if (documentType.toUpperCase() === "CONSENT_FORM") {
            const patientName = findPattern(/(?:patient\s*name|patient|i,?\s*)[\s:=]+([a-zA-Z\s.]{2,40})/i);
            const hospitalName = findPattern(/(?:hospital|facility|medical\s*center)[\s:=]+([a-zA-Z\s.]{3,50})/i);
            const consentDate = findPattern(/(?:date|consented\s*on)[\s:=]+([0-9]{1,4}[-/.\s][0-9]{1,2}[-/.\s][0-9]{1,4})/i);
            const hasSignatureIndicator = Boolean(
                fullText.match(/(?:signature|signed|thumb\s*impression|patient'?s\s*sign|witness)/i)
            );

            const result: ExtractedConsentData = {
                patientName: patientName !== "NOT_FOUND" ? patientName : this.fallbackFirstLineName(lines),
                hospitalName,
                consentDate,
                hasSignatureIndicator,
            };
            return result;
        }

        return { rawTextSnippet: fullText.slice(0, 150) };
    }

    private static fallbackFirstLineName(lines: string[]): string {
        for (const l of lines.slice(0, 8)) {
            if (l.match(/(?:name|patient|pt)[\s:=]+/i)) {
                const parts = l.split(/[\s:=]+/);
                if (parts.length >= 2 && parts[1].length > 2) return parts.slice(1).join(" ").trim();
            }
        }
        return "NOT_FOUND";
    }

    /**
     * Cross-compares extracted document content against the blood requisition record
     * and companion documents.
     */
    public static compareDocumentData(params: {
        documentType: string;
        extractedData: Record<string, any>;
        bloodRequest: {
            requestid?: string;
            patientname: string;
            bloodgroup: string;
            bloodcomponent: string;
            unitsrequired: number;
            hospitalid?: string | null;
            hospitals?: { hospitalname?: string } | null;
            createdat?: Date | null;
        };
        companionDocumentsData?: Array<{ documentType: string; extractedData: Record<string, any> }>;
        ocrConfidence?: number;
    }): { discrepancies: VerificationDiscrepancy[]; status: "CONSISTENT" | "NEEDS_REVIEW" | "MISMATCH" } {
        const { documentType, extractedData, bloodRequest, companionDocumentsData = [], ocrConfidence } = params;
        const discrepancies: VerificationDiscrepancy[] = [];

        // 0. OCR Confidence Advisory
        if (ocrConfidence != null && ocrConfidence < 70) {
            discrepancies.push({
                field: "ocrConfidence",
                extractedValue: `${ocrConfidence}%`,
                expectedValue: ">= 70%",
                severity: "MEDIUM",
                reason: `Low OCR extraction confidence (${ocrConfidence}%). Image resolution or print quality may be compromised. Manual physical verification recommended.`,
                sourceDocument: documentType,
            });
        }

        // 1. Blood Group Comparison (CRITICAL SAFETY GATE)
        const docBloodGroup = extractedData.bloodGroup;
        if (docBloodGroup && docBloodGroup !== "NOT_FOUND") {
            const reqBloodGroup = bloodRequest.bloodgroup;
            if (docBloodGroup !== reqBloodGroup) {
                discrepancies.push({
                    field: "bloodGroup",
                    extractedValue: docBloodGroup,
                    expectedValue: reqBloodGroup,
                    severity: "HIGH",
                    reason: `Critical Discrepancy: ${documentType} specifies blood group ${docBloodGroup}, but requisition requests ${reqBloodGroup}. Immediate clinical review required.`,
                    sourceDocument: documentType,
                });
            }
        } else if (documentType.toUpperCase() === "PRESCRIPTION" || documentType.toUpperCase() === "DIAGNOSTIC_REPORT") {
            discrepancies.push({
                field: "bloodGroup",
                extractedValue: "NOT_FOUND",
                expectedValue: bloodRequest.bloodgroup,
                severity: "MEDIUM",
                reason: `Blood group could not be verified in ${documentType}. Physical document review recommended.`,
                sourceDocument: documentType,
            });
        }

        // 2. Patient Name Comparison
        const docPatientName = extractedData.patientName;
        if (docPatientName && docPatientName !== "NOT_FOUND") {
            const reqPatientName = bloodRequest.patientname;
            const nameCheck = comparePatientNames(docPatientName, reqPatientName);
            if (!nameCheck.matches) {
                discrepancies.push({
                    field: "patientName",
                    extractedValue: docPatientName,
                    expectedValue: reqPatientName,
                    severity: "HIGH",
                    reason: `Identity Mismatch: Document records patient "${docPatientName}", whereas blood request is for "${reqPatientName}".`,
                    sourceDocument: documentType,
                });
            } else if (nameCheck.similarity < 0.9) {
                discrepancies.push({
                    field: "patientName",
                    extractedValue: docPatientName,
                    expectedValue: reqPatientName,
                    severity: "LOW",
                    reason: `Minor Name Variation: Document records "${docPatientName}" (similarity: ${Math.round(nameCheck.similarity * 100)}%). Verify identity spelling.`,
                    sourceDocument: documentType,
                });
            }
        } else if (documentType.toUpperCase() === "PRESCRIPTION") {
            discrepancies.push({
                field: "patientName",
                extractedValue: "NOT_FOUND",
                expectedValue: bloodRequest.patientname,
                severity: "MEDIUM",
                reason: `Patient name could not be deciphered in ${documentType}. Physical confirmation required.`,
                sourceDocument: documentType,
            });
        }

        // 3. Blood Component Comparison
        const docComponent = extractedData.bloodComponent;
        if (docComponent && docComponent !== "NOT_FOUND") {
            const reqComponent = bloodRequest.bloodcomponent;
            if (docComponent !== reqComponent) {
                discrepancies.push({
                    field: "bloodComponent",
                    extractedValue: docComponent,
                    expectedValue: reqComponent,
                    severity: "HIGH",
                    reason: `Clinical Component Contradiction: Document specifies ${docComponent}, but requisition requested ${reqComponent}.`,
                    sourceDocument: documentType,
                });
            }
        }

        // 4. Units Requested Comparison
        const docUnits = extractedData.units;
        if (docUnits !== undefined && docUnits !== "NOT_FOUND") {
            const reqUnits = bloodRequest.unitsrequired;
            const parsedDocUnits = Number(docUnits);
            if (!isNaN(parsedDocUnits) && parsedDocUnits !== reqUnits) {
                discrepancies.push({
                    field: "units",
                    extractedValue: String(parsedDocUnits),
                    expectedValue: String(reqUnits),
                    severity: "MEDIUM",
                    reason: `Quantity Discrepancy: Document specifies ${parsedDocUnits} unit(s), whereas requisition is for ${reqUnits} unit(s).`,
                    sourceDocument: documentType,
                });
            }
        }

        // 5. Date Inconsistency Check (future date check; no hardcoded 30-day invalidation rule)
        const docDateStr = extractedData.prescriptionDate || extractedData.reportDate || extractedData.consentDate;
        if (docDateStr && docDateStr !== "NOT_FOUND") {
            const parsedDate = new Date(docDateStr);
            if (isNaN(parsedDate.getTime())) {
                discrepancies.push({
                    field: "documentDate",
                    extractedValue: docDateStr,
                    expectedValue: "Valid clinical date",
                    severity: "LOW",
                    reason: `Document date "${docDateStr}" could not be parsed as a standard calendar date.`,
                    sourceDocument: documentType,
                });
            } else if (parsedDate.getTime() > Date.now() + 86400000) {
                discrepancies.push({
                    field: "documentDate",
                    extractedValue: parsedDate.toISOString().split("T")[0],
                    expectedValue: "Non-future date",
                    severity: "MEDIUM",
                    reason: `Document date ${parsedDate.toISOString().split("T")[0]} is in the future.`,
                    sourceDocument: documentType,
                });
            }
        }

        // 6. Cross-Document Comparisons (e.g. Prescription vs Diagnostic Report)
        for (const comp of companionDocumentsData) {
            if (comp.extractedData.bloodGroup && comp.extractedData.bloodGroup !== "NOT_FOUND" && docBloodGroup && docBloodGroup !== "NOT_FOUND") {
                if (comp.extractedData.bloodGroup !== docBloodGroup) {
                    discrepancies.push({
                        field: "bloodGroup_crossDoc",
                        extractedValue: `${documentType} (${docBloodGroup})`,
                        expectedValue: `${comp.documentType} (${comp.extractedData.bloodGroup})`,
                        severity: "HIGH",
                        reason: `Cross-Document Conflict: ${documentType} records ${docBloodGroup}, conflicting with ${comp.documentType} which records ${comp.extractedData.bloodGroup}.`,
                        sourceDocument: `${documentType} vs ${comp.documentType}`,
                    });
                }
            }

            if (comp.extractedData.patientName && comp.extractedData.patientName !== "NOT_FOUND" && docPatientName && docPatientName !== "NOT_FOUND") {
                const crossNameCheck = comparePatientNames(docPatientName, comp.extractedData.patientName);
                if (!crossNameCheck.matches) {
                    discrepancies.push({
                        field: "patientName_crossDoc",
                        extractedValue: `${documentType} (${docPatientName})`,
                        expectedValue: `${comp.documentType} (${comp.extractedData.patientName})`,
                        severity: "HIGH",
                        reason: `Cross-Document Patient Mismatch: ${documentType} records "${docPatientName}", whereas ${comp.documentType} records "${comp.extractedData.patientName}".`,
                        sourceDocument: `${documentType} vs ${comp.documentType}`,
                    });
                }
            }
        }

        // Status Determination
        const hasHigh = discrepancies.some((d) => d.severity === "HIGH");
        const hasMediumOrLow = discrepancies.some((d) => d.severity === "MEDIUM" || d.severity === "LOW");

        let status: "CONSISTENT" | "NEEDS_REVIEW" | "MISMATCH";
        if (hasHigh) {
            status = "MISMATCH";
        } else if (hasMediumOrLow) {
            status = "NEEDS_REVIEW";
        } else {
            status = "CONSISTENT";
        }

        return { discrepancies, status };
    }

    /**
     * Executes AI verification for a specific document.
     * Extracts text, extracts structured fields, compares against request and companion docs,
     * and persists verification record.
     */
    public static async verifyDocument(params: {
        requestId: string;
        documentId: string;
    }): Promise<DocumentVerificationReport> {
        const { requestId, documentId } = params;

        // 1. Fetch document and blood request
        const doc = await prisma.requestdocuments.findFirst({
            where: { documentid: documentId, requestid: requestId },
            include: {
                bloodrequests: {
                    select: {
                        requestid: true,
                        patientname: true,
                        bloodgroup: true,
                        bloodcomponent: true,
                        unitsrequired: true,
                        hospitalid: true,
                        createdat: true,
                        hospitals: { select: { hospitalname: true } },
                    },
                },
            },
        });

        if (!doc) {
            throw Object.assign(new Error("Document not found for verification"), { statusCode: 404 });
        }

        // 2. Extract raw text using OcrEngineService (PDF or Tesseract OCR)
        const extraction: ExtractedDocumentContent = await OcrEngineService.extractContent(
            doc.filepath,
            doc.mimetype
        );

        if (extraction.extractionMethod === "FAILED" || (!extraction.rawText && extraction.error)) {
            // Processing failure record
            return await this.saveVerificationRecord({
                requestId,
                documentId,
                documentVersion: doc.version,
                documentType: doc.documenttype,
                fileHash: doc.filehash,
                verificationStatus: "PROCESSING_FAILED",
                ocrConfidence: 0,
                extractedData: { error: extraction.error || "Unable to extract readable content" },
                discrepancies: [],
                summary: `Document extraction failed: ${extraction.error || "No text readable"}`,
                processingError: extraction.error || "OCR extraction failure",
            });
        }

        // 3. Extract structured schema
        const structured = this.extractStructuredData(extraction.rawText, doc.documenttype);

        // 4. Fetch companion documents for cross-document validation
        const companionDocs = await prisma.requestdocuments.findMany({
            where: {
                requestid: requestId,
                documentid: { not: documentId },
            },
            include: {
                documentverifications: {
                    where: { iscurrentversion: true },
                    orderBy: { createdat: "desc" },
                    take: 1,
                },
            },
        });

        const companionData: Array<{ documentType: string; extractedData: Record<string, any> }> = [];
        for (const comp of companionDocs) {
            const latestVer = comp.documentverifications[0];
            if (latestVer && latestVer.extracteddata && typeof latestVer.extracteddata === "object") {
                companionData.push({
                    documentType: comp.documenttype,
                    extractedData: latestVer.extracteddata as Record<string, any>,
                });
            }
        }

        // 5. Compare fields and identify discrepancies
        const comparison = this.compareDocumentData({
            documentType: doc.documenttype,
            extractedData: structured,
            bloodRequest: doc.bloodrequests,
            companionDocumentsData: companionData,
        });

        let finalStatus = comparison.status;
        // If confidence is very low (< 60%), downgrade CONSISTENT to NEEDS_REVIEW
        if (finalStatus === "CONSISTENT" && extraction.confidence < 60) {
            finalStatus = "NEEDS_REVIEW";
        }

        const summary =
            finalStatus === "CONSISTENT"
                ? `Information in ${doc.documenttype} is consistent with blood requisition. No discrepancies identified.`
                : finalStatus === "MISMATCH"
                ? `Discrepancies identified in ${doc.documenttype} requiring authorized clinical review.`
                : `Document contains fields requiring reviewer inspection or moderate OCR confidence.`;

        // 6. Persist verification record
        return await this.saveVerificationRecord({
            requestId,
            documentId,
            documentVersion: doc.version,
            documentType: doc.documenttype,
            fileHash: doc.filehash,
            verificationStatus: finalStatus,
            ocrConfidence: extraction.confidence,
            extractedData: structured,
            discrepancies: comparison.discrepancies,
            summary,
            processingError: null,
        });
    }

    /**
     * Persists verification report, marking previous verification records for this document historical.
     */
    private static async saveVerificationRecord(params: {
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
    }): Promise<DocumentVerificationReport> {
        // Mark previous records for this document historical
        await prisma.documentverifications.updateMany({
            where: { documentid: params.documentId, iscurrentversion: true },
            data: { iscurrentversion: false },
        });

        const created = await prisma.documentverifications.create({
            data: {
                requestid: params.requestId,
                documentid: params.documentId,
                documentversion: params.documentVersion,
                documenttype: params.documentType,
                filehash: params.fileHash,
                verificationstatus: params.verificationStatus,
                ocrconfidence: params.ocrConfidence,
                extracteddata: params.extractedData,
                discrepancies: params.discrepancies as any,
                summary: params.summary,
                processingerror: params.processingError,
                iscurrentversion: true,
            },
        });

        return {
            verificationId: created.verificationid,
            requestId: created.requestid,
            documentId: created.documentid,
            documentVersion: created.documentversion,
            documentType: created.documenttype,
            fileHash: created.filehash,
            verificationStatus: created.verificationstatus as any,
            ocrConfidence: Number(created.ocrconfidence || 0),
            extractedData: created.extracteddata as Record<string, any>,
            discrepancies: (created.discrepancies as any) || [],
            summary: created.summary || "",
            processingError: created.processingerror,
            isCurrentVersion: created.iscurrentversion,
            reviewerDecision: created.reviewerdecision,
            reviewerRemarks: created.reviewerremarks,
            reviewedByUserId: created.reviewedbyuserid,
            reviewedAt: created.reviewedat,
            createdAt: created.createdat || new Date(),
            updatedAt: created.updatedat || new Date(),
        };
    }

    /**
     * Records an authorized human reviewer decision and creates an append-only audit record.
     */
    public static async recordReviewerDecision(params: {
        verificationId: string;
        reviewerUserId: string;
        reviewerRole: string;
        decision: "VERIFIED_MANUAL" | "CORRECTION_REQUIRED" | "ADDITIONAL_INFO_REQUIRED" | "ESCALATED";
        remarks?: string;
    }) {
        const { verificationId, reviewerUserId, reviewerRole, decision, remarks } = params;

        // Authorization check: Must be ADMIN or BLOOD_BANK or authorized clinical reviewer
        if (!["ADMIN", "BLOOD_BANK", "HOSPITAL"].includes(reviewerRole)) {
            throw Object.assign(new Error("Unauthorized: Only authorized clinical reviewers may record verification decisions"), {
                statusCode: 403,
            });
        }

        const verification = await prisma.documentverifications.findUnique({
            where: { verificationid: verificationId },
            include: {
                requestdocuments: true,
            },
        });

        if (!verification) {
            throw Object.assign(new Error("Verification record not found"), { statusCode: 404 });
        }

        const previousStatus = verification.verificationstatus;
        const newStatus =
            decision === "VERIFIED_MANUAL"
                ? "CONSISTENT"
                : decision === "CORRECTION_REQUIRED" || decision === "ESCALATED"
                ? "MISMATCH"
                : "NEEDS_REVIEW";

        const result = await prisma.$transaction(async (tx) => {
            // 1. Update verification record with human decision
            const updated = await tx.documentverifications.update({
                where: { verificationid: verificationId },
                data: {
                    verificationstatus: newStatus,
                    reviewerdecision: decision,
                    reviewerremarks: remarks || null,
                    reviewedbyuserid: reviewerUserId,
                    reviewedat: new Date(),
                    updatedat: new Date(),
                },
            });

            // 2. Append-only audit record
            await tx.documentreviewaudit.create({
                data: {
                    verificationid: verificationId,
                    documentid: verification.documentid,
                    documentversion: verification.documentversion,
                    requestid: verification.requestid,
                    revieweruserid: reviewerUserId,
                    previousstatus: previousStatus,
                    newstatus: newStatus,
                    decision,
                    remarks: remarks || null,
                },
            });

            return updated;
        });

        return result;
    }

    /**
     * Generates a comprehensive verification report for all supporting documents attached to a requisition.
     */
    public static async getRequestVerificationReport(requestId: string) {
        const docs = await prisma.requestdocuments.findMany({
            where: { requestid: requestId },
            include: {
                documentverifications: {
                    where: { iscurrentversion: true },
                    include: {
                        reviewedby: { select: { userid: true, name: true, role: true } },
                        reviewaudits: {
                            orderBy: { createdat: "desc" },
                            include: { reviewer: { select: { name: true, role: true } } },
                        },
                    },
                },
            },
        });

        const reports: DocumentVerificationReport[] = [];
        let overallStatus: "CONSISTENT" | "NEEDS_REVIEW" | "MISMATCH" | "PROCESSING_FAILED" = "CONSISTENT";

        for (const d of docs) {
            const ver = d.documentverifications[0];
            if (ver) {
                reports.push({
                    verificationId: ver.verificationid,
                    requestId: ver.requestid,
                    documentId: ver.documentid,
                    documentVersion: ver.documentversion,
                    documentType: ver.documenttype,
                    fileHash: ver.filehash,
                    verificationStatus: ver.verificationstatus as any,
                    ocrConfidence: Number(ver.ocrconfidence || 0),
                    extractedData: (ver.extracteddata as Record<string, any>) || {},
                    discrepancies: (ver.discrepancies as any) || [],
                    summary: ver.summary || "",
                    processingError: ver.processingerror,
                    isCurrentVersion: ver.iscurrentversion,
                    reviewerDecision: ver.reviewerdecision,
                    reviewerRemarks: ver.reviewerremarks,
                    reviewedByUserId: ver.reviewedbyuserid,
                    reviewedAt: ver.reviewedat,
                    createdAt: ver.createdat || new Date(),
                    updatedAt: ver.updatedat || new Date(),
                });

                if (ver.verificationstatus === "MISMATCH") overallStatus = "MISMATCH";
                else if (ver.verificationstatus === "NEEDS_REVIEW" && overallStatus !== "MISMATCH") overallStatus = "NEEDS_REVIEW";
                else if (ver.verificationstatus === "PROCESSING_FAILED" && overallStatus !== "MISMATCH") overallStatus = "PROCESSING_FAILED";
            }
        }

        return {
            requestId,
            totalDocuments: docs.length,
            verifiedDocuments: reports.length,
            overallStatus,
            reports,
        };
    }
}
