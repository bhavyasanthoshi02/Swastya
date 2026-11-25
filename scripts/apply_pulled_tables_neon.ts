import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { Client } from "pg";

async function applyNewTables() {
  const env = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../.env")));
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log("=== APPLYING NEW TABLES TO NEON: smsoutbox, actiontokens, donoreligibilityresponses ===");

  await client.query(`
    CREATE TABLE IF NOT EXISTS "smsoutbox" (
      "outboxid" UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
      "userid" UUID REFERENCES "users"("userid") ON DELETE SET NULL,
      "phonenumber" VARCHAR(20) NOT NULL,
      "templatename" VARCHAR(100) NOT NULL,
      "messagebody" TEXT NOT NULL,
      "actionurl" VARCHAR(500),
      "payload" JSONB,
      "idempotencykey" VARCHAR(255) UNIQUE,
      "status" VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
      "attempts" INTEGER DEFAULT 0 NOT NULL,
      "maxattempts" INTEGER DEFAULT 3 NOT NULL,
      "lastattemptat" TIMESTAMP(6),
      "nextattemptat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
      "lockeduntil" TIMESTAMP(6),
      "lockedby" VARCHAR(100),
      "lockversion" INTEGER DEFAULT 0 NOT NULL,
      "messagesid" VARCHAR(100),
      "dispatchconfirmedat" TIMESTAMP(6),
      "errorcode" VARCHAR(50),
      "errormessage" TEXT,
      "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
      "updatedat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "idx_smsoutbox_status_next" ON "smsoutbox"("status", "nextattemptat");
    CREATE INDEX IF NOT EXISTS "idx_smsoutbox_user" ON "smsoutbox"("userid");
    CREATE INDEX IF NOT EXISTS "idx_smsoutbox_messagesid" ON "smsoutbox"("messagesid");
    CREATE INDEX IF NOT EXISTS "idx_smsoutbox_lockeduntil" ON "smsoutbox"("lockeduntil");

    CREATE TABLE IF NOT EXISTS "actiontokens" (
      "tokenid" UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
      "tokenhash" VARCHAR(255) UNIQUE NOT NULL,
      "userid" UUID NOT NULL REFERENCES "users"("userid") ON DELETE CASCADE,
      "purpose" VARCHAR(50) NOT NULL,
      "targetid" VARCHAR(255) NOT NULL,
      "redirecturl" VARCHAR(500) NOT NULL,
      "expiresat" TIMESTAMP(6) NOT NULL,
      "usedat" TIMESTAMP(6),
      "createdat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "idx_actiontokens_hash" ON "actiontokens"("tokenhash");
    CREATE INDEX IF NOT EXISTS "idx_actiontokens_user" ON "actiontokens"("userid");
    CREATE INDEX IF NOT EXISTS "idx_actiontokens_expires" ON "actiontokens"("expiresat");

    CREATE TABLE IF NOT EXISTS "donoreligibilityresponses" (
      "responseid" UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
      "requestid" UUID NOT NULL REFERENCES "bloodrequests"("requestid") ON DELETE CASCADE,
      "donorid" UUID NOT NULL REFERENCES "donors"("donorid") ON DELETE CASCADE,
      "donoruserid" UUID NOT NULL REFERENCES "users"("userid") ON DELETE CASCADE,
      "drinksalcohol" BOOLEAN,
      "alcoholin24h" BOOLEAN,
      "feelinghealthy" BOOLEAN,
      "medicationstatus" BOOLEAN,
      "recenttattoosurgery" BOOLEAN,
      "donatedinlast90days" BOOLEAN,
      "chronicillness" BOOLEAN,
      "pregnantorbreastfeeding" BOOLEAN,
      "additionalnotes" TEXT,
      "screeningstatus" VARCHAR(50) DEFAULT 'INCOMPLETE' NOT NULL,
      "unansweredcount" INTEGER DEFAULT 8 NOT NULL,
      "completionpercent" INTEGER DEFAULT 0 NOT NULL,
      "deferralreasons" JSONB DEFAULT '[]'::jsonb,
      "clinicaldisclaimeracknowledged" BOOLEAN DEFAULT false NOT NULL,
      "submittedat" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
      "reviewedbyhospitaluserid" UUID REFERENCES "users"("userid") ON DELETE SET NULL,
      "reviewedat" TIMESTAMP(6),
      "reviewdecision" VARCHAR(50),
      "reviewnotes" TEXT
    );

    CREATE INDEX IF NOT EXISTS "idx_eligibility_request" ON "donoreligibilityresponses"("requestid");
    CREATE INDEX IF NOT EXISTS "idx_eligibility_donor" ON "donoreligibilityresponses"("donorid");
    CREATE INDEX IF NOT EXISTS "idx_eligibility_donoruser" ON "donoreligibilityresponses"("donoruserid");
  `);

  console.log("Successfully created smsoutbox, actiontokens, and donoreligibilityresponses on Neon!");
  await client.end();
}

applyNewTables().catch(console.error);
