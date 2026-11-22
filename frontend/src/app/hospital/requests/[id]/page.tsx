"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  Calendar,
  FileText,
  Activity,
  ShieldCheck,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Check,
  X,
  Loader2,
  Heart,
  Radio,
  RadioTower,
  Eye,
  Download,
  History,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Building2,
  Boxes,
  Search,
  Sparkles,
  Users,
  CheckSquare,
  Square,
} from "lucide-react";
import { api, BloodRequestItem, MatchedDonorItem } from "@/lib/api";
import { generateIdempotencyKey } from "@/lib/idempotency";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
  mapRequestStatusToDisplay,
  mapUrgencyBadge,
  formatTimeAgo,
} from "@/lib/mappers";

interface BroadcastData {
  broadcastid: string;
  triggertype: string;
  triggerreason: string | null;
  radiuskm: number;
  status: string;
  totalmatched: number;
  totalnotified: number;
  totalresponded: number;
  createdat: string;
}

// Swastya Blood Request status pipeline
const STATUS_STEPS = [
  { key: "CREATED", label: "Requisition Raised", stepNumber: 1 },
  { key: "HOSPITAL_REVIEW", label: "Hospital Review", stepNumber: 2 },
  { key: "BLOOD_BANK_CHECK", label: "Blood Bank Check", stepNumber: 3 },
  { key: "DONOR_MATCHING", label: "Donor Matching", stepNumber: 4 },
  { key: "BLOOD_ARRANGED", label: "Blood Arranged", stepNumber: 5 },
  { key: "FULFILLED", label: "Transfusion Fulfilled", stepNumber: 6 },
];

