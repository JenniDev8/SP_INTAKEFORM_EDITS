"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

// Google Translate helpers. We expose a clean two-button toggle (EN / ES)
// that sets the `googtrans` cookie and reloads so the in-page translator
// picks up the chosen language.
const LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

function readCurrentLang() {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(/(?:^|;\s*)googtrans=\/[a-z]+\/([a-z]+)/i);
  return match ? match[1].toLowerCase() : "en";
}

function setLang(code) {
  if (typeof document === "undefined") return;
  // Clear any previous googtrans cookies at every applicable scope
  const host = window.location.hostname;
  const rootHost = host.split(".").slice(-2).join(".");
  const expire = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
  document.cookie = `googtrans=; path=/; ${expire}`;
  document.cookie = `googtrans=; path=/; domain=${host}; ${expire}`;
  document.cookie = `googtrans=; path=/; domain=.${host}; ${expire}`;
  document.cookie = `googtrans=; path=/; domain=.${rootHost}; ${expire}`;

  if (code !== "en") {
    const value = `/en/${code}`;
    document.cookie = `googtrans=${value}; path=/`;
    document.cookie = `googtrans=${value}; path=/; domain=${host}`;
    document.cookie = `googtrans=${value}; path=/; domain=.${host}`;
    document.cookie = `googtrans=${value}; path=/; domain=.${rootHost}`;
  }
  window.location.reload();
}

export default function LanguageSwitcher({ className = "" }) {
  const [active, setActive] = useState("en");

  useEffect(() => {
    setActive(readCurrentLang());
  }, []);

  useEffect(() => {
    // Initializer for the hidden Google Translate element
    if (typeof window === "undefined") return;
    window.googleTranslateElementInit = function () {
      if (!window.google || !window.google.translate) return;
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "en,es",
          autoDisplay: false,
          layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
        },
        "google_translate_element"
      );
    };
  }, []);

  return (
    <>
      {/* Hidden container that Google Translate mounts into */}
      <div id="google_translate_element" className="hidden" aria-hidden="true" />
      <Script
        src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
        strategy="afterInteractive"
      />

      {/* Hide the default Google banner + tooltip chrome */}
      <style jsx global>{`
        .goog-te-banner-frame.skiptranslate,
        .goog-tooltip,
        .goog-tooltip:hover,
        .goog-text-highlight {
          display: none !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        body {
          top: 0 !important;
        }
      `}</style>

      <div
        className={`inline-flex items-center gap-1 rounded-full bg-gray-100 p-1 text-sm ${className}`}
        role="group"
        aria-label="Select language"
        translate="no"
      >
        {LANGS.map((l) => {
          const selected = active === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                if (active === l.code) return;
                setLang(l.code);
              }}
              className={`px-3 py-1.5 rounded-full font-semibold transition ${
                selected
                  ? "bg-white text-brand-navy shadow-sm"
                  : "text-gray-500 hover:text-brand-navy"
              }`}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
