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

const WSS_LOCATION_CONFIG = [
  {
    match: "long island city",
    envEntity: "WSS_ENTITY_LIC",
    envApiKey: "WSS_API_KEY_LIC",
  },
  {
    match: "greenpoint",
    envEntity: "WSS_ENTITY_GP",
    envApiKey: "WSS_API_KEY_GP",
  },
  {
    match: "williamsburg",
    envEntity: "WSS_ENTITY_NYC",
    envApiKey: "WSS_API_KEY_NYC",
  },
  {
    match: "jamaica",
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

  const entityId = process.env[match.envEntity];
  const apiKey = process.env[match.envApiKey];

  if (!entityId || !apiKey) {
    throw new Error(
      `WSS env vars missing for this location. Set ${match.envEntity} and ${match.envApiKey}.`
    );
  }

  return { entityId, apiKey };
}

export const WSS_BASE_URL = "https://api.webselfstorage.com/v3";
