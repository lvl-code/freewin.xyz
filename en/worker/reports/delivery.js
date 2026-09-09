// worker/reports/delivery.js
// Phase 9: Report delivery abstraction.
//
// No email provider is configured anywhere in this codebase (grepped
// for one during the original audit — none found). Per the brief:
// "If email delivery infrastructure does not already exist, implement
// the abstraction cleanly rather than hardcoding an external provider."
//
// So: in-app delivery (via the EXISTING user_notifications table,
// extended in 0032 with severity/category/related_resource/related_id)
// works today, for any recipient with a user_id. Email recipients (a
// bare `email` with no `user_id`) are accepted by the schema
// (report_recipients.email) and recorded, but sendEmail() below is an
// explicit not-yet-configured stub — it does NOT silently drop the
// delivery attempt; it returns a clear "not configured" result that
// the caller records in report_runs.error_message-adjacent bookkeeping,
// per "failures must be recorded, do not silently fail" (brief §12).

/**
 * Stub — replace the body with a real provider call (Resend, SES,
 * Postmark, etc.) when one is chosen. Deliberately throws rather than
 * pretending to succeed, so callers can't accidentally treat an
 * unconfigured provider as a successful send.
 */
async function sendEmail(env, { to, subject, body }) {
  throw new Error('Email delivery provider is not configured for this tenant.');
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
        await sendEmail(env, {
          to: recipient.email,
          subject: `Report ready: ${reportName}`,
          body: `Your scheduled report "${reportName}" finished with ${reportRun.rowCount ?? 0} rows.`
        });
        outcomes.push({ recipient: recipient.email, method: 'email', success: true });
      } catch (e) {
        outcomes.push({ recipient: recipient.email, method: 'email', success: false, error: e.message });
      }
    }
  }

  return outcomes;
}
