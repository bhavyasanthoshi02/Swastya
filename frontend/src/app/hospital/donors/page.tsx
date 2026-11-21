"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileSpreadsheet,
  ChevronRight,
  ChevronLeft,
  X,
  Copy,
  Check,
  Eye,
  RefreshCw,
  Droplets,
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
import { mapBloodGroupToDisplay } from "@/lib/mappers";

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
        await loadDonorDetail(selectedDonorId);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between text-xs">
        <Link
          href="/hospital/dashboard"
          className="inline-flex items-center gap-1.5 font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Hospital Dashboard</span>
        </Link>

        {!isLoading && (
          <span className="text-slate-500">
            Showing {donors.length} of {totalRecords} registered donors
          </span>
        )}
      </div>

      {/* 1. Page Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
              Donor Registry &amp; Historical Records
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Manage hospital-registered donors, import legacy records, and verify historical donations.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={Boolean(downloadingTemplate)}
            onClick={() => handleDownloadTemplate("csv")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Download standard CSV template"
          >
            {downloadingTemplate === "csv" ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#317786]" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[#317786]" />
            )}
            <span>CSV Template</span>
          </button>

          <button
            type="button"
            disabled={Boolean(downloadingTemplate)}
            onClick={() => handleDownloadTemplate("xlsx")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Download Excel template (Donors + Donations)"
          >
            {downloadingTemplate === "xlsx" ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>Excel Template</span>
          </button>

          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] shadow-2xs transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Donors</span>
          </button>
        </div>
      </header>

      {/* 2. Compact Search and Filters Toolbar */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#317786] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, email, phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/40 text-[#053845] focus:outline-none focus:border-[#317786] placeholder:text-slate-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Blood Group Filter */}
          <select
            value={selectedBloodGroup}
            onChange={(e) => {
              setSelectedBloodGroup(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/40 text-[#053845] focus:outline-none focus:border-[#317786]"
          >
            <option value="">All Blood Groups</option>
            {BLOOD_GROUPS.map((bg) => (
              <option key={bg} value={bg}>
                Blood Group: {bg}
              </option>
            ))}
          </select>

          {/* Account Status Filter */}
          <select
            value={selectedAccountStatus}
            onChange={(e) => {
              setSelectedAccountStatus(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/40 text-[#053845] focus:outline-none focus:border-[#317786]"
          >
            <option value="">All Account Statuses</option>
            <option value="ACTIVATED">Active Accounts</option>
            <option value="PENDING_ACTIVATION">Pending Activation</option>
          </select>

          {/* Verification Status Filter */}
          <select
            value={selectedVerificationStatus}
            onChange={(e) => {
              setSelectedVerificationStatus(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/40 text-[#053845] focus:outline-none focus:border-[#317786]"
          >
            <option value="">All Verifications</option>
            <option value="VERIFIED">Verified Records</option>
            <option value="PENDING">Pending Records</option>
            <option value="REJECTED">Rejected Records</option>
          </select>
        </div>

        {/* Active Filter Chips */}
        {(selectedBloodGroup || selectedAccountStatus || selectedVerificationStatus || search) && (
          <div className="flex items-center flex-wrap gap-1.5 pt-2 border-t border-[#F3E9D1]/60 text-xs">
            <span className="text-slate-400 text-[11px]">Active filters:</span>
            {search && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">
                Keyword: &quot;{search}&quot;
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="hover:text-red-500 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedBloodGroup && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px]">
                Blood: {selectedBloodGroup}
                <button
                  type="button"
                  onClick={() => setSelectedBloodGroup("")}
                  className="hover:text-red-500 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedAccountStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px]">
                Status: {selectedAccountStatus === "ACTIVATED" ? "Active" : "Pending"}
                <button
                  type="button"
                  onClick={() => setSelectedAccountStatus("")}
                  className="hover:text-red-500 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedVerificationStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px]">
                Verification: {selectedVerificationStatus}
                <button
                  type="button"
                  onClick={() => setSelectedVerificationStatus("")}
                  className="hover:text-red-500 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSelectedBloodGroup("");
                setSelectedAccountStatus("");
                setSelectedVerificationStatus("");
                setPage(1);
              }}
              className="text-[11px] text-[#317786] hover:underline font-medium ml-1 cursor-pointer"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* 3. Donor Records Content */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-12 text-center space-y-3 shadow-2xs">
          <RefreshCw className="w-6 h-6 text-[#317786] animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading hospital donor registry...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-8 text-center space-y-2 shadow-2xs">
          <AlertCircle className="w-7 h-7 text-rose-500 mx-auto" />
          <h3 className="font-serif text-base font-bold text-slate-800">Error Loading Registry</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={loadRegistry}
            className="mt-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : donors.length === 0 ? (
        /* 4. Compact Empty State */
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-8 sm:p-10 text-center space-y-2 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center mx-auto mb-1">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="font-serif text-base font-bold text-[#053845]">
            No Donors Found
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {search || selectedBloodGroup || selectedAccountStatus || selectedVerificationStatus
              ? "No registered donors match your current filter criteria."
              : "Your hospital has no donors in its registry yet."}
          </p>
          {!search && !selectedBloodGroup && !selectedAccountStatus && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] shadow-2xs transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Existing Donors</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Full-Width Donor Cards */
        <div className="space-y-3">
          {donors.map((donor) => {
            const bloodGroupDisplay = mapBloodGroupToDisplay(donor.bloodGroup);

            return (
              <article
                key={donor.donorId}
                className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs hover:border-[#317786]/45 transition-colors space-y-3"
              >
                {/* Top Row: Donor Name, Gender, Source ID & Status Pills */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#F3E9D1]/70">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <h2 className="font-serif text-base font-bold text-[#053845] truncate">
                      {donor.name}
                    </h2>
                    {donor.gender && (
                      <span className="text-xs text-slate-400 capitalize">
                        · {donor.gender.toLowerCase()}
                      </span>
                    )}
                    {donor.sourceIdentifier && (
                      <span className="text-[11px] font-mono font-medium text-[#317786] bg-[#317786]/10 px-2 py-0.5 rounded-md">
                        ID: {donor.sourceIdentifier}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {donor.accountStatus === "ACTIVATED" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>Pending Activation</span>
                      </span>
                    )}

                    {donor.historicalVerificationStatus === "VERIFIED" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        <ShieldCheck className="w-3 h-3 text-blue-600" />
                        <span>Verified History</span>
                      </span>
                    ) : donor.historicalVerificationStatus === "PENDING" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <span>Pending Review</span>
                      </span>
                    ) : donor.donationCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                        <span>{donor.donationCount} Donation(s)</span>
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Content & Action Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-600">
                    {/* Blood Group */}
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#317786]/10 border border-[#317786]/20 shrink-0">
                      <Droplets className="w-3.5 h-3.5 text-[#B94F30]" />
                      <span className="font-serif font-bold text-sm text-[#053845]">
                        {bloodGroupDisplay}
                      </span>
                    </div>

                    {/* Phone */}
                    {donor.phoneNumber && (
                      <a
                        href={`tel:${donor.phoneNumber}`}
                        className="flex items-center gap-1 text-slate-600 hover:text-[#053845] font-medium hover:underline"
                      >
                        <Phone className="w-3.5 h-3.5 text-[#317786]" />
                        <span>{donor.phoneNumber}</span>
                      </a>
                    )}

                    {/* Email */}
                    {donor.email && (
                      <div className="flex items-center gap-1 text-slate-600 truncate max-w-[220px]">
                        <Mail className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span className="truncate">{donor.email}</span>
                      </div>
                    )}

                    {/* Location */}
                    {(donor.city || donor.state) && (
                      <div className="flex items-center gap-1 text-slate-500">
                        <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span>
                          {donor.city}{donor.state ? `, ${donor.state}` : ""}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Profile Action */}
                  <button
                    type="button"
                    onClick={() => loadDonorDetail(donor.donorId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FAF6EE] hover:bg-[#F3E9D1] text-[#053845] font-semibold text-xs border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer shrink-0 self-end sm:self-center"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Profile &amp; History</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {totalRecords > 0 && !isLoading && (
        <div className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-[#F3E9D1] text-xs text-slate-600 shadow-2xs">
          <span>
            Showing {donors.length} of {totalRecords} registered donors
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-800">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* INDIVIDUAL DONOR DETAIL DRAWER */}
      {selectedDonorId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-[#F3E9D1] bg-[#FAF6EE] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold text-[#317786] uppercase tracking-wider block">
                  Donor Profile &amp; Clinical History
                </span>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  {donorDetail?.name || "Donor Details"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedDonorId(null);
                  setDonorDetail(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {isDetailLoading ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#317786]" />
                  <p className="text-xs text-slate-500 font-medium">Loading donor profile...</p>
                </div>
              ) : detailError ? (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{detailError}</span>
                </div>
              ) : donorDetail ? (
                <>
                  {/* Profile Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] space-y-1">
                      <span className="text-[11px] text-slate-500">Blood Group</span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          {donorDetail.bloodGroup}
                        </span>
                        {donorDetail.gender && (
                          <span className="text-xs text-slate-600 capitalize">({donorDetail.gender.toLowerCase()})</span>
                        )}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] space-y-1">
                      <span className="text-[11px] text-slate-500">Account Onboarding</span>
                      <div>
                        {donorDetail.accountStatus === "ACTIVATED" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Activated
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Permitted Contact Details */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5 text-xs">
                    <h4 className="font-semibold text-slate-800 uppercase tracking-wider text-[11px]">
                      Profile Details
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span className="truncate">{donorDetail.email || "No email"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span>{donorDetail.phoneNumber || "No phone"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span>
                          {donorDetail.city}{donorDetail.state ? `, ${donorDetail.state}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span>Ref: {donorDetail.sourceIdentifier || "None"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Facility Donation History */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-slate-800 uppercase tracking-wider text-[11px]">
                        Donation History ({donorDetail.donations.length})
                      </h4>
                      <span className="text-[11px] text-slate-500">Live &amp; Historical</span>
                    </div>

                    {donorDetail.donations.length === 0 ? (
                      <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs">
                        No donation records found for this donor at your facility.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {donorDetail.donations.map((d) => (
                          <div
                            key={d.donationHistoryId}
                            className="p-3.5 rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/40 space-y-2 text-xs"
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
                                    Live Donation
                                  </span>
                                )}
                              </div>

                              <div>
                                {d.verificationStatus === "VERIFIED" && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    ✓ Verified
                                  </span>
                                )}
                                {d.verificationStatus === "PENDING" && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    Pending Review
                                  </span>
                                )}
                                {d.verificationStatus === "REJECTED" && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                    ✕ Rejected
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5 text-slate-600">
                              <div>Component: <strong className="text-slate-800">{d.bloodComponent}</strong></div>
                              <div>Units: <strong className="text-slate-800">{d.unitsDonated}</strong></div>
                              {d.sourceRecordId && (
                                <div className="col-span-2 text-slate-500">Source: <strong>{d.sourceRecordId}</strong></div>
                              )}
                              {d.remarks && (
                                <div className="col-span-2 text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100">
                                  {d.remarks}
                                </div>
                              )}
                            </div>

                            {/* Verification action buttons for historical records */}
                            {d.isImported && (
                              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-end gap-2">
                                {d.verificationStatus !== "VERIFIED" && (
                                  <button
                                    type="button"
                                    disabled={updatingHistoryId === d.donationHistoryId}
                                    onClick={() => handleVerifyDonation(d.donationHistoryId, "VERIFIED")}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200 cursor-pointer"
                                  >
                                    Verify Record
                                  </button>
                                )}
                                {d.verificationStatus !== "REJECTED" && (
                                  <button
                                    type="button"
                                    disabled={updatingHistoryId === d.donationHistoryId}
                                    onClick={() => handleVerifyDonation(d.donationHistoryId, "REJECTED")}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors border border-rose-200 cursor-pointer"
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

      {/* 5. TWO-STEP BULK UPLOAD MODAL */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-[#F3E9D1] bg-[#FAF6EE] flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-semibold text-[#317786] uppercase tracking-wider block">
                  Bulk Donor Onboarding
                </span>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  Upload Donors &amp; Historical Records
                </h3>
              </div>
              <button
                type="button"
                onClick={resetUploadModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              {uploadError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* STEP 1: Select File & Preview */}
              {!previewResult && !commitResult && (
                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {/* 3. Spreadsheet Templates */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] text-xs">
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-[#317786]" />
                      <span className="font-semibold text-[#053845]">Download Templates</span>
                      <span className="text-slate-400 text-[11px] hidden sm:inline">· Pre-formatted spreadsheets with sample donor rows</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={Boolean(downloadingTemplate)}
                        onClick={() => handleDownloadTemplate("csv")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#053845] bg-white border border-[#F3E9D1] hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                      >
                        {downloadingTemplate === "csv" ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#317786]" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-[#317786]" />
                        )}
                        <span>CSV Template</span>
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(downloadingTemplate)}
                        onClick={() => handleDownloadTemplate("xlsx")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#053845] bg-white border border-[#F3E9D1] hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                      >
                        {downloadingTemplate === "xlsx" ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        ) : (
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span>XLSX Template</span>
                      </button>
                    </div>
                  </div>

                  {/* 4. Upload Area */}
                  <div
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                      isDragging
                        ? "border-[#317786] bg-[#FAF6EE]"
                        : uploadFile
                        ? "border-emerald-300 bg-emerald-50/20"
                        : "border-[#F3E9D1] bg-[#FAF6EE]/30 hover:border-[#317786]/60 hover:bg-[#FAF6EE]/50"
                    }`}
                  >
                    {uploadFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileSpreadsheet className="w-7 h-7 text-emerald-600" />
                        <div className="text-xs font-bold text-[#053845] max-w-md truncate">{uploadFile.name}</div>
                        <div className="text-[11px] text-slate-500">{formatFileSize(uploadFile.size)}</div>
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            File ready for validation
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUploadFile(null);
                              setUploadError(null);
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px] font-semibold border border-rose-200 hover:bg-rose-100 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5">
                        <Upload className="w-6 h-6 text-[#317786]" />
                        <div className="text-xs font-bold text-[#053845]">
                          Drag and drop your spreadsheet here
                        </div>
                        <div className="text-xs text-slate-500">
                          or <span className="font-semibold text-[#317786] underline underline-offset-2">browse files from your computer</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Supports Excel (.xlsx, .xls) and CSV (.csv) up to 5MB
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 5. Column Mapping Guide */}
                  <div className="p-3.5 rounded-xl bg-[#FAF6EE]/80 border border-[#F3E9D1] text-xs space-y-2">
                    <div className="font-semibold text-[#053845] flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-[#317786]" />
                      <span>Spreadsheet Column Mapping</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-600 pt-0.5">
                      <div className="space-y-0.5">
                        <span className="font-semibold text-[#053845] block">Donors Sheet</span>
                        <p className="leading-relaxed">
                          Full Name, Email, Phone Number, Blood Group (A+, O-, A+ve, etc.), Date of Birth (YYYY-MM-DD or DD/MM/YYYY), Gender, City, Source Donor ID.
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="font-semibold text-[#053845] block">Donations Sheet (Optional)</span>
                        <p className="leading-relaxed">
                          Donor Identifier (Email or Phone), Donation Date, Units Donated, Blood Component (WHOLE_BLOOD, PLATELETS, etc.), Source Record ID.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Preview Results & Confirmation */}
              {previewResult && !commitResult && (
                <div className="space-y-4">
                  {/* Summary metric cards */}
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-base font-bold text-slate-800">{previewResult.summary.totalRows}</div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Rows</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="text-base font-bold text-emerald-700">{previewResult.summary.toCreateCount}</div>
                      <div className="text-[10px] text-emerald-600 font-medium">New Donors</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                      <div className="text-base font-bold text-blue-700">{previewResult.summary.toLinkCount}</div>
                      <div className="text-[10px] text-blue-600 font-medium">Existing Linked</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200">
                      <div className="text-base font-bold text-purple-700">{previewResult.summary.historicalDonationsCount}</div>
                      <div className="text-[10px] text-purple-600 font-medium">Donations</div>
                    </div>
                  </div>

                  {/* Invalid Rows Warning */}
                  {previewResult.invalidRows.length > 0 && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-rose-800">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        {previewResult.invalidRows.length} Row(s) Contain Errors and Will Be Skipped
                      </div>
                      <div className="max-h-28 overflow-y-auto divide-y divide-rose-200/60 text-[11px] text-rose-700">
                        {previewResult.invalidRows.map((inv, idx) => (
                          <div key={idx} className="py-1">
                            Row {inv.rowNumber} ({inv.name}): {inv.errors.join("; ")}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Donors preview list */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <div className="bg-slate-50 px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">
                      Approved Donors to Onboard ({previewResult.toCreate.length + previewResult.toLink.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {previewResult.toCreate.map((d, i) => (
                        <div key={i} className="px-3 py-1.5 flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-slate-800">{d.name}</span>
                            <span className="text-slate-500 ml-2">({d.email || d.phone})</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px]">
                            {d.bloodGroup}
                          </span>
                        </div>
                      ))}
                      {previewResult.toLink.map((d, i) => (
                        <div key={i} className="px-3 py-1.5 flex items-center justify-between bg-blue-50/30">
                          <div>
                            <span className="font-semibold text-slate-800">{d.name}</span>
                            <span className="text-slate-500 ml-2">({d.email})</span>
                          </div>
                          <span className="text-blue-600 font-medium text-[11px]">Link Profile</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Commit Success */}
              {commitResult && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                    <h4 className="font-serif text-base font-bold text-emerald-900">
                      Import Successfully Completed!
                    </h4>
                    <p className="text-xs text-emerald-700">
                      {commitResult.importedCount} new donor(s) created, {commitResult.linkedCount} linked, and {commitResult.historicalDonationsImported} donations saved.
                    </p>
                  </div>

                  {commitResult.activationRecords.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                      <div className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-b border-slate-200">
                        Generated Activation Links
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {commitResult.activationRecords.map((rec, i) => (
                          <div key={i} className="p-2.5 flex items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-slate-800">{rec.name}</div>
                              <div className="text-slate-400 text-[10px]">{rec.email}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyActivationUrl(rec.activationUrl, rec.activationToken)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FAF6EE] text-[#053845] hover:bg-[#F3E9D1] border border-[#F3E9D1] cursor-pointer"
                            >
                              {copiedToken === rec.activationToken ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy Link</span>
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 6. Visible Fixed Footer */}
            <div className="px-5 sm:px-6 py-3.5 border-t border-[#F3E9D1] bg-white shrink-0 flex items-center justify-end gap-2.5">
              {!previewResult && !commitResult && (
                <>
                  <button
                    type="button"
                    onClick={resetUploadModal}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!uploadFile || isParsing}
                    onClick={handlePreviewUpload}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs cursor-pointer"
                  >
                    {isParsing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Validating...</span>
                      </>
                    ) : (
                      <span>Preview &amp; Validate</span>
                    )}
                  </button>
                </>
              )}

              {previewResult && !commitResult && (
                <div className="w-full flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPreviewResult(null)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    &larr; Back to Upload
                  </button>
                  <button
                    type="button"
                    disabled={isCommitting || (previewResult.toCreate.length === 0 && previewResult.toLink.length === 0)}
                    onClick={handleCommitImport}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-2xs cursor-pointer"
                  >
                    {isCommitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <span>Confirm &amp; Commit Import</span>
                    )}
                  </button>
                </div>
              )}

              {commitResult && (
                <button
                  type="button"
                  onClick={resetUploadModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors cursor-pointer"
                >
                  Done &amp; Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
