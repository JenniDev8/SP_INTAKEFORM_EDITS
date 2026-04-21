// lib/wssClient.js
// Browser-side helpers that talk to our Next.js API routes.
// The WSS API key is NEVER exposed here — the routes on the server attach it.

/**
 * Fetches the available unit sizes and insurance options for the given
 * location label (e.g. "Long Island City – 37-11 ..."). The server looks up
 * the WSS entity ID + API key based on that label.
 *
 * @returns {Promise<{ sizes: Array, insurance: Array }>}
 */
export async function fetchAvailableSizes(location) {
  const url = `/api/wss-units?location=${encodeURIComponent(location)}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) {
    let details = "";
    try {
      details = (await res.json()).error || "";
    } catch {}
    throw new Error(details || `Failed to load sizes (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Submits a new reservation to WSS via the server proxy.
 *
 * @param {string} location  Selected location label.
 * @param {object} reservation  Payload shaped as WSS /v3/reservation expects:
 *   { reservationDay, units: [{ unitID, insuranceID? }], paymentInfo: {...} }
 * @returns {Promise<{ success: boolean, data?: any, error?: string, details?: any }>}
 */
export async function submitWssReservation(location, reservation) {
  try {
    const res = await fetch("/api/wss-reservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, reservation }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      return {
        success: false,
        error: json.error || `HTTP ${res.status}`,
        details: json.details || json,
      };
    }
    return { success: true, data: json.data };
  } catch (err) {
    return { success: false, error: err.message || "Network error" };
  }
}

/**
 * Builds the WSS reservation payload from the intake form's state.
 * Returns null if the form is missing fields that make a reservation
 * impossible (no unit, no CC).
 */
export function buildReservationPayload(form) {
  const unitID = form.unitSelection?.unitId;
  if (!unitID) return null;

  const cc = form.creditCard || {};
  if (!cc.number || !cc.expMmYy || !cc.csc) return null;

  // Normalize expiration: accept "MM/YY", "MMYY", or "MM / YY" → "MMYY"
  const expirationMMYY = String(cc.expMmYy).replace(/\D/g, "").slice(0, 4);

  // Pick the address that acts as the billing address
  const billing = form.billingSameAsMailing
    ? {
        address1: (form.customer.mailingAddress.address || "").trim(),
        address2: (form.customer.mailingAddress.aptSte || "").trim(),
        city: form.customer.mailingAddress.city,
        state: form.customer.mailingAddress.state,
        zip: form.customer.mailingAddress.zip,
      }
    : {
        address1: (form.billingAddress.address || "").trim(),
        address2: (form.billingAddress.aptSte || "").trim(),
        city: form.billingAddress.city,
        state: form.billingAddress.state,
        zip: form.billingAddress.zip,
      };

  // Prefer the first phone/email entries
  const firstPhone = (form.customer.phones?.[0]?.number || "").trim();
  const firstEmail = (form.customer.emails?.[0]?.address || "").trim();

  // WSS wants an ISO timestamp
  const reservationDay = form.startDate
    ? new Date(form.startDate).toISOString()
    : new Date().toISOString();

  const unit = { unitID };
  const insuranceID = form.insuranceSelection?.insuranceId;
  if (insuranceID) unit.insuranceID = insuranceID;

  return {
    reservationDay,
    units: [unit],
    paymentInfo: {
      firstName: form.customer.firstName,
      lastName: form.customer.lastName,
      address1: billing.address1,
      address2: billing.address2,
      city: billing.city,
      state: billing.state,
      zip: billing.zip,
      phone: firstPhone,
      email: firstEmail,
      creditCard: String(cc.number).replace(/\s+/g, ""),
      expirationMMYY,
      csc: String(cc.csc),
    },
  };
}
