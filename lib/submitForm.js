// lib/submitForm.js
// Sends form data to Google Apps Script Web App

const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL;

// Validate a one-time intake token against the Apps Script backend.
// Returns { valid, reason?, customerName?, customerEmail?, customerPhone? }.
// On any network or CORS issue we fail open (return { valid: true, unknown: true })
// because the server-side check on submit will still enforce the token.
export async function validateIntakeToken(token) {
  if (!GAS_URL) return { valid: false, reason: "config" };
  if (!token)   return { valid: false, reason: "missing" };
  try {
    const url = `${GAS_URL}?action=validateToken&token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    if (!res.ok) return { valid: true, unknown: true };
    const json = await res.json();
    return json;
  } catch (err) {
    return { valid: true, unknown: true };
  }
}

export async function submitIntakeForm(formData, options = {}) {
  if (!GAS_URL) {
    throw new Error(
      "NEXT_PUBLIC_GAS_URL is not set. Please add it to your .env.local file."
    );
  }

  // Build the payload — NO credit card numbers included
  const payload = {
    timestamp: new Date().toISOString(),
    location: formData.location,
    token: options.token || "",

    // Marketing
    howHeard: formData.marketing.howHeard,
    reasonForStoring: formData.marketing.reasonForStoring,
    whyChose: formData.marketing.whyChose,
    whatStored: formData.marketing.whatStored,

    // Customer
    contractType: formData.customer.contractType,
    firstName: formData.customer.firstName,
    lastName: formData.customer.lastName,
    mailingAddress: `${formData.customer.mailingAddress.address}${formData.customer.mailingAddress.aptSte ? " " + formData.customer.mailingAddress.aptSte : ""}`,
    city: formData.customer.mailingAddress.city,
    state: formData.customer.mailingAddress.state,
    zip: formData.customer.mailingAddress.zip,
    zipPlusFour: formData.customer.mailingAddress.plusFour,
    phones: JSON.stringify(formData.customer.phones),
    emails: JSON.stringify(formData.customer.emails),

    // Additional access
    additionalAccess: JSON.stringify(formData.additionalAccess),

    // Payment — method only, NO card numbers
    paymentMethod: formData.payment.method,
    autopay: formData.payment.autopay,

    // Storage start date
    storageStartDate: formData.startDate,

    // ID images (base64) — stored in Google Drive, not the Sheet
    idFront: formData.identification.frontImage,
    idBack: formData.identification.backImage,

    // Signature (base64) — stored in Google Drive
    signature: formData.signature,
  };

  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    mode: "no-cors", // GAS web apps require no-cors
  });

  // With no-cors we get an opaque response; treat as success if no throw
  return { success: true };
}
