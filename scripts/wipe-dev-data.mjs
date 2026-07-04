/**
 * DESTRUCTIVE — full data reset of the DEV Supabase project.
 *
 * Hard-deletes, in FK-safe order:
 *   efd_record_consignments -> efd_records -> consignments
 *   -> clients -> icds -> import_jobs
 * consignments children (stage_history, stuck_alerts, attachments, guta_pairs)
 * clear automatically via `on delete cascade`.
 *
 * Guarded to the DEV project id. Refuses to run against PROD.
 *
 * Usage:
 *   node scripts/wipe-dev-data.mjs           # prints counts, then asks to confirm
 *   node scripts/wipe-dev-data.mjs --yes     # skip the prompt (non-interactive)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const DEV_PROJECT_ID = "vmkhiahoytuqnjpcxwrb";

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[t.slice(0, eq).trim()] = v;
  }
  return env;
}

function confirm(question) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); res(a.trim()); });
  });
}

const env = loadEnv(".env.local");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local"); process.exit(1); }
if (!url.includes(DEV_PROJECT_ID)) { console.error(`REFUSING: target is not the DEV project (${DEV_PROJECT_ID}). URL=${url}`); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const ALL = "00000000-0000-0000-0000-000000000000";
const order = ["efd_record_consignments", "efd_records", "consignments", "clients", "icds", "import_jobs"];

async function count(tbl) {
  const { count } = await sb.from(tbl).select("*", { count: "exact", head: true });
  return count;
}

console.log(`Target: DEV (${url})\n=== BEFORE ===`);
for (const t of order) console.log(`  ${t}: ${await count(t)}`);

const yes = process.argv.includes("--yes");
if (!yes) {
  const answer = await confirm('\nType "WIPE" to hard-delete ALL of the above on DEV: ');
  if (answer !== "WIPE") { console.error("Aborted."); process.exit(1); }
}

console.log("\n=== DELETING ===");
for (const t of order) {
  const filterCol = t === "efd_record_consignments" ? "consignment_id" : "id";
  const { error } = await sb.from(t).delete().neq(filterCol, ALL);
  console.log(`  ${t}: ${error ? "ERR " + error.message : "cleared -> " + (await count(t))}`);
}

console.log("\n=== AFTER ===");
for (const t of order) console.log(`  ${t}: ${await count(t)}`);
for (const t of ["consignment_stage_history", "stuck_alerts", "consignment_attachments", "guta_pairs"]) {
  try { console.log(`  ${t} (cascade): ${await count(t)}`); } catch { /* may not exist */ }
}
console.log("\nDone.");
