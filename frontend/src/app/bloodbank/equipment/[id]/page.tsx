"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Calendar,
  FileText,
  Upload,
  RefreshCw,
  Edit,
  ShieldAlert,
  ShieldCheck,
  ChevronRight,
  User,
  History,
  Activity,
  Check,
  X,
} from "lucide-react";
import {
  api,
  EquipmentItem,
  EquipmentCalibrationItem,
  EquipmentMaintenanceItem,
  EquipmentBreakdownItem,
  EquipmentStatusHistoryItem,
} from "@/lib/api";

export default function EquipmentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const equipmentId = params.id as string;

  const [equipment, setEquipment] = useState<EquipmentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [clinicalAdvisory, setClinicalAdvisory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "CALIBRATION" | "MAINTENANCE" | "AUDIT">("OVERVIEW");

  // Modals
  const [isCalModalOpen, setIsCalModalOpen] = useState(false);
  const [isMaintModalOpen, setIsMaintModalOpen] = useState(false);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [resolveTargetBreakdown, setResolveTargetBreakdown] = useState<EquipmentBreakdownItem | null>(null);

  // Calibration Form
  const [calPerformedDate, setCalPerformedDate] = useState(new Date().toISOString().slice(0, 10));
  const [calScheduledDate, setCalScheduledDate] = useState("");
  const [calNextDueDate, setCalNextDueDate] = useState("");
  const [calPerformedBy, setCalPerformedBy] = useState("");
  const [calServiceProvider, setCalServiceProvider] = useState("");
  const [calResult, setCalResult] = useState<"PASSED" | "FAILED" | "PASSED_WITH_CONDITIONS">("PASSED");
  const [calStandardsUsed, setCalStandardsUsed] = useState("");
  const [calReadings, setCalReadings] = useState("");
  const [calRemarks, setCalRemarks] = useState("");
  const [calRequiresVerification, setCalRequiresVerification] = useState(false);
  const [calFile, setCalFile] = useState<File | null>(null);
  const [isSubmittingCal, setIsSubmittingCal] = useState(false);

  // Maintenance Form
  const [maintType, setMaintType] = useState<"PREVENTIVE" | "CORRECTIVE">("PREVENTIVE");
  const [maintStatus, setMaintStatus] = useState<"SCHEDULED" | "COMPLETED">("SCHEDULED");
  const [maintScheduledDate, setMaintScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [maintCompletedDate, setMaintCompletedDate] = useState("");
  const [maintAssignedTo, setMaintAssignedTo] = useState("");
  const [maintServiceProvider, setMaintServiceProvider] = useState("");
  const [maintWorkDetails, setMaintWorkDetails] = useState("");
  const [maintPartsReplaced, setMaintPartsReplaced] = useState("");
  const [maintDowntimeHours, setMaintDowntimeHours] = useState("");
  const [maintCost, setMaintCost] = useState("");
  const [maintFile, setMaintFile] = useState<File | null>(null);
  const [isSubmittingMaint, setIsSubmittingMaint] = useState(false);

  // Breakdown Form
  const [breakdownIssue, setBreakdownIssue] = useState("");
  const [breakdownDesc, setBreakdownDesc] = useState("");
  const [breakdownSeverity, setBreakdownSeverity] = useState<"CRITICAL" | "MAJOR" | "MINOR">("MAJOR");
  const [breakdownImpactStorage, setBreakdownImpactStorage] = useState(false);
  const [breakdownSopAction, setBreakdownSopAction] = useState("");
  const [isSubmittingBreakdown, setIsSubmittingBreakdown] = useState(false);

  // Status Change Form
  const [newStatus, setNewStatus] = useState<"OPERATIONAL" | "UNDER_MAINTENANCE" | "OUT_OF_SERVICE" | "RETIRED">("OPERATIONAL");
  const [statusReason, setStatusReason] = useState("");
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);

  // Resolve Breakdown Form
  const [resolutionDetails, setResolutionDetails] = useState("");
  const [resPartsReplaced, setResPartsReplaced] = useState("");
  const [resDowntimeHours, setResDowntimeHours] = useState("");
  const [resRestoreOperational, setResRestoreOperational] = useState(true);
  const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);

  // File download state
  const [downloadingCertId, setDownloadingCertId] = useState<string | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

  const handleDownloadCertificate = async (calId: string, filename: string) => {
    try {
      setDownloadingCertId(calId);
      const blob = await api.equipment.fetchCalibrationCertificateBlob(equipmentId, calId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `calibration_certificate_${calId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err?.message || "Failed to download calibration certificate");
    } finally {
      setDownloadingCertId(null);
    }
  };

  const handleDownloadMaintenanceReport = async (maintId: string, filename: string) => {
    try {
      setDownloadingReportId(maintId);
      const blob = await api.equipment.fetchMaintenanceReportBlob(equipmentId, maintId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `maintenance_report_${maintId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err?.message || "Failed to download maintenance report");
    } finally {
      setDownloadingReportId(null);
    }
  };

  const fetchEquipment = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.equipment.getById(equipmentId);
      if (res.success && res.equipment) {
        setEquipment(res.equipment);
        setNewStatus(res.equipment.operationalstatus as any);
      } else {
        setError("Equipment record not found");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load equipment details");
    } finally {
      setIsLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

  // Handle Log Calibration
  const handleLogCalibration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calPerformedBy.trim()) {
      setError("Technician / Performer name is required.");
      return;
    }
    try {
      setIsSubmittingCal(true);
      const formData = new FormData();
      formData.append("performedDate", calPerformedDate);
      if (calScheduledDate) formData.append("scheduledDate", calScheduledDate);
      if (calNextDueDate) formData.append("nextDueDate", calNextDueDate);
      formData.append("performedBy", calPerformedBy.trim());
      if (calServiceProvider) formData.append("serviceProvider", calServiceProvider.trim());
      formData.append("result", calResult);
      if (calStandardsUsed) formData.append("standardsUsed", calStandardsUsed.trim());
      if (calReadings) formData.append("readings", calReadings.trim());
      if (calRemarks) formData.append("remarks", calRemarks.trim());
      formData.append("requiresVerification", String(calRequiresVerification));
      if (calFile) {
        formData.append("certificate", calFile);
      }

      const res = await api.equipment.logCalibration(equipmentId, formData);
      if (res.success) {
        setSuccessMessage("Calibration logged successfully");
        if (res.clinicalAdvisory) {
          setClinicalAdvisory(res.clinicalAdvisory);
        }
        setIsCalModalOpen(false);
        setCalFile(null);
        setCalRemarks("");
        setCalReadings("");
        await fetchEquipment();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to log calibration");
    } finally {
      setIsSubmittingCal(false);
    }
  };

  // Handle Reviewer Verify Calibration
  const handleVerifyCalibration = async (calId: string, decision: "VERIFIED" | "REJECTED") => {
    if (!window.confirm(`Are you sure you want to mark this calibration record as ${decision}?`)) {
      return;
    }
    try {
      const res = await api.equipment.verifyCalibration(equipmentId, calId, { decision });
      if (res.success) {
        setSuccessMessage(`Calibration marked as ${decision}`);
        await fetchEquipment();
      }
    } catch (err: any) {
      if (err?.message?.includes("Independent verification required")) {
        setError("Independent verification error: The staff member who recorded this calibration cannot approve their own record. A different authorized reviewer must sign off.");
      } else {
        setError(err?.message || "Failed to verify calibration");
      }
    }
  };

  // Handle Schedule Maintenance
  const handleScheduleMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingMaint(true);
      const formData = new FormData();
      formData.append("maintenanceType", maintType);
      formData.append("status", maintStatus);
      formData.append("scheduledDate", maintScheduledDate);
      if (maintStatus === "COMPLETED" && maintCompletedDate) {
        formData.append("completedDate", maintCompletedDate);
      }
      if (maintAssignedTo) formData.append("assignedTo", maintAssignedTo.trim());
      if (maintServiceProvider) formData.append("serviceProvider", maintServiceProvider.trim());
      if (maintWorkDetails) formData.append("workDetails", maintWorkDetails.trim());
      if (maintPartsReplaced) formData.append("partsReplaced", maintPartsReplaced.trim());
      if (maintDowntimeHours) formData.append("downtimeHours", maintDowntimeHours);
      if (maintCost) formData.append("cost", maintCost);
      if (maintFile) formData.append("report", maintFile);

      const res = await api.equipment.scheduleMaintenance(equipmentId, formData);
      if (res.success) {
        setSuccessMessage("Maintenance activity recorded");
        setIsMaintModalOpen(false);
        setMaintFile(null);
        setMaintWorkDetails("");
        await fetchEquipment();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to record maintenance");
    } finally {
      setIsSubmittingMaint(false);
    }
  };

  // Handle Report Breakdown
  const handleReportBreakdown = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!breakdownIssue.trim()) {
      setError("Breakdown issue is required.");
      return;
    }
    try {
      setIsSubmittingBreakdown(true);
      const res = await api.equipment.reportBreakdown(equipmentId, {
        issue: breakdownIssue.trim(),
        description: breakdownDesc.trim() || undefined,
        severity: breakdownSeverity,
        impactOnStorage: breakdownImpactStorage,
        sopActionTaken: breakdownSopAction.trim() || undefined,
      });

      if (res.success) {
        setSuccessMessage("Breakdown report submitted");
        if (res.clinicalAdvisory) {
          setClinicalAdvisory(res.clinicalAdvisory);
        }
        setIsBreakdownModalOpen(false);
        setBreakdownIssue("");
        setBreakdownDesc("");
        setBreakdownSopAction("");
        await fetchEquipment();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to report breakdown");
    } finally {
      setIsSubmittingBreakdown(false);
    }
  };

  // Handle Resolve Breakdown
  const handleResolveBreakdown = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTargetBreakdown) return;
    if (!resolutionDetails.trim()) {
      setError("Resolution details are required.");
      return;
    }
    try {
      setIsSubmittingResolve(true);
      const res = await api.equipment.resolveBreakdown(equipmentId, resolveTargetBreakdown.breakdownid, {
        resolutionDetails: resolutionDetails.trim(),
        partsReplaced: resPartsReplaced.trim() || undefined,
        downtimeHours: resDowntimeHours ? parseFloat(resDowntimeHours) : undefined,
        restoreOperational: resRestoreOperational,
      });

      if (res.success) {
        setSuccessMessage("Breakdown incident marked as resolved");
        setResolveTargetBreakdown(null);
        setResolutionDetails("");
        setResPartsReplaced("");
        setResDowntimeHours("");
        await fetchEquipment();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to resolve breakdown");
    } finally {
      setIsSubmittingResolve(false);
    }
  };

  // Handle Change Operational Status
  const handleChangeStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusReason || statusReason.trim().length < 5) {
      setError("A meaningful reason (minimum 5 characters) is required.");
      return;
    }
    try {
      setIsSubmittingStatus(true);
      const res = await api.equipment.updateStatus(equipmentId, {
        operationalStatus: newStatus,
        reason: statusReason.trim(),
      });

      if (res.success) {
        setSuccessMessage(`Operational status changed to ${newStatus}`);
        if (res.clinicalAdvisory) {
          setClinicalAdvisory(res.clinicalAdvisory);
        }
        setIsStatusModalOpen(false);
        setStatusReason("");
        await fetchEquipment();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to change operational status");
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center text-gray-500">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#317786] mb-3" />
        <p className="text-sm">Loading equipment profile...</p>
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-gray-900">Equipment Record Not Found</h2>
        <p className="text-sm text-gray-600 mt-1">{error || "Unable to locate this equipment asset."}</p>
        <Link
          href="/bloodbank/equipment"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#053845] rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Registry
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/bloodbank/equipment"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#317786] hover:text-[#053845] transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Equipment Registry
        </Link>
      </div>

      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold px-2.5 py-1 rounded bg-[#053845] text-white">
              {equipment.assetnumber}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold">
              {equipment.category}
            </span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
              equipment.operationalstatus === "OPERATIONAL"
                ? "bg-emerald-100 text-emerald-800"
                : equipment.operationalstatus === "UNDER_MAINTENANCE"
                ? "bg-amber-100 text-amber-800"
                : "bg-rose-100 text-rose-800"
            }`}>
              {equipment.operationalstatus.replace("_", " ")}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-[#053845] mt-2">
            {equipment.equipmentname}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {[equipment.manufacturer, equipment.modelnumber, equipment.serialnumber && `SN: ${equipment.serialnumber}`, equipment.location]
              .filter(Boolean)
              .join(" • ")}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsCalModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] rounded-lg shadow-sm transition"
          >
            <ShieldCheck className="w-4 h-4" /> Log Calibration
          </button>

          <button
            onClick={() => setIsMaintModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] rounded-lg transition"
          >
            <Wrench className="w-4 h-4 text-[#317786]" /> Maintenance
          </button>

          <button
            onClick={() => setIsBreakdownModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
          >
            <AlertTriangle className="w-4 h-4 text-rose-600" /> Report Issue
          </button>

          <button
            onClick={() => setIsStatusModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition"
          >
            Status
          </button>

          <Link
            href={`/bloodbank/equipment/${equipment.equipmentid}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-transparent hover:border-gray-200 rounded-lg transition"
            title="Edit Equipment Details"
          >
            <Edit className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Notifications / Clinical Advisories */}
      {clinicalAdvisory && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 shadow-sm flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-900">Clinical Safety Advisory</h4>
            <p className="text-xs text-amber-800 mt-0.5">{clinicalAdvisory}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}
      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <div className="text-sm">{successMessage}</div>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="border-b border-[#F3E9D1] flex gap-2 sm:gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab("OVERVIEW")}
          className={`pb-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
            activeTab === "OVERVIEW"
              ? "border-[#053845] text-[#053845]"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          Overview & Specifications
        </button>

        <button
          onClick={() => setActiveTab("CALIBRATION")}
          className={`pb-3 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
            activeTab === "CALIBRATION"
              ? "border-[#053845] text-[#053845]"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          Calibration Schedule & History
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
            {equipment.calibrations?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("MAINTENANCE")}
          className={`pb-3 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
            activeTab === "MAINTENANCE"
              ? "border-[#053845] text-[#053845]"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          Maintenance & Breakdowns
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
            {(equipment.maintenance?.length || 0) + (equipment.breakdowns?.length || 0)}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("AUDIT")}
          className={`pb-3 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
            activeTab === "AUDIT"
              ? "border-[#053845] text-[#053845]"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          Status Audit Trail
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
            {equipment.statushistory?.length || 0}
          </span>
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "OVERVIEW" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Quick Compliance Card */}
          <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#053845] uppercase tracking-wider">
              Compliance & Safety Status
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <span className="text-xs text-gray-500 font-medium">Calibration Status</span>
                <div className="text-sm font-bold text-[#053845] mt-1">
                  {equipment.calibrationstatus.replace("_", " ")}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Next due: {equipment.nextcalibrationdate ? new Date(equipment.nextcalibrationdate).toLocaleDateString() : "N/A"}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <span className="text-xs text-gray-500 font-medium">Maintenance Status</span>
                <div className="text-sm font-bold text-[#053845] mt-1">
                  {equipment.maintenancestatus.replace("_", " ")}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Next due: {equipment.nextmaintenancedate ? new Date(equipment.nextmaintenancedate).toLocaleDateString() : "N/A"}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <span className="text-xs text-gray-500 font-medium">Calibration Interval</span>
                <div className="text-sm font-bold text-[#053845] mt-1">
                  {equipment.iscalibrationrequired ? `${equipment.calibrationintervaldays || 90} Days` : "Not Required"}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <span className="text-xs text-gray-500 font-medium">Maintenance Interval</span>
                <div className="text-sm font-bold text-[#053845] mt-1">
                  {equipment.ismaintenancerequired ? `${equipment.maintenanceintervaldays || 90} Days` : "Not Required"}
                </div>
              </div>
            </div>
          </div>

          {/* Location & Placement */}
          <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-[#053845] uppercase tracking-wider">
              Location & Custody
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Physical Location:</span>
                <span className="font-medium text-gray-900">{equipment.location || "Not assigned"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Department:</span>
                <span className="font-medium text-gray-900">{equipment.department || "General"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Responsible Person:</span>
                <span className="font-medium text-gray-900">{equipment.responsibleperson || "Unassigned"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Installation Date:</span>
                <span className="font-medium text-gray-900">
                  {equipment.installationdate ? new Date(equipment.installationdate).toLocaleDateString() : "N/A"}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-gray-500">Warranty Expiry:</span>
                <span className="font-medium text-gray-900">
                  {equipment.warrantyexpirydate ? new Date(equipment.warrantyexpirydate).toLocaleDateString() : "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm md:col-span-2 space-y-2">
            <h3 className="text-sm font-bold text-[#053845] uppercase tracking-wider">
              Operational & Technical Notes
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {equipment.notes || <span className="text-gray-400 italic">No notes recorded for this asset.</span>}
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Calibration History */}
      {activeTab === "CALIBRATION" && (
        <div className="bg-white rounded-xl border border-[#F3E9D1] shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#053845]">Calibration Traceability Log</h3>
              <p className="text-xs text-gray-500">Chronological history of verified calibration cycles and certificates.</p>
            </div>
            <button
              onClick={() => setIsCalModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] rounded-lg transition"
            >
              <Upload className="w-3.5 h-3.5" /> Log New Calibration
            </button>
          </div>

          {!equipment.calibrations || equipment.calibrations.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No calibration records logged yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {equipment.calibrations.map((cal) => (
                <div key={cal.calibrationid} className="py-4 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                        cal.result === "PASSED"
                          ? "bg-emerald-100 text-emerald-800"
                          : cal.result === "PASSED_WITH_CONDITIONS"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                      }`}>
                        {cal.result.replace(/_/g, " ")}
                      </span>

                      <span className="text-xs font-semibold text-gray-700">
                        Performed: {new Date(cal.performeddate).toLocaleDateString()}
                      </span>

                      {cal.nextduedate && (
                        <span className="text-xs text-gray-500">
                          (Next Due: {new Date(cal.nextduedate).toLocaleDateString()})
                        </span>
                      )}
                    </div>

                    {/* Reviewer Verification Badge */}
                    <div className="flex items-center gap-2">
                      {cal.verificationstatus === "VERIFIED" ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Verified by Reviewer
                        </span>
                      ) : cal.verificationstatus === "REJECTED" ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertCircle className="w-3 h-3" /> Rejected
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            Pending Review
                          </span>
                          <button
                            onClick={() => handleVerifyCalibration(cal.calibrationid, "VERIFIED")}
                            className="p-1 rounded hover:bg-emerald-50 text-emerald-600"
                            title="Verify Calibration"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleVerifyCalibration(cal.calibrationid, "REJECTED")}
                            className="p-1 rounded hover:bg-rose-50 text-rose-600"
                            title="Reject Calibration"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-gray-600 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                    <div>
                      <span className="text-gray-400">Performed By:</span> {cal.performedby}
                      {cal.serviceprovider && ` (${cal.serviceprovider})`}
                    </div>
                    {cal.standardsused && (
                      <div>
                        <span className="text-gray-400">Standards / NIST Traceability:</span> {cal.standardsused}
                      </div>
                    )}
                    {cal.certificatefilename && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">Certificate:</span>{" "}
                        <button
                          type="button"
                          onClick={() => handleDownloadCertificate(cal.calibrationid, cal.certificatefilename!)}
                          disabled={downloadingCertId === cal.calibrationid}
                          className="font-medium text-[#317786] hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                          title="Download official calibration certificate"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {cal.certificatefilename}
                          {downloadingCertId === cal.calibrationid && <RefreshCw className="w-3 h-3 animate-spin text-[#317786]" />}
                        </button>
                      </div>
                    )}
                  </div>

                  {cal.readings && (
                    <div className="text-xs bg-gray-50 p-2 rounded text-gray-700 font-mono">
                      {cal.readings}
                    </div>
                  )}

                  {cal.remarks && (
                    <p className="text-xs text-gray-500 italic">
                      Remarks: {cal.remarks}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Maintenance & Breakdowns */}
      {activeTab === "MAINTENANCE" && (
        <div className="space-y-6">
          {/* Active / Unresolved Breakdowns */}
          <div className="bg-white rounded-xl border border-rose-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" /> Breakdown & Incident Log
                </h3>
                <p className="text-xs text-rose-700">Corrective incidents and equipment failure reports.</p>
              </div>
              <button
                onClick={() => setIsBreakdownModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition"
              >
                Report New Breakdown
              </button>
            </div>

            {!equipment.breakdowns || equipment.breakdowns.length === 0 ? (
              <p className="text-xs text-gray-500 italic py-2">No breakdown incidents recorded.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {equipment.breakdowns.map((bd) => (
                  <div key={bd.breakdownid} className="py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                          bd.severity === "CRITICAL"
                            ? "bg-rose-600 text-white"
                            : bd.severity === "MAJOR"
                            ? "bg-amber-500 text-white"
                            : "bg-gray-200 text-gray-800"
                        }`}>
                          {bd.severity}
                        </span>
                        <span className="text-sm font-bold text-gray-900">{bd.issue}</span>
                        {bd.impactonstorage && (
                          <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold">
                            Storage Impact
                          </span>
                        )}
                      </div>

                      <div>
                        {bd.status === "RESOLVED" ? (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            Resolved
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setResolveTargetBreakdown(bd);
                              setResolutionDetails("");
                            }}
                            className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded transition"
                          >
                            Resolve Issue
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-gray-600">{bd.description}</p>
                    {bd.sopactiontaken && (
                      <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                        <strong>SOP Action:</strong> {bd.sopactiontaken}
                      </p>
                    )}

                    <div className="text-xs text-gray-400 flex items-center justify-between">
                      <span>Reported: {new Date(bd.reportedat).toLocaleString()}</span>
                      {bd.resolvedat && (
                        <span className="text-emerald-700">
                          Resolved: {new Date(bd.resolvedat).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preventive Maintenance Log */}
          <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#053845] flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-[#317786]" /> Preventive Maintenance History
                </h3>
                <p className="text-xs text-gray-500">Scheduled servicing, parts replacement, and downtime tracking.</p>
              </div>
              <button
                onClick={() => setIsMaintModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] rounded-lg transition"
              >
                Schedule Maintenance
              </button>
            </div>

            {!equipment.maintenance || equipment.maintenance.length === 0 ? (
              <p className="text-xs text-gray-500 italic py-2">No maintenance records logged.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {equipment.maintenance.map((m) => (
                  <div key={m.maintenanceid} className="py-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded font-semibold bg-gray-100 text-gray-800">
                          {m.maintenancetype}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                          m.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                        }`}>
                          {m.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          Scheduled: {new Date(m.scheduleddate).toLocaleDateString()}
                        </span>
                        {m.completeddate && (
                          <span className="text-xs text-emerald-700 font-medium">
                            Completed: {new Date(m.completeddate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {m.downtimehours && (
                        <span className="text-xs text-gray-600 font-medium">
                          Downtime: {m.downtimehours} hrs
                        </span>
                      )}
                    </div>

                    {m.workdetails && (
                      <p className="text-xs text-gray-700">{m.workdetails}</p>
                    )}
                    {m.partsreplaced && (
                      <p className="text-xs text-gray-500">Parts Replaced: {m.partsreplaced}</p>
                    )}
                    {m.reportfilename && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-gray-400 text-xs">Report Attachment:</span>{" "}
                        <button
                          type="button"
                          onClick={() => handleDownloadMaintenanceReport(m.maintenanceid, m.reportfilename!)}
                          disabled={downloadingReportId === m.maintenanceid}
                          className="font-medium text-[#317786] text-xs hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                          title="Download maintenance service report"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {m.reportfilename}
                          {downloadingReportId === m.maintenanceid && <RefreshCw className="w-3 h-3 animate-spin text-[#317786]" />}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Status Audit Trail */}
      {activeTab === "AUDIT" && (
        <div className="bg-white rounded-xl border border-[#F3E9D1] shadow-sm p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#053845] flex items-center gap-2">
              <History className="w-5 h-5 text-[#317786]" /> Operational Status Audit Log
            </h3>
            <p className="text-xs text-gray-500">
              Immutable, append-only history of every operational status change and justification.
            </p>
          </div>

          {!equipment.statushistory || equipment.statushistory.length === 0 ? (
            <p className="text-xs text-gray-500 italic py-4">No audit history entries recorded.</p>
          ) : (
            <div className="relative border-l-2 border-[#317786]/30 ml-4 pl-4 space-y-6 my-4">
              {equipment.statushistory.map((hist) => (
                <div key={hist.historyid} className="relative space-y-1">
                  <div className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-[#053845] border-2 border-white" />
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-gray-500">{hist.previousstatus}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-bold text-[#053845]">{hist.newstatus}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500">{new Date(hist.createdat).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-800 bg-gray-50 p-2.5 rounded border border-gray-100">
                    {hist.reason}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Log Calibration */}
      {isCalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-bold text-[#053845]">Log Calibration Cycle</h3>
              <button onClick={() => setIsCalModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogCalibration} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Performed Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={calPerformedDate}
                    onChange={(e) => setCalPerformedDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Calibration Result <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={calResult}
                    onChange={(e) => setCalResult(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded border text-xs bg-white"
                  >
                    <option value="PASSED">Passed</option>
                    <option value="PASSED_WITH_CONDITIONS">Passed With Conditions</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Performed By (Technician) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bio-Med Eng. Sharma"
                    value={calPerformedBy}
                    onChange={(e) => setCalPerformedBy(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Service Provider / Agency
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. National Calibration Agency"
                    value={calServiceProvider}
                    onChange={(e) => setCalServiceProvider(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Reference Standards / NIST Traceability
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fluke 51 II Calibrated Thermometer #TK-09"
                  value={calStandardsUsed}
                  onChange={(e) => setCalStandardsUsed(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Readings / Measured Values
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Target 4.0°C. Measured: Top=4.1°C, Mid=3.9°C, Bottom=4.0°C. Deviation within ±0.5°C tolerance."
                  value={calReadings}
                  onChange={(e) => setCalReadings(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Upload Calibration Certificate (PDF / PNG / JPG)
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setCalFile(e.target.files?.[0] || null)}
                  className="w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-[#FAF6EE] file:text-[#053845] hover:file:bg-[#F3E9D1]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="requiresVerif"
                  checked={calRequiresVerification}
                  onChange={(e) => setCalRequiresVerification(e.target.checked)}
                  className="rounded text-[#317786]"
                />
                <label htmlFor="requiresVerif" className="text-xs text-gray-700">
                  Require Reviewer Clinical Sign-Off before finalizing status
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsCalModalOpen(false)}
                  className="px-4 py-1.5 text-xs rounded border hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCal}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] rounded disabled:opacity-50"
                >
                  {isSubmittingCal ? "Saving..." : "Log Calibration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Schedule Maintenance */}
      {isMaintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-bold text-[#053845]">Maintenance Service Entry</h3>
              <button onClick={() => setIsMaintModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleScheduleMaintenance} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Maintenance Type</label>
                  <select
                    value={maintType}
                    onChange={(e) => setMaintType(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded border text-xs bg-white"
                  >
                    <option value="PREVENTIVE">Preventive Maintenance</option>
                    <option value="CORRECTIVE">Corrective Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                  <select
                    value={maintStatus}
                    onChange={(e) => setMaintStatus(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded border text-xs bg-white"
                  >
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    required
                    value={maintScheduledDate}
                    onChange={(e) => setMaintScheduledDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Completed Date {maintStatus === "COMPLETED" && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="date"
                    required={maintStatus === "COMPLETED"}
                    value={maintCompletedDate}
                    onChange={(e) => setMaintCompletedDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Work Details</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Cleaned condenser coils, verified door gasket integrity, tested backup battery."
                  value={maintWorkDetails}
                  onChange={(e) => setMaintWorkDetails(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Parts Replaced</label>
                  <input
                    type="text"
                    placeholder="e.g. Door Gasket #DG-44"
                    value={maintPartsReplaced}
                    onChange={(e) => setMaintPartsReplaced(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Downtime (Hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="e.g. 1.5"
                    value={maintDowntimeHours}
                    onChange={(e) => setMaintDowntimeHours(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Upload Service Report (PDF / Image)
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setMaintFile(e.target.files?.[0] || null)}
                  className="w-full text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsMaintModalOpen(false)}
                  className="px-4 py-1.5 text-xs rounded border hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMaint}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] rounded disabled:opacity-50"
                >
                  {isSubmittingMaint ? "Saving..." : "Save Maintenance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Report Breakdown */}
      {isBreakdownModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-bold text-rose-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" /> Report Equipment Breakdown
              </h3>
              <button onClick={() => setIsBreakdownModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReportBreakdown} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Issue Summary <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chamber temperature rising above 6.0°C"
                  value={breakdownIssue}
                  onChange={(e) => setBreakdownIssue(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Severity</label>
                <select
                  value={breakdownSeverity}
                  onChange={(e) => setBreakdownSeverity(e.target.value as any)}
                  className="w-full px-3 py-1.5 rounded border text-xs bg-white"
                >
                  <option value="CRITICAL">Critical (Storage or Safety compromised)</option>
                  <option value="MAJOR">Major (Operational impact, backup available)</option>
                  <option value="MINOR">Minor (Cosmetic / Non-critical component)</option>
                </select>
              </div>

              <div className="p-3 bg-amber-50 rounded border border-amber-200">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-900">
                  <input
                    type="checkbox"
                    checked={breakdownImpactStorage}
                    onChange={(e) => setBreakdownImpactStorage(e.target.checked)}
                    className="rounded text-amber-600"
                  />
                  Impacts stored blood component safety
                </label>
                <p className="text-xs text-amber-800 mt-1">
                  Checking this marks equipment UNDER_MAINTENANCE and triggers clinical advisory reminders to transfer units per facility SOP.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  SOP / Immediate Action Taken
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Transferred 24 Whole Blood units to Refrigerator BBR-02. Thermal data logger attached."
                  value={breakdownSopAction}
                  onChange={(e) => setBreakdownSopAction(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Detailed Description</label>
                <textarea
                  rows={2}
                  placeholder="Observations, error codes, noise, etc."
                  value={breakdownDesc}
                  onChange={(e) => setBreakdownDesc(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsBreakdownModalOpen(false)}
                  className="px-4 py-1.5 text-xs rounded border hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBreakdown}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded disabled:opacity-50"
                >
                  {isSubmittingBreakdown ? "Submitting..." : "Submit Incident"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Resolve Breakdown */}
      {resolveTargetBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-bold text-emerald-900">Resolve Breakdown Incident</h3>
              <button onClick={() => setResolveTargetBreakdown(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResolveBreakdown} className="space-y-3 text-sm">
              <div className="p-2 rounded bg-gray-50 text-xs">
                <strong>Issue:</strong> {resolveTargetBreakdown.issue}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Resolution Details <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe repair actions, parts replaced, and post-repair testing/verification results."
                  value={resolutionDetails}
                  onChange={(e) => setResolutionDetails(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Parts Replaced</label>
                  <input
                    type="text"
                    placeholder="e.g. Thermostat probe"
                    value={resPartsReplaced}
                    onChange={(e) => setResPartsReplaced(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Downtime (Hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="e.g. 4.0"
                    value={resDowntimeHours}
                    onChange={(e) => setResDowntimeHours(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="restoreOp"
                  checked={resRestoreOperational}
                  onChange={(e) => setResRestoreOperational(e.target.checked)}
                  className="rounded text-[#317786]"
                />
                <label htmlFor="restoreOp" className="text-xs text-gray-700">
                  Restore equipment operational status to <strong>OPERATIONAL</strong>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setResolveTargetBreakdown(null)}
                  className="px-4 py-1.5 text-xs rounded border hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingResolve}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded disabled:opacity-50"
                >
                  {isSubmittingResolve ? "Resolving..." : "Complete Resolution"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change Operational Status */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-bold text-[#053845]">Change Operational Status</h3>
              <button onClick={() => setIsStatusModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangeStatus} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">New Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded border text-xs bg-white"
                >
                  <option value="OPERATIONAL">Operational</option>
                  <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                  <option value="OUT_OF_SERVICE">Out of Service</option>
                  <option value="RETIRED">Retired</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Reason for Transition <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="A detailed reason is required for the immutable audit log (e.g. Periodic shutdown for deep sanitization, compressor failure, vendor overhaul)."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  className="w-full px-3 py-2 rounded border text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="px-4 py-1.5 text-xs rounded border hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStatus}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] rounded disabled:opacity-50"
                >
                  {isSubmittingStatus ? "Updating..." : "Update Status"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
