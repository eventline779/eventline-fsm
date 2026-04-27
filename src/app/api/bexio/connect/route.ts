import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAuthorizeUrl } from "@/lib/bexio";

// Startet den OAuth-Flow: state generieren, in Cookie ablegen (httpOnly), dann
// per 302 zur Bexio-Authorize-URL weiterleiten. Der Callback prueft das
// state-Cookie und tauscht den Code gegen Tokens.
export async function GET(_request: NextRequest) {
  const state = randomBytes(32).toString("hex");
  const url = getAuthorizeUrl(state);

  const res = NextResponse.redirect(url, { status: 302 });
  res.cookies.set("bexio_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 Minuten — danach muss man's neu starten
  });
  return res;
}
