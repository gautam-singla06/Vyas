"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { askChatbot } from "@/domain/patient-access/actions";
import HospitalCard from "./HospitalCard";
import type { Facility } from "@/data/types";
import Link from "next/link";

interface Props {
  facilityType: "PHC" | "CHC" | "Private";
  facilities: Facility[];
}

function newSessionToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const getFilters = (facilityType: string) => {
  if (facilityType === "Private") {
    return ["All", "Open Now", "Emergency", "High Rating", "Nearby", "Multi-Speciality"];
  }
  return ["All", "Open Now", "Nearby", "High Rating", "Government"];
};

const getSuggestions = (facilityType: string) => {
  if (facilityType === "Private") {
    return [
      "Which private hospital has ICU beds?",
      "Book appointment at Asian Hospital",
      "Nearest emergency hospital",
      "Which hospital provides cancer treatment?",
      "Which hospital has robotic surgery?",
      "Which hospital has the highest bed availability?"
    ];
  }
  if (facilityType === "CHC") {
    return [
      "Which CHC is nearest?",
      "Are beds available at CHC Kurali?",
      "Does CHC Tigaon provide vaccinations?",
      "Is emergency care available?",
      "Book appointment at CHC Kheri Kalan"
    ];
  }
  return [
      "Is paracetamol available?",
      "Which PHC is nearest?",
      "Are beds available?",
      "Which doctor is on duty?",
      "Is vaccination available?"
  ];
};

export default function FacilityClient({ facilityType, facilities }: Props) {
  const { language, t } = useLanguage();
  const [chat, setChat] = useState<{ from: "patient" | "bot"; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const sessionRef = useRef<string>(newSessionToken());
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    if (chat.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || chatBusy) return;
    const text = draft.trim();
    setDraft("");
    setChat((c) => [...c, { from: "patient", text }]);
    setChatBusy(true);
    try {
      const res = await askChatbot({
        query: text,
        language,
        facilityId: facilityType,
        patientSession: sessionRef.current,
      });
      setChat((c) => [
        ...c,
        { from: "bot", text: res.answer ?? (res.grounded ? t.chat_err_grounded : t.chat_err_facility) },
      ]);
    } catch {
      setChat((c) => [...c, { from: "bot", text: t.chat_err_network }]);
    } finally {
      setChatBusy(false);
    }
  }

  const filteredFacilities = useMemo(() => {
    let filtered = [...facilities];
    if (searchQuery) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.services.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    if (activeFilter === "High Rating") {
      filtered = filtered.filter(p => p.rating >= 4.4);
    }
    return filtered;
  }, [facilities, searchQuery, activeFilter]);

  const searchPlaceholder = facilityType === "Private" 
    ? "Search private hospitals..." 
    : `Search nearby ${facilityType}s...`;

  const emptyStateNearbyText = facilityType === "Private" ? "private hospitals" : `${facilityType}s`;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-4 sm:hidden">
        <Link href="/availability" className="inline-flex items-center text-sm font-medium text-ms-textSecondary hover:text-brand transition-colors group">
          <svg className="w-4 h-4 mr-1 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t.back_to_categories || "Back to Categories"}
        </Link>
      </div>

      <div className="mb-8 ms-fade-rise max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
          <div className="relative w-full sm:max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-ms-textDisabled" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-ms-border bg-ms-surface rounded-ms-sm text-sm text-ms-textPrimary focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-colors shadow-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {getFilters(facilityType).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeFilter === f ? 'bg-brand text-white shadow-brand-sm' : 'bg-ms-surface border border-ms-border text-ms-textSecondary hover:border-brand/50 hover:text-ms-textPrimary'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {filteredFacilities.map((facility, index) => (
            <HospitalCard key={facility.id} facility={facility} facilityType={facilityType} index={index} />
          ))}
          {filteredFacilities.length === 0 && (
            <div className="py-12 text-center border border-ms-border border-dashed rounded-ms-md">
              <p className="text-ms-textSecondary">No health centres found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>

      <section className="rounded-ms-md border border-ms-border bg-ms-surface shadow-card transition-all duration-500 ms-fade-rise max-w-3xl mx-auto mb-8">
        <div className="border-b border-ms-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-ms-textPrimary">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-brand" aria-hidden="true">
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
            </svg>
            Ask Vyas AI
            <span className="ml-auto text-xs text-ms-textDisabled">EN & हिं</span>
          </h2>
        </div>

        <div className="max-h-56 min-h-[80px] overflow-y-auto px-5 py-4 space-y-3">
          {chat.length === 0 && (
            <p className="text-sm italic text-ms-textDisabled max-w-md">
              Ask about medicines,<br/>beds,<br/>doctor availability,<br/>vaccination,<br/>or nearby {emptyStateNearbyText}...
            </p>
          )}
          {chat.map((m, i) => (
            <div
              key={i}
              className={`flex ms-fade-rise ${m.from === "patient" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-ms-md px-4 py-2.5 text-sm leading-relaxed ${
                  m.from === "patient"
                    ? "bg-brand text-white shadow-md shadow-brand/10"
                    : "border border-ms-border bg-ms-bg text-ms-textPrimary shadow-sm"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {chatBusy && (
            <div className="flex justify-start ms-fade-rise">
              <div className="rounded-ms-md border border-ms-border bg-ms-bg px-4 py-3 shadow-sm">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ms-textDisabled" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ms-textDisabled" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ms-textDisabled" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="border-t border-ms-border px-5 py-3 bg-ms-surface/50 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <div className="flex gap-2 transition-all duration-300">
            {getSuggestions(facilityType).map((suggestion, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setDraft(suggestion);
                  document.getElementById('chat-input')?.focus();
                }}
                className="rounded-full border border-ms-border bg-ms-surface px-3 py-1.5 text-xs font-medium text-ms-textPrimary transition-all hover:border-brand hover:text-brand hover:shadow-brand-sm whitespace-nowrap shadow-sm"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
        <form onSubmit={sendChat} className="flex gap-2 border-t border-ms-border px-5 py-4">
          <input
            id="chat-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your healthcare question..."
            className="
              flex-1 rounded-ms-sm border border-ms-border bg-ms-bg px-4 py-3
              text-sm text-ms-textPrimary placeholder:text-ms-textDisabled
              focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 shadow-inner-sm transition-all
            "
            style={{ minHeight: "48px" }}
          />
          <button
            id="chat-send-btn"
            type="submit"
            disabled={chatBusy || !draft.trim()}
            className="
              ms-press rounded-ms-sm bg-brand px-5 py-3 text-sm font-semibold
              text-white shadow-brand transition-all hover:bg-brand-hover hover:shadow-brand-lg hover:scale-105
              disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-brand
            "
            style={{ minHeight: "48px" }}
          >
            {chatBusy ? "..." : t.ask_btn}
          </button>
        </form>
      </section>
    </div>
  );
}
