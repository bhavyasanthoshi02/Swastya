import React from "react";

const portals = [
  {
    category: "Clinical Care",
    title: "Hospitals",
    description:
      "Create and manage blood requests and coordinate with participating organizations efficiently.",
    linkText: "Access Hospital Portal",
    href: "#login-hospital",
  },
  {
    category: "Inventory & Supply",
    title: "Blood Banks",
    description:
      "Maintain inventory records and respond to blood requests with verified stock records.",
    linkText: "Access Blood Bank Portal",
    href: "#login-bloodbank",
  },
  {
    category: "Voluntary Community",
    title: "Blood Donors",
    description:
      "Manage eligibility information, availability schedules, and emergency notifications.",
    linkText: "Access Donor Portal",
    href: "#login-donor",
  },
  {
    category: "Patients & Families",
    title: "Patients & Attendants",
    description:
      "Submit or follow blood requests and receive direct status updates without confusion.",
    linkText: "Track Request Status",
    href: "#login-patient",
  },
];

export function PortalsSection() {
  return (
    <section className="py-20 bg-white border-b border-slate-200" id="portals">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-[#317786]">
            User Portals
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#053845] mt-2">
            Designed for Everyone in the Blood Network
          </h2>
          <p className="text-slate-600 mt-3 text-base">
            Dedicated interfaces tailored to each participant&apos;s workflow and regulatory responsibilities.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {portals.map((portal) => (
            <div
              key={portal.title}
              className="flex flex-col justify-between p-6 rounded-xl border border-slate-200 bg-white hover:border-[#053845] transition-all group"
            >
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#317786] mb-2">
                  {portal.category}
                </div>
                <h3 className="font-serif text-xl font-bold text-[#053845] mb-3">{portal.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">{portal.description}</p>
              </div>
              <a
                className="inline-flex items-center text-sm font-semibold text-[#053845] group-hover:text-[#B94F30] transition-colors"
                href={portal.href}
              >
                {portal.linkText}
                <span className="ml-1.5 transition-transform group-hover:translate-x-1">→</span>
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
