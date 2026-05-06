// lib/wssConfig.js
// Server-side only. Maps a customer-facing location string to the matching
// WSS (WebSelfStorage) entity ID and API key.
//
// Location strings come straight from the form's LOCATIONS constant, e.g.
//   "Long Island City – 37-11 47th Avenue, Long Island City, NY 11101 · (718) 658-5200"
// We match case-insensitively against the start of that string.
//
// IMPORTANT: This module must only be imported from Next.js API routes
// (app/api/**). It reads process.env.WSS_* which are NOT public.
//
// Read credentials with literal `process.env.NAME` per location (Next-friendly).
// `.trim()` avoids failures when Vercel values were pasted with a trailing newline.
function getEntityAndKeyForMatch(match) {
  switch (match.envEntity) {
    case "WSS_ENTITY_LIC":
      return {
        entityId: process.env.WSS_ENTITY_LIC?.trim(),
        apiKey: process.env.WSS_API_KEY_LIC?.trim(),
      };
    case "WSS_ENTITY_GP":
      return {
        entityId: process.env.WSS_ENTITY_GP?.trim(),
        apiKey: process.env.WSS_API_KEY_GP?.trim(),
      };
    case "WSS_ENTITY_NYC":
      return {
        entityId: process.env.WSS_ENTITY_NYC?.trim(),
        apiKey: process.env.WSS_API_KEY_NYC?.trim(),
      };
    case "WSS_ENTITY_LIB":
      return {
        entityId: process.env.WSS_ENTITY_LIB?.trim(),
        apiKey: process.env.WSS_API_KEY_LIB?.trim(),
      };
    default:
      return { entityId: undefined, apiKey: undefined };
  }
}

// Each row: form location prefix → Vercel env names (must match exactly).
// Note: Williamsburg uses *_NYC_* — that is intentional in WebSelfStorage; not “all of NYC”.
const WSS_LOCATION_CONFIG = [
  {
    match: "long island city",
    storefront: "Long Island City",
    envEntity: "WSS_ENTITY_LIC",
    envApiKey: "WSS_API_KEY_LIC",
  },
  {
    match: "greenpoint",
    storefront: "Greenpoint",
    envEntity: "WSS_ENTITY_GP",
    envApiKey: "WSS_API_KEY_GP",
  },
  {
    match: "williamsburg",
    storefront: "Williamsburg",
    envEntity: "WSS_ENTITY_NYC",
    envApiKey: "WSS_API_KEY_NYC",
  },
  {
    match: "jamaica",
    storefront: "Jamaica",
    envEntity: "WSS_ENTITY_LIB",
    envApiKey: "WSS_API_KEY_LIB",
  },
];

export function getWssCredentials(location) {
  const normalized = String(location || "").trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing location. Cannot resolve WSS credentials.");
  }

  const match = WSS_LOCATION_CONFIG.find((c) => normalized.startsWith(c.match));
  if (!match) {
    throw new Error(
      `No WSS credentials configured for location "${location}".`
    );
  }

  const { entityId, apiKey } = getEntityAndKeyForMatch(match);

  if (!entityId || !apiKey) {
    const missing = [];
    if (!entityId) missing.push(`${match.envEntity} (missing or blank)`);
    if (!apiKey) missing.push(`${match.envApiKey} (missing or blank)`);
    throw new Error(
      `${match.storefront}: ${missing.join("; ")}. In Vercel → Settings → Environment Variables, paste the WebSelfStorage entity UUID and API key again (no extra spaces), enable Production, then Deployments → Redeploy (do not rely on an old build).`
    );
  }

  return { entityId, apiKey };
}

export const WSS_BASE_URL = "https://api.webselfstorage.com/v3";
