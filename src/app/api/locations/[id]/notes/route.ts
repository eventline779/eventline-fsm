import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

interface Note {
  id: string;
  content: string;
  created_at: string;
}

function parseNotes(raw: string | null): Note[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  // Legacy: plain text notes → convert to single note
  return [{ id: crypto.randomUUID(), content: raw, created_at: new Date().toISOString() }];
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase.from("locations").select("notes").eq("id", id).single();
  return NextResponse.json({ notes: parseNotes(data?.notes) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { content } = await request.json();
  const supabase = createAdminClient();

  if (!content?.trim()) {
    return NextResponse.json({ success: false, error: "Notiz darf nicht leer sein" }, { status: 400 });
  }

  const { data } = await supabase.from("locations").select("notes").eq("id", id).single();
  const notes = parseNotes(data?.notes);
  notes.unshift({ id: crypto.randomUUID(), content: content.trim(), created_at: new Date().toISOString() });

  const { error } = await supabase.from("locations").update({ notes: JSON.stringify(notes) }).eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, notes });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { notes } = await request.json();
  const supabase = createAdminClient();
  // Legacy support: save plain text
  const { error } = await supabase.from("locations").update({ notes }).eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { noteId } = await request.json();
  const supabase = createAdminClient();

  const { data } = await supabase.from("locations").select("notes").eq("id", id).single();
  const notes = parseNotes(data?.notes).filter((n) => n.id !== noteId);

  const { error } = await supabase.from("locations").update({ notes: JSON.stringify(notes) }).eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, notes });
}
