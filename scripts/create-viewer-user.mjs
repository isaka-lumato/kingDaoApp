// One-off: create a viewer test account in the linked dev project.
// Uses the same admin.createUser API the inviteUserAction server action uses.
// Reads SUPABASE_URL + SUPABASE_SECRET_KEY from .env.local.
//
// Usage: node scripts/create-viewer-user.mjs
//
// Idempotent: if the user already exists, just (re)assigns the viewer role.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const text = readFileSync(path, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const VIEWER_ROLE_ID = "a877a670-34c1-49e3-baaf-bb8e74c73259";
const EMAIL = "viewer@kingdao.co.tz";
const PASSWORD = "ViewerTest2026!";

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Target project: ${SUPABASE_URL}`);
  console.log(`Creating user: ${EMAIL}`);

  let userId;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  if (createErr) {
    const msg = createErr.message.toLowerCase();
    if (msg.includes("already been registered") || msg.includes("already exists")) {
      console.log("User already exists — looking up existing ID.");
      const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
        perPage: 500,
      });
      if (listErr) throw listErr;
      const existing = listData.users.find(
        (u) => (u.email ?? "").toLowerCase() === EMAIL.toLowerCase(),
      );
      if (!existing) throw new Error("Reportedly exists but not found in listUsers.");
      userId = existing.id;
    } else {
      throw createErr;
    }
  } else {
    userId = created.user?.id;
    if (!userId) throw new Error("createUser succeeded but no user id returned.");
    console.log(`Created user with id: ${userId}`);
  }

  console.log(`Assigning viewer role (${VIEWER_ROLE_ID})...`);
  const { error: roleErr } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: VIEWER_ROLE_ID });

  if (roleErr) {
    if (roleErr.code === "23505") {
      console.log("Viewer role already assigned — nothing to do.");
    } else {
      throw roleErr;
    }
  } else {
    console.log("Viewer role assigned.");
  }

  console.log("\n--- Done ---");
  console.log(`Email:    ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`User ID:  ${userId}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
