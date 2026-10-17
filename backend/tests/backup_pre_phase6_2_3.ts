import { prisma } from "../src/config/prisma";
import * as fs from "fs";
import * as path from "path";

async function backupDatabase() {
    console.log("Starting full database backup for pre-Phase 6.2.3...");
    const backupDir = path.join(__dirname, "../backups");
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const tablesResult: any = await prisma.$queryRawUnsafe(`
        SELECT table_name::text 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    `);

    const backupData: Record<string, any[]> = {};
    const summary: Record<string, number> = {};

    for (const row of tablesResult) {
        const tableName = row.table_name;
        // Skip migrations or internal tables if any, but backing up all tables is safest
        try {
            const rows: any = await prisma.$queryRawUnsafe(`SELECT * FROM "${tableName}"`);
            backupData[tableName] = rows;
            summary[tableName] = rows.length;
            console.log(`  Backed up table [${tableName}]: ${rows.length} rows`);
        } catch (err: any) {
            console.warn(`  Failed to backup table ${tableName}:`, err.message);
        }
    }

    const backupFile = path.join(backupDir, `pre_phase_6_2_3_backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), "utf8");
    console.log(`\nBackup successfully written to: ${backupFile}`);
    console.log("Table row summary:", summary);
}

backupDatabase()
    .then(async () => {
        await prisma.$disconnect();
        process.exit(0);
    })
    .catch(async (e) => {
        console.error("Backup failed:", e);
        await prisma.$disconnect();
        process.exit(1);
    });
