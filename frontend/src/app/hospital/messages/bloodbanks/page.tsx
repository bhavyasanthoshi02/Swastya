"use client";

import React from "react";
import PeerChatManager from "@/components/chat/PeerChatManager";

export default function HospitalToBloodBankMessagesPage() {
  return (
    <div className="w-full">
      <PeerChatManager role="HOSPITAL" targetType="BLOOD_BANK" />
    </div>
  );
}
