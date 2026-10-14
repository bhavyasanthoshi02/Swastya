import React from "react";

const features = [
  {
    title: "Emergency Blood Requests",
    description:
      "Streamlined intake forms engineered for rapid clinical submission during acute trauma, surgeries, or urgent transfusions.",
    iconBg: "bg-[#A2363A]/10 text-[#A2363A]",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    title: "Inventory Management",
    description:
      "Direct digital registries for certified blood banks to update component availability, expiry, and cold-chain status.",
    iconBg: "bg-[#317786]/10 text-[#317786]",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    title: "Smart Donor Matching",
    description:
      "Compatibility-driven filtering considering ABO/Rh compatibility, verified intervals since last donation, and geographic proximity.",
    iconBg: "bg-[#053845]/10 text-[#053845]",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    title: "Hospital Coordination",
    description:
      "Structured inter-facility communication protocols enabling mutual aid and component sharing between partner health centers.",
    iconBg: "bg-[#317786]/10 text-[#317786]",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    title: "Availability Control",
    description:
      "Donors retain full authority over their participation status, quiet hours, travel limits, and temporary pause windows.",
    iconBg: "bg-[#EFA27E]/20 text-[#B94F30]",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    title: "Request Status Tracking",
    description:
      "Transparent timeline tracking from intake to verification, donor assignment, and hospital reception of units.",
    iconBg: "bg-[#053845]/10 text-[#053845]",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    title: "Emergency Alerts",
    description:
      "Targeted notifications routed only to eligible registered individuals nearby, avoiding broadcast fatigue and false alarms.",
    iconBg: "bg-[#A2363A]/10 text-[#A2363A]",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    title: "Radius Expansion",
    description:
      "Graduated search scope expansion if primary regional supplies are insufficient for rare blood groups or high-volume needs.",
    iconBg: "bg-[#317786]/10 text-[#317786]",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
];

export function FeaturesSection() {
  return (
    <section className="py-20 bg-slate-50/60 border-b border-slate-200" id="features">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-[#317786]">
            Comprehensive Capabilities
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#053845] mt-2">
            Purpose-Built Features for Clinical and Community Care
          </h2>
          <p className="text-slate-600 mt-3 text-base">
            Equipping healthcare providers, blood banks, and volunteers with practical tools for every stage of blood coordination.
          </p>
        </div>

        {/* 8 Features (4x2 Grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((item) => (
            <div
              key={item.title}
              className="bg-white p-6 rounded-lg border border-slate-200 hover:border-[#317786]/50 transition-colors"
            >
              <div
                className={`w-10 h-10 rounded-md ${item.iconBg} flex items-center justify-center mb-4`}
              >
                {item.icon}
              </div>
              <h3 className="font-serif font-bold text-base text-[#053845] mb-2">{item.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
