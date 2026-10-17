"use client";

import { m } from "framer-motion";
import { Pill, Bed, Stethoscope, Wrench, Search, BrainCircuit, Mic, LayoutDashboard } from "lucide-react";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function FeaturesSection() {
  const { t } = useLanguage();
  
  const FEATURES = [
    {
      icon: Pill,
      title: t.feat_1_title,
      description: t.feat_1_desc,
    },
    {
      icon: Bed,
      title: t.feat_2_title,
      description: t.feat_2_desc,
    },
    {
      icon: Stethoscope,
      title: t.feat_3_title,
      description: t.feat_3_desc,
    },
    {
      icon: Wrench,
      title: t.feat_4_title,
      description: t.feat_4_desc,
    },
    {
      icon: Search,
      title: t.feat_5_title,
      description: t.feat_5_desc,
    },
    {
      icon: BrainCircuit,
      title: t.feat_6_title,
      description: t.feat_6_desc,
    },
    {
      icon: Mic,
      title: t.feat_7_title,
      description: t.feat_7_desc,
    },
    {
      icon: LayoutDashboard,
      title: t.feat_8_title,
      description: t.feat_8_desc,
    },
  ];

  return (
    <section id="features" className="py-24 bg-ms-surface border-t border-ms-border">
      <div className="max-w-content mx-auto px-4 sm:px-6">
        <div className="text-center mb-20">
          <m.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-[clamp(2rem,4vw,3rem)] font-extrabold text-ms-textPrimary tracking-tight"
          >
            {t.features_title}
          </m.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {FEATURES.map((feature, index) => (
            <m.div
              key={index}
              initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6 }}
              className="group flex flex-col sm:flex-row items-start sm:items-center gap-6 p-8 rounded-ms-2xl bg-ms-bg border border-ms-border hover:shadow-brand hover:border-brand-light transition-all duration-300"
            >
              <div className="w-16 h-16 rounded-2xl bg-ms-surface shadow-sm border border-brand-light/40 flex items-center justify-center text-brand shrink-0 group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-ms-textPrimary mb-2 group-hover:text-brand transition-colors">{feature.title}</h3>
                <p className="text-ms-textSecondary leading-relaxed">{feature.description}</p>
              </div>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  );
}

