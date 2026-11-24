import { prisma } from "../config/prisma";

export class HospitalCommunicationService {
    /**
     * Resolve hospital profile for current user
     */
    public static async getHospitalByUserId(userId: string) {
        return await prisma.hospitals.findUnique({
            where: { userid: userId },
            select: {
                hospitalid: true,
                hospitalname: true,
                approvalstatus: true,
                city: true,
                state: true,
            },
        });
    }

    /**
     * List all other approved hospitals for in-app peer communication
     */
    public static async listPeerHospitals(currentUserId: string) {
        const currentHospital = await this.getHospitalByUserId(currentUserId);
        if (!currentHospital) {
            throw new Error("Hospital profile not found for authenticated user.");
        }

        // Handle empty database / no other hospitals gracefully
        const peerHospitals = await prisma.hospitals.findMany({
            where: {
                approvalstatus: "APPROVED",
                hospitalid: { not: currentHospital.hospitalid },
                users: { isactive: true },
            },
            select: {
                hospitalid: true,
                hospitalname: true,
                contactpersonname: true,
                contactpersonphone: true,
                address: true,
                city: true,
                state: true,
                pincode: true,
            },
            orderBy: { hospitalname: "asc" },
        });

        if (peerHospitals.length === 0) {
            return [];
        }

        // For each peer hospital, fetch unread count and latest message preview
        const results = await Promise.all(
            peerHospitals.map(async (peer) => {
                const unreadCount = await prisma.hospitalmessages.count({
                    where: {
                        senderhospitalid: peer.hospitalid,
                        recipienthospitalid: currentHospital.hospitalid,
                        isread: false,
                    },
                });

                const lastMessage = await prisma.hospitalmessages.findFirst({
                    where: {
                        OR: [
                            {
                                senderhospitalid: currentHospital.hospitalid,
                                recipienthospitalid: peer.hospitalid,
                            },
                            {
                                senderhospitalid: peer.hospitalid,
                                recipienthospitalid: currentHospital.hospitalid,
                            },
                        ],
                    },
                    orderBy: { createdat: "desc" },
                    select: {
                        messageid: true,
                        content: true,
                        createdat: true,
                        senderhospitalid: true,
                        isread: true,
                    },
                });

                return {
                    ...peer,
                    unreadCount,
                    lastMessage: lastMessage
                        ? {
                              ...lastMessage,
                              isOutgoing: lastMessage.senderhospitalid === currentHospital.hospitalid,
                          }
                        : null,
                };
            })
        );

        // Sort peers: those with recent messages first, then alphabetical
        return results.sort((a, b) => {
            const timeA = a.lastMessage?.createdat ? new Date(a.lastMessage.createdat).getTime() : 0;
            const timeB = b.lastMessage?.createdat ? new Date(b.lastMessage.createdat).getTime() : 0;
            if (timeA !== timeB) return timeB - timeA;
            return a.hospitalname.localeCompare(b.hospitalname);
        });
    }

