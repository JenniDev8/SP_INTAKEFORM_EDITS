import { Suspense } from "react";
import IntakeForm from "@/components/IntakeForm";

export const metadata = {
  title: "Intake Form – Storage Plus",
};

export default function IntakePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-light flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand-navy/20 border-t-brand-navy rounded-full animate-spin" />
      </div>
    }>
      <IntakeForm />
    </Suspense>
  );
}
