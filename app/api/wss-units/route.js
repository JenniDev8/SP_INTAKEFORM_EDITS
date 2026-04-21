// app/api/wss-units/route.js
// Next.js App Router API: proxies a "list available units/sizes" request to
// the WebSelfStorage location endpoint. The client sends only a location
// label; the server attaches the entity ID + API key from env vars.

import { NextResponse } from "next/server";
import { getWssCredentials, WSS_BASE_URL } from "@/lib/wssConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const location = searchParams.get("location") || "";

    const { entityId, apiKey } = getWssCredentials(location);

    const wssUrl = `${WSS_BASE_URL}/location/${entityId}`;
    const response = await fetch(wssUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    const rawText = await response.text();
    let body;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = { rawResponse: rawText };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "WebSelfStorage API error",
          status: response.status,
          details: body,
        },
        { status: response.status }
      );
    }

    // Flatten to what the form needs: sizes + insurance options only.
    const units =
      (body && body.location && Array.isArray(body.location.units) && body.location.units) ||
      [];
    const insuranceOptions =
      (body && body.location && Array.isArray(body.location.insuranceOptions) &&
        body.location.insuranceOptions) ||
      [];

    const sizes = [];
    const seen = new Set();
    for (const u of units) {
      if (!u) continue;
      const unitId = u.unitId || u.unitID;
      if (!unitId) continue;
      const length = u.length || 0;
      const width = u.width || 0;
      const height = u.height || 8;
      const monthly = u.monthly || u.monthlyRate || 0;
      const displaySize = u.unitSize || `${length}x${width}`;
      const dedupeKey = `${displaySize}|${monthly}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      sizes.push({
        unitId,
        displaySize,
        dimensions: `${length}' x ${width}' x ${height}'`,
        length,
        width,
        height,
        monthly,
        availableCount: u.vacantUnits || u.availableCount || 1,
      });
    }

    const insurance = insuranceOptions
      .filter((i) => i && i.insuranceId)
      .map((i) => ({
        insuranceId: i.insuranceId,
        description: i.description || "Insurance Coverage",
        monthlyRate: i.monthlyRate || 0,
        due: i.due || 0,
      }));

    return NextResponse.json({ sizes, insurance });
  } catch (err) {
    console.error("wss-units error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
