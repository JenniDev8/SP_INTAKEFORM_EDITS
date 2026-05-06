import { NextResponse } from "next/server";

const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ valid: false, reason: "missing" });
  }
  if (!GAS_URL) {
    return NextResponse.json({ valid: false, reason: "error" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `${GAS_URL}?action=validateToken&token=${encodeURIComponent(token)}`
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ valid: false, reason: "error" }, { status: 502 });
  }
}
