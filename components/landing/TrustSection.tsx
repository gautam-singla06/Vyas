"use client";

import { m } from "framer-motion";
import { WifiOff, Brain, Clock, Languages } from "lucide-react";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function TrustSection() {
  const { t } = useLanguage();
  
  const TRUST_CARDS = [
    {
      icon: WifiOff,
      title: t.trust_1_title,
      description: t.trust_1_desc,
      color: "brand",
    },
    {
      icon: Brain,
      title: t.trust_2_title,
      description: t.trust_2_desc,
      color: "watch",
    },
    {
      icon: Clock,
      title: t.trust_3_title,
      description: t.trust_3_desc,
      color: "warning",
    },
    {
      icon: Languages,
      title: t.trust_4_title,
      description: t.trust_4_desc,
      color: "brand",
    },
  ];

  return (
    <section className="relative -mt-10 pb-20 z-20">
      <div className="max-w-content mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TRUST_CARDS.map((card, index) => (
            <m.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -5 }}
              className="bg-ms-surface p-6 rounded-ms-xl shadow-card border border-ms-border transition-all duration-300 hover:shadow-lg flex flex-col items-start gap-4"
            >
              <div
                className={`w-12 h-12 rounded-ms-md flex items-center justify-center shrink-0 ${
                  card.color === "brand"
                    ? "bg-brand-tint text-brand"
                    : card.color === "watch"
                    ? "bg-watch-tint text-watch"
                    : "bg-warning-tint text-warning"
                }`}
              >
                <card.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-ms-textPrimary mb-2">{card.title}</h3>
                <p className="text-sm text-ms-textSecondary leading-relaxed">{card.description}</p>
              </div>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  );
}