    /**
     * Get conversation message history between current hospital and peer hospital
     */
    public static async getConversation(currentUserId: string, otherHospitalId: string) {
        const currentHospital = await this.getHospitalByUserId(currentUserId);
        if (!currentHospital) {
            throw new Error("Hospital profile not found for authenticated user.");
        }

        // Verify other hospital exists
        const otherHospital = await prisma.hospitals.findUnique({
            where: { hospitalid: otherHospitalId },
            select: {
                hospitalid: true,
                hospitalname: true,
                city: true,
                state: true,
            },
        });

        if (!otherHospital) {
            throw new Error("Target hospital not found.");
        }

        const messages = await prisma.hospitalmessages.findMany({
            where: {
                OR: [
                    {
                        senderhospitalid: currentHospital.hospitalid,
                        recipienthospitalid: otherHospitalId,
                    },
                    {
                        senderhospitalid: otherHospitalId,
                        recipienthospitalid: currentHospital.hospitalid,
                    },
                ],
            },
            orderBy: { createdat: "asc" },
            include: {
                senderhospital: {
                    select: { hospitalid: true, hospitalname: true },
                },
                recipienthospital: {
                    select: { hospitalid: true, hospitalname: true },
                },
            },
        });

        // Auto-mark incoming unread messages as read
        const unreadIncomingIds = messages
            .filter((m) => m.recipienthospitalid === currentHospital.hospitalid && !m.isread)
            .map((m) => m.messageid);

        if (unreadIncomingIds.length > 0) {
            await prisma.hospitalmessages.updateMany({
                where: { messageid: { in: unreadIncomingIds } },
                data: {
                    isread: true,
                    readat: new Date(),
                },
            });
        }

        return {
            currentHospitalId: currentHospital.hospitalid,
            peerHospital: otherHospital,
            messages: messages.map((m) => ({
                messageId: m.messageid,
                senderHospitalId: m.senderhospitalid,
                senderHospitalName: m.senderhospital.hospitalname,
                recipientHospitalId: m.recipienthospitalid,
                recipientHospitalName: m.recipienthospital.hospitalname,
                content: m.content,
                isRead: unreadIncomingIds.includes(m.messageid) ? true : m.isread,
                readAt: unreadIncomingIds.includes(m.messageid) ? new Date() : m.readat,
                createdAt: m.createdat,
                isOutgoing: m.senderhospitalid === currentHospital.hospitalid,
            })),
        };
    }

    /**
     * Send in-app message from current hospital to target hospital
     * Strictly persists in DB without triggering SMS or Outbox.
     */
    public static async sendMessage(
        currentUserId: string,
        recipientHospitalId: string,
        content: string
    ) {
        const currentHospital = await this.getHospitalByUserId(currentUserId);
        if (!currentHospital) {
            throw new Error("Hospital profile not found for authenticated user.");
        }

        if (currentHospital.hospitalid === recipientHospitalId) {
            throw new Error("Cannot send in-app message to your own hospital.");
        }

        const sanitizedContent = (content || "").trim();
        if (!sanitizedContent) {
            throw new Error("Message content cannot be empty.");
        }
        if (sanitizedContent.length > 2000) {
            throw new Error("Message content exceeds maximum allowed length (2000 characters).");
        }

        // Verify recipient hospital exists and is approved
        const recipientHospital = await prisma.hospitals.findUnique({
            where: { hospitalid: recipientHospitalId },
            select: { hospitalid: true, hospitalname: true, approvalstatus: true },
        });

        if (!recipientHospital) {
            throw new Error("Recipient hospital does not exist.");
        }
        if (recipientHospital.approvalstatus !== "APPROVED") {
            throw new Error("Cannot message a hospital that is not approved.");
        }

        const message = await prisma.hospitalmessages.create({
            data: {
                senderhospitalid: currentHospital.hospitalid,
                recipienthospitalid: recipientHospitalId,
                content: sanitizedContent,
            },
            include: {
                senderhospital: {
                    select: { hospitalid: true, hospitalname: true },
                },
                recipienthospital: {
                    select: { hospitalid: true, hospitalname: true },
                },
            },
        });

        return {
            messageId: message.messageid,
            senderHospitalId: message.senderhospitalid,
            senderHospitalName: message.senderhospital.hospitalname,
            recipientHospitalId: message.recipienthospitalid,
            recipientHospitalName: message.recipienthospital.hospitalname,
            content: message.content,
            isRead: message.isread,
            createdAt: message.createdat,
            isOutgoing: true,
        };
    }

    /**
     * Mark conversation from other hospital as read
     */
    public static async markAsRead(currentUserId: string, otherHospitalId: string) {
        const currentHospital = await this.getHospitalByUserId(currentUserId);
        if (!currentHospital) {
            throw new Error("Hospital profile not found for authenticated user.");
        }

        const updateRes = await prisma.hospitalmessages.updateMany({
            where: {
                senderhospitalid: otherHospitalId,
                recipienthospitalid: currentHospital.hospitalid,
                isread: false,
            },
            data: {
                isread: true,
                readat: new Date(),
            },
        });

        return { markedReadCount: updateRes.count };
    }
}

export class BloodBankCommunicationService {
    /**
     * Resolve blood bank profile for current user
     */
    public static async getBloodBankByUserId(userId: string) {
        return await prisma.bloodbanks.findUnique({
            where: { userid: userId },
            select: {
                bloodbankid: true,
                bloodbankname: true,
                approvalstatus: true,
                city: true,
                state: true,
            },
        });
    }

