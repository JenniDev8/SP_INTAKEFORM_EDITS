// lib/cardValidation.js — client-side checks before WSS (format + Luhn + expiry).

/** Digits only, max length for major networks. */
export function cardDigitsOnly(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 19);
}

export function isAmexDigits(digits) {
  return /^3[47]/.test(digits);
}

/** Groups for display: Amex 4-6-5, otherwise 4-4-4-4… */
export function formatCardNumberGroups(digits) {
  const d = cardDigitsOnly(digits);
  if (!d) return "";
  if (isAmexDigits(d)) {
    const parts = [];
    if (d.length > 0) parts.push(d.slice(0, 4));
    if (d.length > 4) parts.push(d.slice(4, 10));
    if (d.length > 10) parts.push(d.slice(10, 15));
    return parts.join(" ");
  }
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/** Luhn check on digit string. */
export function luhnValid(digits) {
  const d = cardDigitsOnly(digits);
  if (d.length < 13) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = parseInt(d[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function isValidCardNumber(digits) {
  const d = cardDigitsOnly(digits);
  if (d.length < 13 || d.length > 19) return false;
  return luhnValid(d);
}

/** MM/YY or MMYY → { ok, message } */
export function validateExpiryMmYy(value) {
  const m = String(value || "").replace(/\D/g, "");
  if (m.length !== 4) {
    return { ok: false, message: "Enter expiration as MM/YY (4 digits)." };
  }
  const mm = parseInt(m.slice(0, 2), 10);
  const yy = parseInt(m.slice(2, 4), 10);
  if (mm < 1 || mm > 12) {
    return { ok: false, message: "Expiration month must be between 01 and 12." };
  }
  const now = new Date();
  const curYY = now.getFullYear() % 100;
  const curMM = now.getMonth() + 1;
  if (yy < curYY || (yy === curYY && mm < curMM)) {
    return { ok: false, message: "This card appears to be expired. Please check the expiration date." };
  }
  return { ok: true, message: "" };
}

export function validateCvv(cardDigits, csc) {
  const d = cardDigitsOnly(cardDigits);
  const c = String(csc || "").replace(/\D/g, "");
  const amex = d.length >= 2 && isAmexDigits(d);
  if (amex) {
    if (c.length !== 4) {
      return {
        ok: false,
        message:
          "American Express cards use a 4-digit security code (on the front of the card).",
      };
    }
  } else if (c.length !== 3) {
    return {
      ok: false,
      message:
        "Please enter the 3-digit CVV on the back of your card (4 digits for American Express).",
    };
  }
  return { ok: true, message: "" };
}

/** Format user typing as MM/YY */
export function formatExpInput(raw) {
  const d = String(raw || "").replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}
