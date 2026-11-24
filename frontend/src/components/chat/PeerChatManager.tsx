"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  Send,
  Search,
  Building2,
  Clock,
  Check,
  CheckCheck,
  RefreshCw,
  AlertCircle,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import { api } from "@/lib/api";

interface PeerItem {
  id: string;
  name: string;
  city: string;
  state: string;
  contactPerson?: string;
  phone?: string;
  unreadCount: number;
  lastMessage: {
    content: string;
    createdAt: string;
    isOutgoing: boolean;
    isRead: boolean;
  } | null;
}

interface ChatMessage {
  messageId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  isOutgoing: boolean;
}

interface PeerChatManagerProps {
  role: "HOSPITAL" | "BLOOD_BANK";
}

export default function PeerChatManager({ role }: PeerChatManagerProps) {
  const isHospital = role === "HOSPITAL";
  const orgTypeLabel = isHospital ? "Hospitals" : "Blood Banks";
  const singularLabel = isHospital ? "Hospital" : "Blood Bank";

  const [peers, setPeers] = useState<PeerItem[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activePeerName, setActivePeerName] = useState<string>("");
  const [activePeerCity, setActivePeerCity] = useState<string>("");
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingPeers, setLoadingPeers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch peers list
  const fetchPeers = useCallback(async (isInitial = false) => {
    if (isInitial) setLoadingPeers(true);
    try {
      if (isHospital) {
        const res = await api.hospitalMessages.getPeers();
        if (res.success && res.data) {
          const mapped: PeerItem[] = res.data.map((h) => ({
            id: h.hospitalid,
            name: h.hospitalname,
            city: h.city,
            state: h.state,
            contactPerson: h.contactpersonname,
            phone: h.contactpersonphone,
            unreadCount: h.unreadCount || 0,
            lastMessage: h.lastMessage
              ? {
                  content: h.lastMessage.content,
                  createdAt: h.lastMessage.createdat,
                  isOutgoing: h.lastMessage.isOutgoing,
                  isRead: h.lastMessage.isread,
                }
              : null,
          }));
          setPeers(mapped);
        }
      } else {
        const res = await api.bloodbankMessages.getPeers();
        if (res.success && res.data) {
          const mapped: PeerItem[] = res.data.map((b) => ({
            id: b.bloodbankid,
            name: b.bloodbankname,
            city: b.city,
            state: b.state,
            contactPerson: b.contactpersonname,
            phone: b.contactpersonphone,
            unreadCount: b.unreadCount || 0,
            lastMessage: b.lastMessage
              ? {
                  content: b.lastMessage.content,
                  createdAt: b.lastMessage.createdat,
                  isOutgoing: b.lastMessage.isOutgoing,
                  isRead: b.lastMessage.isread,
                }
              : null,
          }));
          setPeers(mapped);
        }
      }
      setError(null);
    } catch (err: any) {
      console.error("Failed to load peer organizations:", err);
      if (isInitial) {
        setError(err.message || "Failed to load peer organizations.");
      }
    } finally {
      if (isInitial) setLoadingPeers(false);
    }
  }, [isHospital]);

  // Fetch active conversation
  const fetchConversation = useCallback(
    async (peerId: string, isSilent = false) => {
      if (!isSilent) setLoadingMessages(true);
      try {
        if (isHospital) {
          const res = await api.hospitalMessages.getConversation(peerId);
          if (res.success && res.data) {
            setActivePeerName(res.data.peerHospital.hospitalname);
            setActivePeerCity(
              res.data.peerHospital.city
                ? `${res.data.peerHospital.city}, ${res.data.peerHospital.state || ""}`
                : ""
            );
            const mapped: ChatMessage[] = res.data.messages.map((m) => ({
              messageId: m.messageId,
              senderId: m.senderHospitalId,
              senderName: m.senderHospitalName,
              recipientId: m.recipientHospitalId,
              recipientName: m.recipientHospitalName,
              content: m.content,
              isRead: m.isRead,
              readAt: m.readAt,
              createdAt: m.createdAt,
              isOutgoing: m.isOutgoing,
            }));
            setMessages(mapped);
          }
        } else {
          const res = await api.bloodbankMessages.getConversation(peerId);
          if (res.success && res.data) {
            setActivePeerName(res.data.peerBloodBank.bloodbankname);
            setActivePeerCity(
              res.data.peerBloodBank.city
                ? `${res.data.peerBloodBank.city}, ${res.data.peerBloodBank.state || ""}`
                : ""
            );
            const mapped: ChatMessage[] = res.data.messages.map((m) => ({
              messageId: m.messageId,
              senderId: m.senderBloodBankId,
              senderName: m.senderBloodBankName,
              recipientId: m.recipientBloodBankId,
              recipientName: m.recipientBloodBankName,
              content: m.content,
              isRead: m.isRead,
              readAt: m.readAt,
              createdAt: m.createdAt,
              isOutgoing: m.isOutgoing,
            }));
            setMessages(mapped);
          }
        }
        setError(null);
      } catch (err: any) {
        console.error("Failed to fetch conversation:", err);
        if (!isSilent) {
          setError(err.message || "Failed to load conversation history.");
        }
      } finally {
        if (!isSilent) setLoadingMessages(false);
      }
    },
    [isHospital]
  );

  // Initial load
  useEffect(() => {
    fetchPeers(true);
  }, [fetchPeers]);

  // Load conversation on peer select
  useEffect(() => {
    if (selectedPeerId) {
      fetchConversation(selectedPeerId);
      // Clear unread badge in local peer list
      setPeers((prev) =>
        prev.map((p) => (p.id === selectedPeerId ? { ...p, unreadCount: 0 } : p))
      );
    } else {
      setMessages([]);
      setActivePeerName("");
      setActivePeerCity("");
    }
  }, [selectedPeerId, fetchConversation]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Real-time polling every 4 seconds
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchPeers(false);
      if (selectedPeerId) {
        fetchConversation(selectedPeerId, true);
      }
    }, 4000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedPeerId, fetchPeers, fetchConversation]);

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPeerId || !inputText.trim() || sending) return;

    const contentToSend = inputText.trim();
    setInputText("");
    setSending(true);

    try {
      if (isHospital) {
        await api.hospitalMessages.sendMessage(selectedPeerId, contentToSend);
      } else {
        await api.bloodbankMessages.sendMessage(selectedPeerId, contentToSend);
      }
      await fetchConversation(selectedPeerId, true);
      await fetchPeers(false);
    } catch (err: any) {
      console.error("Failed to send message:", err);
      setError(err.message || "Failed to deliver message.");
      setInputText(contentToSend); // Restore input on failure
    } finally {
      setSending(false);
    }
  };

  const filteredPeers = peers.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatMessageTime = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatMessageDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-210px)] min-h-[580px] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Top Banner / Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#053845]/10 flex items-center justify-center text-[#053845]">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#053845] font-serif">
              {singularLabel}-to-{singularLabel} Direct Communication
            </h1>
            <p className="text-xs text-slate-500">
              Private, secure in-app messaging between registered {orgTypeLabel.toLowerCase()}.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            fetchPeers(true);
            if (selectedPeerId) fetchConversation(selectedPeerId);
          }}
          className="p-2 text-slate-500 hover:text-[#053845] hover:bg-slate-200/50 rounded-lg transition-colors"
          title="Refresh messages"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Split Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Peers Sidebar */}
        <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col bg-white">
          {/* Search Box */}
          <div className="p-3 border-b border-slate-200">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder={`Search ${orgTypeLabel.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>
          </div>

          {/* Peer List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingPeers ? (
              <div className="p-6 text-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-[#317786]" />
                Loading {orgTypeLabel.toLowerCase()}...
              </div>
            ) : filteredPeers.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="text-xs font-semibold text-slate-700 mb-1">
                  {peers.length === 0 ? `No Other ${orgTypeLabel} Found` : "No matching results"}
                </h3>
                <p className="text-[11px] text-slate-500 max-w-[200px] mx-auto leading-relaxed">
                  {peers.length === 0
                    ? `When other ${orgTypeLabel.toLowerCase()} register and are approved, they will appear here.`
                    : "Try adjusting your search criteria."}
                </p>
              </div>
            ) : (
              filteredPeers.map((peer) => {
                const isSelected = selectedPeerId === peer.id;
                return (
                  <button
                    key={peer.id}
                    onClick={() => setSelectedPeerId(peer.id)}
                    className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors ${
                      isSelected
                        ? "bg-[#e8f3f5] border-l-4 border-[#317786]"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSelected
                          ? "bg-[#317786] text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {peer.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-semibold text-xs text-slate-800 truncate">
                          {peer.name}
                        </span>
                        {peer.lastMessage?.createdAt && (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatMessageTime(peer.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{peer.city || "Unknown Location"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-slate-600 truncate pr-2 max-w-[190px]">
                          {peer.lastMessage ? (
                            <>
                              {peer.lastMessage.isOutgoing && (
                                <span className="text-slate-400">You: </span>
                              )}
                              {peer.lastMessage.content}
                            </>
                          ) : (
                            <span className="text-slate-400 italic">No messages yet</span>
                          )}
                        </p>
                        {peer.unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold text-white bg-[#A2363A] rounded-full shrink-0">
                            {peer.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Chat Conversation */}
        <div className="flex-1 flex flex-col bg-slate-50/50">
          {selectedPeerId ? (
            <>
              {/* Chat Header */}
              <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#053845]">{activePeerName}</h2>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>{activePeerCity}</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                  In-App Message (No SMS)
                </div>
              </div>

              {/* Messages Scroll Area */}
              <div className="flex-1 p-6 overflow-y-auto space-y-3">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mr-2 text-[#317786]" />
                    Loading conversation...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-semibold text-slate-700">No message history yet</p>
                    <p className="text-[11px] text-slate-500 max-w-sm mt-1">
                      Send a message below to start coordinating blood availability, patient transfers, or inventory logistics.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOut = msg.isOutgoing;
                    return (
                      <div
                        key={msg.messageId}
                        className={`flex flex-col ${isOut ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs shadow-xs leading-relaxed ${
                            isOut
                              ? "bg-[#053845] text-white rounded-br-xs"
                              : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-slate-400">
                          <span>{formatMessageTime(msg.createdAt)}</span>
                          {isOut && (
                            <span title={msg.isRead ? "Read" : "Delivered"}>
                              {msg.isRead ? (
                                <CheckCheck className="w-3.5 h-3.5 text-[#317786]" />
                              ) : (
                                <Check className="w-3 h-3 text-slate-400" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Box */}
              <div className="p-4 bg-white border-t border-slate-200">
                {error && (
                  <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-600">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={`Type a message to ${activePeerName}...`}
                    className="flex-1 px-4 py-2.5 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#317786]"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || sending}
                    className="px-4 py-2.5 bg-[#053845] hover:bg-[#03252e] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                  >
                    <span>Send</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-700 font-serif">
                Select a {singularLabel}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Choose an organization from the directory on the left to view conversation history or start a new in-app discussion.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
