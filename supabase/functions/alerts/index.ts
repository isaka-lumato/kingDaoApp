// T-053 alerts edge function (Supabase Functions, Deno runtime).
//
// Run every 30 min via Supabase Cron. For each consignment × stage that has
// just entered the v_stuck_stages view, send a digest email to every admin.
//
// Contracts:
//   - The function is invoked with the header `Authorization: Bearer <ALERTS_CRON_SECRET>`.
//     Any other request is rejected with 401 so the URL itself is not load-bearing.
//   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the Functions
//     runtime automatically — no need to set them as secrets.
//   - RESEND_API_KEY, ALERTS_FROM, and ALERTS_CRON_SECRET are set with
//     `supabase secrets set ...` (see humanTasks.md H-010 / T-053b).
//
// Behavior:
//   1. reset_resolved_stuck_alerts()  → clear ledger rows whose (cid, stage)
//      has exited Action since the last run.
//   2. claim_new_stuck_alerts()       → atomically insert+return the rows that
//      are currently stuck AND newly alerted.
//   3. If nothing was claimed → 200 with `{ sent: 0, claimed: 0 }`. No email.
//   4. Otherwise resolve every admin's email via auth.admin.listUsers + the
//      `admin` role from public.user_roles + public.roles.
//   5. POST one digest email per admin to https://api.resend.com/emails.
//   6. Return `{ sent, claimed, admins, errors }` JSON for the cron logs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

type StuckRow = {
  consignment_id: string;
  ref_no: string;
  year: number;
  client_name: string;
  vessel_name: string | null;
  stage: string;
  stuck_value: string;
  stuck_since: string;
  hours_stuck: number;
};

const STAGE_LABELS: Record<string, string> = {
  manifest: "Manifest",
  shipping_batch: "Shipping Batch",
  tanesws: "TANESWS",
  assessment: "Assessment",
  tbs_loading: "TBS Loading",
  tbs_debit: "TBS Debit",
  manifest_comp: "Manifest Comp",
  duty: "Duty",
  inspection_file: "Inspection File",
  release: "Release",
};

function stageLabel(s: string): string {
  return STAGE_LABELS[s] ?? s;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDigestHtml(rows: StuckRow[], appUrl: string): string {
  const items = rows
    .map((r) => {
      const link = `${appUrl}/consignments/${r.consignment_id}`;
      const hours = Math.floor(r.hours_stuck);
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;font-family:monospace">
            <a href="${link}" style="color:#1db89a;text-decoration:none">${htmlEscape(r.ref_no)}</a>
            <span style="color:#888;font-size:11px"> · ${r.year}</span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #eee">${htmlEscape(r.client_name)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;color:#c0392b;font-weight:600">
            ${htmlEscape(stageLabel(r.stage))}
          </td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-family:monospace;text-align:right">${hours}h</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,system-ui,sans-serif;color:#222;max-width:640px;margin:24px auto">
  <h2 style="color:#c0392b;margin:0 0 8px 0">${rows.length} consignment${rows.length === 1 ? "" : "s"} newly stuck (> 48h)</h2>
  <p style="color:#666;font-size:13px;margin:0 0 16px 0">
    The following pipeline stages have been in Action for more than 48 hours.
    Open the dashboard for the full list.
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead>
      <tr style="background:#f7f7f7">
        <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#666">REF</th>
        <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#666">Client</th>
        <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#666">Stuck stage</th>
        <th style="padding:8px;text-align:right;font-size:11px;text-transform:uppercase;color:#666">Hours</th>
      </tr>
    </thead>
    <tbody>${items}</tbody>
  </table>
  <p style="margin:20px 0 0 0;font-size:12px;color:#888">
    <a href="${appUrl}/dashboard" style="color:#1db89a">Open dashboard</a>
    · This alert is sent every 30 min when new jobs cross the 48-hour threshold.
  </p>
</body></html>`;
}

function renderDigestText(rows: StuckRow[], appUrl: string): string {
  const lines = rows.map((r) => {
    const hours = Math.floor(r.hours_stuck);
    return `  ${r.ref_no} (${r.year}) · ${r.client_name} · ${stageLabel(r.stage)} · ${hours}h
    ${appUrl}/consignments/${r.consignment_id}`;
  });
  return `${rows.length} consignment${rows.length === 1 ? "" : "s"} newly stuck (> 48h):

${lines.join("\n\n")}

Open dashboard: ${appUrl}/dashboard
`;
}

type SendResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    return { ok: false, status: res.status, error: body.slice(0, 500) };
  }
  const json = (await res.json()) as { id?: string };
  return { ok: true, id: json.id ?? "" };
}

// deno-lint-ignore no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request) => {
  // ── Auth gate ──────────────────────────────────────────────────────────
  const cronSecret = Deno.env.get("ALERTS_CRON_SECRET");
  const auth = req.headers.get("Authorization") ?? "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const alertsFrom = Deno.env.get("ALERTS_FROM");
  const appUrl = Deno.env.get("APP_URL") ?? "https://example.com";

  if (!resendKey || !alertsFrom) {
    return new Response(
      JSON.stringify({
        error: "RESEND_API_KEY and ALERTS_FROM must be set",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ── 1. Reset resolved ledger rows ──────────────────────────────────────
  const { data: resetData, error: resetErr } = await supabase.rpc(
    "reset_resolved_stuck_alerts",
  );
  if (resetErr) {
    return new Response(
      JSON.stringify({ error: "reset failed", detail: resetErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 2. Claim new stuck rows ────────────────────────────────────────────
  const { data: claimed, error: claimErr } = await supabase.rpc(
    "claim_new_stuck_alerts",
  );
  if (claimErr) {
    return new Response(
      JSON.stringify({ error: "claim failed", detail: claimErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const rows = (claimed ?? []) as StuckRow[];
  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, claimed: 0, reset: resetData ?? 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 3. Resolve admin emails ────────────────────────────────────────────
  // Get user_ids assigned to a role named 'admin'.
  const { data: adminRows, error: adminErr } = await supabase
    .from("user_roles")
    .select("user_id, roles!inner(name)")
    .eq("roles.name", "admin");
  if (adminErr) {
    return new Response(
      JSON.stringify({ error: "admin lookup failed", detail: adminErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const adminUserIds = (adminRows ?? []).map((r) => r.user_id as string);

  // Resolve their emails via the Auth Admin API.
  const adminEmails: string[] = [];
  for (const userId of adminUserIds) {
    const { data: u, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !u?.user?.email) continue;
    adminEmails.push(u.user.email);
  }

  if (adminEmails.length === 0) {
    return new Response(
      JSON.stringify({
        sent: 0,
        claimed: rows.length,
        reset: resetData ?? 0,
        warning: "No admin recipients",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 4. Send digest to each admin ───────────────────────────────────────
  const subject = `[KDL] ${rows.length} consignment${rows.length === 1 ? "" : "s"} newly stuck`;
  const html = renderDigestHtml(rows, appUrl);
  const text = renderDigestText(rows, appUrl);

  const errors: { to: string; status?: number; error: string }[] = [];
  let sent = 0;
  for (const to of adminEmails) {
    const result = await sendViaResend(resendKey, alertsFrom, to, subject, html, text);
    if (result.ok) {
      sent++;
    } else {
      errors.push({ to, status: result.status, error: result.error });
    }
  }

  return new Response(
    JSON.stringify({
      sent,
      claimed: rows.length,
      reset: resetData ?? 0,
      admins: adminEmails.length,
      errors,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
