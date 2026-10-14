"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CreateRequestRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/requester/requests/new");
  }, [router]);

  return null;
}
