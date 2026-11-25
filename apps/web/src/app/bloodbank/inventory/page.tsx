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
  Plus,
  SlidersHorizontal,
  X,
  Boxes,
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
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  const loadData = useCallback(async (background = false) => {
    try {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // Fetch facility profile first
      const profRes = await api.bloodbank.getProfile();
      const activeBb = profRes.success ? profRes.bloodbank : getStoredBloodBank();

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
      setIsRefreshing(false);
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

  // Helper for component label formatting
  const formatComponentLabel = (component?: string | null) => {
    if (!component) return "Whole Blood";
    if (component === "WHOLE_BLOOD") return "Whole Blood";
    if (component === "RBC") return "Packed Red Cells (RBC)";
    if (component === "PLATELETS") return "Platelets";
    if (component === "PLASMA") return "Plasma (FFP)";
    return component
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
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
          formatBloodGroup(item.bloodgroup).toLowerCase().includes(q) ||
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

  // Aggregated KPI counts
  const totalAvailable = useMemo(() => {
    if (dashboard && typeof dashboard.totalUnitsAvailable === "number") {
      return dashboard.totalUnitsAvailable;
    }
    return inventory.reduce((sum, item) => sum + (item.unitsavailable || 0), 0);
  }, [dashboard, inventory]);

  const totalReserved = useMemo(() => {
    if (dashboard && typeof dashboard.totalUnitsReserved === "number") {
      return dashboard.totalUnitsReserved;
    }
    return inventory.reduce((sum, item) => sum + (item.unitsreserved || 0), 0);
  }, [dashboard, inventory]);

  const totalUnits = totalAvailable + totalReserved;

  const handleIntakeSuccess = (msg: string) => {
    setSuccessMessage(msg);
    loadData(true);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
  };

  const handleAdjustmentSuccess = (msg: string) => {
    setSuccessMessage(msg);
    loadData(true);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    selectedBloodGroup !== "ALL" ||
    selectedComponent !== "ALL" ||
    selectedStatus !== "ALL";

  return (
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/bloodbank/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Blood Bank Dashboard</span>
        </Link>

        {!isLoading && !error && (
          <span className="text-xs text-slate-500">
            Showing {filteredInventory.length} of {inventory.length}{" "}
            {inventory.length === 1 ? "stock batch" : "stock batches"}
          </span>
        )}
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="p-1 rounded-lg text-teal-600 hover:text-teal-800 hover:bg-teal-100/50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-100/50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Droplets className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Blood Inventory
              </h1>
              {!isLoading && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                  {inventory.length} {inventory.length === 1 ? "Batch" : "Batches"}
                </span>
              )}
            </div>
            <p className="hidden sm:block text-xs sm:text-sm text-slate-500">
              Manage available blood units and registered stock batches.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh inventory"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin text-[#317786]" : ""}`} />
            <span>Refresh</span>
          </button>

          {bloodbank && (
            <button
              type="button"
              onClick={() => setIsIntakeModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Stock</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. Four Compact Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Available Units */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Available Units</span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
              <Droplets className="w-3.5 h-3.5 text-[#317786]" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {totalAvailable}
          </div>
          <p className="text-[11px] text-teal-700 font-medium">Ready for dispatch</p>
        </div>

        {/* Reserved Units */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Reserved Units</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">
            {totalReserved}
          </div>
          <p className="text-[11px] text-amber-700 font-medium">Allocated to requisitions</p>
        </div>

        {/* Active Batches */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Active Batches</span>
            <div className="w-7 h-7 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#053845]">
              <Package className="w-3.5 h-3.5 text-[#053845]" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {inventory.length}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">Distinct stock lots</p>
        </div>

        {/* Total Units */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Units</span>
            <div className="w-7 h-7 rounded-lg bg-[#317786]/10 border border-[#317786]/20 flex items-center justify-center text-[#317786]">
              <Boxes className="w-3.5 h-3.5 text-[#317786]" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {totalUnits}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">Gross vault stock</p>
        </div>
      </section>

      {/* 3. Search & Filter Bar */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Batch ID or Blood Group..."
              className="w-full pl-10 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Blood Group Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium hidden sm:inline">Group:</span>
              <select
                value={selectedBloodGroup}
                onChange={(e) => setSelectedBloodGroup(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
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
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
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
                      {formatComponentLabel(comp)}
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
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
              >
                <option value="ALL">All Stock</option>
                <option value="LOW_STOCK">Low Stock (≤2)</option>
                <option value="EXPIRING_SOON">Expiring Soon (≤7d)</option>
              </select>
            </div>

            {/* Sort Filter */}
            <div className="flex items-center gap-1 text-xs">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
              >
                <option value="expiry">Expiry Date</option>
                <option value="units">Available Units</option>
                <option value="group">Blood Group</option>
                <option value="updated">Last Updated</option>
              </select>
              <button
                type="button"
                onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                title="Toggle sort direction"
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSelectedBloodGroup("ALL");
                  setSelectedComponent("ALL");
                  setSelectedStatus("ALL");
                  setSearchQuery("");
                }}
                className="text-xs font-medium text-[#317786] hover:underline px-1 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 4. Inventory Records Table */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <RefreshCw className="w-7 h-7 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading blood inventory...</p>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#317786] mx-auto">
              <Package className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-serif text-base font-bold text-[#053845]">
                {inventory.length === 0 ? "No inventory records yet" : "No matching inventory batches"}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                {inventory.length === 0
                  ? "Register your first blood stock batch to start managing inventory."
                  : "No stock lots match your active search and filter criteria."}
              </p>
            </div>

            {inventory.length === 0 && bloodbank ? (
              <button
                type="button"
                onClick={() => setIsIntakeModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add Stock</span>
              </button>
            ) : inventory.length > 0 ? (
              <button
                type="button"
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
                <tr className="bg-[#FAF6EE]/70 text-[11px] font-semibold uppercase tracking-wider text-slate-600 border-b border-[#F3E9D1]">
                  <th className="py-3 px-5">Batch ID</th>
                  <th className="py-3 px-4">Blood Group</th>
                  <th className="py-3 px-4">Component</th>
                  <th className="py-3 px-4 text-center">Available Units</th>
                  <th className="py-3 px-4">Collection Date</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredInventory.map((item) => {
                  const displayGroup = formatBloodGroup(item.bloodgroup);
                  const isExpiringSoon = item.expirydate
                    ? new Date(item.expirydate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 &&
                      new Date(item.expirydate).getTime() - Date.now() > 0
                    : false;
                  const isDepleted = item.unitsavailable <= 0;
                  const isLowStock = !isDepleted && item.unitsavailable <= 2;
                  const collectionDate = item.createdat;

                  return (
                    <tr key={item.inventoryid} className="hover:bg-slate-50/70 transition-colors">
                      {/* Batch ID */}
                      <td className="py-3.5 px-5 font-mono text-[11px] text-slate-600">
                        #{item.inventoryid.slice(0, 8)}
                      </td>

                      {/* Blood Group */}
                      <td className="py-3.5 px-4 font-bold text-[#053845]">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1]">
                          <Droplets className="w-3 h-3 text-[#B94F30]" />
                          <span>{displayGroup}</span>
                        </span>
                      </td>

                      {/* Component */}
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {formatComponentLabel(item.bloodcomponent)}
                      </td>

                      {/* Available Units */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`font-mono text-sm font-bold ${
                            isDepleted
                              ? "text-slate-400"
                              : isLowStock
                              ? "text-[#A2363A]"
                              : "text-[#053845]"
                          }`}
                        >
                          {item.unitsavailable}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">units</span>
                      </td>

                      {/* Collection Date */}
                      <td className="py-3.5 px-4 text-slate-600">
                        {collectionDate ? (
                          new Date(collectionDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Expiry Date */}
                      <td className="py-3.5 px-4">
                        {item.expirydate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
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

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        {isDepleted ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            Depleted
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Low Stock
                          </span>
                        ) : isExpiringSoon ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Expiring Soon
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            In Stock
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => setAdjustmentTargetLot(item)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors cursor-pointer shadow-2xs"
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
