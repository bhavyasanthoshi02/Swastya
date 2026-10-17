"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Droplets,
  Package,
  AlertTriangle,
  CheckCircle2,
  Search,
  ArrowUpDown,
  RefreshCw,
  ArrowLeft,
  Calendar,
  Lock,
  PackagePlus,
  SlidersHorizontal,
  X,
  ShieldCheck,
} from "lucide-react";
import { api, InventoryItem, BloodBankDashboardData } from "@/lib/api";
import { getStoredBloodBank, AuthBloodBank } from "@/lib/auth";
import { StockIntakeModal } from "@/components/bloodbank/StockIntakeModal";
import { StockAdjustmentModal } from "@/components/bloodbank/StockAdjustmentModal";

export default function BloodBankInventoryPage() {
  const [bloodbank, setBloodBank] = useState<AuthBloodBank | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [dashboard, setDashboard] = useState<BloodBankDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string>("ALL");
  const [selectedComponent, setSelectedComponent] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | "LOW_STOCK" | "EXPIRING_SOON">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"units" | "expiry" | "group" | "updated">("expiry");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Modal states
  const [isIntakeModalOpen, setIsIntakeModalOpen] = useState(false);
  const [adjustmentTargetLot, setAdjustmentTargetLot] = useState<InventoryItem | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch facility profile first
      const profRes = await api.bloodbank.getProfile();
      let activeBb = profRes.success ? profRes.bloodbank : getStoredBloodBank();

      if (activeBb) {
        setBloodBank(activeBb);

        // Fetch dashboard metrics and comprehensive inventory list concurrently
        const [dashRes, invRes] = await Promise.all([
          api.bloodbank.getDashboard(activeBb.bloodbankid),
          api.bloodbank.getInventory(activeBb.bloodbankid),
        ]);

        setDashboard(dashRes);
        if (invRes.success) {
          setInventory(invRes.inventory || []);
        }
      } else {
        setError("Facility authentication profile not found. Please re-login.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load facility blood inventory");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Format blood group helper
  const formatBloodGroup = (bg: string) => {
    return bg
      .replace("_POSITIVE", "+")
      .replace("_NEGATIVE", "-")
      .replace("POSITIVE", "+")
      .replace("NEGATIVE", "-");
  };

  // Filtered and sorted inventory
  const filteredInventory = useMemo(() => {
    let result = [...inventory];

    // Filter by group
    if (selectedBloodGroup !== "ALL") {
      result = result.filter((item) => {
        const normalized = formatBloodGroup(item.bloodgroup);
        return normalized === selectedBloodGroup || item.bloodgroup === selectedBloodGroup;
      });
    }

    // Filter by component
    if (selectedComponent !== "ALL") {
      result = result.filter((item) => item.bloodcomponent === selectedComponent);
    }

    // Filter by status (Low Stock or Expiring Soon)
    if (selectedStatus === "LOW_STOCK") {
      result = result.filter((item) => item.unitsavailable <= 2);
    } else if (selectedStatus === "EXPIRING_SOON") {
      const now = Date.now();
      result = result.filter((item) => {
        if (!item.expirydate) return false;
        const diff = new Date(item.expirydate).getTime() - now;
        return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000;
      });
    }

    // Filter by search query (id or bloodgroup or component)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.inventoryid.toLowerCase().includes(q) ||
          item.bloodgroup.toLowerCase().includes(q) ||
          (item.bloodcomponent && item.bloodcomponent.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "units") {
        return sortOrder === "asc"
          ? a.unitsavailable - b.unitsavailable
          : b.unitsavailable - a.unitsavailable;
      }
      if (sortBy === "group") {
        return sortOrder === "asc"
          ? a.bloodgroup.localeCompare(b.bloodgroup)
          : b.bloodgroup.localeCompare(a.bloodgroup);
      }
      if (sortBy === "updated") {
        const dateA = a.lastupdated || a.updatedat ? new Date(a.lastupdated || a.updatedat!).getTime() : 0;
        const dateB = b.lastupdated || b.updatedat ? new Date(b.lastupdated || b.updatedat!).getTime() : 0;
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      }
      // default: expiry
      const dateA = a.expirydate ? new Date(a.expirydate).getTime() : 0;
      const dateB = b.expirydate ? new Date(b.expirydate).getTime() : 0;
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    return result;
  }, [inventory, selectedBloodGroup, selectedComponent, selectedStatus, searchQuery, sortBy, sortOrder]);

  const uniqueComponents = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((i) => {
      if (i.bloodcomponent) set.add(i.bloodcomponent);
    });
    return Array.from(set);
  }, [inventory]);

  const handleIntakeSuccess = (msg: string) => {
    setSuccessMessage(msg);
    loadData();
    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      setSuccessMessage(null);
    }, 6000);
  };

  const handleAdjustmentSuccess = (msg: string) => {
    setSuccessMessage(msg);
    loadData();
    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      setSuccessMessage(null);
    }, 6000);
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-16">
      {/* Top Breadcrumb Navigation (mirrors Hospital & Donor request views) */}
      <div className="flex items-center justify-between">
        <Link
          href="/bloodbank/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Blood Bank Dashboard</span>
        </Link>

        {!isLoading && (
          <span className="text-xs text-slate-500">
            Showing {filteredInventory.length} of {inventory.length} blood lots
          </span>
        )}
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Ledger Mutation Committed</span>
              <span className="text-[11px] text-teal-800">{successMessage}</span>
            </div>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="p-1 rounded-lg text-teal-600 hover:text-teal-800 hover:bg-teal-100/50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Operation Error</span>
              <span className="text-[11px]">{error}</span>
            </div>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-100/50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Container Card (mirrors Hospital Blood Requests structure) */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {/* Page Header Banner */}
        <div className="p-6 sm:p-8 border-b border-[#F3E9D1] bg-gradient-to-r from-white via-[#FAF6EE]/40 to-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#B94F30] animate-pulse" />
                <span className="text-xs font-bold text-[#B94F30] uppercase tracking-wider">
                  Vault Stock & Distribution Registry
                </span>
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Blood Inventory Management
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {bloodbank?.bloodbankname
                  ? `Live audited stock records for ${bloodbank.bloodbankname} (${bloodbank.licensenumber}) • Audit-Ledger Active`
                  : "Vault stock registration, lot merging, and audited available-stock corrections."}
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
              <button
                onClick={loadData}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#317786]" : "text-slate-500"}`} />
                <span>Refresh Stock</span>
              </button>

              {bloodbank && (
                <button
                  onClick={() => setIsIntakeModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <PackagePlus className="w-4 h-4 text-[#F3E9D1]" />
                  <span>Stock Intake / Register Lot</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 4 Quick KPI Summary Chips */}
        <div className="p-5 sm:p-6 bg-[#FAF6EE]/30 border-b border-[#F3E9D1] grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
              <Droplets className="w-3 h-3 text-[#317786]" />
              Total Units Ready
            </span>
            <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
              {dashboard?.totalUnitsAvailable ?? 0}
            </div>
            <p className="text-[11px] text-teal-700">Available for clinical dispatch</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
              <Lock className="w-3 h-3 text-amber-600" />
              Units Reserved
            </span>
            <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">
              {dashboard?.totalUnitsReserved ?? 0}
            </div>
            <p className="text-[11px] text-amber-700">Locked for hospital orders</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
              <Package className="w-3 h-3 text-[#053845]" />
              Active Vault Lots
            </span>
            <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
              {inventory.length}
            </div>
            <p className="text-[11px] text-slate-500">Batches currently stored</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-700" />
              Regulatory Status
            </span>
            <div className="font-serif text-base sm:text-lg font-bold text-[#053845] mt-1">
              {bloodbank?.approvalstatus === "APPROVED" ? "CDSCO Licensed" : "Review Active"}
            </div>
            <p className="text-[11px] text-slate-500">Audit-Ledger Active</p>
          </div>
        </div>

        {/* Filters & Search Control Bar */}
        <div className="p-5 sm:p-6 border-b border-[#F3E9D1] bg-white space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Box */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Batch ID, blood group, or component..."
                className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Blood Group Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium hidden sm:inline">Group:</span>
                <select
                  value={selectedBloodGroup}
                  onChange={(e) => setSelectedBloodGroup(e.target.value)}
                  className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
                >
                  <option value="ALL">All Groups</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>

              {/* Component Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium hidden sm:inline">Component:</span>
                <select
                  value={selectedComponent}
                  onChange={(e) => setSelectedComponent(e.target.value)}
                  className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
                >
                  <option value="ALL">All Components</option>
                  <option value="WHOLE_BLOOD">Whole Blood</option>
                  <option value="RBC">Packed Red Cells (RBC)</option>
                  <option value="PLATELETS">Platelets</option>
                  <option value="PLASMA">Plasma (FFP)</option>
                  {uniqueComponents
                    .filter((c) => !["WHOLE_BLOOD", "RBC", "PLATELETS", "PLASMA"].includes(c))
                    .map((comp) => (
                      <option key={comp} value={comp}>
                        {comp}
                      </option>
                    ))}
                </select>
              </div>

              {/* Stock Status Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium hidden sm:inline">Status:</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as any)}
                  className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
                >
                  <option value="ALL">All Stock</option>
                  <option value="LOW_STOCK">Low Stock (≤2)</option>
                  <option value="EXPIRING_SOON">Expiring Soon (≤7d)</option>
                </select>
              </div>

              {/* Sort Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium hidden sm:inline">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
                >
                  <option value="expiry">Expiry Date</option>
                  <option value="units">Available Units</option>
                  <option value="group">Blood Group</option>
                  <option value="updated">Last Updated</option>
                </select>
                <button
                  onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                  title="Toggle sort direction"
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Inventory Table & Card Grid */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-base font-bold text-[#053845]">
              Active Vault Batches
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]">
              {filteredInventory.length} {filteredInventory.length === 1 ? "batch" : "batches"}
            </span>
          </div>

          <span className="text-[11px] text-slate-400">
            Authenticated real-time ledger records
          </span>
        </div>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <RefreshCw className="w-7 h-7 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Syncing Inventory Vault...
            </p>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#317786] mx-auto">
              <Package className="w-6 h-6" />
            </div>
            <h4 className="font-serif text-base font-bold text-[#053845]">
              No Inventory Records Found
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              {inventory.length === 0
                ? "There are currently no blood unit batches registered in the vault for this facility. Click below to register your first verified stock lot."
                : "No inventory batches match your active filter criteria. Try clearing or broadening your filters."}
            </p>

            {inventory.length === 0 && bloodbank ? (
              <button
                onClick={() => setIsIntakeModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <PackagePlus className="w-4 h-4 text-[#F3E9D1]" />
                <span>Register First Stock Batch</span>
              </button>
            ) : inventory.length > 0 ? (
              <button
                onClick={() => {
                  setSelectedBloodGroup("ALL");
                  setSelectedComponent("ALL");
                  setSelectedStatus("ALL");
                  setSearchQuery("");
                }}
                className="text-xs font-semibold text-[#317786] hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF6EE]/60 text-[11px] font-semibold uppercase tracking-wider text-slate-600 border-b border-[#F3E9D1]">
                  <th className="py-3.5 px-6">Blood Group</th>
                  <th className="py-3.5 px-4">Component</th>
                  <th className="py-3.5 px-4 text-center">Available Stock</th>
                  <th className="py-3.5 px-4 text-center">Reserved Units</th>
                  <th className="py-3.5 px-4">Expiry Date</th>
                  <th className="py-3.5 px-4">Last Updated</th>
                  <th className="py-3.5 px-4 text-center">Batch Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredInventory.map((item) => {
                  const displayGroup = formatBloodGroup(item.bloodgroup);
                  const isExpiringSoon = item.expirydate
                    ? new Date(item.expirydate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
                    : false;
                  const isCriticalStock = item.unitsavailable <= 2;
                  const lastUpdatedTime = item.lastupdated || item.updatedat || item.createdat;

                  return (
                    <tr key={item.inventoryid} className="hover:bg-slate-50/70 transition-colors">
                      {/* Blood Group */}
                      <td className="py-4 px-6 font-bold text-[#053845]">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1]">
                          <Droplets className="w-3.5 h-3.5 text-[#B94F30]" />
                          <span>{displayGroup}</span>
                        </span>
                      </td>

                      {/* Component */}
                      <td className="py-4 px-4 font-medium text-slate-800">
                        {item.bloodcomponent ? (
                          <span className="capitalize">
                            {item.bloodcomponent.replace(/_/g, " ").toLowerCase()}
                          </span>
                        ) : (
                          <span className="text-slate-400">Whole Blood</span>
                        )}
                      </td>

                      {/* Available Units */}
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`font-mono text-sm font-bold ${
                            isCriticalStock ? "text-[#A2363A]" : "text-[#053845]"
                          }`}
                        >
                          {item.unitsavailable}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">units</span>
                      </td>

                      {/* Reserved Units */}
                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex items-center gap-1 font-mono text-amber-800 font-semibold text-xs">
                          <Lock className="w-3 h-3 text-amber-600" />
                          <span>{item.unitsreserved || 0}</span>
                        </div>
                      </td>

                      {/* Expiry Date */}
                      <td className="py-4 px-4">
                        {item.expirydate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span
                              className={`font-mono ${
                                isExpiringSoon ? "text-[#B94F30] font-semibold" : "text-slate-600"
                              }`}
                            >
                              {new Date(item.expirydate).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Unspecified</span>
                        )}
                      </td>

                      {/* Last Updated Timestamp */}
                      <td className="py-4 px-4 text-slate-500 font-mono text-[11px]">
                        {lastUpdatedTime ? (
                          <span>
                            {new Date(lastUpdatedTime).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                            })}{" "}
                            {new Date(lastUpdatedTime).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Stock Status Badge */}
                      <td className="py-4 px-4 text-center">
                        {isCriticalStock ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200">
                            Low Stock
                          </span>
                        ) : isExpiringSoon ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200">
                            Expiring Soon
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200">
                            Adequate
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => setAdjustmentTargetLot(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors cursor-pointer shadow-2xs"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                          <span>Adjust Stock</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Intake Modal */}
      {bloodbank && (
        <StockIntakeModal
          isOpen={isIntakeModalOpen}
          onClose={() => setIsIntakeModalOpen(false)}
          bloodBankId={bloodbank.bloodbankid}
          existingInventory={inventory}
          onSuccess={handleIntakeSuccess}
        />
      )}

      {/* Stock Adjustment Modal */}
      {bloodbank && (
        <StockAdjustmentModal
          isOpen={Boolean(adjustmentTargetLot)}
          onClose={() => setAdjustmentTargetLot(null)}
          bloodBankId={bloodbank.bloodbankid}
          lot={adjustmentTargetLot}
          onSuccess={handleAdjustmentSuccess}
        />
      )}
    </div>
  );
}
