// RLS-Audit: listet pro Tabelle ob RLS aktiv ist + welche Policies existieren.
// Zweck: Luecken finden — Tabellen ohne RLS-Enable, oder mit zu offenen Policies.

import fs from "node:fs";

const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ACCESS = process.env.SUPABASE_ACCESS_TOKEN;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, await res.text());
    process.exit(1);
  }
  return res.json();
}

console.log("\n=== TABLES + RLS-STATUS ===");
const tables = await query(`
  select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname
`);
for (const t of tables) {
  console.log(`${t.rls_enabled ? "✓" : "✗"} ${t.table_name}${t.rls_enabled ? "" : "  ← RLS DISABLED"}`);
}

console.log("\n=== POLICIES ===");
const policies = await query(`
  select tablename, policyname, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public'
  order by tablename, cmd, policyname
`);
let curTable = null;
for (const p of policies) {
  if (p.tablename !== curTable) {
    console.log(`\n[${p.tablename}]`);
    curTable = p.tablename;
  }
  const usingPart = p.qual ? `USING ${p.qual.slice(0, 80)}${p.qual.length > 80 ? "…" : ""}` : "";
  const checkPart = p.with_check ? ` CHECK ${p.with_check.slice(0, 80)}${p.with_check.length > 80 ? "…" : ""}` : "";
  console.log(`  ${p.cmd}: ${p.policyname} — ${usingPart}${checkPart}`);
}

console.log("\n=== TABLES WITHOUT POLICIES ===");
const tablesWithoutPolicies = await query(`
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname
    )
  order by c.relname
`);
if (tablesWithoutPolicies.length === 0) {
  console.log("(keine — RLS-aktiv aber Policies fehlen waere ein Bug)");
} else {
  for (const t of tablesWithoutPolicies) {
    console.log(`✗ ${t.relname} — RLS enabled but NO policies — niemand kann zugreifen!`);
  }
}
