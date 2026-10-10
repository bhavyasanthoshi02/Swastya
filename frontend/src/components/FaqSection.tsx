import React from "react";

const faqs = [
  {
    question: "What is Swastya?",
    answer:
      "Swastya is an integrated digital coordination platform designed to bridge communication between hospitals, certified blood banks, volunteer donors, and patient families. We streamline request intake, donor availability matching, and delivery tracking.",
  },
  {
    question: "Who can use the platform?",
    answer:
      "Authorized hospitals and clinics, licensed blood banks and transfusion units, individual voluntary blood donors, and patients or family attendants seeking blood coordination support can all access dedicated portals tailored to their specific needs.",
  },
  {
    question: "How can a hospital raise a blood request?",
    answer:
      "Verified clinical partners can log into their Hospital Portal, submit clinical details (blood type, blood component, urgency class, and patient identification number), and simultaneously initiate internal inventory checks and local network alerts.",
  },
  {
    question: "How can I register as a donor?",
    answer:
      "Individual donors can register by creating a profile in the Donor Portal. You specify your ABO/Rh blood group, geographic location, donation history, and preferred contact hours. All donor information remains confidential and is never shared publicly.",
  },
  {
    question: "Can I track a blood request?",
    answer:
      "Yes. Each submitted request generates a unique reference tracking ID (e.g., #SW-8492). Both hospitals and patient attendants can review real-time updates—such as verification, matching in progress, and donor response—directly via the web interface.",
  },
  {
    question: "Does Swastya replace blood banks or medical professionals?",
    answer:
      "No. Swastya is strictly a coordination and logistics technology platform. It does not replace medical screening, laboratory testing, clinical compatibility evaluations, or standard statutory blood bank protocols. All donations and transfusions must take place at accredited medical facilities under licensed clinical supervision.",
  },
];

export function FaqSection() {
  return (
    <section className="py-20 bg-white border-b border-slate-100" id="faq">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-[#317786]">
            Answers &amp; Clarity
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#053845] mt-2">
            Frequently Asked Questions
          </h2>
          <p className="text-slate-600 mt-3 text-base">
            Understand how Swastya operates, respects privacy, and supports medical institutions.
          </p>
        </div>

        {/* FAQ List */}
        <div className="space-y-6">
          {faqs.map((faq) => (
            <div
              key={faq.question}
              className="border border-slate-200 rounded-lg p-6 hover:border-[#317786]/40 transition-colors bg-white"
            >
              <h3 className="font-serif text-lg font-bold text-[#053845] mb-2">{faq.question}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
