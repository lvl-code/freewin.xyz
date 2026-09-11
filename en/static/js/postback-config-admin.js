document.addEventListener("DOMContentLoaded", () => {
  initPostbackConfigsPage();
});

async function initPostbackConfigsPage() {
  const table = document.getElementById("pbTableBody");
  if (!table) return; // not on this page

  await populateAccountDropdown();
  await loadPostbackConfigs();
  initPostbackForm();
  initPostbackTestForm();
}

async function populateAccountDropdown() {
  try {
    const res = await fetch("/en/api/v1/affiliate-accounts/list");
    const data = await res.json();
    const accounts = data.accounts || [];
    const options = accounts.map(a => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join("");
    document.getElementById("pbAccountSelect").innerHTML = options || '<option value="">No affiliate accounts yet — create one first</option>';
  } catch { /* leave empty on failure */ }
}

async function loadPostbackConfigs() {
  const tbody = document.getElementById("pbTableBody");
  const testSelect = document.getElementById("pbTestConfigSelect");
  try {
    const res = await fetch("/en/api/v1/postback-configs/list");
    if (res.status === 403) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">Postback integrations are admin-only.</td></tr>';
      return;
    }
    const data = await res.json();
    const configs = data.configs || [];

    if (!configs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No postback integrations yet — create one below.</td></tr>';
    } else {
      tbody.innerHTML = configs.map(c => `
        <tr>
          <td>${escapeHtml(c.label)}</td>
          <td>${escapeHtml(c.account_name)}</td>
          <td>${escapeHtml(c.auth_method)}</td>
          <td>${c.status === "active" ? '<span class="badge badge--success">active</span>' : '<span class="badge">disabled</span>'}</td>
          <td><span data-health-for="${c.id}" class="muted">loading…</span></td>
          <td><code style="font-size:11px">/en/api/v1/conversions/postback/${c.endpoint_token.slice(0, 8)}…</code></td>
          <td>
            <button class="btn btn--sm" onclick="rotatePostbackToken(${c.id})">Rotate URL</button>
            ${c.status === "active" ? `<button class="btn btn--sm btn--danger" onclick="archivePostbackConfig(${c.id})">Archive</button>` : ""}
          </td>
        </tr>
      `).join("");
      configs.forEach(c => loadConversionHealthBadge(c.id));
    }

    if (testSelect) {
      testSelect.innerHTML = configs
        .filter(c => c.status === "active")
        .map(c => `<option value="${c.id}">${escapeHtml(c.label)} (${escapeHtml(c.account_name)})</option>`).join("")
        || '<option value="">No active integrations</option>';
    }
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Failed to load.</td></tr>';
  }
}

async function loadConversionHealthBadge(configId) {
  const el = document.querySelector(`[data-health-for="${configId}"]`);
  if (!el) return;
  try {
    const res = await fetch(`/en/api/v1/postback-config/health?id=${configId}`);
    const data = await res.json();
    const h = data.health;
    if (!h || !h.has_data) {
      el.textContent = "no data yet";
      return;
    }
    const pct = Math.round((h.attributed_rate || 0) * 100);
    el.innerHTML = `${h.accepted} accepted, ${pct}% attributed${h.unattributed ? `, ${h.unattributed} unattributed` : ""}`;
  } catch {
    el.textContent = "—";
  }
}

