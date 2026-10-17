import path from "path";
import fs from "fs";

export interface FileValidationResult {
    valid: boolean;
    error?: string;
    detectedMimeType?: string;
    detectedExtension?: string;
}

export const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Validates a file buffer using file signatures (magic numbers)
 * to prevent spoofed extensions/MIME types.
 *
 * Supported Signatures:
 * - PDF: %PDF (0x25, 0x50, 0x44, 0x46)
 * - JPEG: 0xFF, 0xD8, 0xFF
 * - PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
 */
export function validatePrescriptionFile(
    fileBuffer: Buffer,
    originalName: string,
    declaredMimeType?: string
): FileValidationResult {
    if (!fileBuffer || fileBuffer.length === 0) {
        return { valid: false, error: "Prescription file is empty or missing" };
    }

    if (fileBuffer.length > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds the 5 MB limit (file size: ${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB)`,
        };
    }

    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return {
            valid: false,
            error: `Invalid file extension "${ext}". Allowed formats are: PDF, JPEG, JPG, PNG`,
        };
    }

    // Inspect file signature (magic bytes)
    let detectedMimeType: string | null = null;
    let detectedExtension: string | null = null;

    // Check PDF: 0x25, 0x50, 0x44, 0x46 (%PDF)
    if (
        fileBuffer.length >= 4 &&
        fileBuffer[0] === 0x25 &&
        fileBuffer[1] === 0x50 &&
        fileBuffer[2] === 0x44 &&
        fileBuffer[3] === 0x46
    ) {
        detectedMimeType = "application/pdf";
        detectedExtension = ".pdf";
    }
    // Check JPEG: 0xFF, 0xD8, 0xFF
    else if (
        fileBuffer.length >= 3 &&
        fileBuffer[0] === 0xff &&
        fileBuffer[1] === 0xd8 &&
        fileBuffer[2] === 0xff
    ) {
        detectedMimeType = "image/jpeg";
        detectedExtension = ext === ".jpeg" ? ".jpeg" : ".jpg";
    }
    // Check PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    else if (
        fileBuffer.length >= 8 &&
        fileBuffer[0] === 0x89 &&
        fileBuffer[1] === 0x50 &&
        fileBuffer[2] === 0x4e &&
        fileBuffer[3] === 0x47 &&
        fileBuffer[4] === 0x0d &&
        fileBuffer[5] === 0x0a &&
        fileBuffer[6] === 0x1a &&
        fileBuffer[7] === 0x0a
    ) {
        detectedMimeType = "image/png";
        detectedExtension = ".png";
    }

    if (!detectedMimeType) {
        return {
            valid: false,
            error: "Invalid file signature. The file content does not match a valid PDF, JPEG, or PNG document.",
        };
    }

    // Verify declared extension matches detected magic byte signature
    const isPdfMatch = detectedMimeType === "application/pdf" && ext === ".pdf";
    const isJpegMatch = detectedMimeType === "image/jpeg" && (ext === ".jpg" || ext === ".jpeg");
    const isPngMatch = detectedMimeType === "image/png" && ext === ".png";

    if (!isPdfMatch && !isJpegMatch && !isPngMatch) {
        return {
            valid: false,
            error: `File signature mismatch. The extension "${ext}" does not match the actual file format (${detectedMimeType}).`,
        };
    }

    return {
        valid: true,
        detectedMimeType,
        detectedExtension: detectedExtension || ext,
    };
}

/**
 * Ensures private storage directory exists.
 */
export function getPrescriptionStorageDir(): string {
    const dir = path.resolve(process.cwd(), "uploads", "prescriptions");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
