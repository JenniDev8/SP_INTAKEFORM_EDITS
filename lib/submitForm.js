// lib/submitForm.js
// Orchestrates the two submissions from the intake form:
//   1. WebSelfStorage (WSS) reservation — ONLY when payment method is Credit Card.
//      Sends billing/card data through our Next.js proxy → never touches Google.
//   2. Google Apps Script — ALWAYS runs, and is the durable record (IDs,
//      signature, PDF, notifications). CC data is NEVER included.
//
// Failure policy (confirmed with the user):
//   • Google always saves. If it fails, the user sees the error.
//   • WSS is best-effort. If it fails, Google still saves; the form's success
//     screen will warn the user to call the office to complete payment.

import { submitWssReservation, buildReservationPayload } from "@/lib/wssClient";

const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL;

function buildGooglePayload(formData) {
  // NOTE: explicitly excludes credit card fields and billing address.
  return {
    timestamp: new Date().toISOString(),
    location: formData.location,

    // Marketing
    howHeard: formData.marketing.howHeard,
    reasonForStoring: formData.marketing.reasonForStoring,
    whyChose: formData.marketing.whyChose,
    whatStored: formData.marketing.whatStored,

    // Customer
    contractType: formData.customer.contractType,
    businessName: formData.customer.businessName || "",
    firstName: formData.customer.firstName,
    lastName: formData.customer.lastName,
    mailingAddress: `${formData.customer.mailingAddress.address}${formData.customer.mailingAddress.aptSte ? " " + formData.customer.mailingAddress.aptSte : ""}`,
    city: formData.customer.mailingAddress.city,
    state: formData.customer.mailingAddress.state,
    zip: formData.customer.mailingAddress.zip,
    zipPlusFour: formData.customer.mailingAddress.plusFour,
    phones: JSON.stringify(formData.customer.phones),
    emails: JSON.stringify(formData.customer.emails),

    additionalAccess: JSON.stringify(formData.additionalAccess),

    // Payment — method only, NEVER card numbers
    paymentMethod: formData.payment.method,
    autopay: formData.payment.autopay,

    rentalStartDate: formData.startDate,

    // Selected unit size (WSS) — useful metadata for staff, no PII
    unitSize: formData.unitSelection?.displaySize || "",
    unitDimensions: formData.unitSelection?.dimensions || "",
    unitMonthlyRate: formData.unitSelection?.monthly || "",
    insuranceDescription: formData.insuranceSelection?.description || "",
    insuranceMonthlyRate: formData.insuranceSelection?.monthlyRate || "",

    // WSS reservation outcome (so staff can see which rows need manual entry)
    wssStatus: formData.wssStatus || "",
    wssError: formData.wssError || "",

    // ID images (base64) — stored in Drive, not the Sheet
    idFront: formData.identification.frontImage,
    idBack: formData.identification.backImage,

    // Signature (base64) — stored in Drive
    signature: formData.signature,
  };
}

async function postToGoogle(payload) {
  if (!GAS_URL) {
    throw new Error(
      "NEXT_PUBLIC_GAS_URL is not set. Please add it to your .env.local file."
    );
  }
  await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    mode: "no-cors",
  });
  // no-cors yields an opaque response; treat a non-throw as success
  return { success: true };
}

/**
 * Submit the intake form. If payment method is "Credit Card", also submits a
 * reservation to WSS (cash customers skip WSS entirely).
 *
 * Returns: { googleOk: boolean, wssOk: boolean|null, wssError?: string }
 *   wssOk is null when the WSS call was intentionally skipped (cash).
 */
export async function submitIntakeForm(formData) {
  const isCard = formData.payment?.method === "Credit Card";

  let wssOk = null;
  let wssError = "";
  let wssStatus = "skipped";

  if (isCard) {
    const reservation = buildReservationPayload(formData);
    if (!reservation) {
      // Should be caught by form validation, but guard anyway
      wssOk = false;
      wssError = "Missing unit, card, or billing info.";
      wssStatus = "failed";
    } else {
      const result = await submitWssReservation(formData.location, reservation);
      wssOk = !!result.success;
      if (!result.success) {
        wssError = result.error || "WSS reservation failed";
        wssStatus = "failed";
      } else {
        wssStatus = "reserved";
      }
    }
  }

  // Always save to Google. Include the WSS outcome as metadata so staff know
  // which rows need manual follow-up.
  const googlePayload = buildGooglePayload({
    ...formData,
    wssStatus,
    wssError,
  });

  try {
    await postToGoogle(googlePayload);
    return { googleOk: true, wssOk, wssError: wssError || undefined };
  } catch (err) {
    // Re-throw so the form can show the error — Google is the system of record
    throw err;
  }
}
