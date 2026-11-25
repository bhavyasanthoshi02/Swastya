"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Wrench,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  AlertCircle,
  FileDown,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import {
  api,
  EquipmentItem,
  EquipmentDashboardMetrics,
  EquipmentCategoryItem,
} from "@/lib/api";

export default function BloodBankEquipmentPage() {
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [metrics, setMetrics] = useState<EquipmentDashboardMetrics | null>(null);
  const [categories, setCategories] = useState<EquipmentCategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [operationalStatus, setOperationalStatus] = useState("ALL");
  const [calibrationStatus, setCalibrationStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadData = useCallback(async (background = false) => {
    try {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const [dashRes, catRes, listRes] = await Promise.all([
        api.equipment.getDashboard(),
        api.equipment.getCategories(),
        api.equipment.list({
          search: search || undefined,
          category: category !== "ALL" ? category : undefined,
          operationalStatus: operationalStatus !== "ALL" ? operationalStatus : undefined,
          calibrationStatus: calibrationStatus !== "ALL" ? calibrationStatus : undefined,
          page,
          limit: 15,
        }),
      ]);

      if (dashRes.success) {
        setMetrics(dashRes.metrics);
      }
      if (catRes.success) {
        setCategories(catRes.categories);
      }
      if (listRes.success) {
        setEquipmentList(listRes.items);
        setTotalPages(listRes.pagination.totalPages || 1);
        setTotalCount(listRes.pagination.total || 0);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load equipment data");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [search, category, operationalStatus, calibrationStatus, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportCSV = async () => {
    try {
      const res = await api.equipment.getReports();
      if (!res.success || !res.report?.equipment) {
        throw new Error("No report data available");
      }
      const data: any[] = res.report.equipment;
      const headers = [
        "Asset ID",
        "Equipment Name",
        "Category",
        "Manufacturer",
        "Model",
        "Location",
        "Operational Status",
        "Calibration Status",
        "Next Calibration",
        "Maintenance Status",
        "Next Maintenance",
      ];
      const rows = data.map((d) => [
        `"${d.assetNumber}"`,
        `"${d.equipmentName}"`,
        `"${d.category}"`,
        `"${d.manufacturer}"`,
        `"${d.modelNumber}"`,
        `"${d.location}"`,
        `"${d.operationalStatus}"`,
        `"${d.calibrationStatus}"`,
        `"${d.nextCalibrationDate}"`,
        `"${d.maintenanceStatus}"`,
        `"${d.nextMaintenanceDate}"`,
      ]);
      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Equipment_Audit_Report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setSuccessMessage("Compliance report exported successfully as CSV");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || "Export failed");
    }
  };

  const getOperationalBadge = (status: string) => {
    switch (status) {
      case "OPERATIONAL":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> Operational</span>;
      case "UNDER_MAINTENANCE":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3.5 h-3.5" /> Under Maintenance</span>;
      case "OUT_OF_SERVICE":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"><AlertCircle className="w-3.5 h-3.5" /> Out of Service</span>;
      case "RETIRED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">Retired</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  const getCalibrationBadge = (status: string, nextDate?: string | null) => {
    const formattedDate = nextDate ? new Date(nextDate).toLocaleDateString() : "N/A";
    switch (status) {
      case "UP_TO_DATE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100" title={`Next: ${formattedDate}`}>
            <CheckCircle2 className="w-3 h-3" /> Up to Date
          </span>
        );
      case "DUE_SOON":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200" title={`Due: ${formattedDate}`}>
            <Clock className="w-3 h-3" /> Due Soon ({formattedDate})
          </span>
        );
      case "OVERDUE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200" title={`Overdue since: ${formattedDate}`}>
            <AlertTriangle className="w-3 h-3" /> OVERDUE ({formattedDate})
          </span>
        );
      case "PENDING_VERIFICATION":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            Pending Verification
          </span>
        );
      default:
        return <span className="text-xs text-gray-500">N/A</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#F3E9D1] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#317786]/10 text-[#317786]">
              <Wrench className="w-6 h-6" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#053845]">Equipment & Calibration Tracker</h1>
          </div>
          <p className="hidden sm:block text-sm text-gray-600 mt-1">
            Centralized registry, calibration scheduling, preventive maintenance & breakdown tracking for blood banking assets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#053845] bg-white border border-[#F3E9D1] rounded-lg hover:bg-[#FAF6EE] transition disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-[#317786]" : ""}`} />
            Refresh
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#053845] bg-white border border-[#F3E9D1] rounded-lg hover:bg-[#FAF6EE] transition"
          >
            <FileDown className="w-4 h-4 text-[#317786]" />
            Export CSV
          </button>

          <Link
            href="/bloodbank/equipment/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#053845] hover:bg-[#317786] rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Register Equipment
          </Link>
        </div>
      </div>

      {/* Notifications */}
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

      {/* Clinical / Operational Alert Banner */}
      {metrics && (metrics.calibration.overdue > 0 || metrics.activeBreakdownsCount > 0) && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                Action Required: {metrics.calibration.overdue} Overdue Calibrations & {metrics.activeBreakdownsCount} Active Breakdowns
              </h3>
              <p className="text-xs text-amber-700 mt-0.5">
                Clinical SOP Reminder: Ensure uncalibrated or failing storage equipment undergoes immediate service or component relocation per facility SOP. Inventory records remain preserved.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setCalibrationStatus("OVERDUE");
              setPage(1);
            }}
            className="text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg shrink-0 self-start md:self-center transition"
          >
            Filter Overdue Assets
          </button>
        </div>
      )}

      {/* Dashboard KPI Summary Cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="p-4 rounded-xl bg-white border border-[#F3E9D1] shadow-sm">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Assets</span>
            <div className="mt-2 text-2xl font-bold text-[#053845]">{metrics.totalEquipment}</div>
            <div className="mt-1 text-xs text-gray-500">{metrics.retired} retired</div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#F3E9D1] shadow-sm">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Operational</span>
            <div className="mt-2 text-2xl font-bold text-emerald-700">{metrics.operational}</div>
            <div className="mt-1 text-xs text-emerald-600">Active in service</div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#F3E9D1] shadow-sm">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Maintenance</span>
            <div className="mt-2 text-2xl font-bold text-amber-700">{metrics.underMaintenance}</div>
            <div className="mt-1 text-xs text-amber-600">{metrics.outOfService} out of service</div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#F3E9D1] shadow-sm">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Cal. Up To Date</span>
            <div className="mt-2 text-2xl font-bold text-emerald-700">{metrics.calibration.upToDate}</div>
            <div className="mt-1 text-xs text-emerald-600">Within valid cycle</div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#F3E9D1] shadow-sm">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Cal. Due Soon</span>
            <div className="mt-2 text-2xl font-bold text-amber-700">{metrics.calibration.dueSoon}</div>
            <div className="mt-1 text-xs text-amber-600">Within next 30 days</div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-rose-200 shadow-sm bg-rose-50/30">
            <span className="text-xs font-medium text-rose-600 uppercase tracking-wider">Cal. Overdue</span>
            <div className="mt-2 text-2xl font-bold text-rose-700">{metrics.calibration.overdue}</div>
            <div className="mt-1 text-xs text-rose-600 font-medium">Needs calibration</div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-white border border-[#F3E9D1] shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Asset ID, name, model, serial, location..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786] focus:border-transparent"
            />
          </div>

          {/* Category */}
          <div>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="w-full py-2 px-3 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786] bg-white"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c.categoryid} value={c.categoryname}>
                  {c.categoryname}
                </option>
              ))}
            </select>
          </div>

          {/* Operational Status */}
          <div>
            <select
              value={operationalStatus}
              onChange={(e) => {
                setOperationalStatus(e.target.value);
                setPage(1);
              }}
              className="w-full py-2 px-3 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786] bg-white"
            >
              <option value="ALL">All Operational Statuses</option>
              <option value="OPERATIONAL">Operational</option>
              <option value="UNDER_MAINTENANCE">Under Maintenance</option>
              <option value="OUT_OF_SERVICE">Out of Service</option>
              <option value="RETIRED">Retired</option>
            </select>
          </div>

          {/* Calibration Status */}
          <div>
            <select
              value={calibrationStatus}
              onChange={(e) => {
                setCalibrationStatus(e.target.value);
                setPage(1);
              }}
              className="w-full py-2 px-3 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786] bg-white"
            >
              <option value="ALL">All Calibration Statuses</option>
              <option value="UP_TO_DATE">Up to Date</option>
              <option value="DUE_SOON">Due Soon (≤ 30d)</option>
              <option value="OVERDUE">Overdue</option>
              <option value="PENDING_VERIFICATION">Pending Verification</option>
              <option value="NOT_APPLICABLE">Not Applicable</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
          <span>Showing {equipmentList.length} of {totalCount} equipment assets</span>
          {(search || category !== "ALL" || operationalStatus !== "ALL" || calibrationStatus !== "ALL") && (
            <button
              onClick={() => {
                setSearch("");
                setCategory("ALL");
                setOperationalStatus("ALL");
                setCalibrationStatus("ALL");
                setPage(1);
              }}
              className="text-[#317786] hover:underline font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Equipment Table */}
      <div className="bg-white rounded-xl border border-[#F3E9D1] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#317786] mb-3" />
            <p className="text-sm">Loading equipment registry...</p>
          </div>
        ) : equipmentList.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Wrench className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-base font-semibold text-gray-700">No equipment found</p>
            <p className="text-sm mt-1">
              {search || category !== "ALL" || operationalStatus !== "ALL" || calibrationStatus !== "ALL"
                ? "Try adjusting your filters or search keywords."
                : "No equipment registered yet. Click 'Register Equipment' to add your first asset."}
            </p>
            <div className="mt-4">
              <Link
                href="/bloodbank/equipment/new"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#053845] hover:bg-[#317786] rounded-lg transition"
              >
                <Plus className="w-4 h-4" /> Register Equipment
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF6EE] border-b border-[#F3E9D1] text-xs font-semibold text-[#053845] uppercase tracking-wider">
                  <th className="py-3 px-4">Asset ID</th>
                  <th className="py-3 px-4">Equipment Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Operational Status</th>
                  <th className="py-3 px-4">Calibration Status</th>
                  <th className="py-3 px-4">Maintenance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3E9D1] text-sm">
                {equipmentList.map((eq) => (
                  <tr key={eq.equipmentid} className="hover:bg-gray-50/80 transition group">
                    <td className="py-3.5 px-4 font-mono font-semibold text-[#053845]">
                      <Link href={`/bloodbank/equipment/${eq.equipmentid}`} className="hover:text-[#317786] hover:underline">
                        {eq.assetnumber}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-gray-900">
                      <div>{eq.equipmentname}</div>
                      {(eq.manufacturer || eq.modelnumber) && (
                        <div className="text-xs text-gray-500">
                          {[eq.manufacturer, eq.modelnumber].filter(Boolean).join(" • ")}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600">
                      <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-700">
                        {eq.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600">
                      {eq.location || <span className="text-gray-400 italic">Not set</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      {getOperationalBadge(eq.operationalstatus)}
                    </td>
                    <td className="py-3.5 px-4">
                      {getCalibrationBadge(eq.calibrationstatus, eq.nextcalibrationdate)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs text-gray-600">
                        {eq.maintenancestatus === "OVERDUE" ? (
                          <span className="text-rose-600 font-semibold">Overdue</span>
                        ) : eq.nextmaintenancedate ? (
                          new Date(eq.nextmaintenancedate).toLocaleDateString()
                        ) : (
                          "N/A"
                        )}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/bloodbank/equipment/${eq.equipmentid}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#053845] transition"
                      >
                        Details <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 bg-white border-t border-[#F3E9D1] flex items-center justify-between text-xs text-gray-600">
            <div>
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