function initPostbackForm() {
  const form = document.getElementById("pbForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("pbFormAlert");
    alertEl.style.display = "none";
    const formData = new FormData(form);

    const payload = {
      account_id: parseInt(formData.get("account_id")),
      label: formData.get("label"),
      auth_method: formData.get("auth_method"),
      credential_reference: formData.get("credential_reference"),
      signature_param: formData.get("signature_param") || null,
      timestamp_param: formData.get("timestamp_param") || null,
      timestamp_tolerance_seconds: formData.get("timestamp_tolerance_seconds") ? parseInt(formData.get("timestamp_tolerance_seconds")) : 300,
      allowed_ips: formData.get("allowed_ips") || null,
      field_mapping_json: formData.get("field_mapping_json") || null,
    };

    try {
      const res = await fetch("/en/api/v1/postback-config/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, `Integration created. Postback URL: /en/api/v1/conversions/postback/${data.endpoint_token} — copy this now, it won't be shown in full again.`, true);
        form.reset();
        await loadPostbackConfigs();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

async function rotatePostbackToken(id) {
  if (!confirm("Rotate this integration's postback URL? The old URL will stop working immediately — update it with the provider afterward.")) return;
  try {
    const res = await fetch("/en/api/v1/postback-config/rotate-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to rotate"); return; }
    alert(`New postback URL: /en/api/v1/conversions/postback/${data.endpoint_token}`);
    loadPostbackConfigs();
  } catch { alert("Network error"); }
}

async function archivePostbackConfig(id) {
  if (!confirm("Archive this integration? Its postback URL will stop accepting requests.")) return;
  try {
    const res = await fetch("/en/api/v1/postback-config/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to archive"); return; }
    loadPostbackConfigs();
  } catch { alert("Network error"); }
}

function initPostbackTestForm() {
  const form = document.getElementById("pbTestForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById("pbTestConfigSelect").value);
    if (!id) return;

    const payload = {
      id,
      payload: {
        click_id: document.getElementById("pbTestClickId").value || undefined,
        conversion_type: document.getElementById("pbTestType").value,
        status: "confirmed",
        reported_value: parseFloat(document.getElementById("pbTestValue").value) || 0,
        currency: document.getElementById("pbTestCurrency").value || "USD",
      },
    };

    try {
      const res = await fetch("/en/api/v1/postback-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      renderTestResult(data);
    } catch {
      document.getElementById("pbTestResult").style.display = "block";
      document.getElementById("pbTestChecklist").innerHTML = '<li class="checklist-fail">Network error</li>';
    }
  });
}

// Ordered checklist matching the brief's postback-testing UI example
// (click found → tracking link → casino → partner → account →
// commercial term → commission → stored).
const PB_TEST_STEP_LABELS = [
  ["click_found", "Click found"],
  ["tracking_link_resolved", "Tracking link resolved"],
  ["casino_resolved", "Casino resolved"],
  ["partner_resolved", "Partner resolved"],
  ["account_resolved", "Account resolved"],
  ["commercial_term_resolved", "Commercial term resolved"],
  ["commission_calculated", "Commission calculated"],
];

function renderTestResult(data) {
  const resultEl = document.getElementById("pbTestResult");
  const listEl = document.getElementById("pbTestChecklist");
  const rawEl = document.getElementById("pbTestRaw");
  resultEl.style.display = "block";

  if (!data.success) {
    listEl.innerHTML = `<li class="checklist-fail">✗ ${escapeHtml(data.error || "Test failed")}</li>`;
    rawEl.textContent = JSON.stringify(data, null, 2);
    return;
  }

  const steps = data.steps || {};
  let html = PB_TEST_STEP_LABELS.map(([key, label]) => {
    const pass = !!steps[key];
    return `<li class="${pass ? "checklist-pass" : "checklist-fail"}">${pass ? "✓" : "✗"} ${label}</li>`;
  }).join("");

  if (steps.program_mismatch) {
    html += `<li class="checklist-fail">✗ Click belongs to a different program — rejected for this account's protection</li>`;
  }

  const outcomeLabel = { would_accept: "Would be ACCEPTED", would_be_unattributed: "Would be recorded UNATTRIBUTED" }[data.outcome] || data.outcome;
  html += `<li><strong>Result: ${escapeHtml(outcomeLabel)}</strong>${data.calculated_commission != null ? ` — commission: ${data.calculated_commission}` : ""}</li>`;

  listEl.innerHTML = html;
  rawEl.textContent = JSON.stringify(data, null, 2);
}
