"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getStoredUser, isAuthenticated } from "@/lib/auth";
import {
  Activity,
  Heart,
  Building,
  Search,
  PlusCircle,
  Bell,
  LogOut,
  CheckCircle2,
  Droplet,
  ArrowRight,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"all" | "emergency" | "matching" | "fulfilled">("all");

  useEffect(() => {
    if (isAuthenticated()) {
      const user = getStoredUser();
      if (user?.role === "DONOR") {
        router.replace("/donor/dashboard");
      } else if (user?.role === "REQUESTER" || (user?.role as any) === "PATIENT") {
        router.replace("/requester/dashboard");
      } else if (user?.role === "HOSPITAL") {
        router.replace("/hospital/dashboard");
      } else if (user?.role === "BLOOD_BANK") {
        router.replace("/bloodbank/dashboard");
      }
    }
  }, [router]);

  const requests = [
    {
      id: "REQ-8491",
      patient: "Priya Sundaram",
      hospital: "St. Jude Hospital",
      bloodGroup: "O+",
      units: 2,
      urgency: "Emergency",
      status: "Matching in Progress",
      time: "12 mins ago",
      statusColor: "bg-[#A2363A]/10 text-[#A2363A] border-[#A2363A]/20",
    },
    {
      id: "REQ-8490",
      patient: "Venkatesh Rao",
      hospital: "City Care Clinic",
      bloodGroup: "B+",
      units: 1,
      urgency: "Urgent",
      status: "Donor Contacted",
      time: "34 mins ago",
      statusColor: "bg-[#B94F30]/10 text-[#B94F30] border-[#B94F30]/20",
    },
    {
      id: "REQ-8488",
      patient: "Farida Sheikh",
      hospital: "Metro Memorial Hospital",
      bloodGroup: "AB-",
      units: 3,
      urgency: "Standard",
      status: "Inventory Reserved",
      time: "1 hour ago",
      statusColor: "bg-[#317786]/10 text-[#317786] border-[#317786]/20",
    },
    {
      id: "REQ-8485",
      patient: "Anand Verma",
      hospital: "Apollo Transit Wing",
      bloodGroup: "A+",
      units: 2,
      urgency: "Emergency",
      status: "Fulfilled & Dispatched",
      time: "2 hours ago",
      statusColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF6EE] text-slate-800 antialiased selection:bg-[#EFA27E]/30 selection:text-[#053845]">
      {/* Top Header */}
      <header className="border-b border-[#F3E9D1] bg-white/90 backdrop-blur-md sticky top-0 z-30 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/swastya-logo.svg"
              alt="Swastya Lotus Logo"
              width={38}
              height={30}
              className="h-8 w-auto object-contain"
              priority
            />
            <div className="flex flex-col text-left">
              <span className="font-serif text-lg font-bold tracking-tight text-[#053845] leading-none">
                Swastya
              </span>
              <span className="text-[8px] tracking-widest uppercase font-semibold text-[#317786] mt-0.5">
                COORDINATION CENTER
              </span>
            </div>
          </Link>

          {/* Quick Actions & Profile */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="p-2 rounded-lg text-slate-500 hover:text-[#053845] hover:bg-slate-100 transition-colors relative cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#B94F30]" />
            </button>

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#317786]/10 text-[#317786] font-semibold text-xs flex items-center justify-center border border-[#317786]/20">
                SW
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-[#053845] leading-none">Active User</span>
                <span className="text-[10px] text-slate-500 mt-0.5">Coordination Desk</span>
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#A2363A] px-2.5 py-1.5 rounded-md hover:bg-[#fdf2f2] transition-colors ml-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="flex-grow py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Voluntary Donor Portal Switcher Banner */}
          <div className="bg-[#FAF6EE] rounded-xl border border-[#F3E9D1] p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#317786]" />
              <span className="text-slate-600">
                Registered as a voluntary blood donor? Access your personalized Donor Dashboard:
              </span>
            </div>
            <Link
              href="/donor/dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#317786] text-white font-semibold hover:bg-[#245964] transition-colors self-start sm:self-auto flex-shrink-0"
            >
              Open Donor Dashboard →
            </Link>
          </div>

          {/* Welcome Banner */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-xs p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#317786]/10 border border-[#317786]/20 text-[#053845] text-[10px] font-semibold tracking-wider uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-[#317786]" />
                LIVE PLATFORM STATUS
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
                Welcome to your Coordination Center
              </h1>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Track clinical blood requirements, discover matching regional donors, and monitor real-time fulfillment across partner hospitals and licensed blood banks.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] shadow-sm transition-all cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                Raise Blood Request
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-[#053845] bg-white border border-slate-200 hover:border-[#317786] transition-all cursor-pointer shadow-xs"
              >
                <Search className="w-4 h-4" />
                Find Donors
              </button>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#F3E9D1] shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Requests</span>
                <div className="w-7 h-7 rounded-lg bg-[#A2363A]/10 text-[#A2363A] flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold font-serif text-[#053845]">14</div>
              <p className="text-[11px] text-slate-500 mt-1">4 emergency cases in progress</p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#F3E9D1] shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Matching Donors</span>
                <div className="w-7 h-7 rounded-lg bg-[#EFA27E]/20 text-[#B94F30] flex items-center justify-center">
                  <Heart className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold font-serif text-[#053845]">128</div>
              <p className="text-[11px] text-slate-500 mt-1">Available within 15 km radius</p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#F3E9D1] shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Verified Reserves</span>
                <div className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center">
                  <Building className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold font-serif text-[#053845]">42</div>
              <p className="text-[11px] text-slate-500 mt-1">Units logged by 6 blood banks</p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#F3E9D1] shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Fulfilled Today</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold font-serif text-[#053845]">9</div>
              <p className="text-[11px] text-slate-500 mt-1">Successful transfusions verified</p>
            </div>
          </div>

          {/* Coordination Requests Table */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-xs overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-serif text-lg sm:text-xl font-bold text-[#053845]">
                  Recent Coordination Requests
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time status updates across clinical hospital and blood bank channels.
                </p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                    activeTab === "all" ? "bg-white text-[#053845] shadow-xs" : "text-slate-600 hover:text-[#053845]"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("emergency")}
                  className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                    activeTab === "emergency" ? "bg-white text-[#053845] shadow-xs" : "text-slate-600 hover:text-[#053845]"
                  }`}
                >
                  Emergency
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("matching")}
                  className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                    activeTab === "matching" ? "bg-white text-[#053845] shadow-xs" : "text-slate-600 hover:text-[#053845]"
                  }`}
                >
                  Matching
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-5 font-semibold">Request ID</th>
                    <th className="py-3 px-5 font-semibold">Patient</th>
                    <th className="py-3 px-5 font-semibold">Hospital</th>
                    <th className="py-3 px-5 font-semibold">Blood Group</th>
                    <th className="py-3 px-5 font-semibold">Units</th>
                    <th className="py-3 px-5 font-semibold">Status</th>
                    <th className="py-3 px-5 font-semibold">Time</th>
                    <th className="py-3 px-5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-[#053845]">{req.id}</td>
                      <td className="py-3.5 px-5 text-slate-700 font-medium">{req.patient}</td>
                      <td className="py-3.5 px-5 text-slate-600">{req.hospital}</td>
                      <td className="py-3.5 px-5">
                        <span className="inline-flex items-center gap-1 font-bold text-[#B94F30]">
                          <Droplet className="w-3 h-3 fill-current" />
                          {req.bloodGroup}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-slate-600">{req.units} units</td>
                      <td className="py-3.5 px-5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${req.statusColor}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-slate-400 text-xs">{req.time}</td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#317786] hover:text-[#245964] hover:underline cursor-pointer"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-center">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#317786] hover:text-[#245964]"
              >
                Return to Swastya Public Platform <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#F3E9D1] py-4 text-center text-xs text-slate-500 bg-white/50 flex-shrink-0">
        <p>© 2026 Swastya Health Systems. All rights reserved. Platform designed solely for coordination support.</p>
      </footer>
    </div>
  );
}
