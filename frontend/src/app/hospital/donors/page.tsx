"use client";

import React, { useState, useEffect, useCallback, useId, useRef } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Filter,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  FileSpreadsheet,
  ChevronRight,
  ChevronLeft,
  X,
  Copy,
  Check,
  Eye,
  RefreshCw,
  Droplets,
  Calendar,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  Building2,
  FileText,
  AlertTriangle,
  Info,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import {
  api,
  DonorRegistryItem,
  DonorDetailItem,
  ImportPreviewResult,
  ImportCommitResult,
} from "@/lib/api";
import { DonorCard } from "@/components/hospital/DonorCard";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function HospitalDonorsPage() {
  // Registry list states
  const [donors, setDonors] = useState<DonorRegistryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string>("");
  const [selectedAccountStatus, setSelectedAccountStatus] = useState<string>("");
  const [selectedVerificationStatus, setSelectedVerificationStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Selected donor detail drawer
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const [donorDetail, setDonorDetail] = useState<DonorDetailItem | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [updatingHistoryId, setUpdatingHistoryId] = useState<string | null>(null);

  // Upload modal states
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState<"csv" | "xlsx" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load donor registry
  const loadRegistry = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.hospital.getDonors({
        search: search || undefined,
        bloodGroup: selectedBloodGroup || undefined,
        accountStatus: selectedAccountStatus || undefined,
        verificationStatus: selectedVerificationStatus || undefined,
        page,
        limit: 12,
      });

      if (res.success) {
        setDonors(res.donors || []);
        setTotalRecords(res.total || 0);
        setTotalPages(Math.ceil((res.total || 0) / (res.limit || 12)) || 1);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load hospital donor registry.");
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedBloodGroup, selectedAccountStatus, selectedVerificationStatus, page]);

  useEffect(() => {
    loadRegistry();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "import") {
        setIsUploadOpen(true);
      }
    }
  }, [loadRegistry]);

  // Load donor detail drawer
  const loadDonorDetail = useCallback(async (donorId: string) => {
    setSelectedDonorId(donorId);
    setIsDetailLoading(true);
    setDetailError(null);
    try {
      const res = await api.hospital.getDonorDetails(donorId);
      if (res.success) {
        setDonorDetail(res.donor);
      }
    } catch (err: any) {
      setDetailError(err?.message || "Failed to load donor details.");
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  // Update historical donation verification status
  const handleVerifyDonation = async (historyId: string, status: "VERIFIED" | "REJECTED") => {
    if (!selectedDonorId) return;
    setUpdatingHistoryId(historyId);
    try {
      const res = await api.hospital.updateDonationStatus(selectedDonorId, historyId, {
        status,
        remarks: `Updated by hospital clinical coordinator on ${new Date().toLocaleDateString()}`,
      });
      if (res.success) {
        // Refresh detail
        await loadDonorDetail(selectedDonorId);
        // Refresh list in background
        loadRegistry();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to update verification status.");
    } finally {
      setUpdatingHistoryId(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const processFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls" && ext !== "csv") {
      setUploadError("Invalid file type. Please upload a valid .xlsx or .csv spreadsheet.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size exceeds 5MB limit. Please upload a smaller file.");
      return;
    }
    setUploadFile(file);
    setUploadError(null);
    setPreviewResult(null);
    setCommitResult(null);
  };

  // Handle file selection for upload via file dialog
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Drag-and-drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDownloadTemplate = async (format: "csv" | "xlsx") => {
    setDownloadingTemplate(format);
    setUploadError(null);
    try {
      const blob = await api.hospital.downloadTemplate(format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Swastya_Donor_Import_Template.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setUploadError(err?.message || `Failed to download ${format.toUpperCase()} template.`);
    } finally {
      setDownloadingTemplate(null);
    }
  };

  // Preview file upload (Step 1)
  const handlePreviewUpload = async () => {
    if (!uploadFile) return;
    setIsParsing(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const res = await api.hospital.previewImport(formData);
      if (res.success) {
        setPreviewResult(res);
      }
    } catch (err: any) {
      setUploadError(err?.message || "Failed to preview import file.");
    } finally {
      setIsParsing(false);
    }
  };

  // Commit import (Step 2)
  const handleCommitImport = async () => {
    if (!previewResult) return;
    setIsCommitting(true);
    setUploadError(null);
    try {
      const res = await api.hospital.commitImport({
        toCreate: previewResult.toCreate,
        toLink: previewResult.toLink,
        validDonations: previewResult.validDonations,
      });

      if (res.success) {
        setCommitResult(res);
        // Refresh registry table
        loadRegistry();
      }
    } catch (err: any) {
      setUploadError(err?.message || "Failed to commit donor import.");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCopyActivationUrl = (url: string, token: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const resetUploadModal = () => {
    setIsUploadOpen(false);
    setUploadFile(null);
    setPreviewResult(null);
    setCommitResult(null);
    setUploadError(null);
    setIsDragging(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/hospital/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Hospital Dashboard</span>
        </Link>

        {!isLoading && (
          <span className="text-xs text-slate-500">
            Showing {donors.length} of {totalRecords} registered donors
          </span>
        )}
      </div>

      {/* Page Header Container */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[#317786] animate-pulse" />
              <span className="text-xs font-bold text-[#317786] uppercase tracking-wider">
                Private Hospital Roster
              </span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
              Donor Registry & Historical Records
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Manage donors registered with your facility, bulk import legacy Excel/CSV records, and verify historical donations safely.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Download Template Buttons */}
            <div className="flex items-center rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs p-1">
              <a
                href={api.hospital.getTemplateUrl("csv")}
                download="Swastya_Donor_Template.csv"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-[#053845] hover:bg-white transition-all"
                title="Download standard CSV template"
              >
                <Download className="w-3.5 h-3.5" />
                CSV Template
              </a>
              <div className="w-px h-4 bg-[#F3E9D1] mx-1" />
              <a
                href={api.hospital.getTemplateUrl("xlsx")}
                download="Swastya_Donor_Template.xlsx"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-[#053845] hover:bg-white transition-all"
                title="Download Excel workbook template (Donors + Donations sheets)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Excel Template
              </a>
            </div>

            {/* Upload Donors Button */}
            <button
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-semibold text-xs sm:text-sm text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-xs hover:scale-[1.02] cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Donors</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#317786] focus:border-transparent bg-[#FAF6EE]/50"
            />
          </div>

          {/* Blood Group Filter */}
          <div>
            <select
              value={selectedBloodGroup}
              onChange={(e) => {
                setSelectedBloodGroup(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#317786] bg-[#FAF6EE]/50 text-slate-700"
            >
              <option value="">All Blood Groups</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  Blood Group: {bg}
                </option>
              ))}
            </select>
          </div>

          {/* Account Status Filter */}
          <div>
            <select
              value={selectedAccountStatus}
              onChange={(e) => {
                setSelectedAccountStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#317786] bg-[#FAF6EE]/50 text-slate-700"
            >
              <option value="">All Account Statuses</option>
              <option value="ACTIVATED">Active Swastya Accounts</option>
              <option value="PENDING_ACTIVATION">Pending Activation</option>
            </select>
          </div>

          {/* Verification Status Filter */}
          <div>
            <select
              value={selectedVerificationStatus}
              onChange={(e) => {
                setSelectedVerificationStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#317786] bg-[#FAF6EE]/50 text-slate-700"
            >
              <option value="">All Verification Statuses</option>
              <option value="VERIFIED">Has Verified Records</option>
              <option value="PENDING">Has Pending Records</option>
              <option value="REJECTED">Has Rejected Records</option>
            </select>
          </div>
        </div>

        {/* Active Filter Chips */}
        {(selectedBloodGroup || selectedAccountStatus || selectedVerificationStatus || search) && (
          <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">Active filters:</span>
            {search && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                Keyword: &quot;{search}&quot;
                <button onClick={() => setSearch("")} className="hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedBloodGroup && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                Blood: {selectedBloodGroup}
                <button onClick={() => setSelectedBloodGroup("")} className="hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedAccountStatus && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Status: {selectedAccountStatus}
                <button onClick={() => setSelectedAccountStatus("")} className="hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedVerificationStatus && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Verification: {selectedVerificationStatus}
                <button onClick={() => setSelectedVerificationStatus("")} className="hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setSearch("");
                setSelectedBloodGroup("");
                setSelectedAccountStatus("");
                setSelectedVerificationStatus("");
                setPage(1);
              }}
              className="text-xs text-[#317786] hover:underline font-medium ml-2"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Registry Table & Content */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[#317786]" />
            <p className="text-sm font-medium text-slate-600">Loading hospital donor registry...</p>
          </div>
        ) : error ? (
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center gap-3">
            <AlertCircle className="w-8 h-8 text-rose-500" />
            <h3 className="font-serif text-base font-bold text-slate-800">Error loading registry</h3>
            <p className="text-xs text-slate-500 max-w-md">{error}</p>
            <button
              onClick={loadRegistry}
              className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : donors.length === 0 ? (
          <div className="py-20 px-4 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-slate-400">
              <Users className="w-7 h-7 text-[#317786]" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#053845]">No donors found</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              {search || selectedBloodGroup || selectedAccountStatus || selectedVerificationStatus
                ? "No registered donors match your current filter criteria."
                : "Your hospital does not have any donors in its registry yet. Click 'Upload Donors' to bulk import records."}
            </p>
            {!search && !selectedBloodGroup && !selectedAccountStatus && (
              <button
                onClick={() => setIsUploadOpen(true)}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Existing Donors
              </button>
            )}
          </div>
        ) : (
          <div className="p-5 sm:p-6 bg-[#FAF6EE]/15">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {donors.map((donor) => (
                <DonorCard
                  key={donor.donorId}
                  donor={donor}
                  onViewDetails={loadDonorDetail}
                />
              ))}
            </div>
          </div>
        )}

        {/* Pagination Footer */}
        {totalRecords > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#F3E9D1] bg-[#FAF6EE]/40 text-xs text-slate-600">
            <span>
              Showing {donors.length} of {totalRecords} registered donors
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium text-slate-800">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* INDIVIDUAL DONOR DETAIL DRAWER / MODAL */}
      {selectedDonorId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-[#F3E9D1] bg-[#FAF6EE] flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-[#317786] uppercase tracking-wider">
                  Donor Profile & Clinical History
                </span>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  {donorDetail?.name || "Donor Details"}
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedDonorId(null);
                  setDonorDetail(null);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isDetailLoading ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#317786]" />
                  <p className="text-sm font-medium text-slate-600">Loading donor profile...</p>
                </div>
              ) : detailError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{detailError}</span>
                </div>
              ) : donorDetail ? (
                <>
                  {/* Profile Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] space-y-1">
                      <span className="text-xs text-slate-500">Blood Group</span>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-sm font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          {donorDetail.bloodGroup}
                        </span>
                        <span className="text-xs text-slate-600">({donorDetail.gender})</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] space-y-1">
                      <span className="text-xs text-slate-500">Account Onboarding</span>
                      <div>
                        {donorDetail.accountStatus === "ACTIVATED" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Activated Account
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3.5 h-3.5" /> Pending Activation
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Permitted Contact Details */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                      Permitted Profile Data
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>{donorDetail.email || "No email recorded"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>{donorDetail.phoneNumber || "No phone recorded"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>
                          {donorDetail.city}
                          {donorDetail.state ? `, ${donorDetail.state}` : ""}
                          {donorDetail.pincode ? ` - ${donorDetail.pincode}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Legacy Ref: {donorDetail.sourceIdentifier || "None assigned"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Donation Records at this facility */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                        Facility Donation History ({donorDetail.donations.length})
                      </h4>
                      <span className="text-[11px] text-slate-500">Live & Historical Records</span>
                    </div>

                    {donorDetail.donations.length === 0 ? (
                      <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs">
                        No donation records found for this donor at your hospital.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {donorDetail.donations.map((d) => (
                          <div
                            key={d.donationHistoryId}
                            className="p-4 rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/40 space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-800">
                                  {new Date(d.donationDate).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                                {d.isImported ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                    Historical Import
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                    Swastya Live Donation
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {d.verificationStatus === "VERIFIED" && (
                                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    ✓ Verified
                                  </span>
                                )}
                                {d.verificationStatus === "PENDING" && (
                                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    ⏳ Pending Verification
                                  </span>
                                )}
                                {d.verificationStatus === "REJECTED" && (
                                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                    ✕ Rejected
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-slate-600">
                              <div>
                                Component: <strong className="text-slate-800">{d.bloodComponent}</strong>
                              </div>
                              <div>
                                Units: <strong className="text-slate-800">{d.unitsDonated}</strong>
                              </div>
                              {d.sourceRecordId && (
                                <div className="col-span-2 text-slate-500">
                                  Source Ref: <strong>{d.sourceRecordId}</strong>
                                </div>
                              )}
                              {d.remarks && (
                                <div className="col-span-2 text-slate-500 italic bg-white p-2 rounded-lg border border-slate-100">
                                  {d.remarks}
                                </div>
                              )}
                            </div>

                            {/* Verification action buttons for historical records */}
                            {d.isImported && (
                              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-end gap-2">
                                {d.verificationStatus !== "VERIFIED" && (
                                  <button
                                    disabled={updatingHistoryId === d.donationHistoryId}
                                    onClick={() => handleVerifyDonation(d.donationHistoryId, "VERIFIED")}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200"
                                  >
                                    Verify Record
                                  </button>
                                )}
                                {d.verificationStatus !== "REJECTED" && (
                                  <button
                                    disabled={updatingHistoryId === d.donationHistoryId}
                                    onClick={() => handleVerifyDonation(d.donationHistoryId, "REJECTED")}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors border border-rose-200"
                                  >
                                    Reject Record
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* TWO-STEP BULK UPLOAD MODAL */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#F3E9D1] bg-[#FAF6EE] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[#317786] uppercase tracking-wider">
                  Bulk Donor Onboarding
                </span>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  Upload Donors & Historical Records
                </h3>
              </div>
              <button
                onClick={resetUploadModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {uploadError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* STEP 1: Select File & Preview */}
              {!previewResult && !commitResult && (
                <div className="space-y-4">
                  {/* Hidden native input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {/* Template Download Utility */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white border border-[#F3E9D1] flex items-center justify-center text-[#317786] shrink-0">
                        <Download className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#053845]">Need standard spreadsheet templates?</div>
                        <div className="text-[11px] text-slate-500">Download formatted files with sample donor & history rows</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={Boolean(downloadingTemplate)}
                        onClick={() => handleDownloadTemplate("csv")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#053845] bg-white border border-[#F3E9D1] hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs"
                      >
                        {downloadingTemplate === "csv" ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#317786]" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-[#317786]" />
                        )}
                        <span>.CSV Template</span>
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(downloadingTemplate)}
                        onClick={() => handleDownloadTemplate("xlsx")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#053845] bg-white border border-[#F3E9D1] hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs"
                      >
                        {downloadingTemplate === "xlsx" ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        ) : (
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span>.XLSX Template</span>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Drag & Drop Area */}
                  <div
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-2xl p-7 text-center transition-all duration-150 cursor-pointer select-none ${
                      isDragging
                        ? "border-[#317786] bg-[#FAF6EE] ring-4 ring-[#317786]/20 scale-[1.01]"
                        : uploadFile
                        ? "border-emerald-300 bg-emerald-50/20 hover:bg-emerald-50/40"
                        : "border-[#F3E9D1] bg-[#FAF6EE]/30 hover:bg-[#FAF6EE]/60 hover:border-[#317786]/60"
                    }`}
                  >
                    {uploadFile ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-100/70 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-xs">
                          <FileSpreadsheet className="w-7 h-7" />
                        </div>
                        <div className="space-y-1 max-w-md">
                          <div className="text-sm font-bold text-[#053845] break-all">
                            {uploadFile.name}
                          </div>
                          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">{formatFileSize(uploadFile.size)}</span>
                            <span>•</span>
                            <span className="uppercase font-semibold text-emerald-700">
                              {uploadFile.name.split(".").pop()} File
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-800 bg-emerald-100 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Ready for Preview & Validation
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUploadFile(null);
                              setUploadError(null);
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Click or drop another file to replace
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className={`w-14 h-14 rounded-2xl bg-white border flex items-center justify-center transition-colors shadow-xs ${
                            isDragging ? "border-[#317786] text-[#317786]" : "border-[#F3E9D1] text-[#317786]"
                          }`}
                        >
                          {isDragging ? (
                            <Upload className="w-7 h-7 animate-bounce" />
                          ) : (
                            <FileSpreadsheet className="w-7 h-7" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm font-bold text-[#053845]">
                            {isDragging ? "Drop your spreadsheet file here" : "Drag and drop your spreadsheet here"}
                          </div>
                          <div className="text-xs text-slate-500">
                            or <span className="font-semibold text-[#317786] underline underline-offset-2">browse from your computer</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Supports Excel (.xlsx, .xls) and CSV (.csv) up to 5MB. Multi-sheet workbooks supported.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Mapping Guide */}
                  <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 text-xs text-blue-800 space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Info className="w-4 h-4 text-blue-600 shrink-0" />
                      Spreadsheet Column Mapping Guide
                    </div>
                    <p className="text-blue-700">
                      <strong>Donors Sheet:</strong> Full Name, Email, Phone Number, Blood Group (A+, O-, A+ve, etc.), Date of Birth (YYYY-MM-DD or DD/MM/YYYY), Gender, City, Source Donor ID.
                    </p>
                    <p className="text-blue-700">
                      <strong>Donations Sheet (Optional):</strong> Donor Identifier (Email or Phone), Donation Date, Units Donated, Blood Component (WHOLE_BLOOD, PLATELETS), Source Record ID.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={resetUploadModal}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!uploadFile || isParsing}
                      onClick={handlePreviewUpload}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs"
                    >
                      {isParsing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Validating File...
                        </>
                      ) : (
                        "Preview & Validate"
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Preview Results & Confirmation */}
              {previewResult && !commitResult && (
                <div className="space-y-6">
                  {/* Summary metric cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-lg font-bold text-slate-800">
                        {previewResult.summary.totalRows}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">Total Rows</div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="text-lg font-bold text-emerald-700">
                        {previewResult.summary.toCreateCount}
                      </div>
                      <div className="text-[11px] text-emerald-600 font-medium">New Donors</div>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                      <div className="text-lg font-bold text-blue-700">
                        {previewResult.summary.toLinkCount}
                      </div>
                      <div className="text-[11px] text-blue-600 font-medium">Existing Linked</div>
                    </div>
                    <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
                      <div className="text-lg font-bold text-purple-700">
                        {previewResult.summary.historicalDonationsCount}
                      </div>
                      <div className="text-[11px] text-purple-600 font-medium">Donations</div>
                    </div>
                  </div>

                  {/* Invalid Rows Diagnostics */}
                  {previewResult.invalidRows.length > 0 && (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        {previewResult.invalidRows.length} Row(s) Contain Errors and Will Be Skipped
                      </div>
                      <div className="max-h-36 overflow-y-auto divide-y divide-rose-200/60 text-xs">
                        {previewResult.invalidRows.map((inv, idx) => (
                          <div key={idx} className="py-1.5 text-rose-700">
                            <strong>Row {inv.rowNumber} ({inv.name}):</strong> {inv.errors.join("; ")}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Identity Conflicts */}
                  {previewResult.conflicts.length > 0 && (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        {previewResult.conflicts.length} Ambiguous Identity Conflict(s)
                      </div>
                      <p className="text-xs text-amber-700">
                        Swastya does not silently merge accounts when phone numbers differ. These records require manual review.
                      </p>
                    </div>
                  )}

                  {/* Donor preview list */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <div className="bg-slate-50 px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">
                      Approved Donors to Onboard ({previewResult.toCreate.length + previewResult.toLink.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {previewResult.toCreate.map((d, i) => (
                        <div key={i} className="px-3 py-2 flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-slate-800">{d.name}</span>
                            <span className="text-slate-500 ml-2">({d.email || d.phone})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-sm bg-rose-50 text-rose-700 font-bold">
                              {d.bloodGroup}
                            </span>
                            <span className="text-emerald-600 font-medium">New Account</span>
                          </div>
                        </div>
                      ))}
                      {previewResult.toLink.map((d, i) => (
                        <div key={i} className="px-3 py-2 flex items-center justify-between bg-blue-50/30">
                          <div>
                            <span className="font-semibold text-slate-800">{d.name}</span>
                            <span className="text-slate-500 ml-2">({d.email})</span>
                          </div>
                          <span className="text-blue-600 font-medium">Link Existing Profile</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setPreviewResult(null)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      ← Back to Upload
                    </button>
                    <button
                      disabled={isCommitting || (previewResult.toCreate.length === 0 && previewResult.toLink.length === 0)}
                      onClick={handleCommitImport}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-xs"
                    >
                      {isCommitting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Processing Safe Import...
                        </>
                      ) : (
                        "Confirm & Commit Import"
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Commit Success & Single-Use Activation Links */}
              {commitResult && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                    <h4 className="font-serif text-base font-bold text-emerald-900">
                      Import Successfully Completed!
                    </h4>
                    <p className="text-xs text-emerald-700">
                      {commitResult.importedCount} new donor account(s) created, {commitResult.linkedCount} existing account(s) linked, and {commitResult.historicalDonationsImported} historical donation record(s) persisted.
                    </p>
                  </div>

                  {/* Delivery Gateway Notice */}
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      Delivery Gateway Status: {commitResult.deliveryStatus}
                    </div>
                    <p>{commitResult.deliveryNote}</p>
                  </div>

                  {/* Single-use Activation Tokens List */}
                  {commitResult.activationRecords.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                      <div className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-b border-slate-200 flex items-center justify-between">
                        <span>Generated Secure Donor Activation Links</span>
                        <span className="text-[11px] text-slate-500">Single-use (Expires in 7 days)</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {commitResult.activationRecords.map((rec, i) => (
                          <div key={i} className="p-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-800">{rec.name}</div>
                              <div className="text-slate-500 text-[11px]">{rec.email}</div>
                            </div>
                            <button
                              onClick={() => handleCopyActivationUrl(rec.activationUrl, rec.activationToken)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#FAF6EE] text-[#053845] hover:bg-[#F3E9D1] transition-colors border border-[#F3E9D1]"
                            >
                              {copiedToken === rec.activationToken ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  Copy Link
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={resetUploadModal}
                      className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors"
                    >
                      Done & Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