    /**
     * List all other approved blood banks for in-app peer communication
     */
    public static async listPeerBloodBanks(currentUserId: string) {
        const currentBloodBank = await this.getBloodBankByUserId(currentUserId);
        if (!currentBloodBank) {
            throw new Error("Blood bank profile not found for authenticated user.");
        }

        // Handle empty database / no other blood banks gracefully
        const peerBloodBanks = await prisma.bloodbanks.findMany({
            where: {
                approvalstatus: "APPROVED",
                bloodbankid: { not: currentBloodBank.bloodbankid },
                users: { isactive: true },
            },
            select: {
                bloodbankid: true,
                bloodbankname: true,
                contactpersonname: true,
                contactpersonphone: true,
                address: true,
                city: true,
                state: true,
                pincode: true,
            },
            orderBy: { bloodbankname: "asc" },
        });

        if (peerBloodBanks.length === 0) {
            return [];
        }

        // For each peer blood bank, fetch unread count and latest message preview
        const results = await Promise.all(
            peerBloodBanks.map(async (peer) => {
                const unreadCount = await prisma.bloodbankmessages.count({
                    where: {
                        senderbloodbankid: peer.bloodbankid,
                        recipientbloodbankid: currentBloodBank.bloodbankid,
                        isread: false,
                    },
                });

                const lastMessage = await prisma.bloodbankmessages.findFirst({
                    where: {
                        OR: [
                            {
                                senderbloodbankid: currentBloodBank.bloodbankid,
                                recipientbloodbankid: peer.bloodbankid,
                            },
                            {
                                senderbloodbankid: peer.bloodbankid,
                                recipientbloodbankid: currentBloodBank.bloodbankid,
                            },
                        ],
                    },
                    orderBy: { createdat: "desc" },
                    select: {
                        messageid: true,
                        content: true,
                        createdat: true,
                        senderbloodbankid: true,
                        isread: true,
                    },
                });

                return {
                    ...peer,
                    unreadCount,
                    lastMessage: lastMessage
                        ? {
                              ...lastMessage,
                              isOutgoing: lastMessage.senderbloodbankid === currentBloodBank.bloodbankid,
                          }
                        : null,
                };
            })
        );

        // Sort peers: those with recent messages first, then alphabetical
        return results.sort((a, b) => {
            const timeA = a.lastMessage?.createdat ? new Date(a.lastMessage.createdat).getTime() : 0;
            const timeB = b.lastMessage?.createdat ? new Date(b.lastMessage.createdat).getTime() : 0;
            if (timeA !== timeB) return timeB - timeA;
            return a.bloodbankname.localeCompare(b.bloodbankname);
        });
    }

    /**
     * Get conversation message history between current blood bank and peer blood bank
     */
    public static async getConversation(currentUserId: string, otherBloodBankId: string) {
        const currentBloodBank = await this.getBloodBankByUserId(currentUserId);
        if (!currentBloodBank) {
            throw new Error("Blood bank profile not found for authenticated user.");
        }

        // Verify other blood bank exists
        const otherBloodBank = await prisma.bloodbanks.findUnique({
            where: { bloodbankid: otherBloodBankId },
            select: {
                bloodbankid: true,
                bloodbankname: true,
                city: true,
                state: true,
            },
        });

        if (!otherBloodBank) {
            throw new Error("Target blood bank not found.");
        }

        const messages = await prisma.bloodbankmessages.findMany({
            where: {
                OR: [
                    {
                        senderbloodbankid: currentBloodBank.bloodbankid,
                        recipientbloodbankid: otherBloodBankId,
                    },
                    {
                        senderbloodbankid: otherBloodBankId,
                        recipientbloodbankid: currentBloodBank.bloodbankid,
                    },
                ],
            },
            orderBy: { createdat: "asc" },
            include: {
                senderbloodbank: {
                    select: { bloodbankid: true, bloodbankname: true },
                },
                recipientbloodbank: {
                    select: { bloodbankid: true, bloodbankname: true },
                },
            },
        });

        // Auto-mark incoming unread messages as read
        const unreadIncomingIds = messages
            .filter((m) => m.recipientbloodbankid === currentBloodBank.bloodbankid && !m.isread)
            .map((m) => m.messageid);

        if (unreadIncomingIds.length > 0) {
            await prisma.bloodbankmessages.updateMany({
                where: { messageid: { in: unreadIncomingIds } },
                data: {
                    isread: true,
                    readat: new Date(),
                },
            });
        }

        return {
            currentBloodBankId: currentBloodBank.bloodbankid,
            peerBloodBank: otherBloodBank,
            messages: messages.map((m) => ({
                messageId: m.messageid,
                senderBloodBankId: m.senderbloodbankid,
                senderBloodBankName: m.senderbloodbank.bloodbankname,
                recipientBloodBankId: m.recipientbloodbankid,
                recipientBloodBankName: m.recipientbloodbank.bloodbankname,
                content: m.content,
                isRead: unreadIncomingIds.includes(m.messageid) ? true : m.isread,
                readAt: unreadIncomingIds.includes(m.messageid) ? new Date() : m.readat,
                createdAt: m.createdat,
                isOutgoing: m.senderbloodbankid === currentBloodBank.bloodbankid,
            })),
        };
    }

