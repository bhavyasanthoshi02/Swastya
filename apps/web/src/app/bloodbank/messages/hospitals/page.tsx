"use client";

import React from "react";
import PeerChatManager from "@/components/chat/PeerChatManager";

export default function BloodBankToHospitalMessagesPage() {
  return (
    <div className="w-full">
      <PeerChatManager role="BLOOD_BANK" targetType="HOSPITAL" />
    </div>
  );
}
