"use client";

import { m } from "framer-motion";
import { Edit3, RefreshCw, BrainCircuit, ShieldCheck } from "lucide-react";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function HowItWorksSection() {
  const { t } = useLanguage();

  const STEPS = [
    {
      icon: Edit3,
      title: t.how_step1_title,
      description: t.how_step1_desc,
    },
    {
      icon: RefreshCw,
      title: t.how_step2_title,
      description: t.how_step2_desc,
    },
    {
      icon: BrainCircuit,
      title: t.how_step3_title,
      description: t.how_step3_desc,
    },
    {
      icon: ShieldCheck,
      title: t.how_step4_title,
      description: t.how_step4_desc,
    },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-ms-bg relative">
      <div className="max-w-content mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <m.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-[clamp(2rem,4vw,3rem)] font-extrabold text-ms-textPrimary tracking-tight"
          >
            {t.how_it_works_title}
          </m.h2>
        </div>

        <div className="relative">
          {/* Connecting Line */}
          <div className="absolute top-[48px] left-0 w-full h-1 bg-gradient-to-r from-brand-tint via-brand to-brand-tint hidden md:block opacity-30" />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-6 relative z-10">
            {STEPS.map((step, index) => (
              <m.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className="flex flex-col items-center text-center relative"
              >
                {/* Timeline Node */}
                <div className="w-24 h-24 rounded-full bg-ms-surface shadow-card border-4 border-brand-tint flex items-center justify-center mb-6 relative z-10">
                  <step.icon className="w-10 h-10 text-brand" />
                  
                  {/* Pulse effect */}
                  <div className="absolute inset-0 rounded-full border-2 border-brand/20 animate-ping" style={{ animationDuration: '3s' }} />
                </div>

                <div className="bg-ms-surface w-full p-6 rounded-xl shadow-sm border border-ms-border">
                  <h3 className="text-lg font-black text-brand mb-2">{step.title}</h3>
                  <p className="text-sm font-medium text-ms-textSecondary leading-relaxed">
                    {step.description}
                  </p>
                </div>
                
                {/* Mobile Connector */}
                {index !== STEPS.length - 1 && (
                  <div className="h-12 w-1 bg-brand-tint md:hidden my-2" />
                )}
              </m.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

