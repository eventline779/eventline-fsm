import { NextResponse } from "next/server";
import { disconnect } from "@/lib/bexio";
import { requireAdmin } from "@/lib/api-auth";

// Verbindung trennen — loescht die Singleton-Zeile. Beim naechsten "Verbinden"
// muss neu OAuth durchgespielt werden.
//
// requireAdmin: das Trennen kappt die Bexio-Integration der ganzen Firma —
// soll nur ein Admin koennen, nicht jeder authentifizierte User.
export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  await disconnect();
  return NextResponse.json({ success: true });
}
