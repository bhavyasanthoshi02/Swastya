import React from "react";

export function EmergencyBanner() {
  return (
    <section className="py-16 bg-[#FAF6EE] border-b border-[#F3E9D1]" id="emergency">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl border-l-4 border-l-[#EFA27E] border-y border-r border-slate-200 p-8 sm:p-12 shadow-sm">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="max-w-3xl space-y-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#B94F30]">
                <span className="w-2 h-2 rounded-full bg-[#B94F30]" />
                Time-Critical Protocol
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#053845]">
                When Every Moment Matters, Coordination Matters.
              </h2>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                Help reduce the time spent searching across disconnected channels by bringing blood requests, availability information, and donor discovery into a more organized workflow.
              </p>
            </div>
            <div className="flex-shrink-0">
              <a
                className="inline-flex items-center justify-center px-6 py-3 rounded-md text-sm font-semibold text-white bg-[#053845] hover:bg-[#03252e] transition-colors shadow-sm"
                href="#how-it-works"
              >
                Explore How It Works
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
