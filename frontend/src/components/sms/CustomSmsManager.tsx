"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  MessageSquare,
  Send,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Shield,
  Smartphone,
  Info,
  ChevronRight,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";

interface PermittedRecipient {
  userId: string;
  displayName: string;
  role: "DONOR" | "REQUESTER" | "HOSPITAL" | "BLOOD_BANK";
  maskedPhone: string;
  relationshipContext: string;
  targetRequestId?: string;
  bloodGroup?: string;
}

interface SmsHistoryItem {
  outboxId: string;
  recipientName: string;
  recipientRole: string;
  maskedPhone: string;
  messageBody: string;
  status: "PENDING" | "SENT" | "FAILED" | "DEAD_LETTER";
  createdAt: string;
  dispatchConfirmedAt?: string | null;
  errorCode?: string | null;
  attempts: number;
}

interface CustomSmsManagerProps {
  userRole: "HOSPITAL" | "BLOOD_BANK" | "ADMIN";
  facilityName?: string;
}

export function CustomSmsManager({ userRole, facilityName = "Healthcare Facility" }: CustomSmsManagerProps) {
  const [recipients, setRecipients] = useState<PermittedRecipient[]>([]);
  const [history, setHistory] = useState<SmsHistoryItem[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Form State
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [messageText, setMessageText] = useState<string>("");
  const [attachActionLink, setAttachActionLink] = useState<boolean>(false);
  const [actionPath, setActionPath] = useState<string>("");

  // Sending State
  const [isSending, setIsSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(null);

  // Load Data
  const loadData = async () => {
    setIsLoadingRecipients(true);
    setIsLoadingHistory(true);
    try {
      const recRes = await api.customSms.getRecipients();
      if (recRes.success && recRes.recipients) {
        setRecipients(recRes.recipients);
      }
    } catch (err: any) {
      console.error("Failed to load recipients:", err);
    } finally {
      setIsLoadingRecipients(false);
    }

    try {
      const histRes = await api.customSms.getHistory(50);
      if (histRes.success && histRes.history) {
        setHistory(histRes.history);
      }
    } catch (err: any) {
      console.error("Failed to load SMS history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Recipients
  const filteredRecipients = useMemo(() => {
    return recipients.filter((r) => {
      const matchesSearch =
        r.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.relationshipContext.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.bloodGroup && r.bloodGroup.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === "ALL" || r.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [recipients, searchQuery, roleFilter]);

  const selectedRecipient = useMemo(() => {
    return recipients.find((r) => r.userId === selectedRecipientId);
  }, [recipients, selectedRecipientId]);

  // Character and Segment Calculation
  const renderedPreview = useMemo(() => {
    const cleanMsg = messageText.trim() || "Type your custom message above to preview...";
    const linkStr = attachActionLink && actionPath ? ` Details: http://localhost:3000${actionPath}` : "";
    return `Swastya Update from ${facilityName}: ${cleanMsg}${linkStr}`;
  }, [messageText, facilityName, attachActionLink, actionPath]);

  const charCount = renderedPreview.length;
  const segmentCount = charCount <= 160 ? 1 : Math.ceil(charCount / 153);

  // Send Message
  const handleConfirmSend = async () => {
    if (!selectedRecipientId || !messageText.trim()) return;

    setIsSending(true);
    setSendSuccessMessage(null);
    setSendErrorMessage(null);

    try {
      const res = await api.customSms.send({
        recipientUserId: selectedRecipientId,
        message: messageText.trim(),
        contextRequestId: selectedRecipient?.targetRequestId,
        actionUrl: attachActionLink && actionPath ? actionPath : undefined,
        idempotencyKey: `sms_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      });

      if (res.success) {
        setSendSuccessMessage(`Message successfully queued for delivery to ${res.data.recipientName}.`);
        setMessageText("");
        setAttachActionLink(false);
        setActionPath("");
        setShowConfirmModal(false);
        // Refresh history
        const histRes = await api.customSms.getHistory(50);
        if (histRes.success && histRes.history) {
          setHistory(histRes.history);
        }
      }
    } catch (err: any) {
      setSendErrorMessage(err?.message || "Failed to dispatch custom SMS.");
      setShowConfirmModal(false);
    } finally {
      setIsSending(false);
    }
  };

  // Retry Failed Message
  const handleRetry = async (outboxId: string) => {
    try {
      const res = await api.customSms.retry(outboxId);
      if (res.success) {
        const histRes = await api.customSms.getHistory(50);
        if (histRes.success && histRes.history) {
          setHistory(histRes.history);
        }
      }
    } catch (err: any) {
      alert(err?.message || "Failed to retry message");
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header Card */}
      <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#FAF6EE] border border-[#F3E9D1] rounded-xl text-[#317786]">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Custom SMS Communication Center</h1>
              <p className="text-sm text-slate-500">
                Compose and send authorized operational messages to permitted donors and requesters.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-full">
            <Shield className="w-3.5 h-3.5" />
            Twilio Engine: Mock Safe Mode Active
          </span>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {sendSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span>{sendSuccessMessage}</span>
        </div>
      )}

      {sendErrorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <span>{sendErrorMessage}</span>
        </div>
      )}

      {/* Main Grid: Composer & History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Composer (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-[#317786]" />
                Compose Authorized SMS
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Recipients are restricted to verified operational relationships belonging to this facility.
              </p>
            </div>

            {/* Recipient Selection */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                1. Select Permitted Recipient *
              </label>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, blood group, or context..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#317786]"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#317786]"
                >
                  <option value="ALL">All Roles</option>
                  <option value="DONOR">Donors</option>
                  <option value="REQUESTER">Requesters</option>
                  {(userRole === "BLOOD_BANK" || userRole === "ADMIN") && <option value="HOSPITAL">Hospitals</option>}
                  {userRole === "ADMIN" && <option value="BLOOD_BANK">Blood Banks</option>}
                </select>
              </div>

              {/* Recipient Dropdown / Select List */}
              {isLoadingRecipients ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading permitted recipients...</div>
              ) : filteredRecipients.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  No permitted recipients found matching filters.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                  {filteredRecipients.map((r) => {
                    const isSelected = selectedRecipientId === r.userId;
                    return (
                      <div
                        key={r.userId}
                        onClick={() => {
                          setSelectedRecipientId(r.userId);
                          if (r.targetRequestId) {
                            setActionPath(`/donor/requests/${r.targetRequestId}/donate`);
                          }
                        }}
                        className={`p-3 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? "bg-[#FAF6EE] border-l-4 border-[#317786]" : "hover:bg-white"
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            <span>{r.displayName}</span>
                            <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[10px] rounded font-medium">
                              {r.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{r.relationshipContext}</div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-slate-600">{r.maskedPhone}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedRecipient && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-between text-xs text-teal-900">
                  <div>
                    <span className="font-bold">Active Recipient: </span>
                    {selectedRecipient.displayName} ({selectedRecipient.role})
                  </div>
                  <span className="font-mono">{selectedRecipient.maskedPhone}</span>
                </div>
              )}
            </div>

            {/* Message Text Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Message Content *
                </label>
                <span
                  className={`text-xs font-mono ${
                    charCount > 320 ? "text-rose-600 font-bold" : "text-slate-500"
                  }`}
                >
                  {charCount}/320 chars ({segmentCount} segment{segmentCount > 1 ? "s" : ""})
                </span>
              </div>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message here (e.g., Thank you for volunteering. Please visit the blood center counter on 2nd floor...)"
                rows={4}
                className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#317786] resize-none"
              />
              <p className="text-[11px] text-slate-500">
                Messages are prefixed with &quot;Swastya Update from {facilityName}:&quot; for recipient safety and DLT
                compliance.
              </p>
            </div>

            {/* Optional Action Link */}
            <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={attachActionLink}
                  onChange={(e) => setAttachActionLink(e.target.checked)}
                  className="rounded text-[#317786] focus:ring-[#317786]"
                />
                Attach Interactive Swastya Action Link
              </label>

              {attachActionLink && (
                <div className="pt-2">
                  <input
                    type="text"
                    value={actionPath}
                    onChange={(e) => setActionPath(e.target.value)}
                    placeholder="/donor/requests/... or /requester/dashboard"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#317786]"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Path will be converted into a secure tokenized link.
                  </p>
                </div>
              )}
            </div>

            {/* Safety & Compliance Notice */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
              <Info className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
              <span>
                <strong>Privacy &amp; Safety Policy:</strong> Do not include sensitive medical diagnoses, test results,
                or OTP verification codes. Messages are monitored and audited for patient protection.
              </span>
            </div>

            {/* Submit Button */}
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={!selectedRecipientId || !messageText.trim() || charCount > 320 || isSending}
              className="w-full py-3 bg-[#317786] hover:bg-[#255f6b] disabled:bg-slate-300 text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Send className="w-4 h-4" />
              Review &amp; Send Custom SMS
            </button>
          </div>
        </div>

        {/* Right Column: Live Mockup & Audit History (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Phone Mockup Preview */}
          <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#317786]" />
              Recipient SMS Preview
            </h2>
            <div className="bg-[#FAF6EE] p-4 rounded-xl border border-[#F3E9D1]">
              <div className="text-[10px] text-slate-400 font-mono mb-2 flex justify-between">
                <span>Sender: SWASTYA</span>
                <span>To: {selectedRecipient ? selectedRecipient.maskedPhone : "+91 **********"}</span>
              </div>
              <div className="bg-white p-3.5 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 text-xs text-slate-800 leading-relaxed break-words">
                {renderedPreview}
              </div>
              <div className="mt-2 text-right text-[10px] text-slate-400">
                Segment Estimate: {segmentCount} SMS
              </div>
            </div>
          </div>

          {/* SMS Outbox Audit History */}
          <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#317786]" />
                Outbox Activity Audit ({history.length})
              </h2>
            </div>

            {isLoadingHistory ? (
              <div className="py-6 text-center text-xs text-slate-400">Loading audit history...</div>
            ) : history.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No custom SMS messages dispatched yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {history.map((item) => (
                  <div
                    key={item.outboxId}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900">
                        {item.recipientName} ({item.recipientRole})
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.status === "SENT"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "PENDING"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="text-slate-700 bg-white p-2 rounded-lg border border-slate-100 line-clamp-2 text-[11px]">
                      {item.messageBody}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      <span className="font-mono">{item.maskedPhone}</span>
                    </div>

                    {item.status === "FAILED" && (
                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-[10px] text-rose-600 font-medium">Error: {item.errorCode || "Delivery failed"}</span>
                        <button
                          onClick={() => handleRetry(item.outboxId)}
                          className="px-2 py-1 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded text-[10px] font-semibold flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-5 h-5 text-[#317786]" />
              Confirm Custom SMS Dispatch
            </h3>

            <div className="space-y-3 text-xs text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between">
                <span className="font-medium text-slate-500">Recipient:</span>
                <span className="font-bold text-slate-900">{selectedRecipient?.displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-slate-500">Phone:</span>
                <span className="font-mono text-slate-900">{selectedRecipient?.maskedPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-slate-500">Estimated Segments:</span>
                <span className="font-bold text-slate-900">{segmentCount} SMS</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-slate-500">Environment:</span>
                <span className="font-bold text-emerald-700">Mock Provider (0 real SMS cost)</span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Are you sure you want to queue this message into the transactional outbox?
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isSending}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSend}
                disabled={isSending}
                className="flex-1 py-2.5 bg-[#317786] hover:bg-[#255f6b] text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <span>Dispatching...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Confirm &amp; Send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
