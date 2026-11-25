"use client";

import React, { useEffect, useState } from "react";
import { CustomSmsManager } from "@/components/sms/CustomSmsManager";
import { getStoredUser, AuthUser } from "@/lib/auth";

export default function HospitalSmsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <CustomSmsManager userRole="HOSPITAL" facilityName={user?.name || "Hospital Healthcare Center"} />
    </div>
  );
}
