import { NextResponse } from "next/server";
import { getConnection } from "@/lib/bexio";

// Status fuer das Frontend: Ist Bexio verbunden? Wer hat es verbunden, wann?
// Token selbst NIE rausgeben — nur Metadaten.
export async function GET() {
  const conn = await getConnection();
  if (!conn) {
    return NextResponse.json({ connected: false });
  }
  return NextResponse.json({
    connected: true,
    connectedAt: conn.connected_at,
    bexioEmail: conn.bexio_user_email,
    expiresAt: conn.expires_at,
  });
}
