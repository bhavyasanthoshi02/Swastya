"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Building,
  ShieldCheck,
  Save,
} from "lucide-react";
import { api, EquipmentCategoryItem } from "@/lib/api";

export default function RegisterEquipmentPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<EquipmentCategoryItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [assetNumber, setAssetNumber] = useState("");
  const [equipmentName, setEquipmentName] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [location, setLocation] = useState("");
  const [department, setDepartment] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [installationDate, setInstallationDate] = useState("");
  const [warrantyExpiryDate, setWarrantyExpiryDate] = useState("");
  const [operationalStatus, setOperationalStatus] = useState("OPERATIONAL");

  // Calibration Config
  const [isCalibrationRequired, setIsCalibrationRequired] = useState(true);
  const [calibrationIntervalDays, setCalibrationIntervalDays] = useState(90);
  const [lastCalibrationDate, setLastCalibrationDate] = useState("");
  const [nextCalibrationDate, setNextCalibrationDate] = useState("");

  // Maintenance Config
  const [isMaintenanceRequired, setIsMaintenanceRequired] = useState(true);
  const [maintenanceIntervalDays, setMaintenanceIntervalDays] = useState(90);
  const [lastMaintenanceDate, setLastMaintenanceDate] = useState("");
  const [nextMaintenanceDate, setNextMaintenanceDate] = useState("");

  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await api.equipment.getCategories();
        if (res.success && res.categories) {
          setCategories(res.categories);
          if (res.categories.length > 0) {
            setCategory(res.categories[0].categoryname);
            if (res.categories[0].defaultcalibrationinterval) {
              setCalibrationIntervalDays(res.categories[0].defaultcalibrationinterval);
            }
            if (res.categories[0].defaultmaintenanceinterval) {
              setMaintenanceIntervalDays(res.categories[0].defaultmaintenanceinterval);
            }
          }
        }
      } catch {
        // Fallback to default
        setCategory("Blood Bank Refrigerator");
      }
    }
    fetchCategories();
  }, []);

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setCategory(val);
    const found = categories.find((c) => c.categoryname === val);
    if (found) {
      if (found.defaultcalibrationinterval) {
        setCalibrationIntervalDays(found.defaultcalibrationinterval);
      }
      if (found.defaultmaintenanceinterval) {
        setMaintenanceIntervalDays(found.defaultmaintenanceinterval);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const chosenCategory = category === "OTHER" ? customCategory.trim() : category;

    if (!assetNumber.trim()) {
      setError("Asset Number / ID is required.");
      return;
    }
    if (!equipmentName.trim()) {
      setError("Equipment Name is required.");
      return;
    }
    if (!chosenCategory) {
      setError("Category is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.equipment.create({
        assetNumber: assetNumber.trim(),
        equipmentName: equipmentName.trim(),
        category: chosenCategory,
        manufacturer: manufacturer.trim() || undefined,
        modelNumber: modelNumber.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
        location: location.trim() || undefined,
        department: department.trim() || undefined,
        responsiblePerson: responsiblePerson.trim() || undefined,
        installationDate: installationDate || undefined,
        warrantyExpiryDate: warrantyExpiryDate || undefined,
        operationalStatus,
        isCalibrationRequired,
        calibrationIntervalDays: isCalibrationRequired ? Number(calibrationIntervalDays) : undefined,
        lastCalibrationDate: lastCalibrationDate || undefined,
        nextCalibrationDate: nextCalibrationDate || undefined,
        isMaintenanceRequired,
        maintenanceIntervalDays: isMaintenanceRequired ? Number(maintenanceIntervalDays) : undefined,
        lastMaintenanceDate: lastMaintenanceDate || undefined,
        nextMaintenanceDate: nextMaintenanceDate || undefined,
        notes: notes.trim() || undefined,
      });

      if (res.success && res.equipment) {
        router.push(`/bloodbank/equipment/${res.equipment.equipmentid}`);
      } else {
        setError(res.message || "Failed to register equipment");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to register equipment. Please check input.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb & Navigation */}
      <div>
        <Link
          href="/bloodbank/equipment"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#317786] hover:text-[#053845] transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Equipment Registry
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#053845] mt-2">Register New Equipment</h1>
        <p className="text-sm text-gray-600 mt-1">
          Add an equipment asset to the facility registry with calibration and preventive maintenance intervals.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Identification */}
        <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-[#053845] border-b border-[#F3E9D1] pb-2">
            Asset Identification
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Asset ID / Inventory Tag <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. BBR-01, PLT-AG-04"
                value={assetNumber}
                onChange={(e) => setAssetNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
              <span className="text-xs text-gray-500 mt-0.5 block">Must be unique within this blood bank facility</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Equipment Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Helmer Blood Bank Refrigerator 4°C"
                value={equipmentName}
                onChange={(e) => setEquipmentName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={handleCategoryChange}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786] bg-white"
              >
                {categories.map((c) => (
                  <option key={c.categoryid} value={c.categoryname}>
                    {c.categoryname}
                  </option>
                ))}
                <option value="OTHER">Other / Custom Category</option>
              </select>
            </div>

            {category === "OTHER" && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Specify Category Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apheresis Machine"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Manufacturer
              </label>
              <input
                type="text"
                placeholder="e.g. Helmer Scientific, Terumo BCT"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Model Number
              </label>
              <input
                type="text"
                placeholder="e.g. iBR120-GX"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Serial Number
              </label>
              <input
                type="text"
                placeholder="e.g. SN-892410-B"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Initial Operational Status
              </label>
              <select
                value={operationalStatus}
                onChange={(e) => setOperationalStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786] bg-white"
              >
                <option value="OPERATIONAL">Operational</option>
                <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                <option value="OUT_OF_SERVICE">Out of Service</option>
              </select>
            </div>
          </div>
        </div>

        {/* Location & Placement */}
        <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-[#053845] border-b border-[#F3E9D1] pb-2">
            Facility Location & Assignment
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Physical Location
              </label>
              <input
                type="text"
                placeholder="e.g. Cold Storage Bay 2, Lab 104"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Department
              </label>
              <input
                type="text"
                placeholder="e.g. Immunohematology / Storage"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Responsible Person / Officer
              </label>
              <input
                type="text"
                placeholder="e.g. Senior Lab Tech S. Rao"
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Installation Date
              </label>
              <input
                type="date"
                value={installationDate}
                onChange={(e) => setInstallationDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Warranty Expiry Date
              </label>
              <input
                type="date"
                value={warrantyExpiryDate}
                onChange={(e) => setWarrantyExpiryDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>
          </div>
        </div>

        {/* Calibration Configuration */}
        <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#F3E9D1] pb-2">
            <h2 className="text-base font-semibold text-[#053845]">Calibration Tracking Schedule</h2>
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
              <input
                type="checkbox"
                checked={isCalibrationRequired}
                onChange={(e) => setIsCalibrationRequired(e.target.checked)}
                className="rounded text-[#317786] focus:ring-[#317786]"
              />
              Calibration Required
            </label>
          </div>

          {isCalibrationRequired ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Calibration Interval (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1825"
                  value={calibrationIntervalDays}
                  onChange={(e) => setCalibrationIntervalDays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
                />
                <span className="text-xs text-gray-500 mt-0.5 block">Standard: 90 days (quarterly) or 180 days</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Last Calibration Date
                </label>
                <input
                  type="date"
                  value={lastCalibrationDate}
                  onChange={(e) => setLastCalibrationDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Next Due Date (Auto if blank)
                </label>
                <input
                  type="date"
                  value={nextCalibrationDate}
                  onChange={(e) => setNextCalibrationDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">
              Calibration tracking disabled for this asset. Status will show as Not Applicable.
            </p>
          )}
        </div>

        {/* Maintenance Configuration */}
        <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#F3E9D1] pb-2">
            <h2 className="text-base font-semibold text-[#053845]">Preventive Maintenance Schedule</h2>
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
              <input
                type="checkbox"
                checked={isMaintenanceRequired}
                onChange={(e) => setIsMaintenanceRequired(e.target.checked)}
                className="rounded text-[#317786] focus:ring-[#317786]"
              />
              Maintenance Required
            </label>
          </div>

          {isMaintenanceRequired ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Maintenance Interval (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1825"
                  value={maintenanceIntervalDays}
                  onChange={(e) => setMaintenanceIntervalDays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Last Maintenance Date
                </label>
                <input
                  type="date"
                  value={lastMaintenanceDate}
                  onChange={(e) => setLastMaintenanceDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Next Due Date (Auto if blank)
                </label>
                <input
                  type="date"
                  value={nextMaintenanceDate}
                  onChange={(e) => setNextMaintenanceDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">
              Preventive maintenance tracking disabled for this asset.
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-[#053845] border-b border-[#F3E9D1] pb-2">
            Technical & Clinical Notes
          </h2>
          <div>
            <textarea
              rows={3}
              placeholder="e.g. Temperature range 2°C - 6°C. Connected to Uninterruptible Power Supply (UPS-4). Contact vendor for annual PM contract."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/bloodbank/equipment"
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-[#053845] hover:bg-[#317786] rounded-lg shadow transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? "Registering..." : "Save Equipment"}
          </button>
        </div>
      </form>
    </div>
  );
}
