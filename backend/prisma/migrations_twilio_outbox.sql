-- =========================================================================
-- SWASTYA: TWILIO SMS & TRANSACTIONAL OUTBOX MIGRATION
-- Compatible with Neon PostgreSQL (Idempotent and Non-Destructive)
-- Target: dev-sms-feature branch (ep-holy-flower-bive3xfn)
-- =========================================================================

-- 1. ACTION TOKENS TABLE (Secure, expiring, single-purpose links)
CREATE TABLE IF NOT EXISTS actiontokens (
    tokenid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tokenhash VARCHAR(255) NOT NULL UNIQUE,
    userid UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    purpose VARCHAR(50) NOT NULL,
    targetid VARCHAR(255) NOT NULL,
    redirecturl VARCHAR(500) NOT NULL,
    expiresat TIMESTAMP(6) NOT NULL,
    usedat TIMESTAMP(6),
    createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_actiontokens_hash ON actiontokens(tokenhash);
CREATE INDEX IF NOT EXISTS idx_actiontokens_user ON actiontokens(userid);
CREATE INDEX IF NOT EXISTS idx_actiontokens_expires ON actiontokens(expiresat);

-- 2. TRANSACTIONAL SMS OUTBOX TABLE (Crash-resilient worker, idempotency)
CREATE TABLE IF NOT EXISTS smsoutbox (
    outboxid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userid UUID REFERENCES users(userid) ON DELETE SET NULL,
    phonenumber VARCHAR(20) NOT NULL,
    templatename VARCHAR(100) NOT NULL,
    messagebody TEXT NOT NULL,
    actionurl VARCHAR(500),
    payload JSONB,
    idempotencykey VARCHAR(255) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    maxattempts INT NOT NULL DEFAULT 3,
    lastattemptat TIMESTAMP(6),
    nextattemptat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    lockeduntil TIMESTAMP(6),
    lockedby VARCHAR(100),
    lockversion INT NOT NULL DEFAULT 0,
    messagesid VARCHAR(100),
    dispatchconfirmedat TIMESTAMP(6),
    errorcode VARCHAR(50),
    errormessage TEXT,
    createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_smsoutbox_status_next ON smsoutbox(status, nextattemptat);
CREATE INDEX IF NOT EXISTS idx_smsoutbox_user ON smsoutbox(userid);
CREATE INDEX IF NOT EXISTS idx_smsoutbox_messagesid ON smsoutbox(messagesid);
CREATE INDEX IF NOT EXISTS idx_smsoutbox_lockeduntil ON smsoutbox(lockeduntil);

-- 3. DONOR ELIGIBILITY QUESTIONNAIRE RESPONSES TABLE
-- Note: Medical questions are strictly nullable. NULL = UNANSWERED / NOT RECORDED.
CREATE TABLE IF NOT EXISTS donoreligibilityresponses (
    responseid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requestid UUID NOT NULL REFERENCES bloodrequests(requestid) ON DELETE CASCADE,
    donorid UUID NOT NULL REFERENCES donors(donorid) ON DELETE CASCADE,
    donoruserid UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    drinksalcohol BOOLEAN,
    alcoholin24h BOOLEAN,
    feelinghealthy BOOLEAN,
    medicationstatus BOOLEAN,
    recenttattoosurgery BOOLEAN,
    donatedinlast90days BOOLEAN,
    chronicillness BOOLEAN,
    pregnantorbreastfeeding BOOLEAN,
    additionalnotes TEXT,
    screeningstatus VARCHAR(50) NOT NULL DEFAULT 'INCOMPLETE',
    unansweredcount INT NOT NULL DEFAULT 8,
    completionpercent INT NOT NULL DEFAULT 0,
    deferralreasons JSONB DEFAULT '[]'::jsonb,
    clinicaldisclaimeracknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    submittedat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    reviewedbyhospitaluserid UUID REFERENCES users(userid) ON DELETE SET NULL,
    reviewedat TIMESTAMP(6),
    reviewdecision VARCHAR(50),
    reviewnotes TEXT
);

CREATE INDEX IF NOT EXISTS idx_eligibility_request ON donoreligibilityresponses(requestid);
CREATE INDEX IF NOT EXISTS idx_eligibility_donor ON donoreligibilityresponses(donorid);
CREATE INDEX IF NOT EXISTS idx_eligibility_donoruser ON donoreligibilityresponses(donoruserid);
