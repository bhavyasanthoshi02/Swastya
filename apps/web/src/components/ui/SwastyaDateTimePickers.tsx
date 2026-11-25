"use client";

import React, { useState, useEffect, useRef } from "react";
import { Calendar, Clock, ChevronLeft, ChevronRight } from "lucide-react";

interface SwastyaDatePickerProps {
  value: string; // YYYY-MM-DD
  min?: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  hasError?: boolean;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseYMD(ymd: string): { year: number; month: number; day: number } | null {
  const parts = ymd.split("-");
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}

function toYMD(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function SwastyaDatePicker({
  value,
  min,
  onChange,
  hasError = false,
}: SwastyaDatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const todayStr = toYMD(today.getFullYear(), today.getMonth(), today.getDate());
  const parsedVal = parseYMD(value);

  const [viewYear, setViewYear] = useState(parsedVal?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedVal?.month ?? today.getMonth());

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleToggle = () => {
    if (!open && parsedVal) {
      setViewYear(parsedVal.year);
      setViewMonth(parsedVal.month);
    }
    setOpen((prev) => !prev);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const displayLabel = parsedVal
    ? new Date(parsedVal.year, parsedVal.month, parsedVal.day).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Select date";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label="Required by date"
        className={`w-full h-10 px-3 rounded-xl border text-xs sm:text-sm bg-white flex items-center justify-between gap-2 text-[#053845] focus:outline-none transition-colors cursor-pointer ${
          hasError
            ? "border-[#A2363A]"
            : open
            ? "border-[#317786] ring-1 ring-[#317786]/25"
            : "border-slate-200 hover:border-[#317786]/50 focus:border-[#317786]"
        }`}
      >
        <span className="truncate font-medium">{displayLabel}</span>
        <Calendar className="w-4 h-4 text-[#317786] shrink-0" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute left-0 top-11 z-40 w-64 bg-white rounded-2xl border border-[#F3E9D1] shadow-lg p-3 space-y-2.5"
        >
          {/* Month / Year Header */}
          <div className="flex items-center justify-between">
            <span className="font-serif text-sm font-bold text-[#053845]">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                aria-label="Previous month"
                className="w-7 h-7 rounded-lg hover:bg-[#FAF6EE] text-[#053845] flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                aria-label="Next month"
                className="w-7 h-7 rounded-lg hover:bg-[#FAF6EE] text-[#053845] flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[11px] font-semibold text-slate-400 py-0.5">
                {w}
              </span>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="h-7" />;
              }
              const cellYMD = toYMD(viewYear, viewMonth, day);
              const isDisabled = Boolean(min && cellYMD < min);
              const isSelected = cellYMD === value;
              const isToday = cellYMD === todayStr;

              return (
                <button
                  key={cellYMD}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    onChange(cellYMD);
                    setOpen(false);
                  }}
                  className={`h-7 w-full rounded-lg text-xs font-medium transition-colors ${
                    isDisabled
                      ? "text-slate-300 cursor-not-allowed"
                      : isSelected
                      ? "bg-[#053845] text-white font-semibold cursor-pointer"
                      : isToday
                      ? "bg-[#FAF6EE] border border-[#317786]/40 text-[#053845] font-semibold hover:bg-[#F3E9D1] cursor-pointer"
                      : "text-[#053845] hover:bg-[#FAF6EE] cursor-pointer"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-[#F3E9D1] flex items-center justify-between text-xs">
            <button
              type="button"
              disabled={Boolean(min && todayStr < min)}
              onClick={() => {
                onChange(todayStr);
                setOpen(false);
              }}
              className="font-semibold text-[#317786] hover:text-[#053845] cursor-pointer disabled:opacity-40"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-medium text-slate-500 hover:text-[#053845] cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SwastyaTimePickerProps {
  value: string; // HH:mm
  onChange: (value: string) => void;
  hasError?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

export function SwastyaTimePicker({
  value,
  onChange,
  hasError = false,
}: SwastyaTimePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedHour, selectedMinute] = (value || "12:00").split(":");

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Required by time"
        className={`w-full h-10 px-3 rounded-xl border text-xs sm:text-sm bg-white flex items-center justify-between gap-2 text-[#053845] focus:outline-none transition-colors cursor-pointer ${
          hasError
            ? "border-[#A2363A]"
            : open
            ? "border-[#317786] ring-1 ring-[#317786]/25"
            : "border-slate-200 hover:border-[#317786]/50 focus:border-[#317786]"
        }`}
      >
        <span className="font-medium tabular-nums">{value || "Select time"}</span>
        <Clock className="w-4 h-4 text-[#317786] shrink-0" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose time"
          className="absolute right-0 top-11 z-40 w-44 bg-white rounded-2xl border border-[#F3E9D1] shadow-lg p-2.5 space-y-2"
        >
          <div className="grid grid-cols-2 gap-1.5 text-center text-[11px] font-semibold text-slate-400 pb-1 border-b border-[#F3E9D1]">
            <span>Hour</span>
            <span>Min</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
              {HOURS.map((h) => {
                const isSelected = h === selectedHour;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onChange(`${h}:${selectedMinute || "00"}`)}
                    className={`w-full py-1 rounded-lg text-xs tabular-nums transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#317786] text-white font-semibold"
                        : "text-[#053845] hover:bg-[#FAF6EE]"
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>

            <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
              {MINUTES.map((m) => {
                const isSelected = m === selectedMinute;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onChange(`${selectedHour || "12"}:${m}`);
                      setOpen(false);
                    }}
                    className={`w-full py-1 rounded-lg text-xs tabular-nums transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#053845] text-white font-semibold"
                        : "text-[#053845] hover:bg-[#FAF6EE]"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