function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "Date not specified";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Invalid date";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function HospitalRequestDetailsPage() {
  const params = useParams();
  const requestId = params?.id as string;

  const [request, setRequest] = useState<BloodRequestItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Status Action Modal State
  const [actionType, setActionType] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [notes, setNotes] = useState("");
  const [fulfillmentConfirmed, setFulfillmentConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Prescription Review State
  const [prescriptionReviewAction, setPrescriptionReviewAction] = useState<"VERIFIED" | "REJECTED" | null>(null);
  const [prescriptionReviewRemarks, setPrescriptionReviewRemarks] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [showPrescriptionHistory, setShowPrescriptionHistory] = useState(false);
  const [isLoadingPrescription, setIsLoadingPrescription] = useState(false);
  const [prescriptionViewError, setPrescriptionViewError] = useState<string | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  // Broadcast State
  const [hasBroadcast, setHasBroadcast] = useState(false);
  const [broadcast, setBroadcast] = useState<BroadcastData | null>(null);
  const [isBroadcastLoading, setIsBroadcastLoading] = useState(true);
  const [isExpandingBroadcast, setIsExpandingBroadcast] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState<number>(25);
  const [broadcastFeedback, setBroadcastFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // History Expand State
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  // Edit Clinical Notes inline state
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Blood Bank Requisition Assignment State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [bloodbanksList, setBloodbanksList] = useState<any[]>([]);
  const [isLoadingBloodbanks, setIsLoadingBloodbanks] = useState(false);
  const [bloodbankSearchQuery, setBloodbankSearchQuery] = useState("");
  const [selectedBloodBankId, setSelectedBloodBankId] = useState<string | null>(null);
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  // Intelligent Donor Matching State
  const [isMatchingModalOpen, setIsMatchingModalOpen] = useState(false);
  const [matchedDonors, setMatchedDonors] = useState<MatchedDonorItem[]>([]);
  const [isMatchingLoading, setIsMatchingLoading] = useState(false);
  const [matchingError, setMatchingError] = useState<string | null>(null);
  const [matchingRadius, setMatchingRadius] = useState<number>(25);
  const [selectedDonorIds, setSelectedDonorIds] = useState<Set<string>>(new Set());
  const [isBroadcastingToSelected, setIsBroadcastingToSelected] = useState(false);
  const [matchingBroadcastFeedback, setMatchingBroadcastFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [matchingSearchQuery, setMatchingSearchQuery] = useState("");

  const activeAssignment = useMemo(() => {
    if (!request?.requisitionassignments || request.requisitionassignments.length === 0) {
      return null;
    }
    return (
      request.requisitionassignments.find(
        (a) => a.assignmentstatus === "ACCEPTED" || a.status === "ACCEPTED"
      ) ||
      request.requisitionassignments.find(
        (a) => a.assignmentstatus === "PENDING_ACCEPTANCE" || a.status === "PENDING"
      ) ||
      request.requisitionassignments[0]
    );
  }, [request?.requisitionassignments]);

  const filteredMatchedDonors = useMemo(() => {
    if (!matchingSearchQuery.trim()) return matchedDonors;
    const q = matchingSearchQuery.toLowerCase().trim();
    return matchedDonors.filter(
      (d) =>
        d.donorName.toLowerCase().includes(q) ||
        d.bloodGroup.toLowerCase().includes(q) ||
        d.city.toLowerCase().includes(q) ||
        d.state.toLowerCase().includes(q)
    );
  }, [matchedDonors, matchingSearchQuery]);

  const isPrescriptionRequiredAndUnverified = useMemo(() => {
    return Boolean(request?.requesterid && request?.prescription?.status !== "VERIFIED");
  }, [request?.requesterid, request?.prescription?.status]);

  const filteredBloodbanks = useMemo(() => {
    if (!bloodbankSearchQuery.trim()) return bloodbanksList;
    const query = bloodbankSearchQuery.toLowerCase().trim();
    return bloodbanksList.filter(
      (bb) =>
        bb.bloodbankname?.toLowerCase().includes(query) ||
        bb.city?.toLowerCase().includes(query) ||
        bb.state?.toLowerCase().includes(query) ||
        bb.licensenumber?.toLowerCase().includes(query)
    );
  }, [bloodbanksList, bloodbankSearchQuery]);

  const selectedBloodBank = useMemo(() => {
    if (!selectedBloodBankId) return null;
    return bloodbanksList.find((bb) => bb.bloodbankid === selectedBloodBankId) || null;
  }, [bloodbanksList, selectedBloodBankId]);

  const handleOpenAssignModal = async () => {
    setIsAssignModalOpen(true);
    setAssignmentError(null);
    setBloodbankSearchQuery("");
    setAssignmentNotes("");
    setSelectedBloodBankId(null);

    if (bloodbanksList.length === 0) {
      try {
        setIsLoadingBloodbanks(true);
        const res = await api.bloodbanks.getAll();
        if (Array.isArray(res)) {
          setBloodbanksList(res);
        }
      } catch (err: any) {
        setAssignmentError(err?.message || "Failed to load blood banks list.");
      } finally {
        setIsLoadingBloodbanks(false);
      }
    }
  };

  const handleConfirmAssignment = async () => {
    if (!request || !selectedBloodBankId) return;

    if (isPrescriptionRequiredAndUnverified) {
      setAssignmentError("Clinical prescription verification (VERIFIED) is required before assigning to a blood bank.");
      return;
    }

    try {
      setIsSubmittingAssignment(true);
      setAssignmentError(null);

      const idempotencyKey = generateIdempotencyKey();
      const res = await api.hospital.assignRequisition(
        request.requestid,
        {
          bloodbankid: selectedBloodBankId,
          notes: assignmentNotes.trim() || undefined,
        },
        idempotencyKey
      );

      if (res?.success) {
        const chosenBank = bloodbanksList.find((b) => b.bloodbankid === selectedBloodBankId);
        if (res.autoDeclined) {
          setActionSuccess(
            `Requisition sent to ${chosenBank?.bloodbankname || "blood bank"}, but was automatically declined due to insufficient stock (${res.eligibleCount ?? 0} eligible units available). Please reassign to an alternate facility.`
          );
        } else {
          setActionSuccess(`Requisition successfully assigned to ${chosenBank?.bloodbankname || "blood bank"}.`);
        }
        setIsAssignModalOpen(false);
        fetchRequestDetails(true);
      } else {
        setAssignmentError(res?.message || "Failed to assign requisition.");
      }
    } catch (err: any) {
      setAssignmentError(err?.message || "An unexpected error occurred while assigning requisition.");
    } finally {
      setIsSubmittingAssignment(false);
    }
  };

  const fetchMatchedDonors = useCallback(
    async (overrideRadius?: number) => {
      if (!requestId) return;
      const radiusToUse = overrideRadius ?? matchingRadius;
      setIsMatchingLoading(true);
      setMatchingError(null);
      try {
        const res = await api.hospital.getMatchedDonors(requestId, {
          radiusKm: radiusToUse,
          limit: 100,
        });
        if (res.success && Array.isArray(res.data)) {
          setMatchedDonors(res.data);
          // Pre-select all eligible donors for convenient batch broadcasting
          setSelectedDonorIds(new Set(res.data.map((d: MatchedDonorItem) => d.donorId)));
        } else {
          setMatchedDonors([]);
          setSelectedDonorIds(new Set());
        }
      } catch (err: any) {
        console.error("Failed to fetch matched donors:", err);
        setMatchingError(err?.message || "Failed to load matching donors.");
        setMatchedDonors([]);
        setSelectedDonorIds(new Set());
      } finally {
        setIsMatchingLoading(false);
      }
    },
    [requestId, matchingRadius]
  );

  const handleOpenMatchingModal = () => {
    setIsMatchingModalOpen(true);
    setMatchingBroadcastFeedback(null);
    setMatchingSearchQuery("");
    const initialRadius = request?.searchradius && request.searchradius > 0 ? request.searchradius : 25;
    setMatchingRadius(initialRadius);
    fetchMatchedDonors(initialRadius);
  };

  const handleToggleDonorSelection = (donorId: string) => {
    setSelectedDonorIds((prev) => {
      const next = new Set(prev);
      if (next.has(donorId)) {
        next.delete(donorId);
      } else {
        next.add(donorId);
      }
      return next;
    });
  };

  const handleSelectAllMatchedDonors = () => {
    setSelectedDonorIds(new Set(filteredMatchedDonors.map((d) => d.donorId)));
  };

  const handleDeselectAllMatchedDonors = () => {
    setSelectedDonorIds(new Set());
  };

  const handleBroadcastToSelected = async () => {
    if (selectedDonorIds.size === 0) {
      setMatchingBroadcastFeedback({
        type: "error",
        text: "Please select at least one eligible donor before initiating broadcast.",
      });
      return;
    }

    setIsBroadcastingToSelected(true);
    setMatchingBroadcastFeedback(null);

    try {
      const res = await api.hospital.triggerBroadcast(requestId, {
        radiusKm: matchingRadius,
        reason: `Targeted emergency broadcast to ${selectedDonorIds.size} matched donors`,
      });

      if (res.success) {
        setMatchingBroadcastFeedback({
          type: "success",
          text: res.message || `Emergency broadcast dispatched to ${selectedDonorIds.size} matched donors.`,
        });
        await fetchBroadcastStatus();
        await fetchRequestDetails(true);
      } else {
        setMatchingBroadcastFeedback({
          type: "error",
          text: res.message || "Failed to initiate emergency broadcast.",
        });
      }
    } catch (err: any) {
      console.error("Error broadcasting to matched donors:", err);
      setMatchingBroadcastFeedback({
        type: "error",
        text: err?.message || "Failed to initiate emergency broadcast to selected donors.",
      });
    } finally {
      setIsBroadcastingToSelected(false);
    }
  };

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  const fetchBroadcastStatus = useCallback(async () => {
    if (!requestId) return;
    try {
      setIsBroadcastLoading(true);
      const res = await api.bloodRequests.getBroadcastStatus(requestId);
      setHasBroadcast(res.hasBroadcast);
      setBroadcast(res.broadcast || null);
      if (res.broadcast?.radiuskm) {
        const cur = res.broadcast.radiuskm;
        if (cur < 25) setSelectedRadius(25);
        else if (cur < 50) setSelectedRadius(50);
        else if (cur < 75) setSelectedRadius(75);
        else if (cur < 100) setSelectedRadius(100);
      }
    } catch (err: unknown) {
      console.error("Failed to load broadcast status:", err);
    } finally {
      setIsBroadcastLoading(false);
    }
  }, [requestId]);

  const handleExpandOrTriggerBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || isExpandingBroadcast) return;

    try {
      setIsExpandingBroadcast(true);
      setBroadcastFeedback(null);

      const res = await api.bloodRequests.triggerBroadcast(requestId, {
        radiusKm: selectedRadius,
        reason: hasBroadcast
          ? `Emergency broadcast radius expanded to ${selectedRadius} km`
          : "Emergency broadcast initiated",
      });

      setBroadcastFeedback({
        type: "success",
        text: res.message || `Broadcast updated to ${selectedRadius} km radius.`,
      });

      await fetchBroadcastStatus();
      await fetchRequestDetails(true);
    } catch (err: unknown) {
      setBroadcastFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to trigger or expand emergency broadcast.",
      });
    } finally {
      setIsExpandingBroadcast(false);
    }
  };

  const handleOpenPrescription = async (download: boolean) => {
    if (!request) return;
    try {
      setIsLoadingPrescription(true);
      setPrescriptionViewError(null);
      const { blob, filename } = await api.bloodRequests.fetchPrescriptionBlob(
        request.requestid,
        download
      );
      const objectUrl = URL.createObjectURL(blob);
      objectUrlsRef.current.push(objectUrl);

      if (download) {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = request.prescription?.originalfilename || filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== objectUrl);
        }, 1000);
      } else {
        const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
          URL.revokeObjectURL(objectUrl);
          objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== objectUrl);
          setPrescriptionViewError(
            "Your browser blocked opening the prescription in a new tab. Please allow pop-ups or use the Download button."
          );
          return;
        }
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== objectUrl);
        }, 60000);
      }
    } catch (err: any) {
      setPrescriptionViewError(
        err?.message || "Unable to retrieve prescription document. Please try again."
      );
    } finally {
      setIsLoadingPrescription(false);
    }
  };

  const fetchRequestDetails = useCallback(async (background = false) => {
    if (!requestId) return;
    try {
      if (!background) setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);

      const data = await api.hospital.getRequestDetails(requestId);
      setRequest(data);
      setEditedNotes(data.notes || "");
    } catch (err: any) {
      console.error("Failed to load requisition details:", err);
      if (err?.status === 403) {
        setError("Access Denied: This blood requisition is not assigned to your medical facility.");
      } else if (err?.status === 404) {
        setError("Blood requisition not found. It may have been removed or the ID is invalid.");
      } else {
        setError(err?.message || "Failed to load requisition details. Please check your connection.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchRequestDetails();
    fetchBroadcastStatus();
  }, [fetchRequestDetails, fetchBroadcastStatus]);

  // Handle status update submission
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || !actionType || isSubmitting) return;

    if (actionType === "FULFILLED" && !fulfillmentConfirmed) {
      setActionError("You must explicitly confirm that the physical transfusion was completed and verified by authorized hospital staff.");
      return;
    }

    if (actionType === "BLOOD_ARRANGED" || actionType === "FULFILLED") {
      if (request?.requesterid && request?.prescription?.status !== "VERIFIED") {
        setActionError(
          `Clinical Safety Gate: Cannot advance requester requisition to ${actionType.replace(/_/g, " ")} without a clinically VERIFIED prescription (Current status: ${request?.prescription?.status || "NONE"}). Please review and verify the prescription document first.`
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setActionError(null);

      const payload: { status: string; remarks?: string; notes?: string } = {
        status: actionType,
      };

      if (remarks.trim()) {
        payload.remarks = remarks.trim();
      }

      if (notes.trim()) {
        payload.notes = notes.trim();
      }

      await api.hospital.updateBloodRequest(requestId, payload);

      setActionSuccess(`Requisition status updated to ${actionType.replace(/_/g, " ")}.`);
      setActionType(null);
      setRemarks("");
      setNotes("");
      setFulfillmentConfirmed(false);

      await fetchRequestDetails(true);

      setTimeout(() => {
        setActionSuccess(null);
      }, 5000);
    } catch (err: any) {
      console.error("Failed to update status:", err);
      setActionError(err?.message || "Failed to update requisition status. Please review the server requirements.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Prescription Verification / Rejection
  const handleVerifyPrescription = async (status: "VERIFIED" | "REJECTED") => {
    if (!requestId || isSubmittingReview) return;
    if (status === "REJECTED" && !prescriptionReviewRemarks.trim()) {
      setReviewError("A clear explanation/reason is required when rejecting a prescription.");
      return;
    }

    try {
      setIsSubmittingReview(true);
      setReviewError(null);
      const res = await api.bloodRequests.verifyPrescription(requestId, {
        status,
        remarks: prescriptionReviewRemarks.trim() || undefined,
      });

      if (res && res.success) {
        setReviewSuccess(`Prescription successfully ${status.toLowerCase()}.`);
        setPrescriptionReviewAction(null);
        setPrescriptionReviewRemarks("");
        await fetchRequestDetails(true);
        setTimeout(() => setReviewSuccess(null), 5000);
      }
    } catch (err: any) {
      setReviewError(err?.message || "Failed to submit prescription verification decision.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Handle saving clinical notes without changing status
  const handleSaveNotesOnly = async () => {
    if (!requestId || isSavingNotes) return;
    try {
      setIsSavingNotes(true);
      setActionError(null);

      await api.hospital.updateBloodRequest(requestId, {
        notes: editedNotes.trim(),
        remarks: "Updated clinical notes via hospital coordination portal.",
      });

      setIsEditingNotes(false);
      setActionSuccess("Clinical notes updated successfully.");
      await fetchRequestDetails(true);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error("Failed to update notes:", err);
      setActionError(err?.message || "Failed to save clinical notes.");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const currentStatus = request?.status?.toUpperCase() || "CREATED";
  const isTerminal = ["FULFILLED", "CANCELLED", "EXPIRED"].includes(currentStatus);
  const canManageBroadcast = !isTerminal;

  // Stepper helper
  const getStepState = (stepKey: string) => {
    if (currentStatus === "CANCELLED") return "cancelled";
    const order = ["CREATED", "HOSPITAL_REVIEW", "BLOOD_BANK_CHECK", "DONOR_MATCHING", "BLOOD_ARRANGED", "FULFILLED"];
    const currentIndex = order.indexOf(currentStatus);
    const stepIndex = order.indexOf(stepKey);

    if (currentIndex === -1) return "upcoming";
    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "current";
    return "upcoming";
  };

  // Allowed status transitions for Hospital
  const getAllowedActions = () => {
    if (!request || isTerminal) return [];

    switch (currentStatus) {
      case "CREATED":
      case "VERIFIED":
        return [
          { targetStatus: "HOSPITAL_REVIEW", title: "Accept for Review", variant: "primary" },
          { targetStatus: "BLOOD_BANK_CHECK", title: "Check Blood Bank", variant: "secondary" },
          { targetStatus: "DONOR_MATCHING", title: "Open Donor Matching", variant: "secondary" },
          { targetStatus: "CANCELLED", title: "Cancel Requisition", variant: "danger" },
        ];

      case "HOSPITAL_REVIEW":
        return [
          { targetStatus: "BLOOD_BANK_CHECK", title: "Check Blood Bank Stock", variant: "primary" },
          { targetStatus: "DONOR_MATCHING", title: "Open Donor Matching", variant: "secondary" },
          { targetStatus: "BLOOD_ARRANGED", title: "Units Arranged", variant: "secondary" },
          { targetStatus: "CANCELLED", title: "Cancel Requisition", variant: "danger" },
        ];

      case "BLOOD_BANK_CHECK":
        return [
          { targetStatus: "BLOOD_ARRANGED", title: "Stock Confirmed (Arranged)", variant: "primary" },
          { targetStatus: "DONOR_MATCHING", title: "Stock Depleted (Match Donors)", variant: "secondary" },
          { targetStatus: "CANCELLED", title: "Cancel Requisition", variant: "danger" },
        ];

      case "DONOR_MATCHING":
        return [
          { targetStatus: "BLOOD_ARRANGED", title: "Confirm Units Arranged", variant: "primary" },
          { targetStatus: "CANCELLED", title: "Cancel Requisition", variant: "danger" },
        ];

      case "BLOOD_ARRANGED":
        return [
          { targetStatus: "FULFILLED", title: "Confirm Transfusion & Fulfill", variant: "success" },
          { targetStatus: "CANCELLED", title: "Cancel Requisition", variant: "danger" },
        ];

      default:
        return [];
    }
  };

  const allowedActions = getAllowedActions();

  // Loading View
  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-5 pb-12">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
          <span>/</span>
          <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 space-y-4 animate-pulse">
          <div className="h-7 w-56 bg-slate-200 rounded-lg" />
          <div className="h-14 w-full bg-slate-100 rounded-xl" />
          <div className="h-4 w-80 bg-slate-100 rounded" />
        </div>
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 h-36 animate-pulse" />
      </div>
    );
  }

  // Error View
  if (error || !request) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-[#fdf2f2] border border-[#A2363A]/30 text-[#A2363A] flex items-center justify-center mx-auto shadow-2xs">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-serif text-2xl font-bold text-[#053845]">
            Unable to Display Requisition
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            {error || "The requested requisition record is unavailable or access was denied."}
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Link
            href="/hospital/requests"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Requisitions</span>
          </Link>
          <button
            type="button"
            onClick={() => fetchRequestDetails()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Query</span>
          </button>
        </div>
      </div>
    );
  }

  const statusMeta = mapRequestStatusToDisplay(request.status);
  const urgencyMeta = mapUrgencyBadge(request.urgencylevel);
  const bloodGroupDisplay = mapBloodGroupToDisplay(request.bloodgroup);
  const componentDisplay = mapBloodComponentToDisplay(request.bloodcomponent);
  const refId = `REQ-${request.requestid.slice(0, 8).toUpperCase()}`;
  const isCriticalOrEmergency = Boolean(request.isemergency) || request.urgencylevel === "CRITICAL";

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-500">
          <Link href="/hospital/dashboard" className="hover:text-[#053845] transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/hospital/requests" className="hover:text-[#053845] transition-colors">
            Assigned Requisitions
          </Link>
          <span>/</span>
          <span className="font-semibold text-[#053845] font-mono">{refId}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              fetchRequestDetails(true);
              fetchBroadcastStatus();
            }}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/hospital/requests"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Requisitions</span>
          </Link>
        </div>
      </div>

      {/* Action Success Toast */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{actionSuccess}</div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* 1. Request Overview Header Card */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs space-y-4">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3.5 border-b border-[#F3E9D1]/70">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#053845] truncate">
                {request.patientname}
              </h1>
              <span className="text-xs font-medium text-slate-400 shrink-0 font-mono">
                {refId}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Submitted {formatTimeAgo(request.createdat)}
              {request.patientage ? ` · Age ${request.patientage} yrs` : ""}
              {request.patientgender ? ` · ${request.patientgender}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                isCriticalOrEmergency
                  ? "bg-[#A2363A]/10 text-[#A2363A] border-[#A2363A]/25"
                  : urgencyMeta.badgeClass
              }`}
            >
              {isCriticalOrEmergency ? "Critical Emergency" : urgencyMeta.label}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusMeta.badgeClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
              <span>{statusMeta.label}</span>
            </span>
          </div>
        </div>

        {/* Blood Group & Required Units Focal Point */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1">
          <div className="flex items-center gap-3.5">
            <div className="inline-flex flex-col items-center justify-center px-3.5 py-2 rounded-xl bg-[#317786]/10 border border-[#317786]/20 shrink-0">
              <span className="font-serif text-xl font-bold text-[#053845] leading-none">
                {bloodGroupDisplay}
              </span>
              <span className="text-[11px] font-medium text-[#317786] mt-1 leading-none whitespace-nowrap">
                {componentDisplay}
              </span>
            </div>

            <div className="space-y-0.5">
              <p className="text-sm sm:text-base text-slate-700">
                <span className="font-serif text-xl font-bold text-[#053845]">
                  {request.unitsrequired}
                </span>{" "}
                {request.unitsrequired === 1 ? "unit" : "units"} required
              </p>
              <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                <span>Required by {formatDateTime(request.requiredby)}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0">
            {request.patientcontact && (
              <a
                href={`tel:${request.patientcontact}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] text-xs font-semibold text-[#053845] transition-colors shrink-0"
              >
                <Phone className="w-3.5 h-3.5 text-[#317786]" />
                <span>{request.patientcontact}</span>
              </a>
            )}
            {!isTerminal && (
              <button
                type="button"
                onClick={handleOpenMatchingModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-semibold cursor-pointer transition-colors shadow-2xs shrink-0"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Find Matching Donors</span>
              </button>
            )}
          </div>
        </div>

        {/* Horizontal Progress Tracker */}
        <div className="pt-3 border-t border-[#F3E9D1]/70">
          {currentStatus === "CANCELLED" ? (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <X className="w-4 h-4 text-rose-500 shrink-0" />
              <span><strong>Requisition Cancelled:</strong> This blood requisition has been cancelled.</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {STATUS_STEPS.map((step) => {
                const state = getStepState(step.key);
                return (
                  <div
                    key={step.key}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      state === "completed"
                        ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                        : state === "current"
                        ? "bg-[#053845] border-[#053845] text-white shadow-2xs ring-1 ring-[#317786]/30"
                        : "bg-slate-50/60 border-slate-200/70 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-center mb-1">
                      {state === "completed" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      ) : (
                        <span className={`text-[10px] font-bold ${state === "current" ? "text-teal-200" : "text-slate-400"}`}>
                          0{step.stepNumber}
                        </span>
                      )}
                    </div>
                    <span className="block text-[11px] font-semibold leading-tight">
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Main Content: Clean Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT COLUMN: Emergency Broadcast, Volunteer Responses, Collapsible History */}
        <div className="space-y-5">
          {/* Emergency Blood Broadcast Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F3E9D1]/70">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#B94F30]" />
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Emergency Blood Broadcast
                </h2>
                {hasBroadcast && broadcast && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EFA27E]/20 text-[#B94F30] border border-[#EFA27E]/50">
                    {broadcast.status === "DONOR_RESPONDED"
                      ? "Donor Responded"
                      : broadcast.status || "Active"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!isTerminal && (
                  <button
                    type="button"
                    onClick={handleOpenMatchingModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#053845] hover:bg-[#317786] text-white text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Find Matching Donors</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fetchBroadcastStatus()}
                  disabled={isBroadcastLoading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#F3E9D1] text-xs font-semibold text-slate-600 hover:bg-[#FAF6EE] cursor-pointer transition-colors"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-[#317786] ${isBroadcastLoading ? "animate-spin" : ""}`}
                  />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {broadcastFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  broadcastFeedback.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                {broadcastFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{broadcastFeedback.text}</span>
              </div>
            )}

            {isBroadcastLoading && !broadcast ? (
              <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-[#317786]" />
                <span>Loading broadcast status...</span>
              </div>
            ) : hasBroadcast && broadcast ? (
              <div className="space-y-3">
                {/* Horizontal Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Radius</span>
                    <span className="font-serif text-base font-bold text-[#053845]">
                      {broadcast.radiuskm} km
                    </span>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Matched</span>
                    <span className="font-serif text-base font-bold text-[#053845]">
                      {broadcast.totalmatched}
                    </span>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Notified</span>
                    <span className="font-serif text-base font-bold text-[#B94F30]">
                      {broadcast.totalnotified}
                    </span>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Responded</span>
                    <span className="font-serif text-base font-bold text-[#317786]">
                      {broadcast.totalresponded}
                    </span>
                  </div>
                </div>

                {/* Radius Expansion Control */}
                {canManageBroadcast && broadcast.radiuskm < 100 && (
                  <form
                    onSubmit={handleExpandOrTriggerBroadcast}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1"
                  >
                    <span className="text-xs text-slate-600">
                      Expand broadcast search radius:
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={selectedRadius}
                        onChange={(e) => setSelectedRadius(Number(e.target.value))}
                        disabled={isExpandingBroadcast}
                        className="px-2.5 py-1 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-[#053845] focus:outline-none focus:border-[#317786]"
                      >
                        {[15, 25, 50, 75, 100].map((r) => (
                          <option key={r} value={r} disabled={r <= broadcast.radiuskm}>
                            {r} km {r <= broadcast.radiuskm ? "(Current)" : ""}
                          </option>
                        ))}
                      </select>

                      <button
                        type="submit"
                        disabled={isExpandingBroadcast || selectedRadius <= broadcast.radiuskm}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isExpandingBroadcast ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RadioTower className="w-3 h-3" />
                        )}
                        <span>Expand</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] text-xs">
                <span className="text-slate-600">
                  Emergency broadcast has not been initiated yet.
                </span>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleOpenMatchingModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white hover:bg-[#FAF6EE] text-[#053845] font-semibold cursor-pointer transition-colors shadow-2xs"
                  >
                    <Users className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Find Matching Donors</span>
                  </button>
                  {canManageBroadcast && (
                    <button
                      type="button"
                      onClick={handleExpandOrTriggerBroadcast}
                      disabled={isExpandingBroadcast}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#B94F30] hover:bg-[#a14023] text-white font-semibold cursor-pointer transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isExpandingBroadcast ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Radio className="w-3.5 h-3.5" />
                      )}
                      <span>Initiate Broadcast</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Volunteer Donor Responses & Transit Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-[#B94F30]" />
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Volunteer Donor Responses
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 text-[#317786]">
                  {(request.volunteers || []).length}
                </span>
              </div>
            </div>

            {!request.volunteers || request.volunteers.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1] text-xs text-slate-500 text-center">
                No volunteer responses recorded yet. Matched community donors will appear here as they respond.
              </div>
            ) : (
              <div className="space-y-2.5">
                {request.volunteers.map((vol, idx) => {
                  const transit = (vol.transitStatus || "DONOR_FOUND").toUpperCase();
                  const isCompleted = transit === "COMPLETED";

                  return (
                    <div
                      key={vol.notificationid || idx}
                      className="p-3 rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/40 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-white border border-[#F3E9D1] text-[#053845] flex items-center justify-center font-serif font-bold text-xs shrink-0">
                            {mapBloodGroupToDisplay(vol.donorBloodGroup || request.bloodgroup)}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-[#053845] block truncate">
                              {vol.donorName}
                            </span>
                            <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#317786]" />
                              <span>{vol.donorCity || "Registered Donor"}</span>
                            </span>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center text-[10px] font-semibold border px-2 py-0.5 rounded-full shrink-0 ${
                            isCompleted
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : transit === "REACHED_LOCATION"
                              ? "bg-teal-50 text-teal-800 border-teal-200"
                              : transit === "STARTED"
                              ? "bg-sky-50 text-sky-800 border-sky-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {isCompleted
                            ? "Blood Received"
                            : transit === "REACHED_LOCATION"
                            ? "Reached Hospital"
                            : transit === "STARTED"
                            ? "On the Way"
                            : "Donor Matched"}
                        </span>
                      </div>

                      {vol.screening && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600 pt-1 border-t border-[#F3E9D1]/50">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Health: {vol.screening.generalHealth || "Cleared"}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Alcohol: {vol.screening.alcoholClearance || "Cleared"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Status Audit History (Collapsible Accordion) */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-[#FAF6EE]/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#317786]" />
                <h3 className="font-serif text-sm font-bold text-[#053845]">
                  Status Audit History
                </h3>
                <span className="text-xs font-semibold text-slate-400">
                  ({request.requeststatushistory?.length || 0})
                </span>
              </div>
              {isHistoryExpanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {isHistoryExpanded && (
              <div className="p-4 pt-1 border-t border-[#F3E9D1]/70 space-y-2 text-xs">
                {!request.requeststatushistory || request.requeststatushistory.length === 0 ? (
                  <p className="text-slate-400 italic">No status transitions recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {request.requeststatushistory.map((hist, idx) => (
                      <div
                        key={hist.historyid || idx}
                        className="p-2.5 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1] space-y-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#053845]">
                            {hist.oldstatus ? `${hist.oldstatus} → ` : ""}{hist.newstatus}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDateTime(hist.changedat)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          By: {hist.users?.name || "Staff Member"} ({hist.users?.role || "USER"})
                        </p>
                        {hist.remarks && (
                          <p className="text-[11px] text-slate-600 italic">
                            &quot;{hist.remarks}&quot;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Clinical Actions, Prescription, Notes, Details */}
        <div className="space-y-5">
          {/* Blood Bank Requisition & Assignment Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F3E9D1]/70">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#317786]" />
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Blood Bank Requisition
                </h2>
              </div>

              {activeAssignment ? (
                activeAssignment.assignmentstatus === "ACCEPTED" || activeAssignment.status === "ACCEPTED" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Accepted</span>
                  </span>
                ) : activeAssignment.assignmentstatus === "PENDING_ACCEPTANCE" || activeAssignment.status === "PENDING" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Pending Acceptance</span>
                  </span>
                ) : activeAssignment.assignmentstatus === "DECLINED" || activeAssignment.status === "DECLINED" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-[#A2363A] border border-rose-200">
                    <AlertCircle className="w-3.5 h-3.5 text-[#A2363A]" />
                    <span>Declined</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                    {activeAssignment.assignmentstatus || activeAssignment.status}
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                  Unassigned
                </span>
              )}
            </div>

            {activeAssignment ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold text-sm text-[#053845]">
                      {activeAssignment.bloodbanks?.bloodbankname || "Assigned Blood Bank"}
                    </span>
                    {activeAssignment.bloodbanks?.licensenumber && (
                      <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-[#F3E9D1]">
                        LIC: {activeAssignment.bloodbanks.licensenumber}
                      </span>
                    )}
                  </div>
                  {activeAssignment.bloodbanks?.city && (
                    <p className="text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#317786]" />
                      <span>
                        {activeAssignment.bloodbanks.city}
                        {activeAssignment.bloodbanks.state ? `, ${activeAssignment.bloodbanks.state}` : ""}
                      </span>
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    Dispatched on {formatDateTime(activeAssignment.assignedat)}
                  </p>
                  {activeAssignment.declinereason && (
                    <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
                        <AlertCircle className="w-4 h-4 text-[#A2363A] shrink-0" />
                        <span>
                          {activeAssignment.declinereason.includes("Insufficient eligible blood stock")
                            ? "System Auto-Declined (Insufficient Stock)"
                            : "Declined by Facility"}
                        </span>
                      </div>
                      <p className="text-rose-800 text-xs">
                        &quot;{activeAssignment.declinereason}&quot;
                      </p>
                      {activeAssignment.respondedat && (
                        <p className="text-[10px] text-rose-600 font-mono">
                          Responded on {formatDateTime(activeAssignment.respondedat)}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {!isTerminal && (
                  <div>
                    {activeAssignment.assignmentstatus === "ACCEPTED" || activeAssignment.status === "ACCEPTED" ? (
                      <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-[11px] flex items-center gap-2 border border-emerald-200">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Facility accepted requisition order. Screened units are being reserved.</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleOpenAssignModal}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors cursor-pointer shadow-2xs"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Reassign to Another Blood Bank</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="text-slate-500 leading-relaxed">
                  Dispatch this requisition to an accredited blood bank to check vault inventory, reserve compatible units, and initiate clinical crossmatching.
                </p>

                {isPrescriptionRequiredAndUnverified && (
                  <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800 text-xs flex items-start gap-2 border border-amber-200">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>Prescription verification (VERIFIED) is required by clinical protocol before dispatching to a blood bank.</span>
                  </div>
                )}

                {!isTerminal && (
                  <button
                    type="button"
                    onClick={handleOpenAssignModal}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors cursor-pointer shadow-2xs"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Send Requisition to Blood Bank</span>
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Clinical Coordination Actions Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#317786]" />
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Clinical Actions
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                {currentStatus.replace(/_/g, " ")}
              </span>
            </div>

            {isTerminal ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Requisition is in terminal state ({currentStatus}). No further actions permitted.
              </div>
            ) : allowedActions.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                No active actions available for this stage.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {allowedActions.map((act) => (
                  <button
                    key={act.targetStatus}
                    type="button"
                    onClick={() => {
                      setActionType(act.targetStatus);
                      setActionError(null);
                      setRemarks("");
                      setFulfillmentConfirmed(false);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      act.variant === "success"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : act.variant === "danger"
                        ? "bg-rose-50 hover:bg-rose-100 text-[#A2363A] border border-rose-200"
                        : act.variant === "primary"
                        ? "bg-[#053845] hover:bg-[#317786] text-white"
                        : "bg-white hover:bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]"
                    }`}
                  >
                    <span>{act.title}</span>
                    <span>&rarr;</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Clinical Prescription Review (Only when present or requested) */}
          {request.prescription ? (
            <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F3E9D1]/70">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#317786]" />
                  <h2 className="font-serif text-base font-bold text-[#053845]">
                    Prescription &amp; Verification
                  </h2>
                </div>

                {request.prescription.status === "VERIFIED" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Verified</span>
                  </span>
                )}
                {request.prescription.status === "PENDING" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Pending Review</span>
                  </span>
                )}
                {request.prescription.status === "REJECTED" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-[#A2363A] border border-rose-200">
                    <AlertCircle className="w-3.5 h-3.5 text-[#A2363A]" />
                    <span>Rejected</span>
                  </span>
                )}
              </div>

              {reviewSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{reviewSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1]">
                  <span className="text-slate-400 block text-[10px] uppercase font-medium">Doctor</span>
                  <span className="font-semibold text-[#053845] mt-0.5 block truncate">
                    {request.prescription.doctorname || "Attending Physician"}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1]">
                  <span className="text-slate-400 block text-[10px] uppercase font-medium">Document</span>
                  <span className="font-semibold text-[#053845] mt-0.5 block truncate">
                    {request.prescription.originalfilename || "Prescription File"}
                  </span>
                </div>
              </div>

              {prescriptionViewError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{prescriptionViewError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isLoadingPrescription}
                    onClick={() => handleOpenPrescription(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#317786]/10 hover:bg-[#317786]/15 text-[#053845] font-semibold border border-[#317786]/25 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingPrescription ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#317786]" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-[#317786]" />
                    )}
                    <span>View</span>
                  </button>

                  <button
                    type="button"
                    disabled={isLoadingPrescription}
                    onClick={() => handleOpenPrescription(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF6EE] text-slate-700 font-semibold border border-[#F3E9D1] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Download</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewError(null);
                      setPrescriptionReviewRemarks("");
                      setPrescriptionReviewAction("VERIFIED");
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      request.prescription.status === "VERIFIED"
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }`}
                  >
                    <Check className="w-3 h-3" />
                    <span>{request.prescription.status === "VERIFIED" ? "Re-Verify" : "Verify"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReviewError(null);
                      setPrescriptionReviewRemarks("");
                      setPrescriptionReviewAction("REJECTED");
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      request.prescription.status === "REJECTED"
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-rose-50 text-[#A2363A] border border-rose-200 hover:bg-rose-100"
                    }`}
                  >
                    <X className="w-3 h-3" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>

              {request.prescriptionhistory && request.prescriptionhistory.length > 0 && (
                <div className="pt-2 border-t border-[#F3E9D1]/70">
                  <button
                    type="button"
                    onClick={() => setShowPrescriptionHistory(!showPrescriptionHistory)}
                    className="inline-flex items-center gap-1.5 text-xs text-[#317786] font-semibold hover:underline cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>
                      {showPrescriptionHistory ? "Hide Review History" : `History (${request.prescriptionhistory.length})`}
                    </span>
                  </button>

                  {showPrescriptionHistory && (
                    <div className="pt-2 space-y-1.5">
                      {request.prescriptionhistory.map((hist) => (
                        <div
                          key={hist.historyid}
                          className="p-2 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1] text-[11px] space-y-0.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#053845]">{hist.status}</span>
                            <span className="text-slate-400">{formatDateTime(hist.createdat)}</span>
                          </div>
                          {hist.remarks && (
                            <p className="text-slate-600 italic">&quot;{hist.remarks}&quot;</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : request.requesterid ? (
            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-amber-800 leading-relaxed">
                Prescription not attached by requester. Verification is required prior to transfusion fulfillment.
              </p>
            </div>
          ) : null}

          {/* Clinical Notes Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
              <h3 className="font-serif text-sm font-bold text-[#053845] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#317786]" />
                <span>Clinical Notes</span>
              </h3>
              {!isTerminal && (
                <button
                  type="button"
                  onClick={() => setIsEditingNotes(!isEditingNotes)}
                  className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors cursor-pointer"
                >
                  {isEditingNotes ? "Cancel" : "Edit Notes"}
                </button>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  rows={3}
                  placeholder="Enter clinical observations or handling instructions..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-[#FAF6EE]/50 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800 leading-relaxed"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingNotes(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNotesOnly}
                    disabled={isSavingNotes}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingNotes && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Save Notes</span>
                  </button>
                </div>
              </div>
            ) : request.notes ? (
              <p className="text-xs text-slate-700 bg-[#FAF6EE]/60 p-3 rounded-xl border border-[#F3E9D1]/50 leading-relaxed whitespace-pre-line">
                {request.notes}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">
                No clinical notes recorded for this requisition.
              </p>
            )}
          </section>

          {/* Patient & Contact Details Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
            <h3 className="font-serif text-sm font-bold text-[#053845] flex items-center gap-1.5 pb-3 border-b border-[#F3E9D1]/70">
              <User className="w-4 h-4 text-[#317786]" />
              <span>Patient &amp; Contact Details</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Patient:</span>
                <span className="font-semibold text-slate-800">
                  {request.patientname} ({request.patientage ? `${request.patientage} yrs` : "Age N/A"}, {request.patientgender || "N/A"})
                </span>
              </div>

              {request.patientcontact && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Patient Phone:</span>
                  <a
                    href={`tel:${request.patientcontact}`}
                    className="font-semibold text-[#053845] hover:underline flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3 text-[#317786]" />
                    <span>{request.patientcontact}</span>
                  </a>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-slate-500">Requester:</span>
                <span className="font-semibold text-slate-800">
                  {request.users?.name || "Not Specified"}
                </span>
              </div>

              {(request.users?.phonenumber || request.patientcontact) && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Requester Phone:</span>
                  <a
                    href={`tel:${request.users?.phonenumber || request.patientcontact}`}
                    className="font-semibold text-[#053845] hover:underline flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3 text-[#317786]" />
                    <span>{request.users?.phonenumber || request.patientcontact}</span>
                  </a>
                </div>
              )}

              {request.users?.email && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Requester Email:</span>
                  <span className="font-medium text-slate-700 flex items-center gap-1 truncate max-w-[200px]">
                    <Mail className="w-3 h-3 text-[#317786]" />
                    <span className="truncate">{request.users.email}</span>
                  </span>
                </div>
              )}

              {request.requesters && (
                <div className="flex items-start justify-between gap-2 pt-1">
                  <span className="text-slate-500 shrink-0">Location:</span>
                  <span className="font-medium text-slate-700 text-right">
                    {request.requesters.city}, {request.requesters.state}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Status Transition Action & Fulfillment Modal */}
      {actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#317786]" />
                <span>
                  {actionType === "FULFILLED"
                    ? "Confirm Transfusion (Fulfill)"
                    : actionType === "CANCELLED"
                    ? "Cancel Blood Requisition"
                    : `Transition to ${actionType.replace(/_/g, " ")}`}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>{actionError}</div>
              </div>
            )}

            <form onSubmit={handleStatusSubmit} className="space-y-4">
              {actionType === "FULFILLED" && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2.5">
                  <div className="text-xs text-emerald-900 leading-relaxed">
                    <strong>Physical Transfusion Verification Required</strong>
                    <p className="mt-0.5">
                      Fulfilling is a terminal action confirming units were cross-matched and transfused into the patient.
                    </p>
                  </div>

                  <label className="flex items-start gap-2 pt-1 text-xs text-emerald-950 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fulfillmentConfirmed}
                      onChange={(e) => setFulfillmentConfirmed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-emerald-300 text-[#053845] focus:ring-[#317786]"
                    />
                    <span>
                      I confirm that physical transfusion was completed and verified.
                    </span>
                  </label>
                </div>
              )}

              {actionType === "CANCELLED" && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  <strong>Cancellation is permanent.</strong> Please provide a reason below.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter remarks for audit history..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-[#FAF6EE]/50 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActionType(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (actionType === "FULFILLED" && !fulfillmentConfirmed)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 ${
                    actionType === "FULFILLED"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : actionType === "CANCELLED"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-[#053845] hover:bg-[#317786]"
                  }`}
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {actionType === "FULFILLED"
                      ? "Confirm Transfusion"
                      : actionType === "CANCELLED"
                      ? "Confirm Cancellation"
                      : `Advance to ${actionType.replace(/_/g, " ")}`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Prescription Review & Verification Modal */}
      {prescriptionReviewAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-[#053845]">
                {prescriptionReviewAction === "VERIFIED"
                  ? "Verify Blood Prescription"
                  : "Reject Blood Prescription"}
              </h3>
              <button
                type="button"
                onClick={() => setPrescriptionReviewAction(null)}
                disabled={isSubmittingReview}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reviewError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{reviewError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                {prescriptionReviewAction === "VERIFIED"
                  ? "You are certifying that this prescription has been clinically authenticated for transfusion processing."
                  : "Prescription rejection will notify the requester to provide an updated document. A clear explanation is required."}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {prescriptionReviewAction === "VERIFIED"
                    ? "Clinical Remarks (Optional)"
                    : "Rejection Reason (Required) *"}
                </label>
                <textarea
                  rows={3}
                  value={prescriptionReviewRemarks}
                  onChange={(e) => setPrescriptionReviewRemarks(e.target.value)}
                  placeholder={
                    prescriptionReviewAction === "VERIFIED"
                      ? "e.g., Verified against attending physician records."
                      : "e.g., Signature missing or image blurry."
                  }
                  required={prescriptionReviewAction === "REJECTED"}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPrescriptionReviewAction(null)}
                disabled={isSubmittingReview}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleVerifyPrescription(prescriptionReviewAction)}
                disabled={
                  isSubmittingReview ||
                  (prescriptionReviewAction === "REJECTED" && !prescriptionReviewRemarks.trim())
                }
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 ${
                  prescriptionReviewAction === "VERIFIED"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {isSubmittingReview && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {prescriptionReviewAction === "VERIFIED"
                    ? "Confirm Verification"
                    : "Confirm Rejection"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blood Bank Requisition Assignment Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#317786]" />
                <h3 className="text-sm font-bold text-[#053845]">
                  Send Requisition to Blood Bank
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                disabled={isSubmittingAssignment}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto pr-1 space-y-4 text-xs">
              {/* Requisition Brief Summary */}
              <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-[#053845]">{request.patientname}</span>
                  <span className="font-mono text-[11px] text-slate-500 font-medium">{refId}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
                  <span className="font-semibold text-[#053845]">
                    {request.unitsrequired} {request.unitsrequired === 1 ? "unit" : "units"} of {bloodGroupDisplay} ({componentDisplay})
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500">Urgency: {request.urgencylevel}</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500">Required by {formatDateTime(request.requiredby)}</span>
                </div>
              </div>

              {/* Warning/Error Alerts */}
              {isPrescriptionRequiredAndUnverified && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Prescription Verification Required:</strong> This requisition was initiated by a patient and must have its clinical prescription authenticated (VERIFIED) prior to blood bank assignment.
                  </p>
                </div>
              )}

              {activeAssignment && (activeAssignment.assignmentstatus === "PENDING_ACCEPTANCE" || activeAssignment.status === "PENDING") && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Pending Reassignment:</strong> This request is currently pending acceptance with <em>{activeAssignment.bloodbanks?.bloodbankname || "another facility"}</em>. Confirming a new assignment will cancel the pending order and dispatch to the selected facility.
                  </p>
                </div>
              )}

              {assignmentError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{assignmentError}</span>
                </div>
              )}

              {/* Search Blood Banks */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700">
                  Select Target Blood Bank Facility
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={bloodbankSearchQuery}
                    onChange={(e) => setBloodbankSearchQuery(e.target.value)}
                    placeholder="Search by facility name, city, or state..."
                    className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Blood Bank List */}
              <div className="space-y-2">
                {isLoadingBloodbanks ? (
                  <div className="py-8 text-center text-slate-500 space-y-2">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#317786]" />
                    <p className="text-xs">Loading licensed blood banks...</p>
                  </div>
                ) : filteredBloodbanks.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1] text-slate-500">
                    <Building2 className="w-6 h-6 mx-auto mb-1 text-slate-400" />
                    <p className="text-xs font-medium">No blood banks found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {bloodbankSearchQuery ? "Try refining your search keyword." : "No registered blood banks currently available."}
                    </p>
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {filteredBloodbanks.map((bb) => {
                      const isSelected = selectedBloodBankId === bb.bloodbankid;
                      return (
                        <div
                          key={bb.bloodbankid}
                          onClick={() => setSelectedBloodBankId(bb.bloodbankid)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? "bg-[#317786]/10 border-[#317786] shadow-xs"
                              : "bg-white border-[#F3E9D1] hover:bg-[#FAF6EE]/60"
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-[#053845] truncate">
                                {bb.bloodbankname}
                              </span>
                              {bb.licensenumber && (
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                  {bb.licensenumber}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#317786] shrink-0" />
                              <span className="truncate">
                                {bb.city ? `${bb.city}${bb.state ? `, ${bb.state}` : ""}` : "Licensed Facility"}
                              </span>
                            </p>
                          </div>

                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? "border-[#053845] bg-[#053845] text-white"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Confirmation Selection Summary */}
              {selectedBloodBank && (
                <div className="p-3 rounded-xl bg-[#317786]/10 border border-[#317786]/25 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#053845] uppercase tracking-wide">
                      Selected Target Facility
                    </span>
                    <span className="text-[11px] text-[#317786] font-medium">Ready to dispatch</span>
                  </div>
                  <p className="font-semibold text-xs text-[#053845]">{selectedBloodBank.bloodbankname}</p>
                  <p className="text-[11px] text-slate-600">
                    Location: {selectedBloodBank.city || "Regional center"} · Allocation: {request.unitsrequired} units
                  </p>
                </div>
              )}

              {/* Clinical Notes for Blood Bank */}
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700">
                  Clinical Notes / Special Handling Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={assignmentNotes}
                  onChange={(e) => setAssignmentNotes(e.target.value)}
                  placeholder="e.g. Inpatient surgery scheduled; require irradiated PRBC if available."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                disabled={isSubmittingAssignment}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAssignment}
                disabled={
                  isSubmittingAssignment ||
                  !selectedBloodBankId ||
                  isPrescriptionRequiredAndUnverified
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {isSubmittingAssignment && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm &amp; Send Requisition</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Intelligent Donor Matching Modal */}
      {isMatchingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-[#B94F30]" />
                  </div>
                  <h3 className="font-serif text-lg font-bold text-[#053845]">
                    Intelligent Donor Matching
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#317786]/10 text-[#317786] border border-[#317786]/20">
                    {matchedDonors.length} Eligible
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Clinically compatible &amp; ranked donors for {request.patientname} ({bloodGroupDisplay} {componentDisplay}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMatchingModalOpen(false)}
                disabled={isBroadcastingToSelected}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Feedback Notification */}
            {matchingBroadcastFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 shrink-0 ${
                  matchingBroadcastFeedback.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                {matchingBroadcastFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span className="font-medium">{matchingBroadcastFeedback.text}</span>
              </div>
            )}

            {/* Radius Selector & Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] shrink-0 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-600 font-medium">Search Radius:</span>
                <select
                  value={matchingRadius}
                  onChange={(e) => {
                    const r = Number(e.target.value);
                    setMatchingRadius(r);
                    fetchMatchedDonors(r);
                  }}
                  disabled={isMatchingLoading || isBroadcastingToSelected}
                  className="px-2.5 py-1 rounded-lg border border-[#F3E9D1] bg-white font-semibold text-[#053845] focus:outline-none focus:border-[#317786] cursor-pointer"
                >
                  {[5, 10, 15, 25, 50, 75, 100].map((r) => (
                    <option key={r} value={r}>
                      {r} km radius
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => fetchMatchedDonors()}
                  disabled={isMatchingLoading || isBroadcastingToSelected}
                  className="p-1 rounded-lg border border-[#F3E9D1] bg-white hover:bg-slate-50 text-slate-600 cursor-pointer transition-colors"
                  title="Refresh matching query"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#317786] ${isMatchingLoading ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter donors or city..."
                    value={matchingSearchQuery}
                    onChange={(e) => setMatchingSearchQuery(e.target.value)}
                    className="pl-8 pr-2.5 py-1 rounded-lg border border-[#F3E9D1] bg-white text-xs text-[#053845] placeholder-slate-400 focus:outline-none focus:border-[#317786] w-40 sm:w-48"
                  />
                </div>
                {matchedDonors.length > 0 && (
                  <div className="flex items-center gap-1.5 pl-2 border-l border-[#F3E9D1]">
                    <button
                      type="button"
                      onClick={handleSelectAllMatchedDonors}
                      disabled={isBroadcastingToSelected}
                      className="px-2 py-1 rounded text-[11px] font-semibold text-[#317786] hover:bg-[#FAF6EE] cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllMatchedDonors}
                      disabled={isBroadcastingToSelected}
                      className="px-2 py-1 rounded text-[11px] font-semibold text-slate-500 hover:bg-[#FAF6EE] cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Recommendation List Container */}
            <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[50vh] pr-1 space-y-2.5">
              {isMatchingLoading && matchedDonors.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-xs text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin text-[#317786]" />
                  <span className="font-medium text-slate-600">
                    Evaluating blood compatibility, cooldown, and geographic proximity...
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Strict deterministic clinical validation in progress
                  </span>
                </div>
              ) : matchingError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Unable to load matched donors</p>
                    <p>{matchingError}</p>
                    <button
                      type="button"
                      onClick={() => fetchMatchedDonors()}
                      className="text-[#317786] hover:underline font-semibold cursor-pointer pt-1 block"
                    >
                      Retry Matching Query
                    </button>
                  </div>
                </div>
              ) : filteredMatchedDonors.length === 0 ? (
                <div className="py-12 text-center rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1] p-6 space-y-2">
                  <Users className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-serif text-sm font-bold text-[#053845]">
                    No Matching Eligible Donors Found
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    {matchingSearchQuery
                      ? "No donors match your search filter. Try clearing the filter."
                      : `No available donors matching ${bloodGroupDisplay} (${componentDisplay}) were found within ${matchingRadius} km. Try expanding the search radius above.`}
                  </p>
                </div>
              ) : (
                filteredMatchedDonors.map((donor) => {
                  const isSelected = selectedDonorIds.has(donor.donorId);
                  const isColdStart =
                    donor.explanations.responsiveness.toLowerCase().includes("insufficient") ||
                    donor.explanations.responsiveness.toLowerCase().includes("no previous") ||
                    donor.explanations.responsiveness.toLowerCase().includes("neutral baseline");

                  const scoreBadgeColor =
                    donor.matchScore >= 80
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : donor.matchScore >= 60
                      ? "bg-teal-50 text-[#053845] border-[#317786]/40"
                      : "bg-amber-50 text-amber-800 border-amber-300";

                  return (
                    <div
                      key={donor.donorId}
                      onClick={() => handleToggleDonorSelection(donor.donorId)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#FAF6EE]/90 border-[#317786] ring-1 ring-[#317786]/30 shadow-2xs"
                          : "bg-white border-[#F3E9D1] hover:border-slate-300 hover:bg-[#FAF6EE]/30"
                      }`}
                    >
                      {/* Card Top Row: Checkbox, Name, Blood Group, Score */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#F3E9D1]/50">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleDonorSelection(donor.donorId);
                            }}
                            className="text-[#053845] hover:text-[#317786] cursor-pointer shrink-0"
                            aria-label={isSelected ? "Deselect donor" : "Select donor"}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#053845]" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300" />
                            )}
                          </button>

                          <span className="font-serif font-bold text-sm text-[#053845] truncate">
                            {donor.donorName}
                          </span>

                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#317786]/10 text-[#053845] border border-[#317786]/20 shrink-0">
                            {mapBloodGroupToDisplay(donor.bloodGroup)}
                          </span>

                          {donor.gender && (
                            <span className="text-[10px] text-slate-400 capitalize hidden sm:inline">
                              · {donor.gender.toLowerCase()}
                            </span>
                          )}

                          <span className="text-[11px] text-slate-500 hidden sm:inline">
                            · {donor.city}, {donor.state}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${scoreBadgeColor}`}
                          >
                            {donor.matchScore}/100 Match
                          </span>
                        </div>
                      </div>

                      {/* Score Breakdown Bar */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 pb-1.5 text-[11px]">
                        <span className="text-slate-400 font-medium">Breakdown:</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-medium text-slate-700">
                          Distance: <strong className="text-[#053845]">{donor.scoreBreakdown.distanceScore}/40</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-medium text-slate-700">
                          Availability: <strong className="text-[#053845]">{donor.scoreBreakdown.availabilityScore}/30</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-medium text-slate-700">
                          Response: <strong className="text-[#053845]">{donor.scoreBreakdown.responseScore}/30</strong>
                        </span>
                        {donor.matchType === "CITY_FALLBACK" && (
                          <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold">
                            City Fallback
                          </span>
                        )}
                        {isColdStart && (
                          <span className="px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-semibold inline-flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            Cold-Start
                          </span>
                        )}
                      </div>

                      {/* Explanations List */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pt-1.5 text-xs text-slate-600">
                        <div className="flex items-start gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="truncate">{donor.explanations.compatibility}</span>
                        </div>

                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0 mt-0.5" />
                          <span className="truncate">{donor.explanations.location}</span>
                        </div>

                        <div className="flex items-start gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#053845] shrink-0 mt-0.5" />
                          <span className="truncate">{donor.explanations.availability}</span>
                        </div>

                        <div className="flex items-start gap-1.5">
                          {isColdStart ? (
                            <Sparkles className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                          ) : (
                            <Heart className="w-3.5 h-3.5 text-[#B94F30] shrink-0 mt-0.5" />
                          )}
                          <span className="truncate">{donor.explanations.responsiveness}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 shrink-0">
              <div className="text-xs text-slate-600">
                <span className="font-bold text-[#053845]">{selectedDonorIds.size}</span> of{" "}
                <span className="font-semibold">{filteredMatchedDonors.length}</span> eligible donors selected
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsMatchingModalOpen(false)}
                  disabled={isBroadcastingToSelected}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={handleBroadcastToSelected}
                  disabled={isBroadcastingToSelected || selectedDonorIds.size === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {isBroadcastingToSelected ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Radio className="w-3.5 h-3.5" />
                  )}
                  <span>
                    Broadcast to Selected ({selectedDonorIds.size})
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
