"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  Tent,
  ArrowLeft,
  Users,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Droplets,
  Calendar,
  Ban,
  FileCheck,
  Loader2,
  UserCheck,
} from "lucide-react";
import { api, DonationCampItem, CampRegistrationItem } from "@/lib/api";

function formatAttendanceBadge(attendance: string) {
  switch (attendance) {
    case "ATTENDED":
      return { label: "Attended", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "NOT_ATTENDED":
      return { label: "Absent / Not Attended", badge: "bg-slate-100 text-slate-600 border-slate-200" };
    case "PENDING":
    default:
      return { label: "Pending Attendance", badge: "bg-amber-50 text-amber-700 border-amber-200" };
  }
}

export default function CampRegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const campId = resolvedParams.id;

  const [camp, setCamp] = useState<DonationCampItem | null>(null);
  const [registrations, setRegistrations] = useState<CampRegistrationItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [attendedCount, setAttendedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [attendanceFilter, setAttendanceFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Attendance Modal
  const [selectedReg, setSelectedReg] = useState<CampRegistrationItem | null>(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState<"ATTENDED" | "NOT_ATTENDED">("ATTENDED");
  const [unitsDonated, setUnitsDonated] = useState<number | "">(1);
  const [attendanceNotes, setAttendanceNotes] = useState("");
  const [isUpdatingAttendance, setIsUpdatingAttendance] = useState(false);

  // Cancellation Modal
  const [cancelRegTarget, setCancelRegTarget] = useState<CampRegistrationItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancellingReg, setIsCancellingReg] = useState(false);

  const fetchRegistrations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [campRes, regRes] = await Promise.all([
        api.bloodbank.camps.getById(campId),
        api.bloodbank.camps.getRegistrations(campId, {
          status: statusFilter === "ALL" ? undefined : statusFilter,
          attendance: attendanceFilter === "ALL" ? undefined : attendanceFilter,
          search: searchQuery.trim() || undefined,
          page,
          limit: 20,
        }),
      ]);

      if (campRes.success && campRes.data) {
        setCamp(campRes.data);
      }
      if (regRes.success && regRes.data) {
        setRegistrations(regRes.data.registrations);
        setTotalCount(regRes.data.total);
        setRegisteredCount(regRes.data.registeredCount);
        setAttendedCount(regRes.data.attendedCount);
        setTotalPages(regRes.data.totalPages || 1);
      }
    } catch (err: any) {
      console.error("Error loading camp registrations:", err);
      setError(err?.message || "Failed to load registrations.");
    } finally {
      setIsLoading(false);
    }
  }, [campId, statusFilter, attendanceFilter, searchQuery, page]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  const handleSaveAttendance = async () => {
    if (!selectedReg) return;
    setIsUpdatingAttendance(true);
    try {
      const res = await api.bloodbank.camps.updateAttendance(campId, selectedReg.registrationid, {
        attendancestatus: attendanceStatus,
        unitsdonated: attendanceStatus === "ATTENDED" && unitsDonated !== "" ? Number(unitsDonated) : null,
        attendancenotes: attendanceNotes.trim() || null,
      });

      if (res.success) {
        setShowAttendanceModal(false);
        setSelectedReg(null);
        setActionSuccess(`Attendance recorded for ${selectedReg.donor.name}.`);
        fetchRegistrations();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to record attendance");
    } finally {
      setIsUpdatingAttendance(false);
    }
  };

  const handleCancelRegistration = async () => {
    if (!cancelRegTarget) return;
    if (!cancelReason.trim()) {
      alert("Cancellation reason is required.");
      return;
    }

    setIsCancellingReg(true);
    try {
      const res = await api.bloodbank.camps.cancelRegistration(
        campId,
        cancelRegTarget.registrationid,
        cancelReason.trim()
      );

      if (res.success) {
        setCancelRegTarget(null);
        setCancelReason("");
        setActionSuccess(`Registration ${cancelRegTarget.registrationreference} cancelled.`);
        fetchRegistrations();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to cancel registration");
    } finally {
      setIsCancellingReg(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#053845] pb-24">
      {/* Top Banner */}
      <div className="bg-white border-b border-[#F3E9D1]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href={`/bloodbank/camps/${campId}`}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#053845] transition mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Camp Details</span>
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-[#053845]">
                    {camp?.campname || "Camp"} — Registrations & Attendance
                  </h1>
                  <p className="text-xs text-slate-500">
                    Manage volunteer donor registrations, verify reference codes, and record units collected.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Counts */}
            <div className="flex items-center gap-3">
              <div className="px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="text-slate-400 font-medium">Registered: </span>
                <span className="font-bold text-slate-800">{registeredCount}</span>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                <span className="text-emerald-600 font-medium">Attended: </span>
                <span className="font-bold text-emerald-800">{attendedCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {actionSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Filter Bar */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 mb-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search by donor name or reference code (e.g. CAMP-2026...)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-400 px-2 font-medium">Status:</span>
              {["ALL", "REGISTERED", "CANCELLED"].map((st) => (
                <button
                  key={st}
                  onClick={() => {
                    setStatusFilter(st);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition font-medium ${
                    statusFilter === st ? "bg-[#053845] text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {st === "ALL" ? "All" : st.charAt(0) + st.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-400 px-2 font-medium">Attendance:</span>
              {["ALL", "PENDING", "ATTENDED", "NOT_ATTENDED"].map((at) => (
                <button
                  key={at}
                  onClick={() => {
                    setAttendanceFilter(at);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition font-medium ${
                    attendanceFilter === at ? "bg-[#053845] text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {at === "ALL" ? "All" : at === "NOT_ATTENDED" ? "Absent" : at.charAt(0) + at.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => fetchRegistrations()}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Registrations Table */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-[#053845] mx-auto mb-3" />
              <p className="text-sm text-slate-500">Loading registrations...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-rose-600">
              <p>{error}</p>
            </div>
          ) : registrations.length === 0 ? (
            <div className="py-20 text-center px-4">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800">No donor registrations found</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
                {searchQuery || statusFilter !== "ALL" || attendanceFilter !== "ALL"
                  ? "Try adjusting your search query or filters."
                  : "No donors have registered for this camp yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-6">Donor Details</th>
                    <th className="py-3.5 px-6">Blood Group</th>
                    <th className="py-3.5 px-6">Reference Code</th>
                    <th className="py-3.5 px-6">Registration Date</th>
                    <th className="py-3.5 px-6">Registration Status</th>
                    <th className="py-3.5 px-6">Attendance</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {registrations.map((reg) => {
                    const atBadge = formatAttendanceBadge(reg.attendancestatus);
                    const isCancelled = reg.registrationstatus === "CANCELLED";

                    return (
                      <tr key={reg.registrationid} className="hover:bg-slate-50/60 transition">
                        <td className="py-4 px-6">
                          <span className="font-semibold text-slate-800 block">{reg.donor.name}</span>
                          <span className="text-xs text-slate-500">
                            {reg.donor.gender} • {reg.donor.city}
                          </span>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-lg text-xs">
                            <Droplets className="w-3.5 h-3.5" />
                            <span>{reg.donor.bloodgroup}</span>
                          </span>
                        </td>

                        <td className="py-4 px-6 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {reg.registrationreference}
                        </td>

                        <td className="py-4 px-6 text-xs text-slate-600 whitespace-nowrap">
                          {new Date(reg.registrationdate).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                              isCancelled
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {reg.registrationstatus}
                          </span>
                          {isCancelled && reg.cancellationreason && (
                            <span className="text-[11px] text-slate-400 block mt-0.5 truncate max-w-xs" title={reg.cancellationreason}>
                              Reason: {reg.cancellationreason}
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${atBadge.badge}`}>
                            {atBadge.label}
                          </span>
                          {reg.attendancestatus === "ATTENDED" && reg.unitsdonated && (
                            <span className="text-xs text-slate-600 block mt-0.5 font-medium">
                              {reg.unitsdonated} unit(s) donated
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          {!isCancelled ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedReg(reg);
                                  setAttendanceStatus(reg.attendancestatus === "ATTENDED" ? "ATTENDED" : "ATTENDED");
                                  setUnitsDonated(reg.unitsdonated || 1);
                                  setAttendanceNotes(reg.attendancenotes || "");
                                  setShowAttendanceModal(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition"
                              >
                                Record Attendance
                              </button>

                              {reg.attendancestatus !== "ATTENDED" && (
                                <button
                                  onClick={() => {
                                    setCancelRegTarget(reg);
                                    setCancelReason("");
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No actions</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="bg-white border-t border-slate-100 px-6 py-4 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Showing {registrations.length} of {totalCount} registrations
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium disabled:opacity-40 hover:bg-slate-50"
                >
                  Previous
                </button>
                <span className="text-xs font-medium px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium disabled:opacity-40 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Record Attendance Modal */}
      {showAttendanceModal && selectedReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#F3E9D1]">
            <div className="flex items-center gap-3 text-emerald-700 mb-4">
              <UserCheck className="w-6 h-6" />
              <div>
                <h3 className="text-base font-bold text-slate-800">Record Donor Attendance</h3>
                <p className="text-xs text-slate-500">
                  {selectedReg.donor.name} ({selectedReg.registrationreference})
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Attendance Status</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAttendanceStatus("ATTENDED")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                      attendanceStatus === "ATTENDED"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Attended / Donated
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceStatus("NOT_ATTENDED")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                      attendanceStatus === "NOT_ATTENDED"
                        ? "bg-slate-700 text-white border-slate-700"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Absent / Not Attended
                  </button>
                </div>
              </div>

              {attendanceStatus === "ATTENDED" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Units Donated (Standard: 1 unit)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={2}
                    value={unitsDonated}
                    onChange={(e) => setUnitsDonated(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Staff Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Donor passed pre-donation screening successfully."
                  value={attendanceNotes}
                  onChange={(e) => setAttendanceNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowAttendanceModal(false);
                  setSelectedReg(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isUpdatingAttendance}
                onClick={handleSaveAttendance}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {isUpdatingAttendance && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Attendance</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Registration Modal */}
      {cancelRegTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#F3E9D1]">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <Ban className="w-6 h-6" />
              <div>
                <h3 className="text-base font-bold text-slate-800">Cancel Donor Registration</h3>
                <p className="text-xs text-slate-500">
                  {cancelRegTarget.donor.name} ({cancelRegTarget.registrationreference})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Cancelling releases this slot back to available capacity. The registration history is permanently retained.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cancellation Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Donor notified inability to attend due to travel..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setCancelRegTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition"
              >
                Go Back
              </button>

              <button
                type="button"
                disabled={isCancellingReg || !cancelReason.trim()}
                onClick={handleCancelRegistration}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {isCancellingReg && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Cancellation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
