// app/api/wss-reservation/route.js
// Next.js App Router API: proxies the POST /v3/reservation/{entity} call.
// The client sends a location label + reservation payload (minus credentials);
// the server attaches entity + API key and forwards to WSS.

import { NextResponse } from "next/server";
import { getWssCredentials, WSS_BASE_URL } from "@/lib/wssConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const { location, reservation } = body || {};

    if (!reservation) {
      return NextResponse.json(
        { error: "Missing reservation payload." },
        { status: 400 }
      );
    }

    const { entityId, apiKey } = getWssCredentials(location);

    const wssUrl = `${WSS_BASE_URL}/reservation/${entityId}`;
    const response = await fetch(wssUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(reservation),
    });

    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { rawResponse: rawText };
    }

    if (!response.ok) {
      // Do NOT log CC data. Log status and a sanitized error only.
      console.error("WSS reservation error:", {
        status: response.status,
        details: data,
      });
      return NextResponse.json(
        {
          success: false,
          error: "WebSelfStorage API error",
          status: response.status,
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("wss-reservation route error:", err.message);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
