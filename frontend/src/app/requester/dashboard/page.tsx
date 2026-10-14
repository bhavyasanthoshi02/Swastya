"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Droplet,
  ShieldCheck,
  Heart,
  Compass,
  ArrowRight,
  Sparkles,
  Info,
  Loader2,
  AlertCircle,
  RefreshCw,
  PlusCircle,
  CheckCircle2,
  Building2,
  Activity,
  FileText,
} from "lucide-react";
import { ActiveRequisitionsPreview } from "@/components/requester/ActiveRequisitionsPreview";
import { LatestRequisitionCard } from "@/components/requester/LatestRequisitionCard";
import { RequesterProfileSummary } from "@/components/requester/RequesterProfileSummary";
import {
  RequesterRecentActivityPreview,
  RequesterActivityItem,
} from "@/components/requester/RequesterRecentActivityPreview";
import { api, BloodRequestItem } from "@/lib/api";
import { getStoredUser, AuthUser, AuthRequester } from "@/lib/auth";
import { formatTimeAgo, formatDate } from "@/lib/mappers";

interface DashboardData {
  totalRequests: number;
  activeRequests: number;
  completedRequests: number;
  recentRequests: BloodRequestItem[];
}

export default function RequesterDashboardOverviewPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [requester, setRequester] = useState<AuthRequester | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentActivities, setRecentActivities] = useState<RequesterActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async (background = false) => {
    try {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // Fetch dashboard metrics & profile
      const [dashRes, notifRes] = await Promise.allSettled([
        api.requester.getDashboard(),
        api.notifications.getAll(),
      ]);

      if (dashRes.status === "fulfilled" && dashRes.value && dashRes.value.success) {
        const res = dashRes.value;
        const recentList = res.recentRequests || [];
        setData({
          totalRequests: res.totalRequests ?? 0,
          activeRequests: res.activeRequests ?? 0,
          completedRequests: res.completedRequests ?? 0,
          recentRequests: recentList,
        });

        // Map activities from real notifications if available
        if (
          notifRes.status === "fulfilled" &&
          notifRes.value &&
          notifRes.value.success &&
          notifRes.value.notifications &&
          notifRes.value.notifications.length > 0
        ) {
          const acts: RequesterActivityItem[] = notifRes.value.notifications.slice(0, 4).map((n) => {
            let actType: RequesterActivityItem["type"] = "verification";
            const lowerType = (n.type || "").toLowerCase();
            const lowerTitle = (n.title || "").toLowerCase();
            if (lowerType.includes("urgent") || lowerTitle.includes("emergency")) {
              actType = "alert";
            } else if (lowerType.includes("donor") || lowerTitle.includes("donor") || lowerTitle.includes("match")) {
              actType = "match";
            } else if (lowerType.includes("request") || lowerTitle.includes("request")) {
              actType = "request";
            }

            return {
              id: n.notificationid,
              title: n.title,
              description: n.message,
              timeAgo: formatTimeAgo(n.sentat || n.createdat),
              type: actType,
            };
          });
          setRecentActivities(acts);
        } else if (recentList.length > 0) {
          // Construct from recent requests
          const acts: RequesterActivityItem[] = recentList.slice(0, 3).map((r) => ({
            id: `act-${r.requestid}`,
            title: `Requisition REQ-${r.requestid.slice(0, 8).toUpperCase()}`,
            description: `Patient ${r.patientname}: ${r.unitsrequired} units ${r.bloodgroup} (${r.status.replace(/_/g, " ")})`,
            timeAgo: formatTimeAgo(r.createdat),
            type: r.isemergency ? "alert" : "request",
          }));
          setRecentActivities(acts);
        } else {
          // Initial clinical defaults
          setRecentActivities([
            {
              id: "act-init-1",
              title: "Care Desk Connected",
              description: "Requester account verified for regional hospital blood dispatch.",
              timeAgo: "Recently",
              type: "verification",
            },
            {
              id: "act-init-2",
              title: "Blood Bank Registry Online",
              description: "Live donor matching perimeter active across accredited facilities.",
              timeAgo: "Active",
              type: "request",
            },
          ]);
        }
      } else {
        setError("Failed to retrieve requester dashboard statistics.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to Swastya backend server.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);

    // Also get requester profile
    api.requester
      .getProfile()
      .then((res) => {
        if (res.success && res.requester) {
          setRequester({
            requesterid: res.requester.requesterid,
            userid: res.requester.userid,
            address: res.requester.address || "",
            city: res.requester.city || "",
            state: res.requester.state || "",
            pincode: res.requester.pincode || "",
            latitude: res.requester.latitude ? Number(res.requester.latitude) : null,
            longitude: res.requester.longitude ? Number(res.requester.longitude) : null,
            createdat: res.requester.createdat,
            updatedat: res.requester.updatedat,
          });
        }
      })
      .catch(() => {});

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("created") === "true") {
        const id = params.get("requestId");
        setSuccessBanner(
          id
            ? `Blood Requisition (ID: ${id.slice(0, 8).toUpperCase()}) submitted successfully! Live donor matching and hospital coordination are now active.`
            : "Blood Requisition submitted successfully! Live donor matching and hospital coordination are now active."
        );
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }

    fetchDashboardData();
  }, [fetchDashboardData]);

  if (isLoading && !data) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading requester coordination desk...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-lg mx-auto bg-white rounded-3xl border border-[#F3E9D1] text-center space-y-4 shadow-sm my-12">
        <div className="w-12 h-12 rounded-2xl bg-[#fdf2f2] text-[#A2363A] flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="font-serif text-lg font-bold text-[#053845]">Dashboard Unavailable</h2>
          <p className="text-xs text-slate-600">{error || "Could not retrieve requester information."}</p>
        </div>
        <button
          type="button"
          onClick={() => fetchDashboardData()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-all cursor-pointer shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  const latestRequest = data.recentRequests.length > 0 ? data.recentRequests[0] : null;
  const userCity = requester?.city && requester.city !== "Not Provided" ? requester.city : "Regional Network";

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start justify-between gap-3 text-xs sm:text-sm text-emerald-800 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <span className="font-bold block">Requisition Dispatched Successfully</span>
              <span className="text-emerald-700">{successBanner}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-600 hover:text-emerald-800 font-semibold cursor-pointer text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hero Welcome & Readiness Bar (mirrors DonorDashboardOverviewPage) */}
      <section className="bg-gradient-to-br from-[#053845] via-[#0b4d5e] to-[#053845] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        {/* Decorative background blurs */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#EFA27E]/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-1/3 -top-10 w-48 h-48 bg-[#317786]/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-[#EFA27E]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Verified Clinical Care Requester</span>
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight">
              Welcome back{user?.name ? `, ${user.name}` : ""}
            </h1>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              You currently have{" "}
              <strong className="text-white font-bold">
                {data.activeRequests} active {data.activeRequests === 1 ? "requisition" : "requisitions"}
              </strong>{" "}
              undergoing live donor matching and blood bank reservations across the regional clinical network.
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col items-start md:items-end gap-3 shrink-0">
            <Link
              href="/requester/requests/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] font-bold text-xs sm:text-sm shadow-md transition-all hover:scale-[1.02] cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Raise Blood Request</span>
            </Link>

            <span className="text-[11px] text-slate-300 flex items-center gap-1.5 self-center md:self-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Desk Status: Online ({userCity})</span>
            </span>
          </div>
        </div>

        {/* 4 Quick Vital Stats (mirrors Donor Vital Stats grid inside hero banner) */}
        <div className="relative z-10 mt-6 pt-6 border-t border-white/15 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Clinical Link
            </span>
            <div className="font-serif text-lg sm:text-xl font-bold text-emerald-300">
              Verified
            </div>
            <p className="text-[11px] text-slate-300">Hospital dispatch authorized</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Droplet className="w-3 h-3 text-[#EFA27E]" />
              Active Needs
            </span>
            <div className="font-serif text-lg sm:text-xl font-bold text-white">
              {data.activeRequests} {data.activeRequests === 1 ? "Requisition" : "Requisitions"}
            </div>
            <p className="text-[11px] text-slate-300">Live matching &amp; review</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Heart className="w-3 h-3 text-rose-300" />
              Fulfilled
            </span>
            <div className="font-serif text-lg sm:text-xl font-bold text-white">
              {data.completedRequests} {data.completedRequests === 1 ? "Transfusion" : "Transfusions"}
            </div>
            <p className="text-[11px] text-slate-300">Successfully completed</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Compass className="w-3 h-3 text-[#317786]" />
              Coverage Area
            </span>
            <div className="font-serif text-lg sm:text-xl font-bold text-white truncate">
              {userCity}
            </div>
            <p className="text-[11px] text-slate-300 truncate">Regional Transfusion Network</p>
          </div>
        </div>
      </section>

      {/* Main Dashboard Layout Grid (mirrors 12-column grid in Donor dashboard) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Priority Requisitions & Verification Record (7 cols) */}
        <div className="lg:col-span-7 space-y-6 lg:space-y-8">
          {/* Active Blood Requests */}
          <ActiveRequisitionsPreview requests={data.recentRequests} />

          {/* Latest Requisition Tracking Card */}
          <LatestRequisitionCard request={latestRequest} />
        </div>

        {/* Right Column: Profile Coordination & Guidance (5 cols) */}
        <div className="lg:col-span-5 space-y-6 lg:space-y-8">
          {/* Requester Profile Summary Widget */}
          <RequesterProfileSummary
            user={user}
            requester={requester}
            activeRequestsCount={data.activeRequests}
            totalRequestsCount={data.totalRequests}
          />

          {/* Clinical Guidance & Transfusion Protocol Advisory */}
          <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-3.5">
            <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/70">
              <div className="w-8 h-8 rounded-xl bg-[#FAF6EE] text-[#053845] flex items-center justify-center border border-[#F3E9D1]">
                <Info className="w-4 h-4 text-[#317786]" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-[#053845]">
                  Requisition &amp; Transfusion Guide
                </h3>
                <p className="text-[11px] text-slate-500">
                  Best practices for expedited clinical matching and hospital coordination
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1]/50">
                <span className="w-5 h-5 rounded-full bg-[#317786]/10 text-[#317786] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <p>
                  <strong>Specify exact blood group &amp; component:</strong> Clearly identify whether whole blood, packed red cells (PRBC), or single-donor platelets (SDP) are required.
                </p>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1]/50">
                <span className="w-5 h-5 rounded-full bg-[#317786]/10 text-[#317786] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <p>
                  <strong>Include hospital &amp; ward coordinates:</strong> Accurate hospital selection enables automatic distance calculation and alerts nearby voluntary donors within radius.
                </p>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1]/50">
                <span className="w-5 h-5 rounded-full bg-[#317786]/10 text-[#317786] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <p>
                  <strong>Keep contact channels responsive:</strong> Once a donor confirms availability or a blood bank reserves units, coordinate promptly with the attending hematologist.
                </p>
              </div>
            </div>
          </div>

          {/* Recent Activity Timeline */}
          <RequesterRecentActivityPreview activities={recentActivities} />
        </div>
      </div>
    </div>
  );
}
