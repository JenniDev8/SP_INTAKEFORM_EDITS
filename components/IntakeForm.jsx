"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "./SignaturePad";
import LanguageSwitcher from "./LanguageSwitcher";
import { submitIntakeForm } from "@/lib/submitForm";
import { fetchAvailableSizes } from "@/lib/wssClient";
import {
  cardDigitsOnly,
  formatCardNumberGroups,
  formatExpInput,
  isValidCardNumber,
  validateCvv,
  validateExpiryMmYy,
} from "@/lib/cardValidation";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCATIONS = [
  "Long Island City",
  "Greenpoint",
  "Williamsburg",
  "Jamaica",
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

const CONTRACT_TYPES = ["Individual", "Business"];

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
  // Unit size picked by the customer; staff assigns the physical unit later.
  // unitId is the UUID sent to WSS; the rest is display metadata.
  unitSelection: {
    unitId: "",
    displaySize: "",
    dimensions: "",
    monthly: 0,
  },
  // Optional WSS insurance coverage. Empty insuranceId = no coverage selected.
  insuranceSelection: {
    insuranceId: "",
    description: "",
    monthlyRate: 0,
  },
  payment: { method: "", autopay: "" },
  billingSameAsMailing: true,
  billingAddress: { address: "", aptSte: "", city: "", state: "", zip: "" },
  // Credit card is sent to WSS ONLY. It is never sent to Google.
  creditCard: { number: "", expMmYy: "", csc: "" },
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

function Select({ value, onChange, options, placeholder, className = "", notranslate = false, required = false }) {
  return (
    <select
      value={value}
      onChange={onChange}
      required={required}
      className={`input-base ${className}`}
      translate={notranslate ? "no" : undefined}
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

// ─── UnitSizeDropdown ────────────────────────────────────────────────────────
// Custom-styled dropdown that preserves size + dimensions + monthly rate for
// both the closed selector and each open option. Closes on outside click /
// Escape.
function UnitSizeDropdown({ sizes, value, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = sizes.find((s) => s.unitId === value) || null;

  return (
    <div ref={ref} className="relative" translate="no">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full text-left bg-white border rounded-xl px-4 py-3.5 transition flex items-center justify-between gap-3 ${
          open
            ? "border-brand-navy ring-2 ring-brand-navy/20"
            : "border-gray-200 hover:border-brand-navy/50"
        }`}
      >
        <div className="flex-1 min-w-0">
          {selected ? (
            <div className="font-display font-semibold text-brand-navy text-base truncate">
              {selected.displaySize}
            </div>
          ) : (
            <span className="text-gray-400">Select a unit size</span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-80 overflow-y-auto"
        >
          {sizes.map((s) => {
            const isSelected = s.unitId === value;
            return (
              <button
                key={s.unitId}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onSelect(s);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 transition ${
                  isSelected ? "bg-brand-navy/5" : "hover:bg-gray-50"
                }`}
              >
                <div className="font-display font-semibold text-brand-navy text-base flex items-center gap-2">
                  <span>{s.displaySize}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IntakeForm() {
  const router = useRouter();

  const [form, setForm] = useState(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitWarning, setSubmitWarning] = useState(null);
  const [error, setError] = useState(null);

  // Unit sizes loaded from WSS whenever the location changes
  const [availableSizes, setAvailableSizes] = useState([]);
  const [sizesLoading, setSizesLoading] = useState(false);
  const [sizesError, setSizesError] = useState(null);
  /** false = masked while typing (password field); true = formatted number visible */
  const [showCardNumber, setShowCardNumber] = useState(false);

  useEffect(() => {
    if (!form.location) {
      setAvailableSizes([]);
      return;
    }
    let cancelled = false;
    setSizesLoading(true);
    setSizesError(null);
    fetchAvailableSizes(form.location)
      .then(({ sizes }) => {
        if (cancelled) return;
        setAvailableSizes(sizes || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailableSizes([]);
        setSizesError(err.message || "Could not load available sizes.");
      })
      .finally(() => {
        if (!cancelled) setSizesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.location]);

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
    setSubmitWarning(null);

    // Required fields that aren't covered by native HTML validation
    const missing = [];
    if (!form.customer.contractType) missing.push("Account Type");
    if (form.customer.contractType === "Business" && !form.customer.businessName.trim()) {
      missing.push("Business Name");
    }
    if (!form.customer.firstName.trim()) missing.push("First Name");
    if (!form.customer.lastName.trim()) missing.push("Last Name");
    if (!form.customer.mailingAddress.address.trim()) missing.push("Street Address");
    if (!form.customer.mailingAddress.city.trim()) missing.push("City");
    if (!form.customer.mailingAddress.state) missing.push("State");
    if (!form.customer.mailingAddress.zip.trim()) missing.push("ZIP Code");
    if (!form.customer.phones[0]?.number?.trim()) missing.push("Phone Number");
    if (!form.customer.emails[0]?.address?.trim()) missing.push("Email Address");
    if (!form.startDate) missing.push("Rental Start Date");
    if (!form.marketing.howHeard) missing.push('"How did you hear about us?"');
    if (!form.unitSelection.unitId) missing.push("Unit Size");
    if (!form.payment.method) missing.push("Payment Method");
    if (!form.payment.autopay) missing.push("Sign up for Autopayment (Yes/No)");

    // Credit-card path: require card fields + billing address
    if (form.payment.method === "Credit Card") {
      const cc = form.creditCard;
      if (!cardDigitsOnly(cc.number)) missing.push("Credit Card Number");
      if (!cc.expMmYy.trim()) missing.push("Card Expiration");
      if (!cc.csc.trim()) missing.push("Card CVV");

      if (!form.billingSameAsMailing) {
        const b = form.billingAddress;
        if (!b.address.trim()) missing.push("Billing Address");
        if (!b.city.trim()) missing.push("Billing City");
        if (!b.state.trim()) missing.push("Billing State");
        if (!b.zip.trim()) missing.push("Billing ZIP");
      }
    }

    if (!form.identification.frontImage) missing.push("ID Front photo");
    if (!form.identification.backImage) missing.push("ID Back photo");
    if (!form.signature) missing.push("Signature");

    if (missing.length > 0) {
      setError("Please complete the following before submitting: " + missing.join(", ") + ".");
      return;
    }

    if (form.payment.method === "Credit Card") {
      const digits = cardDigitsOnly(form.creditCard.number);
      if (!isValidCardNumber(digits)) {
        setError(
          "Please re-enter your card number carefully. It may be mistyped or incomplete (we check the number before sending it)."
        );
        return;
      }
      const expCheck = validateExpiryMmYy(form.creditCard.expMmYy);
      if (!expCheck.ok) {
        setError(expCheck.message);
        return;
      }
      const cvvCheck = validateCvv(digits, form.creditCard.csc);
      if (!cvvCheck.ok) {
        setError(cvvCheck.message);
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await submitIntakeForm(form);
      // Google saved. If the customer paid by card and WSS failed, warn them.
      if (form.payment.method === "Credit Card" && result.wssOk === false) {
        setSubmitWarning(
          "Your intake was saved, but we couldn't complete the online reservation. Please call the office to finalize payment — our team has your information."
        );
      }
      setSubmitted(true);
      // Reset after 6 seconds (a bit longer when there's a warning to read)
      setTimeout(() => {
        router.push("/");
      }, 6000);
    } catch (err) {
      setError(err.message || "Submission failed. Please try again.");
      setSubmitting(false);
    }
  };

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
          <p className="text-gray-600 text-sm leading-relaxed mb-4 sm:mb-6">
            The intake form for{" "}
            <strong className="text-brand-navy">{form.customer.firstName} {form.customer.lastName}</strong>{" "}
            has been received and saved.
          </p>

          {submitWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900 leading-relaxed text-left mb-6">
              ⚠️ {submitWarning}
            </div>
          )}

          <p className="text-gray-500 text-xs mb-6 sm:mb-8">
            Returning to the welcome screen…
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
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <span className="hidden sm:inline text-brand-navy text-xs font-semibold uppercase tracking-widest">
              Intake Form
            </span>
          </div>
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
              required
              notranslate
            />
          </Field>
        </div>

        {/* ── UNIT SIZE ── */}
        {form.location && (
          <div className="form-section">
            <SectionTitle>Unit Size</SectionTitle>
            <p className="text-xs text-gray-500 -mt-2 mb-4 leading-relaxed">
              Choose the size you'd like to reserve.
            </p>

            {sizesLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-brand-navy/20 border-t-brand-navy rounded-full animate-spin" />
                Loading available sizes…
              </div>
            )}

            {!sizesLoading && sizesError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                ⚠️ {sizesError}
              </div>
            )}

            {!sizesLoading && !sizesError && availableSizes.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                No sizes are currently available for this location. Please
                contact the office.
              </div>
            )}

            {!sizesLoading && availableSizes.length > 0 && (
              <UnitSizeDropdown
                sizes={availableSizes}
                value={form.unitSelection.unitId}
                onSelect={(s) =>
                  set("unitSelection", {
                    unitId: s.unitId,
                    displaySize: s.displaySize,
                    dimensions: s.dimensions,
                    monthly: s.monthly,
                  })
                }
              />
            )}
          </div>
        )}

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
                required
              />
            </Field>
            {form.customer.contractType === "Business" && (
              <Field label="Business Name" required>
                <input
                  className="input-base"
                  placeholder="e.g. Acme Corp"
                  required
                  translate="no"
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
                  required
                  autoComplete="given-name"
                  translate="no"
                  value={form.customer.firstName}
                  onChange={(e) => set("customer.firstName", e.target.value)}
                />
              </Field>
              <Field label="Last Name" required half>
                <input
                  className="input-base"
                  placeholder="Last name"
                  required
                  autoComplete="family-name"
                  translate="no"
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
                  required
                  autoComplete="street-address"
                  translate="no"
                  value={form.customer.mailingAddress.address}
                  onChange={(e) => set("customer.mailingAddress.address", e.target.value)}
                />
              </Field>
              <Field label="Apt / Ste / Other" half>
                <input
                  className="input-base"
                  placeholder="Apt 2B"
                  autoComplete="address-line2"
                  translate="no"
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
                  required
                  autoComplete="address-level2"
                  translate="no"
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
                  required
                  notranslate
                />
              </Field>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Field label="ZIP Code" required half>
                <input
                  className="input-base"
                  placeholder="10001"
                  inputMode="numeric"
                  maxLength={5}
                  required
                  autoComplete="postal-code"
                  value={form.customer.mailingAddress.zip}
                  onChange={(e) => set("customer.mailingAddress.zip", e.target.value)}
                />
              </Field>
              <Field label="ZIP +4" half>
                <input
                  className="input-base"
                  placeholder="1234"
                  inputMode="numeric"
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
                      type="tel"
                      inputMode="tel"
                      autoComplete={idx === 0 ? "tel" : "off"}
                      placeholder="(555) 000-0000"
                      required={idx === 0}
                      value={phone.number}
                      onChange={(e) => updatePhone(idx, "number", e.target.value)}
                    />
                  </Field>
                  <Field label="Ext (opt.)" half>
                    <input
                      className="input-base"
                      inputMode="numeric"
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
            Individuals permitted to access the account, make changes (i.e.,
            transfer, vacate, remove locks), and be contacted in emergencies.
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
                required
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
          <SectionTitle>Payment</SectionTitle>
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

            {form.payment.method === "Cash" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900 leading-relaxed">
                <strong>Please note:</strong> To secure and hold your reservation, a credit card is required. If you continue without entering one, your information will be saved and our team will contact you to finalize payment.
              </div>
            )}

            <Field label="Sign up for Autopayment?" required>
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

            {/* Credit card + billing — only when customer pays by card */}
            {form.payment.method === "Credit Card" && (
              <div className="space-y-5 pt-2 border-t border-gray-100">
                <div>
                  <h3 className="text-sm font-semibold text-brand-navy uppercase tracking-wider mb-3">
                    Billing Address
                  </h3>
                  <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.billingSameAsMailing}
                      onChange={(e) => set("billingSameAsMailing", e.target.checked)}
                      className="w-4 h-4 accent-brand-navy"
                    />
                    <span className="text-sm text-gray-700">
                      Same as mailing address
                    </span>
                  </label>

                  {!form.billingSameAsMailing && (
                    <div className="space-y-3">
                      <div className="flex gap-3 flex-wrap">
                        <Field label="Street Address" required half>
                          <input
                            className="input-base"
                            placeholder="123 Main St"
                            required
                            autoComplete="billing street-address"
                            translate="no"
                            value={form.billingAddress.address}
                            onChange={(e) => set("billingAddress.address", e.target.value)}
                          />
                        </Field>
                        <Field label="Apt / Ste / Other" half>
                          <input
                            className="input-base"
                            placeholder="Apt 2B"
                            autoComplete="billing address-line2"
                            translate="no"
                            value={form.billingAddress.aptSte}
                            onChange={(e) => set("billingAddress.aptSte", e.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        <Field label="City" required half>
                          <input
                            className="input-base"
                            placeholder="City"
                            required
                            autoComplete="billing address-level2"
                            translate="no"
                            value={form.billingAddress.city}
                            onChange={(e) => set("billingAddress.city", e.target.value)}
                          />
                        </Field>
                        <Field label="State" required half>
                          <Select
                            value={form.billingAddress.state}
                            onChange={(e) => set("billingAddress.state", e.target.value)}
                            options={US_STATES}
                            placeholder="State"
                            required
                            notranslate
                          />
                        </Field>
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        <Field label="ZIP Code" required half>
                          <input
                            className="input-base"
                            placeholder="10001"
                            inputMode="numeric"
                            maxLength={5}
                            required
                            autoComplete="billing postal-code"
                            value={form.billingAddress.zip}
                            onChange={(e) => set("billingAddress.zip", e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-brand-navy uppercase tracking-wider mb-3">
                    Card Information
                  </h3>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                    Your card details are sent securely and are never stored in our records.
                  </p>
                  <div className="space-y-3">
                    <Field label="Card Number" required>
                      <div className="relative">
                        <input
                          className="input-base pr-12 font-mono tabular-nums"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          placeholder="1234 5678 9012 3456"
                          required
                          type={showCardNumber ? "text" : "password"}
                          maxLength={showCardNumber ? 24 : 19}
                          value={
                            showCardNumber
                              ? formatCardNumberGroups(form.creditCard.number)
                              : cardDigitsOnly(form.creditCard.number)
                          }
                          onChange={(e) =>
                            set("creditCard.number", cardDigitsOnly(e.target.value))
                          }
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-gray-100 transition"
                          aria-label={showCardNumber ? "Hide card number" : "Show card number"}
                          onClick={() => setShowCardNumber((v) => !v)}
                        >
                          {showCardNumber ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5">
                        Hidden while typing (dots). Use the eye icon to check what you entered.
                      </p>
                    </Field>
                    <div className="flex gap-3 flex-wrap">
                      <Field label="Expiration (MM/YY)" required half>
                        <input
                          className="input-base font-mono tabular-nums"
                          inputMode="numeric"
                          autoComplete="cc-exp"
                          placeholder="MM/YY"
                          maxLength={5}
                          required
                          value={form.creditCard.expMmYy}
                          onChange={(e) =>
                            set("creditCard.expMmYy", formatExpInput(e.target.value))
                          }
                        />
                      </Field>
                      <Field label="CVV" required half>
                        <input
                          className="input-base"
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          placeholder="123"
                          maxLength={4}
                          required
                          value={form.creditCard.csc}
                          onChange={(e) => set("creditCard.csc", e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
              required
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </Field>
        </div>

        {/* ── ID UPLOAD ── */}
        <div className="form-section">
          <SectionTitle>Identification</SectionTitle>
          <p className="text-xs text-gray-500 -mt-2 mb-4">
            Both the front and back of a valid ID are required.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { side: "front", label: "Upload Valid ID (Front)", stored: form.identification.frontName },
              { side: "back", label: "Upload Valid ID (Back)", stored: form.identification.backName },
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
        Storage Plus Intake System &bull; All data transmitted securely
      </footer>
    </div>
  );
}
