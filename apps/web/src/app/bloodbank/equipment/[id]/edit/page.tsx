"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { api, EquipmentCategoryItem } from "@/lib/api";

export default function EditEquipmentPage() {
  const params = useParams();
  const router = useRouter();
  const equipmentId = params.id as string;

  const [categories, setCategories] = useState<EquipmentCategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [assetNumber, setAssetNumber] = useState("");
  const [equipmentName, setEquipmentName] = useState("");
  const [category, setCategory] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [location, setLocation] = useState("");
  const [department, setDepartment] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [installationDate, setInstallationDate] = useState("");
  const [warrantyExpiryDate, setWarrantyExpiryDate] = useState("");

  const [isCalibrationRequired, setIsCalibrationRequired] = useState(true);
  const [calibrationIntervalDays, setCalibrationIntervalDays] = useState<number | string>(90);

  const [isMaintenanceRequired, setIsMaintenanceRequired] = useState(true);
  const [maintenanceIntervalDays, setMaintenanceIntervalDays] = useState<number | string>(90);

  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const [catRes, eqRes] = await Promise.all([
          api.equipment.getCategories(),
          api.equipment.getById(equipmentId),
        ]);

        if (catRes.success) {
          setCategories(catRes.categories);
        }

        if (eqRes.success && eqRes.equipment) {
          const eq = eqRes.equipment;
          setAssetNumber(eq.assetnumber || "");
          setEquipmentName(eq.equipmentname || "");
          setCategory(eq.category || "");
          setManufacturer(eq.manufacturer || "");
          setModelNumber(eq.modelnumber || "");
          setSerialNumber(eq.serialnumber || "");
          setLocation(eq.location || "");
          setDepartment(eq.department || "");
          setResponsiblePerson(eq.responsibleperson || "");
          setInstallationDate(eq.installationdate ? eq.installationdate.slice(0, 10) : "");
          setWarrantyExpiryDate(eq.warrantyexpirydate ? eq.warrantyexpirydate.slice(0, 10) : "");
          setIsCalibrationRequired(eq.iscalibrationrequired ?? true);
          setCalibrationIntervalDays(eq.calibrationintervaldays || 90);
          setIsMaintenanceRequired(eq.ismaintenancerequired ?? true);
          setMaintenanceIntervalDays(eq.maintenanceintervaldays || 90);
          setNotes(eq.notes || "");
        } else {
          setError("Equipment record not found");
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load equipment record");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [equipmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!assetNumber.trim()) {
      setError("Asset Number is required.");
      return;
    }
    if (!equipmentName.trim()) {
      setError("Equipment Name is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.equipment.update(equipmentId, {
        assetNumber: assetNumber.trim(),
        equipmentName: equipmentName.trim(),
        category: category.trim(),
        manufacturer: manufacturer.trim() || undefined,
        modelNumber: modelNumber.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
        location: location.trim() || undefined,
        department: department.trim() || undefined,
        responsiblePerson: responsiblePerson.trim() || undefined,
        installationDate: installationDate || undefined,
        warrantyExpiryDate: warrantyExpiryDate || undefined,
        isCalibrationRequired,
        calibrationIntervalDays: isCalibrationRequired ? Number(calibrationIntervalDays) : null,
        isMaintenanceRequired,
        maintenanceIntervalDays: isMaintenanceRequired ? Number(maintenanceIntervalDays) : null,
        notes: notes.trim() || undefined,
      });

      if (res.success) {
        router.push(`/bloodbank/equipment/${equipmentId}`);
      } else {
        setError(res.message || "Failed to update equipment");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update equipment record");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#317786] mb-3" />
        <p className="text-sm">Loading equipment editor...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <Link
          href={`/bloodbank/equipment/${equipmentId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#317786] hover:text-[#053845] transition"
        >
          <ArrowLeft className="w-4 h-4" /> Cancel and Back to Details
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#053845] mt-2">Edit Equipment Asset</h1>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-[#053845] border-b border-[#F3E9D1] pb-2">
            Asset Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Asset ID / Tag <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={assetNumber}
                onChange={(e) => setAssetNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Equipment Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={equipmentName}
                onChange={(e) => setEquipmentName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Category
              </label>
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Manufacturer
              </label>
              <input
                type="text"
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
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-[#053845] border-b border-[#F3E9D1] pb-2">
            Location & Intervals
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Location
              </label>
              <input
                type="text"
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
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Responsible Person
              </label>
              <input
                type="text"
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Calibration Interval (Days)
              </label>
              <input
                type="number"
                min="1"
                value={calibrationIntervalDays}
                onChange={(e) => setCalibrationIntervalDays(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Maintenance Interval (Days)
              </label>
              <input
                type="number"
                min="1"
                value={maintenanceIntervalDays}
                onChange={(e) => setMaintenanceIntervalDays(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-[#F3E9D1] shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-[#053845] border-b border-[#F3E9D1] pb-2">
            Notes
          </h2>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#317786]"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href={`/bloodbank/equipment/${equipmentId}`}
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
            {isSubmitting ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
