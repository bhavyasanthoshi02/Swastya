import React from "react";

const pillars = [
  {
    title: "Unified Request Creation",
    description:
      "Standardized intake protocol that structures clinical requirements for hospitals and patient families without ambiguity.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    title: "Transparent Availability",
    description:
      "Structured visibility across participating storage centers to clarify existing reserve units before external mobilization.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    title: "Ethical Donor Discovery",
    description:
      "Strictly voluntary, non-commercial matching respecting donor health parameters, frequency, and personal privacy.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    title: "Status Traceability",
    description:
      "Step-by-step progress notifications eliminating chaotic phone chains and duplicate inquiries during urgent phases.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M13 10V3L4 14h7v7l9-11h-7z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
];

export function AboutSection() {
  return (
    <section className="py-20 bg-[#FAF6EE] border-b border-[#F3E9D1]" id="about">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-[#317786]">
            About the Platform
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#053845] mt-2 mb-4">
            A More Connected Approach to Blood Coordination
          </h2>
          <p className="text-slate-700 text-base sm:text-lg leading-relaxed">
            Swastya aims to reduce the effort involved in finding compatible blood by bringing request creation, blood availability checks, donor discovery, and request tracking into one unified platform.
          </p>
        </div>

        {/* 4 Foundational Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="bg-white p-6 rounded-lg border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-md bg-[#317786]/10 text-[#317786] flex items-center justify-center mb-4">
                {pillar.icon}
              </div>
              <h3 className="font-serif text-lg font-bold text-[#053845] mb-2">{pillar.title}</h3>
              <p className="text-sm text-slate-600 leading-normal">{pillar.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
