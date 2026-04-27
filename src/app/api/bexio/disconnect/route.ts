import { NextResponse } from "next/server";
import { disconnect } from "@/lib/bexio";

// Verbindung trennen — loescht die Singleton-Zeile. Beim naechsten "Verbinden"
// muss neu OAuth durchgespielt werden.
export async function POST() {
  await disconnect();
  return NextResponse.json({ success: true });
}
