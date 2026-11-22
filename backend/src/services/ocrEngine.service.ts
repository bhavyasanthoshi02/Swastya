import fs from "fs";
import path from "path";
// pdf-parse uses CommonJS default export or object export
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");
import { createWorker, Worker } from "tesseract.js";

export interface ExtractedDocumentContent {
    rawText: string;
    confidence: number; // 0 to 100
    isScanned: boolean;
    pageCount: number;
    extractionMethod: "PDF_DIGITAL" | "TESSERACT_OCR" | "FAILED";
    error?: string;
}

/**
 * Modular OCR and Document Content Extraction Engine.
 * Extracts text and metadata from digitally generated and scanned PDFs, as well as JPEG and PNG images.
 * Keeps processing 100% local with zero transmission of Protected Health Information (PHI) to third parties.
 */
export class OcrEngineService {
    /**
     * Currently validated and supported OCR language models.
     * NOTE: Only English ("eng") is validated for clinical document processing.
     * Multilingual OCR (such as Hindi "hin" or Telugu "tel") is NOT yet validated and
     * must not be claimed as supported until regional traineddata models are provisioned
     * and rigorously tested on clinical typography. Documents in unvalidated languages
     * will produce low recognition scores or UNREADABLE / NEEDS_REVIEW status.
     */
    public static readonly SUPPORTED_OCR_LANGUAGES = ["eng"] as const;

    private static tesseractWorker: Worker | null = null;

    /**
     * Extracts text from a document on disk or in-memory buffer.
     */
    public static async extractContent(
        filePathOrBuffer: string | Buffer,
        mimetype: string
    ): Promise<ExtractedDocumentContent> {
        let buffer: Buffer;
        if (typeof filePathOrBuffer === "string") {
            if (!fs.existsSync(filePathOrBuffer)) {
                return {
                    rawText: "",
                    confidence: 0,
                    isScanned: false,
                    pageCount: 0,
                    extractionMethod: "FAILED",
                    error: `File not found on storage: ${filePathOrBuffer}`,
                };
            }
            buffer = await fs.promises.readFile(filePathOrBuffer);
        } else {
            buffer = filePathOrBuffer;
        }

        if (!buffer || buffer.length === 0) {
            return {
                rawText: "",
                confidence: 0,
                isScanned: false,
                pageCount: 0,
                extractionMethod: "FAILED",
                error: "Document buffer is empty",
            };
        }

        const isPdf =
            mimetype === "application/pdf" ||
            (buffer.length >= 4 &&
                buffer[0] === 0x25 &&
                buffer[1] === 0x50 &&
                buffer[2] === 0x44 &&
                buffer[3] === 0x46);

        if (isPdf) {
            return this.extractFromPdf(buffer);
        }

        const isImage =
            mimetype.startsWith("image/") ||
            (buffer[0] === 0xff && buffer[1] === 0xd8) || // JPEG
            (buffer[0] === 0x89 && buffer[1] === 0x50); // PNG

        if (isImage) {
            return this.extractFromImage(buffer);
        }

        return {
            rawText: "",
            confidence: 0,
            isScanned: false,
            pageCount: 0,
            extractionMethod: "FAILED",
            error: `Unsupported MIME type for document extraction: ${mimetype}`,
        };
    }

