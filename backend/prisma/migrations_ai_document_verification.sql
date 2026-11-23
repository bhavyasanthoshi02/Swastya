-- ============================================================================
-- SWASTYA: FEATURE 2 — AI-POWERED DOCUMENT VERIFICATION MIGRATION SCRIPT
-- Safe, idempotent DDL for development/test databases.
-- Target database: Development / Test ONLY (Never execute against production data)
-- ============================================================================

-- 1. Extend requestdocuments with version tracking and cryptographic file hash
ALTER TABLE requestdocuments 
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

ALTER TABLE requestdocuments 
    ADD COLUMN IF NOT EXISTS filehash VARCHAR(64);

-- 2. Create documentverifications table
CREATE TABLE IF NOT EXISTS documentverifications (
    verificationid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requestid UUID NOT NULL,
    documentid UUID NOT NULL,
    documentversion INTEGER NOT NULL DEFAULT 1,
    documenttype VARCHAR(50) NOT NULL,
    filehash VARCHAR(64),
    verificationstatus VARCHAR(30) NOT NULL DEFAULT 'NEEDS_REVIEW',
    ocrconfidence DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    extracteddata JSONB NOT NULL DEFAULT '{}'::jsonb,
    discrepancies JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary TEXT,
    processingerror TEXT,
    iscurrentversion BOOLEAN NOT NULL DEFAULT true,
    reviewerdecision VARCHAR(50),
    reviewerremarks TEXT,
    reviewedbyuserid UUID,
    reviewedat TIMESTAMP,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_verification_request FOREIGN KEY (requestid) 
        REFERENCES bloodrequests(requestid) ON DELETE CASCADE,
    CONSTRAINT fk_verification_document FOREIGN KEY (documentid) 
        REFERENCES requestdocuments(documentid) ON DELETE CASCADE,
    CONSTRAINT fk_verification_reviewer FOREIGN KEY (reviewedbyuserid) 
        REFERENCES users(userid) ON DELETE SET NULL
);

-- Indexes for high-performance query filtering
CREATE INDEX IF NOT EXISTS idx_docverifications_request ON documentverifications(requestid);
CREATE INDEX IF NOT EXISTS idx_docverifications_document ON documentverifications(documentid);
CREATE INDEX IF NOT EXISTS idx_docverifications_current ON documentverifications(iscurrentversion);

-- 3. Create documentreviewaudit table (Immutable append-only audit trail)
CREATE TABLE IF NOT EXISTS documentreviewaudit (
    auditid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verificationid UUID NOT NULL,
    documentid UUID NOT NULL,
    documentversion INTEGER NOT NULL DEFAULT 1,
    requestid UUID NOT NULL,
    revieweruserid UUID NOT NULL,
    previousstatus VARCHAR(30) NOT NULL,
    newstatus VARCHAR(30) NOT NULL,
    decision VARCHAR(50) NOT NULL,
    remarks TEXT,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_verification FOREIGN KEY (verificationid) 
        REFERENCES documentverifications(verificationid) ON DELETE NO ACTION,
    CONSTRAINT fk_audit_reviewer FOREIGN KEY (revieweruserid) 
        REFERENCES users(userid) ON DELETE NO ACTION
);

-- Indexes for audit lookup
CREATE INDEX IF NOT EXISTS idx_docaudit_verification ON documentreviewaudit(verificationid);
CREATE INDEX IF NOT EXISTS idx_docaudit_request ON documentreviewaudit(requestid);
