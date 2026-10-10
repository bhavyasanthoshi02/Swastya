import React from "react";

const steps = [
  {
    step: "01",
    title: "Raise a Request",
    description:
      "A patient attendant or hospital submits verified blood requirements including group, component, units, and clinical urgency.",
  },
  {
    step: "02",
    title: "Check Availability",
    description:
      "The platform checks recorded blood bank inventory and participating hospital availability to determine existing stock.",
  },
  {
    step: "03",
    title: "Identify Suitable Donors",
    description:
      "Eligible donors can be identified using blood group compatibility, availability status, and designated proximity radius.",
  },
  {
    step: "04",
    title: "Track Progress",
    description:
      "Users follow the request status step-by-step as coordination progresses in real time, from contact to donor fulfillment.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="py-20 bg-white border-b border-slate-100" id="how-it-works">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-[#317786]">
            Step-by-Step Flow
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#053845] mt-2">
            How Coordination Works
          </h2>
          <p className="text-slate-600 mt-3 text-base">
            An organized four-step procedure designed to provide immediate clarity from request initiation to completion.
          </p>
        </div>

        {/* 4 Step Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {steps.map((item) => (
            <div
              key={item.step}
              className="flex flex-col bg-[#FAF6EE]/50 border border-slate-200 rounded-lg p-6 relative"
            >
              <div className="text-3xl font-serif font-bold text-[#053845]/20 mb-2">
                {item.step}
              </div>
              <h3 className="font-serif text-lg font-bold text-[#053845] mb-2">{item.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>

        {/* Mandatory Disclaimer Box */}
        <div className="mt-12 p-4 bg-slate-50 border-l-4 border-[#317786] rounded-r-md text-xs sm:text-sm text-slate-600 leading-relaxed">
          <span className="font-bold text-[#053845]">Clinical Notice:</span> Swastya is a digital coordination and communication platform. It does not replace medical screening, clinical compatibility testing, or authorized blood bank procedures.
        </div>
      </div>
    </section>
  );
}
