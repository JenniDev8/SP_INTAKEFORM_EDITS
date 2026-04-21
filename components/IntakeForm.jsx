"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SignaturePad from "./SignaturePad";
import { submitIntakeForm, validateIntakeToken } from "@/lib/submitForm";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCATIONS = [
  "Long Island City – 3500 Review Avenue, Long Island City, NY 11101 · (718) 658-5200",
  "Greenpoint – 425 Greenpoint Avenue, Brooklyn, NY 11222 · (718) 383-3010",
  "Williamsburg – 1053 Metropolitan Avenue, Brooklyn, NY 11211 · (718) 302-0500",
  "Jamaica – 165-08 Liberty Avenue, Jamaica, NY 11433 · (718) 658-5200",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const HOW_HEARD_OPTIONS = [
  "Auction - Bidder",
  "Current Client",
  "Friend referral",
  "Google Search",
  "Maps (Google, Waze..)",
  "Government Agency",
  "Moving Service Referral",
  "Rent Cafe",
  "Returning Client",
  "Sign/Drive-By",
  "Social Media",
  "U-Haul",
  "Yelp",
  "Other/Not Provided",
];

const REASON_OPTIONS = [
  "Apartment/Room too small",
  "Renovating",
  "Business Needs",
  "Homeless",
  "Eviction",
  "Moving Out of New York",
  "Apartment Not Ready",
  "Coming from another Storage",
  "Moving",
  "Other",
];

const WHY_CHOSE_OPTIONS = [
  "Price",
  "Promotion",
  "Hours",
  "Location",
  "Management/Customer Friendly",
  "Friend/Family Member",
  "Reviews/Rating On Google Search",
  "Repeat Client",
  "Transfer Of Unit",
  "Not Sure / Too Long Ago",
];

const WHAT_STORED_OPTIONS = [
  "Residential",
  "Business Merchandise",
  "Construction Items",
  "Mechanic Tools",
  "Just Clothing",
  "Extra Stuff At Home",
  "Seasonal Items",
  "Other",
];

const JAMAICA_PREFIX = "Jamaica";

const CONTRACT_TYPES = ["Business", "Corporate", "Individual"];

const INITIAL_STATE = {
  location: "",
  marketing: { howHeard: "", reasonForStoring: "", whyChose: "", whatStored: "" },
  customer: {
    contractType: "",
    businessName: "",
    firstName: "",
    lastName: "",
    mailingAddress: { address: "", aptSte: "", city: "", state: "", zip: "", plusFour: "" },
    phones: [{ number: "", ext: "" }],
    emails: [{ address: "" }],
  },
  additionalAccess: [
    { name: "", phone: "" },
  ],
  payment: { method: "", autopay: "" },
  startDate: "",
  identification: { frontImage: null, backImage: null, frontName: "", backName: "" },
  signature: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function SectionTitle({ children }) {
  return <h2 className="section-title">{children}</h2>;
}

function Field({ label, required, children, half }) {
  return (
    <div className={half ? "w-full sm:flex-1 sm:min-w-[140px]" : "w-full"}>
      {label && (
        <label className="label-base">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      {children}
    </div>
  );
}

function Select({ value, onChange, options, placeholder, className = "" }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`input-base ${className}`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>
          {o.label ?? o}
        </option>
      ))}
    </select>
  );
}

function CheckboxGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label key={opt} className="pill-option">
          <input
            type="radio"
            name={Math.random()}
            className="hidden"
            checked={value === opt}
            onChange={() => onChange(opt)}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IntakeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";

  const [form, setForm] = useState(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  // Token state: "checking" | "ok" | "invalid" | "none"
  const [tokenState, setTokenState] = useState(token ? "checking" : "none");
  const [tokenInfo, setTokenInfo] = useState(null);

  // Validate the one-time link on first load
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const result = await validateIntakeToken(token);
      if (cancelled) return;
      if (result.valid) {
        setTokenState("ok");
        setTokenInfo(result);
        // Pre-fill the customer name if the admin provided it
        if (result.customerName) {
          const parts = String(result.customerName).trim().split(/\s+/);
          const firstName = parts.shift() || "";
          const lastName = parts.join(" ");
          setForm((prev) => ({
            ...prev,
            customer: {
              ...prev.customer,
              firstName: prev.customer.firstName || firstName,
              lastName: prev.customer.lastName || lastName,
            },
          }));
        }
      } else {
        setTokenState("invalid");
        setTokenInfo(result);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ── Update helpers ──────────────────────────────────────────────────────────

  const set = (path, value) => {
    setForm((prev) => {
      const next = { ...prev };
      const keys = path.split(".");
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = Array.isArray(cur[keys[i]])
          ? [...cur[keys[i]]]
          : { ...cur[keys[i]] };
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const updatePhone = (idx, field, value) => {
    setForm((prev) => {
      const phones = [...prev.customer.phones];
      phones[idx] = { ...phones[idx], [field]: value };
      return { ...prev, customer: { ...prev.customer, phones } };
    });
  };

  const addPhone = () => {
    setForm((prev) => ({
      ...prev,
      customer: {
        ...prev.customer,
        phones: [...prev.customer.phones, { number: "", ext: "" }],
      },
    }));
  };

  const removePhone = (idx) => {
    setForm((prev) => ({
      ...prev,
      customer: {
        ...prev.customer,
        phones: prev.customer.phones.filter((_, i) => i !== idx),
      },
    }));
  };

  const updateEmail = (idx, field, value) => {
    setForm((prev) => {
      const emails = [...prev.customer.emails];
      emails[idx] = { ...emails[idx], [field]: value };
      return { ...prev, customer: { ...prev.customer, emails } };
    });
  };

  const addEmail = () => {
    setForm((prev) => ({
      ...prev,
      customer: {
        ...prev.customer,
        emails: [...prev.customer.emails, { address: "" }],
      },
    }));
  };

  const removeEmail = (idx) => {
    setForm((prev) => ({
      ...prev,
      customer: {
        ...prev.customer,
        emails: prev.customer.emails.filter((_, i) => i !== idx),
      },
    }));
  };

  const updateAccess = (idx, field, value) => {
    setForm((prev) => {
      const additionalAccess = [...prev.additionalAccess];
      additionalAccess[idx] = { ...additionalAccess[idx], [field]: value };
      return { ...prev, additionalAccess };
    });
  };

  const addAccess = () => {
    setForm((prev) => ({
      ...prev,
      additionalAccess: [...prev.additionalAccess, { name: "", phone: "" }],
    }));
  };

  const removeAccess = (idx) => {
    setForm((prev) => ({
      ...prev,
      additionalAccess: prev.additionalAccess.filter((_, i) => i !== idx),
    }));
  };

  // ── File upload handlers ────────────────────────────────────────────────────

  const handleIdUpload = async (e, side) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      setForm((prev) => ({
        ...prev,
        identification: {
          ...prev.identification,
          [side === "front" ? "frontImage" : "backImage"]: base64,
          [side === "front" ? "frontName" : "backName"]: file.name,
        },
      }));
    } catch {
      setError("Failed to read ID file. Please try again.");
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Required fields that aren't covered by native HTML validation
    const missing = [];
    if (form.customer.contractType === "Business" && !form.customer.businessName.trim()) {
      missing.push("Business Name");
    }
    if (!form.marketing.howHeard) missing.push('"How did you hear about us?"');
    if (!form.identification.frontImage) missing.push("ID Front photo");
    if (!form.identification.backImage) missing.push("ID Back photo");
    if (!form.signature) missing.push("Signature");

    if (missing.length > 0) {
      setError("Please complete the following before submitting: " + missing.join(", ") + ".");
      return;
    }

    setSubmitting(true);
    try {
      await submitIntakeForm(form, { token });
      setSubmitted(true);
      // Reset after 4 seconds then go back to welcome
      setTimeout(() => {
        router.push("/");
      }, 4000);
    } catch (err) {
      setError(err.message || "Submission failed. Please try again.");
      setSubmitting(false);
    }
  };

  // ── Token gate screens (only when arriving via ?token=...) ─────────────────

  if (tokenState === "checking") {
    return (
      <div className="min-h-screen bg-brand-light flex flex-col items-center justify-center px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="mb-5 flex items-center justify-center">
            <img src="/storage-plus-logo.png" alt="Storage Plus" className="h-10 w-auto" />
          </div>
          <div className="w-10 h-10 border-4 border-brand-navy/20 border-t-brand-navy rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-sm">Verifying your intake link…</p>
        </div>
      </div>
    );
  }

  if (tokenState === "invalid") {
    const reason = tokenInfo?.reason || "invalid";
    const reasonLabel = {
      used:      "This link has already been used.",
      revoked:   "This link has been revoked.",
      not_found: "This link is not recognized.",
      missing:   "No intake link was provided.",
      error:     "We couldn't verify this link right now.",
    }[reason] || "This intake link is no longer valid.";

    return (
      <div className="min-h-screen bg-brand-light flex flex-col items-center justify-center px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="mb-5 flex items-center justify-center">
            <img src="/storage-plus-logo.png" alt="Storage Plus" className="h-10 w-auto" />
          </div>
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
            <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-display text-xl font-bold text-brand-navy mb-2">Link Unavailable</h1>
          <p className="text-gray-600 text-sm leading-relaxed mb-5">{reasonLabel}</p>
          <p className="text-gray-500 text-xs">
            Please contact Storage Plus and we'll send you a new intake link.
          </p>
        </div>
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-brand-light flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-6 sm:p-10 max-w-md w-full text-center">
          <div className="mb-5 sm:mb-6 flex items-center justify-center">
            <img
              src="/storage-plus-logo.png"
              alt="Storage Plus"
              className="h-9 sm:h-10 w-auto"
            />
          </div>

          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-green-500 rounded-full flex items-center justify-center mb-4 sm:mb-5 mx-auto shadow">
            <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold text-brand-navy mb-3">
            Intake Submitted!
          </h1>
          <p className="text-gray-600 text-sm leading-relaxed mb-6 sm:mb-8">
            The intake form for{" "}
            <strong className="text-brand-navy">{form.customer.firstName} {form.customer.lastName}</strong>{" "}
            has been received and saved. Returning to the welcome screen…
          </p>

          <button
            onClick={() => router.push("/")}
            className="w-full bg-brand-navy text-white font-display font-bold text-base py-3.5 rounded-xl
                       hover:bg-brand-navyDark transition active:scale-95 tracking-wide shadow-md"
          >
            NEW INTAKE →
          </button>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-brand-light">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <img
            src="/storage-plus-logo.png"
            alt="Storage Plus"
            className="h-7 sm:h-8 w-auto"
          />
          <span className="text-brand-navy text-[10px] sm:text-xs font-semibold uppercase tracking-widest">
            Intake Form
          </span>
        </div>
      </header>

      {/* Form body */}
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-3 sm:px-4 py-5 sm:py-8 space-y-0">

        {/* ── LOCATION ── */}
        <div className="form-section">
          <SectionTitle>Facility Location</SectionTitle>
          <Field label="Select Location" required>
            <Select
              value={form.location}
              onChange={(e) => {
                const newLoc = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  location: newLoc,
                  marketing: newLoc.startsWith(JAMAICA_PREFIX)
                    ? prev.marketing
                    : { ...prev.marketing, reasonForStoring: "", whyChose: "", whatStored: "" },
                }));
              }}
              options={LOCATIONS}
              placeholder="— Select a location —"
            />
          </Field>
        </div>

        {/* ── CUSTOMER DETAILS ── */}
        <div className="form-section">
          <SectionTitle>Customer Details</SectionTitle>
          <div className="space-y-4">
            <Field label="Account Type" required>
              <Select
                value={form.customer.contractType}
                onChange={(e) => set("customer.contractType", e.target.value)}
                options={CONTRACT_TYPES}
                placeholder="— Select type —"
              />
            </Field>
            {form.customer.contractType === "Business" && (
              <Field label="Business Name" required>
                <input
                  className="input-base"
                  placeholder="e.g. Acme Corp"
                  value={form.customer.businessName}
                  onChange={(e) => set("customer.businessName", e.target.value)}
                />
              </Field>
            )}
            <div className="flex gap-4 flex-wrap">
              <Field label="First Name" required half>
                <input
                  className="input-base"
                  placeholder="First name"
                  value={form.customer.firstName}
                  onChange={(e) => set("customer.firstName", e.target.value)}
                />
              </Field>
              <Field label="Last Name" required half>
                <input
                  className="input-base"
                  placeholder="Last name"
                  value={form.customer.lastName}
                  onChange={(e) => set("customer.lastName", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* ── MAILING ADDRESS ── */}
        <div className="form-section">
          <SectionTitle>Mailing Address</SectionTitle>
          <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <Field label="Street Address" required half>
                <input
                  className="input-base"
                  placeholder="123 Main St"
                  value={form.customer.mailingAddress.address}
                  onChange={(e) => set("customer.mailingAddress.address", e.target.value)}
                />
              </Field>
              <Field label="Apt / Ste / Other" half>
                <input
                  className="input-base"
                  placeholder="Apt 2B"
                  value={form.customer.mailingAddress.aptSte}
                  onChange={(e) => set("customer.mailingAddress.aptSte", e.target.value)}
                />
              </Field>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Field label="City" required half>
                <input
                  className="input-base"
                  placeholder="City"
                  value={form.customer.mailingAddress.city}
                  onChange={(e) => set("customer.mailingAddress.city", e.target.value)}
                />
              </Field>
              <Field label="State" required half>
                <Select
                  value={form.customer.mailingAddress.state}
                  onChange={(e) => set("customer.mailingAddress.state", e.target.value)}
                  options={US_STATES}
                  placeholder="State"
                />
              </Field>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Field label="ZIP Code" required half>
                <input
                  className="input-base"
                  placeholder="10001"
                  maxLength={5}
                  value={form.customer.mailingAddress.zip}
                  onChange={(e) => set("customer.mailingAddress.zip", e.target.value)}
                />
              </Field>
              <Field label="ZIP +4" half>
                <input
                  className="input-base"
                  placeholder="1234"
                  maxLength={4}
                  value={form.customer.mailingAddress.plusFour}
                  onChange={(e) => set("customer.mailingAddress.plusFour", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* ── PHONE NUMBERS ── */}
        <div className="form-section">
          <SectionTitle>Phone Numbers</SectionTitle>
          <div className="space-y-5">
            {form.customer.phones.map((phone, idx) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Phone #{idx + 1}
                  </span>
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => removePhone(idx)}
                      className="text-xs text-red-400 hover:text-red-600 transition"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Field label="Phone Number" required half>
                    <input
                      className="input-base"
                      placeholder="(555) 000-0000"
                      value={phone.number}
                      onChange={(e) => updatePhone(idx, "number", e.target.value)}
                    />
                  </Field>
                  <Field label="Ext (opt.)" half>
                    <input
                      className="input-base"
                      placeholder="ext"
                      value={phone.ext}
                      onChange={(e) => updatePhone(idx, "ext", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addPhone}
              className="text-sm text-brand-blue hover:text-brand-navy font-medium transition flex items-center gap-1"
            >
              + Add Phone Number
            </button>
          </div>
        </div>

        {/* ── EMAIL ── */}
        <div className="form-section">
          <SectionTitle>Email Address</SectionTitle>
          <div className="space-y-4">
            {form.customer.emails.map((email, idx) => (
              <div key={idx} className="flex gap-3 flex-wrap items-end">
                <Field label="Email Address" required>
                  <input
                    className="input-base"
                    type="email"
                    required={idx === 0}
                    placeholder="name@example.com"
                    value={email.address}
                    onChange={(e) => updateEmail(idx, "address", e.target.value)}
                  />
                </Field>
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => removeEmail(idx)}
                    className="text-xs text-red-400 hover:text-red-600 transition mb-2.5"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addEmail}
              className="text-sm text-brand-blue hover:text-brand-navy font-medium transition flex items-center gap-1"
            >
              + Add Email
            </button>
          </div>
        </div>

        {/* ── ACCESS AUTHORIZATION ── */}
        <div className="form-section">
          <SectionTitle>Access Authorization</SectionTitle>
          <p className="text-xs text-gray-500 mb-4 -mt-2 leading-relaxed">
            Persons authorized to vacate/close account, transfer, or cut lock,
            and can be contacted in case of an emergency.
          </p>
          <div className="space-y-4">
            {form.additionalAccess.map((person, idx) => (
              <div key={idx} className="flex gap-3 flex-wrap items-end">
                <Field label={`Person #${idx + 1} – First & Last Name`} half>
                  <input
                    className="input-base"
                    placeholder="Full name"
                    value={person.name}
                    onChange={(e) => updateAccess(idx, "name", e.target.value)}
                  />
                </Field>
                <Field label="Phone" half>
                  <input
                    className="input-base"
                    placeholder="(555) 000-0000"
                    value={person.phone}
                    onChange={(e) => updateAccess(idx, "phone", e.target.value)}
                  />
                </Field>
                {idx >= 1 && (
                  <button
                    type="button"
                    onClick={() => removeAccess(idx)}
                    className="text-xs text-red-400 hover:text-red-600 transition mb-2.5"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addAccess}
              className="text-sm text-brand-blue hover:text-brand-navy font-medium transition flex items-center gap-1"
            >
              + Add Person
            </button>
          </div>
        </div>

        {/* ── MARKETING ── */}
        <div className="form-section">
          <SectionTitle>Marketing Information</SectionTitle>
          <div className="space-y-5">
            <Field label="How did you hear about us?" required>
              <Select
                value={form.marketing.howHeard}
                onChange={(e) => set("marketing.howHeard", e.target.value)}
                options={HOW_HEARD_OPTIONS}
                placeholder="— Select an option —"
              />
            </Field>

            {form.location.startsWith(JAMAICA_PREFIX) && (
              <>
                <Field label="What is your reason for storing?">
                  <Select
                    value={form.marketing.reasonForStoring}
                    onChange={(e) => set("marketing.reasonForStoring", e.target.value)}
                    options={REASON_OPTIONS}
                    placeholder="— Select an option —"
                  />
                </Field>
                <Field label="What made you choose our facility?">
                  <Select
                    value={form.marketing.whyChose}
                    onChange={(e) => set("marketing.whyChose", e.target.value)}
                    options={WHY_CHOSE_OPTIONS}
                    placeholder="— Select an option —"
                  />
                </Field>
                <Field label="What is being stored?">
                  <Select
                    value={form.marketing.whatStored}
                    onChange={(e) => set("marketing.whatStored", e.target.value)}
                    options={WHAT_STORED_OPTIONS}
                    placeholder="— Select an option —"
                  />
                </Field>
              </>
            )}
          </div>
        </div>

        {/* ── PAYMENT ── */}
        <div className="form-section">
          <SectionTitle>Payment Section</SectionTitle>
          <div className="space-y-5">
            <Field label="How will you pay today?" required>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {["Credit Card", "Cash"].map((method) => (
                  <label key={method} className="pill-option">
                    <input
                      type="radio"
                      name="paymentMethod"
                      className="hidden"
                      checked={form.payment.method === method}
                      onChange={() => set("payment.method", method)}
                    />
                    <span className={form.payment.method === method ? "font-semibold text-brand-blue" : ""}>
                      {method === "Credit Card" ? "💳 " : "💵 "}{method}
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Sign up for Autopayment?">
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {["Yes", "No"].map((opt) => (
                  <label key={opt} className="pill-option">
                    <input
                      type="radio"
                      name="autopay"
                      className="hidden"
                      checked={form.payment.autopay === opt}
                      onChange={() => set("payment.autopay", opt)}
                    />
                    <span className={form.payment.autopay === opt ? "font-semibold text-brand-blue" : ""}>
                      {opt}
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </div>

        {/* ── RENTAL START DATE ── */}
        <div className="form-section">
          <SectionTitle>Rental Start Date</SectionTitle>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Please select the date you would like to start your storage rental.
          </p>
          <Field label="Rental Start Date" required>
            <input
              className="input-base max-w-xs"
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </Field>
        </div>

        {/* ── ID UPLOAD ── */}
        <div className="form-section">
          <SectionTitle>Identification</SectionTitle>
          <p className="text-xs text-gray-500 -mt-2 mb-4">
            Both the front and back of your ID are required.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { side: "front", label: "Upload ID (Front)", stored: form.identification.frontName },
              { side: "back", label: "Upload ID (Back)", stored: form.identification.backName },
            ].map(({ side, label, stored }) => (
              <div key={side}>
                <label className="label-base">
                  {label} <span className="text-red-400">*</span>
                </label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl h-28 bg-gray-50 cursor-pointer hover:border-brand-navy hover:bg-brand-navy/5 transition">
                  {stored ? (
                    <div className="text-center px-3">
                      <div className="text-green-500 text-2xl mb-1">✓</div>
                      <p className="text-xs text-gray-600 truncate max-w-full">{stored}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-3xl mb-1 text-gray-300">🪪</div>
                      <p className="text-xs text-gray-400">Click to upload</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleIdUpload(e, side)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* ── SIGNATURE ── */}
        <div className="form-section">
          <SectionTitle>
            Signature <span className="text-red-400">*</span>
          </SectionTitle>
          <p className="text-xs text-gray-500 -mt-2 mb-4">
            By signing below, you confirm that the information provided on this
            intake form is accurate. A signature is required.
          </p>
          <SignaturePad onSave={(sig) => set("signature", sig)} />
        </div>

        {/* ── ERROR ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* ── SUBMIT ── */}
        <div className="form-section flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-xs text-gray-500 leading-relaxed sm:max-w-sm">
            By submitting, you confirm that the information provided on this intake form is accurate.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full sm:w-auto sm:min-w-[200px] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting…
              </>
            ) : (
              "SUBMIT INTAKE FORM →"
            )}
          </button>
        </div>

      </form>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-gray-400">
        Storage Plus Intake System &bull; All data transmitted securely &bull; No payment card data stored
      </footer>
    </div>
  );
}