    /**
     * Extracts text from a PDF document.
     * Differentiates between digitally generated PDFs (embedded text layers)
     * and scanned image-based PDFs.
     */
    private static async extractFromPdf(buffer: Buffer): Promise<ExtractedDocumentContent> {
        try {
            let text = "";
            let pageCount = 1;

            if (typeof pdfParse === "function") {
                const pdfData = await pdfParse(buffer);
                text = (pdfData?.text || "").trim();
                pageCount = pdfData?.numpages || 1;
            } else if (pdfParse?.PDFParse) {
                const parser = new pdfParse.PDFParse({ data: buffer });
                const res = await parser.getText();
                text = (res?.text || "").trim();
                pageCount = res?.total || res?.pages?.length || 1;
            } else if (pdfParse?.default && typeof pdfParse.default === "function") {
                const pdfData = await pdfParse.default(buffer);
                text = (pdfData?.text || "").trim();
                pageCount = pdfData?.numpages || 1;
            }

            // If digital text layer contains meaningful characters
            if (text.length >= 15) {
                // Calculate character decoding fidelity score (ratio of printable standard chars to total non-whitespace chars)
                const nonWhitespace = text.replace(/\s+/g, "");
                const validChars = text.match(/[a-zA-Z0-9.,/#!$%^&*;:{}=\-_`~()@+\-]/g) || [];
                const decodingFidelity = nonWhitespace.length > 0
                    ? Math.min(100, Math.max(50, Math.round((validChars.length / nonWhitespace.length) * 100)))
                    : 90;

                return {
                    rawText: text,
                    confidence: decodingFidelity,
                    isScanned: false,
                    pageCount,
                    extractionMethod: "PDF_DIGITAL",
                };
            }

            // Scanned PDF (no embedded text layer) -> Render pages into images and process via Tesseract OCR
            return await this.ocrScannedPdf(buffer, pageCount);
        } catch (err: any) {
            return {
                rawText: "",
                confidence: 0,
                isScanned: true,
                pageCount: 1,
                extractionMethod: "FAILED",
                error: `PDF parsing error: ${err.message || err}`,
            };
        }
    }

    /**
     * Genuine OCR processor for scanned PDFs.
     * Renders each PDF page into a high-resolution image buffer and processes
     * each rendered page through the local Tesseract OCR engine.
     */
    private static async ocrScannedPdf(
        buffer: Buffer,
        pageCount: number
    ): Promise<ExtractedDocumentContent> {
        try {
            if (!pdfParse?.PDFParse) {
                return {
                    rawText: "",
                    confidence: 0,
                    isScanned: true,
                    pageCount,
                    extractionMethod: "FAILED",
                    error: "PDF page rendering engine is not available",
                };
            }

            const parser = new pdfParse.PDFParse({ data: buffer });
            const screenshot = await parser.getScreenshot({ imageBuffer: true, scale: 2.0 });

            if (!screenshot.pages || screenshot.pages.length === 0) {
                return {
                    rawText: "",
                    confidence: 0,
                    isScanned: true,
                    pageCount,
                    extractionMethod: "FAILED",
                    error: "Could not render scanned PDF pages into images",
                };
            }

            const worker = await this.getTesseractWorker();
            const pageTexts: string[] = [];
            const pageConfidences: number[] = [];

            for (const page of screenshot.pages) {
                if (page.data && page.data.length > 0) {
                    const pageBuffer = Buffer.from(page.data);
                    const ocrRes = await worker.recognize(pageBuffer);
                    const pageText = (ocrRes?.data?.text || "").trim();
                    if (pageText.length > 0) {
                        pageTexts.push(pageText);
                    }
                    if (typeof ocrRes?.data?.confidence === "number") {
                        pageConfidences.push(ocrRes.data.confidence);
                    }
                }
            }

            const aggregatedText = pageTexts.join("\n\n").trim();
            const avgConfidence = pageConfidences.length > 0
                ? pageConfidences.reduce((a, b) => a + b, 0) / pageConfidences.length
                : 0;

            if (aggregatedText.length === 0) {
                return {
                    rawText: "",
                    confidence: 0,
                    isScanned: true,
                    pageCount: screenshot.pages.length,
                    extractionMethod: "TESSERACT_OCR",
                    error: "No readable text detected on scanned PDF pages by OCR",
                };
            }

            return {
                rawText: aggregatedText,
                confidence: Math.round(avgConfidence * 10) / 10,
                isScanned: true,
                pageCount: screenshot.pages.length,
                extractionMethod: "TESSERACT_OCR",
            };
        } catch (err: any) {
            return {
                rawText: "",
                confidence: 0,
                isScanned: true,
                pageCount,
                extractionMethod: "FAILED",
                error: `Scanned PDF OCR failed: ${err?.message || err}`,
            };
        }
    }

    /**
     * Extracts text from image documents using Tesseract OCR.
     */
    private static async extractFromImage(
        buffer: Buffer,
        fromPdf = false
    ): Promise<ExtractedDocumentContent> {
        try {
            const worker = await this.getTesseractWorker();
            const result = await worker.recognize(buffer);
            const text = (result?.data?.text || "").trim();
            const confidence = typeof result?.data?.confidence === "number"
                ? Math.min(100, Math.max(0, result.data.confidence))
                : 70.0;

            if (!text || text.length === 0) {
                return {
                    rawText: "",
                    confidence: 0,
                    isScanned: true,
                    pageCount: 1,
                    extractionMethod: "TESSERACT_OCR",
                    error: "No readable text detected by OCR",
                };
            }

            return {
                rawText: text,
                confidence: Math.round(confidence * 10) / 10,
                isScanned: true,
                pageCount: 1,
                extractionMethod: "TESSERACT_OCR",
            };
        } catch (err: any) {
            // Catch OCR errors gracefully without crashing the service
            return {
                rawText: "",
                confidence: 0,
                isScanned: true,
                pageCount: 1,
                extractionMethod: "FAILED",
                error: `OCR processing failed: ${err.message || err}`,
            };
        }
    }

    /**
     * Reuses a singleton Tesseract worker instance for speed and efficiency.
     */
    private static async getTesseractWorker(): Promise<Worker> {
        if (!this.tesseractWorker) {
            try {
                const worker = await createWorker("eng", 1, {
                    errorHandler: (err) => {
                        console.warn("[OcrEngineService] Tesseract worker error:", err?.message || err);
                    },
                });
                this.tesseractWorker = worker;
            } catch (err: any) {
                console.warn("[OcrEngineService] Failed to initialize Tesseract worker:", err?.message || err);
                throw new Error(`OCR engine initialization failed: ${err?.message || err}`);
            }
        }
        return this.tesseractWorker;
    }

    /**
     * Gracefully terminates OCR workers on shutdown.
     */
    public static async terminateWorker(): Promise<void> {
        if (this.tesseractWorker) {
            try {
                await this.tesseractWorker.terminate();
            } catch {
                // Ignore
            }
            this.tesseractWorker = null;
        }
    }
}
