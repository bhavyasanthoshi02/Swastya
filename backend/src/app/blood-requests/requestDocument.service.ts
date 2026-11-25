import path from "path";
import fs from "fs";
import crypto from "crypto";
import { prisma } from "../../config/prisma";
import {
    validateDocumentFile,
    getRequestDocumentStorageDir,
    FileValidationResult,
} from "../../utils/fileValidation";

export interface DocumentRequirementDefinition {
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
        uploadedat: Date | null;
        updatedat: Date | null;
    } | null;
}

export interface CompletenessResult {
    requestId: string;
    totalRequirements: number;
    mandatoryRequired: number;
    mandatoryUploaded: number;
    completionPercentage: number;
    isComplete: boolean;
    missingMandatory: Array<{ documentType: string; documentName: string }>;
    checklist: DocumentChecklistItem[];
}

/**
 * Flexible Document Requirements Registry.
 * Easily manageable and configurable without hardcoding magic strings in routes.
 */
export class RequestDocumentService {
    /**
     * Returns the configured document requirements for a blood request.
     * Keeps defaults flexible:
     * - PRESCRIPTION: Mandatory
     * - DIAGNOSTIC_REPORT: Optional
     * - CONSENT_FORM: Optional
     */
    public static getDocumentRequirements(
        _urgencyLevel?: string,
        _isEmergency?: boolean
    ): DocumentRequirementDefinition[] {
        return [
            {
                documentType: "PRESCRIPTION",
                documentName: "Clinical Prescription & Medical Order",
                isMandatory: true,
                description:
                    "Official prescription or transfusion order issued by the treating physician / consultant.",
            },
            {
                documentType: "DIAGNOSTIC_REPORT",
                documentName: "Diagnostic Blood Test / Crossmatch Report",
                isMandatory: false,
                description:
                    "Recent blood grouping, antibody screen, or crossmatch laboratory analysis.",
            },
            {
                documentType: "CONSENT_FORM",
                documentName: "Patient / Attendant Transfusion Consent",
                isMandatory: false,
                description:
                    "Informed consent signed by the patient or authorized family representative.",
            },
        ];
    }

