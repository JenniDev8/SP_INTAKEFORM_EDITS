"use client";
import { useRouter } from "next/navigation";

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-brand-light flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      {/* Welcome Card */}
      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-6 sm:p-10 max-w-md w-full text-center">
        {/* Logo */}
        <div className="mb-6 sm:mb-8 flex items-center justify-center">
          <img
            src="/storage-plus-logo.png"
            alt="Storage Plus"
            className="h-11 sm:h-12 w-auto"
          />
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-bold text-brand-navy mb-3 leading-tight">
          Welcome to Storage Plus
        </h1>
        <p className="text-gray-600 text-sm leading-relaxed mb-6 sm:mb-8">
          Please complete the intake form to get started with your storage unit.
        </p>

        <button
          onClick={() => router.push("/intake")}
          className="w-full bg-brand-navy text-white font-display font-bold text-base py-3.5 rounded-xl
                     hover:bg-brand-blue transition active:scale-95 tracking-wide shadow-md
                     flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Start Intake Form
        </button>
      </div>

      <p className="mt-6 text-gray-400 text-xs text-center max-w-md">
        All information is securely stored. 
      </p>
    </div>
  );
}
