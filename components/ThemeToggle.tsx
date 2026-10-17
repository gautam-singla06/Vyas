"use client";

import { useEffect, useState } from "react";

/**
 * ThemeToggle — applies CSS `filter: invert(1) hue-rotate(180deg)` to <html>
 * via the `.theme-dark` class. White/light is always default.
 * Images/videos are double-inverted in globals.css so they look natural.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // 1. Check local storage
    const stored = localStorage.getItem("ms-theme");
    if (stored === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDark(true);
      document.documentElement.classList.add("theme-dark");
    } else if (stored === "light") {
      // Do nothing, explicitly light
    } else {
      // 2. Auto-detect from OS/Browser if no local storage preference exists
      if (typeof window !== "undefined" && window.matchMedia) {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          setDark(true);
          document.documentElement.classList.add("theme-dark");
        }
      }
    }
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("theme-dark");
      localStorage.setItem("ms-theme", "dark");
    } else {
      document.documentElement.classList.remove("theme-dark");
      localStorage.setItem("ms-theme", "light");
    }
  }

  return (
    <button
      id="theme-toggle"
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`
        relative flex items-center gap-1.5 rounded-ms-sm border border-ms-border
        bg-ms-surface px-3 py-2 text-sm font-medium text-ms-textSecondary
        transition-all duration-200 hover:border-brand hover:text-brand
        active:scale-95
        ${className}
      `}
    >
      {/* Sun icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`h-4 w-4 transition-all duration-200 ${dark ? "opacity-40 scale-75" : "opacity-100 scale-100"}`}
        aria-hidden="true"
      >
        <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
      </svg>

      {/* Track */}
      <span
        className={`
          relative inline-flex h-5 w-9 items-center rounded-full border-2 transition-all duration-200
          ${dark
            ? "border-brand bg-brand"
            : "border-ms-border bg-ms-surface2"
          }
        `}
      >
        <span
          className={`
            inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-all duration-200
            ${dark ? "translate-x-4" : "translate-x-0.5"}
          `}
        />
      </span>

      {/* Moon icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`h-4 w-4 transition-all duration-200 ${dark ? "opacity-100 scale-100" : "opacity-40 scale-75"}`}
        aria-hidden="true"
      >
        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
      </svg>
    </button>
  );
}
