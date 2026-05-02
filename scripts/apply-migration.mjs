// Apply a single migration file to dev Supabase via Management API.
// Usage: node scripts/apply-migration.mjs supabase/migrations/039_xxx.sql

import fs from "node:fs";
import path from "node:path";

const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ACCESS = process.env.SUPABASE_ACCESS_TOKEN;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!ACCESS || !URL) {
  console.error("missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
const projectRef = URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  console.error("could not derive project ref from URL");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-migration.mjs <path>");
  process.exit(1);
}
const sql = fs.readFileSync(file, "utf8");
console.log(`applying ${path.basename(file)} (${sql.length} chars) to ${projectRef}`);

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${ACCESS}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log(`HTTP ${res.status}: ${text.slice(0, 500)}`);
if (!res.ok) process.exit(1);
