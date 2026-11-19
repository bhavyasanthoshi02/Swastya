import "dotenv/config";
import crypto from "crypto";
import { prisma } from "../src/config/prisma";
import { triggerEmergencyBroadcast } from "../src/services/broadcast.service";

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail?: string) {
    if (cond) {
        console.log(`[PASS] ${name}`);
        passed++;
    } else {
        console.error(`[FAIL] ${name}${detail ? ` -> ${detail}` : ""}`);
        failed++;
        throw new Error(`Assertion failed: ${name}`);
    }
}

async function main() {
    if (!process.env.DATABASE_URL?.includes("swastya_test")) {
        throw new Error(`Refusing to run against non-test DB: ${process.env.DATABASE_URL}`);
    }

    console.log("\n=== SWASTYA PHASE 1B FIX 4: POSTGRESQL 25P02 TRANSACTION ABORT TESTS ===\n");

    const tag = crypto.randomUUID().slice(0, 8);
    const city = `Fix4City_${tag}`;
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        const reqUser = await prisma.users.create({
            data: { name: `Fix4 Req ${tag}`, email: `fix4-req-${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        const d1User = await prisma.users.create({
            data: { name: `Fix4 D1 ${tag}`, email: `fix4-d1-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        const d2User = await prisma.users.create({
            data: { name: `Fix4 D2 ${tag}`, email: `fix4-d2-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        const d3User = await prisma.users.create({
            data: { name: `Fix4 D3 ${tag}`, email: `fix4-d3-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        createdUserIds.push(reqUser.userid, d1User.userid, d2User.userid, d3User.userid);

        const requester = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "1 Fix4 St", city, state: "MH", pincode: "411001" },
        });

        const donor1 = await prisma.donors.create({
            data: {
                userid: d1User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1995-01-01"),
                gender: "MALE",
                address: "D1",
                city,
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
            },
        });
        const donor2 = await prisma.donors.create({
            data: {
                userid: d2User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1994-02-02"),
                gender: "FEMALE",
                address: "D2",
                city,
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
            },
        });
        const donor3 = await prisma.donors.create({
            data: {
                userid: d3User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1993-03-03"),
                gender: "MALE",
                address: "D3",
                city,
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
            },
        });

        // 0. Baseline reproduction: demonstrate PostgreSQL 25P02 occurs WITHOUT savepoint when a query fails inside $transaction
        let saw25P02WithoutSavepoint = false;
        try {
            await prisma.$transaction(async (tx) => {
                try {
                    // Genuine PostgreSQL constraint error (invalid UUID / FK violation)
                    await tx.$executeRawUnsafe(
                        `INSERT INTO notification (userid, type, title, message) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'REQUEST', 't', 'm')`
                    );
                } catch {
                    // Without SAVEPOINT, the next query on tx fails with 25P02 (current transaction is aborted)
                    await tx.$queryRawUnsafe(`SELECT 1`);
                }
            });
        } catch (err: any) {
            const msg = String(err?.message || err?.cause?.originalMessage || "");
            if (msg.includes("25P02") || msg.toLowerCase().includes("current transaction is aborted")) {
                saw25P02WithoutSavepoint = true;
            }
        }
        assert(saw25P02WithoutSavepoint, "0. Reproduced PostgreSQL 25P02 aborted-transaction error without SAVEPOINT");

        // 1, 2, 3, 5, 7, 8: Genuine PostgreSQL constraint error on Donor 1 during triggerEmergencyBroadcast
        // Create an emergency request
        const req1 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                patientname: `Fix4 Patient ${tag}`,
                patientage: 40,
                patientgender: "MALE",
                patientcontact: "9999600001",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "CRITICAL",
                status: "CREATED",
                isemergency: true,
                searchradius: 15,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(req1.requestid);

        // Make Donor 1's first broadcastdeliveries.create fail with a real PostgreSQL FK/unique/check constraint
        // by pre-seeding a dummy broadcast? No, unique constraint is on (broadcastid, donorid), OR we can trigger a real PostgreSQL
        // error on Donor 1's notification.create by passing an invalid notification FK via a Prisma tx proxy that swaps Donor 1's
        // notification userid to a non-existent UUID -> triggers real PostgreSQL FK violation (23503) inside PostgreSQL!
        const origTx = prisma.$transaction.bind(prisma);
        let failedDonorOnce = false;
        (prisma as any).$transaction = async (cb: any) => {
            return origTx(async (tx: any) => {
                const wrappedTx = new Proxy(tx, {
                    get(target, prop) {
                        if (prop === "notification") {
                            return {
                                ...target.notification,
                                create: async (args: any) => {
                                    if (!failedDonorOnce && args?.data?.userid === d1User.userid) {
                                        failedDonorOnce = true;
                                        // Real PostgreSQL FK constraint violation (23503) on fk_notification_user
                                        return await target.notification.create({
                                            data: {
                                                ...args.data,
                                                userid: "00000000-0000-0000-0000-000000000000",
                                            },
                                        });
                                    }
                                    return await target.notification.create(args);
                                },
                            };
                        }
                        return target[prop];
                    },
                });
                return await cb(wrappedTx);
            });
        };

        let res1: any;
        try {
            res1 = await triggerEmergencyBroadcast({
                requestId: req1.requestid,
                triggeredByUserId: reqUser.userid,
                triggerType: "REQUEST_CREATION",
                triggerReason: "Initial Fix4 broadcast",
                radiusKm: 15,
            });
        } finally {
            (prisma as any).$transaction = origTx;
        }

        const deliveries1 = await prisma.broadcastdeliveries.findMany({ where: { requestid: req1.requestid } });
        const d1Del = deliveries1.find((d) => d.donorid === donor1.donorid);
        const d2Del = deliveries1.find((d) => d.donorid === donor2.donorid);
        const d3Del = deliveries1.find((d) => d.donorid === donor3.donorid);
        const bcast1 = await prisma.emergencybroadcasts.findUnique({ where: { broadcastid: res1.broadcastId } });

        assert(
            res1.success === true && res1.totalNotified === 2 && bcast1?.totalnotified === 2,
            "1, 5 & 7. Genuine PostgreSQL 23503 constraint error on Donor 1 did NOT trigger 25P02; broadcast succeeded with totalNotified=2",
            `success=${res1.success}, totalNotified=${res1.totalNotified}`
        );
        assert(
            d1Del?.deliverystatus === "FAILED" && Boolean(d1Del?.failuremessage),
            "2 & 8. Failed Donor 1 delivery recorded accurately with deliverystatus=FAILED and failuremessage"
        );
        assert(
            d2Del?.deliverystatus === "DELIVERED" && d3Del?.deliverystatus === "DELIVERED",
            "3. Successful Donor 2 and Donor 3 DELIVERED records remained intact"
        );

        // 9. Active broadcast deduplication still prevents duplicate broadcasts within 10 mins
        const resDup = await triggerEmergencyBroadcast({
            requestId: req1.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "MANUAL_TRIGGER",
            radiusKm: 15,
            expandRadius: false,
        });
        const bcastCountAfterDup = await prisma.emergencybroadcasts.count({ where: { requestid: req1.requestid } });
        assert(
            resDup.success === true && resDup.alreadyActive === true && bcastCountAfterDup === 1,
            "9. Active broadcast deduplication remains intact"
        );

        // 6 & 10. Radius expansion retries FAILED donor (Donor 1) without duplicating DELIVERED donors (Donor 2 & 3)
        const resExpand = await triggerEmergencyBroadcast({
            requestId: req1.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "RADIUS_EXPANSION",
            radiusKm: 25,
            expandRadius: true,
        });
        const req1AfterExpand = await prisma.bloodrequests.findUnique({ where: { requestid: req1.requestid } });
        const d1All = await prisma.broadcastdeliveries.findMany({ where: { requestid: req1.requestid, donorid: donor1.donorid } });
        const d2All = await prisma.broadcastdeliveries.findMany({ where: { requestid: req1.requestid, donorid: donor2.donorid } });
        const d3All = await prisma.broadcastdeliveries.findMany({ where: { requestid: req1.requestid, donorid: donor3.donorid } });
        assert(
            resExpand.success === true &&
                resExpand.totalNotified === 1 &&
                req1AfterExpand?.searchradius === 25 &&
                d1All.some((d) => d.deliverystatus === "DELIVERED") &&
                d2All.length === 1 &&
                d3All.length === 1,
            "6 & 10. Radius expansion retries previously FAILED Donor 1 without duplicating Donor 2 & 3",
            `notified=${resExpand.totalNotified}, d2Len=${d2All.length}, d3Len=${d3All.length}`
        );

        // 4. Broadcast-level transaction failure rolls back all partial broadcast records
        const reqRollback = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                patientname: `Fix4 Rollback ${tag}`,
                patientage: 35,
                patientgender: "FEMALE",
                patientcontact: "9999600002",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "CRITICAL",
                status: "CREATED",
                isemergency: true,
                searchradius: 10,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqRollback.requestid);

        (prisma as any).$transaction = async (cb: any) => {
            return origTx(async (tx: any) => {
                const wrappedTx = new Proxy(tx, {
                    get(target, prop) {
                        if (prop === "bloodrequests") {
                            return {
                                ...target.bloodrequests,
                                update: async () => {
                                    throw new Error("Simulated broadcast-level failure on bloodrequests.update");
                                },
                            };
                        }
                        return target[prop];
                    },
                });
                return await cb(wrappedTx);
            });
        };
        let rolledBack = false;
        try {
            await triggerEmergencyBroadcast({
                requestId: reqRollback.requestid,
                triggeredByUserId: reqUser.userid,
                triggerType: "RADIUS_EXPANSION",
                radiusKm: 20,
                expandRadius: true,
            });
        } catch {
            rolledBack = true;
        } finally {
            (prisma as any).$transaction = origTx;
        }
        const rbBcasts = await prisma.emergencybroadcasts.count({ where: { requestid: reqRollback.requestid } });
        const rbDels = await prisma.broadcastdeliveries.count({ where: { requestid: reqRollback.requestid } });
        const rbReq = await prisma.bloodrequests.findUnique({ where: { requestid: reqRollback.requestid } });
        assert(
            rolledBack && rbBcasts === 0 && rbDels === 0 && rbReq?.searchradius === 10,
            "4. Broadcast-level transaction failure leaves 0 partial broadcast/delivery records and preserves searchradius=10"
        );

        // 11. Terminal requests cannot be broadcast
        const reqTerm = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                patientname: `Fix4 Terminal ${tag}`,
                patientage: 28,
                patientgender: "MALE",
                patientcontact: "9999600003",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "CRITICAL",
                status: "CANCELLED",
                isemergency: true,
                searchradius: 15,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqTerm.requestid);

        const resTerm = await triggerEmergencyBroadcast({
            requestId: reqTerm.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "MANUAL_TRIGGER",
        });
        assert(
            resTerm.success === false && resTerm.terminal === true,
            "11. Terminal CANCELLED request cannot be broadcast"
        );

        // 12. DIRECT_VOLUNTEER containers are excluded from genuine emergency broadcast deduplication
        const reqDV = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                patientname: `Fix4 DV ${tag}`,
                patientage: 33,
                patientgender: "FEMALE",
                patientcontact: "9999600004",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "CRITICAL",
                status: "DONOR_MATCHING",
                isemergency: true,
                searchradius: 15,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqDV.requestid);

        const dvContainer = await prisma.emergencybroadcasts.create({
            data: {
                requestid: reqDV.requestid,
                triggeredbyuserid: reqUser.userid,
                triggertype: "DIRECT_VOLUNTEER",
                radiuskm: 15,
                status: "ACTIVE",
                totalmatched: 1,
                totalnotified: 0,
                totalresponded: 1,
            },
        });
        const resDV = await triggerEmergencyBroadcast({
            requestId: reqDV.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "MANUAL_TRIGGER",
            radiusKm: 15,
        });
        assert(
            resDV.success === true && !resDV.alreadyActive && resDV.broadcastId !== dvContainer.broadcastid,
            "12. DIRECT_VOLUNTEER container is excluded from genuine emergency broadcast deduplication"
        );

        console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
    } finally {
        try {
            if (createdRequestIds.length > 0) {
                await prisma.notification.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.broadcastdeliveries.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.emergencybroadcasts.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.bloodrequests.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            }
            if (createdUserIds.length > 0) {
                await prisma.notification.deleteMany({ where: { userid: { in: createdUserIds } } });
                await prisma.users.deleteMany({ where: { userid: { in: createdUserIds } } });
            }
        } catch (cleanupErr) {
            console.error("Cleanup warning:", cleanupErr);
        }
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error("Test suite error:", e);
    process.exit(1);
});
