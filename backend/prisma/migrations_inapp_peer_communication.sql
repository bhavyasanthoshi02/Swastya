-- =========================================================================
-- SWASTYA: IN-APP PEER-TO-PEER ORGANIZATION COMMUNICATION MIGRATION
-- Compatible with Neon PostgreSQL (Idempotent and Non-Destructive)
-- Feature 4: Hospital-to-Hospital In-App Communication
-- Feature 5: Blood Bank-to-Blood Bank In-App Communication
-- =========================================================================

-- 1. HOSPITAL-TO-HOSPITAL IN-APP MESSAGES TABLE
CREATE TABLE IF NOT EXISTS hospitalmessages (
    messageid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    senderhospitalid UUID NOT NULL REFERENCES hospitals(hospitalid) ON DELETE CASCADE,
    recipienthospitalid UUID NOT NULL REFERENCES hospitals(hospitalid) ON DELETE CASCADE,
    content TEXT NOT NULL,
    isread BOOLEAN NOT NULL DEFAULT FALSE,
    readat TIMESTAMP(6),
    createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hospitalmessages_sender ON hospitalmessages(senderhospitalid);
CREATE INDEX IF NOT EXISTS idx_hospitalmessages_recipient ON hospitalmessages(recipienthospitalid);
CREATE INDEX IF NOT EXISTS idx_hospitalmessages_createdat ON hospitalmessages(createdat);

-- 2. BLOOD BANK-TO-BLOOD BANK IN-APP MESSAGES TABLE
CREATE TABLE IF NOT EXISTS bloodbankmessages (
    messageid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    senderbloodbankid UUID NOT NULL REFERENCES bloodbanks(bloodbankid) ON DELETE CASCADE,
    recipientbloodbankid UUID NOT NULL REFERENCES bloodbanks(bloodbankid) ON DELETE CASCADE,
    content TEXT NOT NULL,
    isread BOOLEAN NOT NULL DEFAULT FALSE,
    readat TIMESTAMP(6),
    createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bloodbankmessages_sender ON bloodbankmessages(senderbloodbankid);
CREATE INDEX IF NOT EXISTS idx_bloodbankmessages_recipient ON bloodbankmessages(recipientbloodbankid);
CREATE INDEX IF NOT EXISTS idx_bloodbankmessages_createdat ON bloodbankmessages(createdat);
