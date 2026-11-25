import { Client } from "pg";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });

async function applyMigrations() {
    const dbUrl = process.env.DATABASE_URL || "";
    console.log("===============================================================================");
    console.log("  SWASTYA: LOCAL TEST DATABASE MIGRATION APPLICATION                          ");
    console.log("===============================================================================");
    console.log("Active Database Target:", dbUrl.replace(/:[^:@]+@/, ":***@"));

    if (dbUrl.includes("neon.tech") || dbUrl.includes("prod")) {
        console.error("CRITICAL SAFETY BLOCK: Database URL points to production Neon! Aborting.");
        process.exit(1);
    }
    if (!dbUrl.includes("swastya_test")) {
        console.error("CRITICAL SAFETY BLOCK: Database URL is not swastya_test! Aborting.");
        process.exit(1);
    }

    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    console.log("Verified: Connected to isolated test database swastya_test.\n");

    // Ensure base requestdocuments table exists before applying versioning/verifications
    console.log("Ensuring requestdocuments table exists...");
    await client.query(`
        CREATE TABLE IF NOT EXISTS requestdocuments (
            documentid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            requestid UUID NOT NULL,
            documenttype VARCHAR(50) NOT NULL,
            documentname VARCHAR(255) NOT NULL,
            ismandatory BOOLEAN DEFAULT true,
            filepath TEXT NOT NULL,
            originalfilename VARCHAR(255) NOT NULL,
            mimetype VARCHAR(100) NOT NULL,
            filesize INTEGER NOT NULL,
            version INTEGER DEFAULT 1,
            filehash VARCHAR(64),
            uploadedbyuserid UUID NOT NULL,
            uploadedat TIMESTAMP(6) DEFAULT now(),
            updatedat TIMESTAMP(6) DEFAULT now(),
            CONSTRAINT fk_document_request FOREIGN KEY (requestid) REFERENCES bloodrequests(requestid) ON DELETE CASCADE,
            CONSTRAINT fk_document_uploader FOREIGN KEY (uploadedbyuserid) REFERENCES users(userid),
            CONSTRAINT uq_request_documenttype UNIQUE (requestid, documenttype)
        );
        CREATE INDEX IF NOT EXISTS idx_requestdocuments_request ON requestdocuments(requestid);
    `);
    console.log("requestdocuments table verified.\n");

    const sqlFiles = [
        path.resolve(__dirname, "../prisma/migrations_ai_document_verification.sql"),
        path.resolve(__dirname, "../prisma/migrations_equipment_tracker.sql")
    ];

    for (const sqlFile of sqlFiles) {
        console.log(`Applying migration file: ${path.basename(sqlFile)}...`);
        const sql = fs.readFileSync(sqlFile, "utf-8");
        await client.query(sql);
        console.log(`Successfully applied: ${path.basename(sqlFile)}`);
    }

    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    console.log("\nTotal tables in swastya_test after migrations:", res.rows.length);
    console.log("Tables:", res.rows.map((r: any) => r.table_name).join(", "));

    await client.end();
    console.log("\nMigration completed safely.");
}

applyMigrations().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
