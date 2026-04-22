"use client";
import { useRouter } from "next/navigation";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-brand-light flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16">
      {/* Welcome Card */}
      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-8 sm:p-14 max-w-2xl w-full text-center">
        {/* Language toggle */}
        <div className="flex justify-end mb-6">
          <LanguageSwitcher />
        </div>

        {/* Logo */}
        <div className="mb-8 sm:mb-10 flex items-center justify-center">
          <img
            src="/storage-plus-logo.png"
            alt="Storage Plus"
            className="h-16 sm:h-20 w-auto"
          />
        </div>

        <h1 className="font-display text-3xl sm:text-5xl font-bold text-brand-navy mb-4 leading-tight">
          Welcome to Storage Plus
        </h1>
        <p className="text-gray-600 text-base sm:text-lg leading-relaxed mb-8 sm:mb-10 max-w-lg mx-auto">
          Please complete the intake form to get started with your storage unit.
        </p>

        <button
          onClick={() => router.push("/intake")}
          className="w-full bg-brand-navy text-white font-display font-bold text-lg sm:text-xl py-4 sm:py-5 rounded-xl
                     hover:bg-brand-blue transition active:scale-95 tracking-wide shadow-md
                     flex items-center justify-center gap-3"
        >
          <svg className="w-6 h-6 sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Start Intake Form
        </button>
      </div>

      <p className="mt-8 text-gray-400 text-sm text-center max-w-md">
        All information is securely stored.
      </p>
    </div>
  );
}