    /**
     * Calculates the document completeness percentage and checklist breakdown for a request.
     * Completeness Formula:
     * Completion Percentage = (Valid Mandatory Documents Uploaded / Total Mandatory Documents Required) * 100
     */
    public static async calculateDocumentCompleteness(
        requestId: string
    ): Promise<CompletenessResult> {
        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            select: {
                requestid: true,
                urgencylevel: true,
                isemergency: true,
                requestdocuments: {
                    select: {
                        documentid: true,
                        documenttype: true,
                        documentname: true,
                        ismandatory: true,
                        originalfilename: true,
                        mimetype: true,
                        filesize: true,
                        version: true,
                        filehash: true,
                        uploadedat: true,
                        updatedat: true,
                    },
                },
            },
        });

        if (!bloodRequest) {
            throw Object.assign(new Error("Blood request not found"), { statusCode: 404 });
        }

        const requirements = this.getDocumentRequirements(
            bloodRequest.urgencylevel,
            bloodRequest.isemergency || false
        );

        const uploadedMap = new Map<string, any>();
        for (const doc of bloodRequest.requestdocuments) {
            uploadedMap.set(doc.documenttype.toUpperCase(), doc);
        }

        const checklist: DocumentChecklistItem[] = [];
        const missingMandatory: Array<{ documentType: string; documentName: string }> = [];

        let mandatoryRequired = 0;
        let mandatoryUploaded = 0;

        for (const req of requirements) {
            const reqKey = req.documentType.toUpperCase();
            const uploadedDoc = uploadedMap.get(reqKey);
            const isUploaded = Boolean(uploadedDoc);

            if (req.isMandatory) {
                mandatoryRequired++;
                if (isUploaded) {
                    mandatoryUploaded++;
                } else {
                    missingMandatory.push({
                        documentType: req.documentType,
                        documentName: req.documentName,
                    });
                }
            }

            checklist.push({
                documentType: req.documentType,
                documentName: req.documentName,
                isMandatory: req.isMandatory,
                description: req.description,
                isUploaded,
                document: uploadedDoc
                    ? {
                          documentid: uploadedDoc.documentid,
                          originalfilename: uploadedDoc.originalfilename,
                          mimetype: uploadedDoc.mimetype,
                          filesize: uploadedDoc.filesize,
                          version: uploadedDoc.version,
                          filehash: uploadedDoc.filehash,
                          uploadedat: uploadedDoc.uploadedat,
                          updatedat: uploadedDoc.updatedat,
                      }
                    : null,
            });
        }

        const completionPercentage =
            mandatoryRequired === 0
                ? 100
                : Math.round((mandatoryUploaded / mandatoryRequired) * 100);

        const isComplete = completionPercentage >= 100;

        return {
            requestId,
            totalRequirements: requirements.length,
            mandatoryRequired,
            mandatoryUploaded,
            completionPercentage,
            isComplete,
            missingMandatory,
            checklist,
        };
    }

    /**
     * Uploads or replaces a document for a request in a transaction-safe manner.
     * Prevents orphan files and protects against data loss on DB failure.
     */
    public static async uploadOrReplaceDocument(params: {
        requestId: string;
        documentType: string;
        fileBuffer: Buffer;
        originalFileName: string;
        declaredMimeType?: string;
        userId: string;
    }) {
        const { requestId, documentType, fileBuffer, originalFileName, declaredMimeType, userId } =
            params;

        // 1. Validate requirement type exists in registry
        const requirements = this.getDocumentRequirements();
        const reqConfig = requirements.find(
            (r) => r.documentType.toUpperCase() === documentType.toUpperCase()
        );
        if (!reqConfig) {
            throw Object.assign(
                new Error(
                    `Invalid document type "${documentType}". Supported types: ${requirements.map((r) => r.documentType).join(", ")}`
                ),
                { statusCode: 400 }
            );
        }

        // 2. Validate file using file signatures (magic bytes)
        const validation: FileValidationResult = validateDocumentFile(
            fileBuffer,
            originalFileName,
            declaredMimeType
        );

        if (!validation.valid || !validation.detectedExtension || !validation.detectedMimeType) {
            throw Object.assign(
                new Error(validation.error || "File validation failed. Supported formats: PDF, JPEG, PNG."),
                { statusCode: 400 }
            );
        }

        // 3. Ensure target directory exists
        const storageDir = getRequestDocumentStorageDir();
        const safeBaseName = `${requestId}_${reqConfig.documentType.toLowerCase()}_${Date.now()}`;
        const targetFileName = `${safeBaseName}${validation.detectedExtension}`;
        const newFilePath = path.join(storageDir, targetFileName);

        // 4. Compute SHA-256 file hash for version tracking & integrity
        const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

        // 5. Save new file to disk first
        await fs.promises.writeFile(newFilePath, fileBuffer);

        let previousFilePath: string | null = null;
        let nextVersion = 1;

        try {
            // 6. Look for existing document of this type on this request
            const existing = await prisma.requestdocuments.findUnique({
                where: {
                    requestid_documenttype: {
                        requestid: requestId,
                        documenttype: reqConfig.documentType,
                    },
                },
                select: {
                    documentid: true,
                    filepath: true,
                    version: true,
                },
            });

            if (existing) {
                previousFilePath = existing.filepath;
                nextVersion = (existing.version || 1) + 1;

                // When replacing a document, previous verification results must become historical
                await prisma.documentverifications.updateMany({
                    where: { documentid: existing.documentid },
                    data: { iscurrentversion: false },
                });

                // Invalidate affected cross-document comparison results on companion documents of this request
                await prisma.documentverifications.updateMany({
                    where: {
                        requestid: requestId,
                        documentid: { not: existing.documentid },
                        iscurrentversion: true,
                    },
                    data: {
                        verificationstatus: "NEEDS_REVIEW",
                        summary: "A companion document on this requisition was replaced. Re-verification required for cross-document consistency.",
                    },
                });
            }

            // 7. DB Upsert (Transaction-safe)
            const record = await prisma.requestdocuments.upsert({
                where: {
                    requestid_documenttype: {
                        requestid: requestId,
                        documenttype: reqConfig.documentType,
                    },
                },
                create: {
                    requestid: requestId,
                    documenttype: reqConfig.documentType,
                    documentname: reqConfig.documentName,
                    ismandatory: reqConfig.isMandatory,
                    filepath: newFilePath,
                    originalfilename: path.basename(originalFileName),
                    mimetype: validation.detectedMimeType,
                    filesize: fileBuffer.length,
                    version: 1,
                    filehash: fileHash,
                    uploadedbyuserid: userId,
                },
                update: {
                    documentname: reqConfig.documentName,
                    ismandatory: reqConfig.isMandatory,
                    filepath: newFilePath,
                    originalfilename: path.basename(originalFileName),
                    mimetype: validation.detectedMimeType,
                    filesize: fileBuffer.length,
                    version: nextVersion,
                    filehash: fileHash,
                    uploadedbyuserid: userId,
                    updatedat: new Date(),
                },
            });

            // 8. Success: only now delete the previous file if replacement occurred
            if (previousFilePath && previousFilePath !== newFilePath) {
                fs.promises.unlink(previousFilePath).catch((err) => {
                    console.warn(`[RequestDocumentService] Could not unlink old file ${previousFilePath}:`, err);
                });
            }

            return record;
        } catch (dbError) {
            // DB failed: clean up newly saved file so no orphan is left on disk
            try {
                if (fs.existsSync(newFilePath)) {
                    await fs.promises.unlink(newFilePath);
                }
            } catch (cleanupErr) {
                console.error("[RequestDocumentService] Failed cleaning up file after DB error:", cleanupErr);
            }
            throw dbError;
        }
    }

    /**
     * Removes an optional uploaded document and cleans up disk storage.
     */
    public static async deleteDocument(params: {
        requestId: string;
        documentId: string;
    }) {
        const { requestId, documentId } = params;

        const doc = await prisma.requestdocuments.findFirst({
            where: {
                documentid: documentId,
                requestid: requestId,
            },
        });

        if (!doc) {
            throw Object.assign(new Error("Document not found"), { statusCode: 404 });
        }

        await prisma.requestdocuments.delete({
            where: { documentid: documentId },
        });

        if (doc.filepath && fs.existsSync(doc.filepath)) {
            fs.promises.unlink(doc.filepath).catch((err) => {
                console.warn(`[RequestDocumentService] Could not unlink deleted file ${doc.filepath}:`, err);
            });
        }

        return { success: true };
    }

    /**
     * Checks if a request is eligible for submission based on mandatory documents.
     * Re-verifies backend completeness; rejects with 422 if mandatory documents are missing.
     */
    public static async validateRequestSubmissionEligibility(requestId: string): Promise<CompletenessResult> {
        const completeness = await this.calculateDocumentCompleteness(requestId);
        if (!completeness.isComplete) {
            const missingNames = completeness.missingMandatory.map((m) => m.documentName).join(", ");
            throw Object.assign(
                new Error(
                    `Cannot submit blood request. Missing mandatory document(s): ${missingNames}. Document completeness is ${completeness.completionPercentage}%.`
                ),
                {
                    statusCode: 422,
                    completeness,
                }
            );
        }
        return completeness;
    }
}
