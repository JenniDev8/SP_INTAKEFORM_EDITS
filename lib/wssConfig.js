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
// Next.js inlines env vars only when they appear as literal `process.env.FOO`.
// Dynamic access like `process.env[someVar]` is often undefined in production
// builds even when Vercel has the variables — so we map through this object.
const WSS_ENTITY = {
  WSS_ENTITY_LIC: process.env.WSS_ENTITY_LIC,
  WSS_ENTITY_GP: process.env.WSS_ENTITY_GP,
  WSS_ENTITY_NYC: process.env.WSS_ENTITY_NYC,
  WSS_ENTITY_LIB: process.env.WSS_ENTITY_LIB,
};

const WSS_API_KEY = {
  WSS_API_KEY_LIC: process.env.WSS_API_KEY_LIC,
  WSS_API_KEY_GP: process.env.WSS_API_KEY_GP,
  WSS_API_KEY_NYC: process.env.WSS_API_KEY_NYC,
  WSS_API_KEY_LIB: process.env.WSS_API_KEY_LIB,
};

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

  const entityId = WSS_ENTITY[match.envEntity];
  const apiKey = WSS_API_KEY[match.envApiKey];

  if (!entityId || !apiKey) {
    throw new Error(
      `WSS env vars missing for ${match.storefront}. In Vercel add ${match.envEntity} and ${match.envApiKey} (exact names), redeploy, and ensure they are enabled for Production (and Preview if you test preview URLs).`
    );
  }

  return { entityId, apiKey };
}

export const WSS_BASE_URL = "https://api.webselfstorage.com/v3";