    /**
     * Send in-app message from current blood bank to target blood bank
     * Strictly persists in DB without triggering SMS or Outbox.
     */
    public static async sendMessage(
        currentUserId: string,
        recipientBloodBankId: string,
        content: string
    ) {
        const currentBloodBank = await this.getBloodBankByUserId(currentUserId);
        if (!currentBloodBank) {
            throw new Error("Blood bank profile not found for authenticated user.");
        }

        if (currentBloodBank.bloodbankid === recipientBloodBankId) {
            throw new Error("Cannot send in-app message to your own blood bank.");
        }

        const sanitizedContent = (content || "").trim();
        if (!sanitizedContent) {
            throw new Error("Message content cannot be empty.");
        }
        if (sanitizedContent.length > 2000) {
            throw new Error("Message content exceeds maximum allowed length (2000 characters).");
        }

        // Verify recipient blood bank exists and is approved
        const recipientBloodBank = await prisma.bloodbanks.findUnique({
            where: { bloodbankid: recipientBloodBankId },
            select: { bloodbankid: true, bloodbankname: true, approvalstatus: true },
        });

        if (!recipientBloodBank) {
            throw new Error("Recipient blood bank does not exist.");
        }
        if (recipientBloodBank.approvalstatus !== "APPROVED") {
            throw new Error("Cannot message a blood bank that is not approved.");
        }

        const message = await prisma.bloodbankmessages.create({
            data: {
                senderbloodbankid: currentBloodBank.bloodbankid,
                recipientbloodbankid: recipientBloodBankId,
                content: sanitizedContent,
            },
            include: {
                senderbloodbank: {
                    select: { bloodbankid: true, bloodbankname: true },
                },
                recipientbloodbank: {
                    select: { bloodbankid: true, bloodbankname: true },
                },
            },
        });

        return {
            messageId: message.messageid,
            senderBloodBankId: message.senderbloodbankid,
            senderBloodBankName: message.senderbloodbank.bloodbankname,
            recipientBloodBankId: message.recipientbloodbankid,
            recipientBloodBankName: message.recipientbloodbank.bloodbankname,
            content: message.content,
            isRead: message.isread,
            createdAt: message.createdat,
            isOutgoing: true,
        };
    }

    /**
     * Mark conversation from other blood bank as read
     */
    public static async markAsRead(currentUserId: string, otherBloodBankId: string) {
        const currentBloodBank = await this.getBloodBankByUserId(currentUserId);
        if (!currentBloodBank) {
            throw new Error("Blood bank profile not found for authenticated user.");
        }

        const updateRes = await prisma.bloodbankmessages.updateMany({
            where: {
                senderbloodbankid: otherBloodBankId,
                recipientbloodbankid: currentBloodBank.bloodbankid,
                isread: false,
            },
            data: {
                isread: true,
                readat: new Date(),
            },
        });

        return { markedReadCount: updateRes.count };
    }
}
