"use client";

import React from "react";
import PeerChatManager from "@/components/chat/PeerChatManager";

export default function HospitalMessagesPage() {
  return (
    <div className="w-full">
      <PeerChatManager role="HOSPITAL" />
    </div>
  );
}
