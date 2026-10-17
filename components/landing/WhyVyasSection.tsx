"use client";

import { m } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function WhyVyasSection() {
  const { t } = useLanguage();

  const REASONS = [
    {
      title: t.why_1_title,
      description: t.why_1_desc,
    },
    {
      title: t.why_2_title,
      description: t.why_2_desc,
    },
    {
      title: t.why_3_title,
      description: t.why_3_desc,
    },
    {
      title: t.why_4_title,
      description: t.why_4_desc,
    },
    {
      title: t.why_5_title,
      description: t.why_5_desc,
    },
    {
      title: "Predictive Alerts",
      description: "AI predicts medicine shortages, doctor absence, and equipment issues before they become critical.",
    },
  ];

  return (
    <section id="why-vyas" className="py-24 bg-brand relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-[80px]" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-brand-hover/50 rounded-full blur-[100px]" />

      <div className="max-w-content mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-16">
          <m.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-[clamp(2rem,4vw,3rem)] font-extrabold text-white tracking-tight"
          >
            {t.why_vyas_title}
          </m.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 justify-center">
          {REASONS.map((reason, index) => (
            <m.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="group h-full bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-[20px] flex items-start gap-4 transition-all duration-300 hover:-translate-y-[6px] hover:bg-white/15 hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]"
            >
              <CheckCircle2 className="w-6 h-6 text-brand-light shrink-0 mt-0.5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" />
              <div>
                <h3 className="text-xl font-bold text-white mb-2">{reason.title}</h3>
                <p className="text-brand-tint/90 text-sm leading-relaxed">{reason.description}</p>
              </div>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  );
}

