import { Facility } from "@/data/types";
import Image from "next/image";

interface Props {
  facility: Facility;
  facilityType: "PHC" | "CHC" | "Private";
  index: number;
}

export default function HospitalCard({ facility, facilityType, index }: Props) {
  return (
    <div
      className="group flex flex-col md:flex-row gap-6 p-5 sm:p-6 rounded-ms-md border border-ms-border bg-ms-surface shadow-card hover:shadow-card-lg hover:-translate-y-1 transition-all duration-300"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Left Side: Info */}
      <div className="flex-1 flex flex-col sm:flex-row gap-5">
        {facility.logo ? (
          <div className="w-full sm:w-36 h-36 bg-white rounded-ms-sm flex-shrink-0 flex items-center justify-center border border-ms-border overflow-hidden relative">
            <div className="relative w-full h-[70px] px-4">
              <Image
                src={facility.logo}
                alt={`${facility.name} Logo`}
                fill
                className="object-contain"
                sizes="(max-width: 640px) 100vw, 144px"
                loading="lazy"
              />
            </div>
          </div>
        ) : (
          <div className="w-full sm:w-36 h-36 bg-ms-surface rounded-ms-sm flex-shrink-0 flex items-center justify-center border border-ms-border overflow-hidden relative">
            <svg className="w-12 h-12 text-ms-textDisabled" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="bg-brand-tint text-brand text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold border border-brand/20">
              {facilityType === "Private" ? "Private" : "Government"}
            </span>
            <span className="flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-watch bg-watch-tint px-2 py-0.5 rounded-full border border-watch/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-watch opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-watch"></span>
              </span>
              {facility.status}
            </span>
            <span className="flex items-center text-xs font-bold text-amber-500">
              <svg className="w-3.5 h-3.5 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {facility.rating}
            </span>
          </div>
          <h3 className="text-xl font-bold text-ms-textPrimary tracking-tight">{facility.name}</h3>
          <p className="text-sm text-ms-textSecondary mb-2 font-medium">{facility.type}</p>
          <div className="flex items-start gap-1.5 text-sm text-ms-textSecondary mb-4">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-ms-textDisabled" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            <span className="line-clamp-2">{facility.location}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {facility.services.slice(0, 6).map((s) => (
              <span key={s} className="text-[11px] font-medium bg-ms-surface2 text-ms-textPrimary px-2.5 py-1 rounded-ms-sm border border-ms-border">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side: Stats and Actions */}
      <div className="w-full md:w-64 flex flex-col gap-4 flex-shrink-0 border-t md:border-t-0 md:border-l border-ms-border pt-4 md:pt-0 md:pl-6">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-brand-tint/20 border border-brand/10 p-2.5 rounded-ms-sm">
            <div className="text-[10px] text-brand uppercase font-bold tracking-wider mb-1 flex items-center gap-1">🛏️ Beds</div>
            <div className="text-sm font-semibold text-ms-textPrimary">
              {facility.beds} {typeof facility.beds === "number" ? "Beds" : ""}{" "}
              {facilityType === "Private" && typeof facility.beds === "number" ? "" : "Available"}
            </div>
          </div>
          <div className="bg-watch-tint/20 border border-watch/10 p-2.5 rounded-ms-sm">
            <div className="text-[10px] text-watch uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
              💊 {facilityType === "Private" ? "Pharmacy" : "Medicines"}
            </div>
            <div className="text-sm font-semibold text-ms-textPrimary">
              {facility.medicines} {facilityType !== "Private" && !facility.medicines.includes("Available") ? "Stock" : ""}
            </div>
          </div>
          <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 p-2.5 rounded-ms-sm">
            <div className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">👨‍⚕️ Doctors</div>
            <div className="text-sm font-semibold text-ms-textPrimary">
              {facility.doctors} {facilityType === "Private" ? "Specialists" : "Available"}
            </div>
          </div>
          <div className="bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 p-2.5 rounded-ms-sm">
            <div className="text-[10px] text-purple-600 dark:text-purple-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">🧠 AI Insight</div>
            <div className="text-[11px] font-medium text-ms-textPrimary leading-tight line-clamp-3">{facility.aiInsight}</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-auto">
          <button 
            type="button"
            onClick={() => alert("Book Appointment functionality will be available in Phase 3.")}
            className="w-full bg-brand text-white text-sm font-semibold py-2.5 rounded-ms-sm shadow-brand hover:bg-brand-hover transition-all ms-press hover:shadow-brand-lg group-hover:scale-[1.01] flex justify-center items-center gap-1.5"
          >
            Book Appointment
          </button>
          <div className="flex gap-2">
            <button 
              type="button"
              onClick={() => alert("Check Bed Availability functionality will be available in Phase 3.")}
              className="flex-1 bg-transparent border border-ms-border text-ms-textPrimary text-xs font-semibold py-2 rounded-ms-sm hover:border-brand hover:text-brand transition-all ms-press group-hover:scale-[1.01]"
            >
              Check Bed Availability
            </button>
            <button 
              type="button"
              onClick={() => alert("Call Now functionality will be available in Phase 3.")}
              className="flex-1 bg-transparent border border-ms-border text-ms-textPrimary text-xs font-semibold py-2 rounded-ms-sm hover:border-brand hover:text-brand transition-all ms-press flex items-center justify-center gap-1.5 group-hover:scale-[1.01]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              Call Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
