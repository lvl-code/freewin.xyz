// worker/reports/delivery.js
// Phase 9: Report delivery abstraction.
//
// In-app delivery (via the EXISTING user_notifications table, extended
// in 0032 with severity/category/related_resource/related_id) works
// for any recipient with a user_id. Email recipients (a bare `email`
// with no `user_id`) are accepted by the schema (report_recipients.email)
// and sent via Resend (https://resend.com) — the provider chosen for
// this tenant. Configuration is two secrets, set per-tenant via
// `wrangler secret put`, never committed to this repo or wrangler.jsonc
// (consistent with how TURNSTILE_SECRET is already handled elsewhere
// in this codebase — grepped for the convention before adding a new one):
//   RESEND_API_KEY     — required. Missing it is a config error, not a
//                        silent no-op — see sendEmail() below.
//   RESEND_FROM_EMAIL  — required. No hardcoded fallback domain is used:
//                        this is a multi-tenant codebase (7+ separate
//                        sites sharing it), and guessing a "from"
//                        address for a tenant that hasn't configured
//                        one would send real email from an address
//                        nobody chose. Better to fail loudly and name
//                        exactly what's missing.

/**
 * Sends one email via the Resend API. Throws with a specific, actionable
 * message on any failure mode (missing config, Resend API error) rather
 * than pretending to succeed — callers already handle a thrown error
 * per-recipient (see deliverReportRun below) and record it, so failing
 * loudly here is safe and is what makes failures visible instead of
 * silently vanishing.
 */
async function sendEmail(env, { to, subject, body }) {
  if (!env.RESEND_API_KEY) {
    throw new Error('Email delivery is not configured for this tenant: RESEND_API_KEY secret is not set (wrangler secret put RESEND_API_KEY).');
  }
  if (!env.RESEND_FROM_EMAIL) {
    throw new Error('Email delivery is not configured for this tenant: RESEND_FROM_EMAIL secret is not set (wrangler secret put RESEND_FROM_EMAIL).');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      text: body
    })
  });

  if (!response.ok) {
    // Resend's error responses are JSON with a `message` field; fall
    // back to the raw status if the body isn't parseable, but never
    // leak the API key (it's never included in the error path below).
    let detail = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.message) detail = errorBody.message;
    } catch { /* keep the HTTP-status fallback */ }
    throw new Error(`Resend delivery failed: ${detail}`);
  }

  const result = await response.json();
  return result?.id ?? null;
}

/**
 * Delivers a completed report run to every recipient on its schedule.
 * Never throws — each recipient's outcome is collected and returned so
 * the caller (the scheduled-report cron job) can record failures per
 * recipient rather than failing the whole run over one bad email
 * address or an unconfigured provider.
 */
export async function deliverReportRun(env, { reportRun, reportName, recipients }) {
  const outcomes = [];

  for (const recipient of recipients) {
    if (recipient.user_id) {
      try {
        await env.DB.prepare(`
          INSERT INTO user_notifications (user_id, title, message, link, severity, category, related_resource, related_id)
          VALUES (?, ?, ?, ?, 'info', 'reports', 'report_run', ?)
        `).bind(
          recipient.user_id,
          `Report ready: ${reportName}`,
          `Your scheduled report "${reportName}" finished with ${reportRun.rowCount ?? 0} rows.`,
          `/en/dashboard/reports/runs/${reportRun.id}`,
          reportRun.id
        ).run();
        outcomes.push({ recipient: recipient.user_id, method: 'in_app', success: true });
      } catch (e) {
        outcomes.push({ recipient: recipient.user_id, method: 'in_app', success: false, error: e.message });
      }
    } else if (recipient.email) {
      try {
        const messageId = await sendEmail(env, {
          to: recipient.email,
          subject: `Report ready: ${reportName}`,
          body: `Your scheduled report "${reportName}" finished with ${reportRun.rowCount ?? 0} rows.`
        });
        outcomes.push({ recipient: recipient.email, method: 'email', success: true, messageId });
      } catch (e) {
        outcomes.push({ recipient: recipient.email, method: 'email', success: false, error: e.message });
      }
    }
  }

  return outcomes;
}
