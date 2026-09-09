document.addEventListener("DOMContentLoaded", () => {
  initAnalyticsPage();
});

function initAnalyticsPage() {
  const grid = document.getElementById("anStatsGrid");
  if (!grid) return; // not on this page

  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  document.getElementById("anEndDate").value = today.toISOString().slice(0, 10);
  document.getElementById("anStartDate").value = thirtyDaysAgo.toISOString().slice(0, 10);

  document.getElementById("anDimensionType")?.addEventListener("change", (e) => {
    document.getElementById("anDimensionLabel").textContent =
      e.target.options[e.target.selectedIndex].text;
  });

  initAlertRuleForm();
  loadAnalytics();
}

function fmtMoney(n) {
  return "$" + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(n) {
  return ((Number(n) || 0) * 100).toFixed(2) + "%";
}

function fmtNum(n) {
  return (Number(n) || 0).toLocaleString();
}

async function loadAnalytics() {
  const dimensionType = document.getElementById("anDimensionType").value;
  const startDate = document.getElementById("anStartDate").value;
  const endDate = document.getElementById("anEndDate").value;
  const currency = document.getElementById("anCurrency").value;

  if (!startDate || !endDate) return;

  const params = new URLSearchParams({
    dimension_type: dimensionType, start_date: startDate, end_date: endDate
  });
  if (currency) params.set("currency", currency);

  const tbody = document.getElementById("anTableBody");
  tbody.innerHTML = `<tr><td colspan="12" class="muted">Loading...</td></tr>`;

  try {
    const res = await fetch(`/en/api/v1/analytics/overview?${params}`);
    const data = await res.json();
    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="12" class="muted">${data.error || "Failed to load"}</td></tr>`;
      return;
    }

    renderStatCards(data.rows);
    renderPerformanceTable(data.rows);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="12" class="muted">Failed to load analytics.</td></tr>`;
  }

  loadGeoPerformance(startDate, endDate, currency);
  loadOpenAlerts();
  loadAlertRules();
}

async function loadAlertRules() {
  const tbody = document.getElementById("anRulesTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/analytics/alert-rules/list");
    const data = await res.json();
    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">${data.error || "Unable to load rules"}</td></tr>`;
      return;
    }
    const rules = data.rules || [];
    if (!rules.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No alert rules yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = rules.map(r => `
      <tr>
        <td>${escapeHtmlAn(r.name)}</td>
        <td>${escapeHtmlAn(r.metric)}</td>
        <td>${escapeHtmlAn(r.scope_type)}${r.scope_id ? " #" + r.scope_id : ""}</td>
        <td>${escapeHtmlAn(r.threshold_type)}${r.threshold_value != null ? ": " + r.threshold_value : ""}</td>
        <td>${r.enabled ? "Yes" : "No"}</td>
        <td><button class="btn btn--sm" onclick="toggleAlertRule(${r.id}, ${r.enabled ? 0 : 1})">${r.enabled ? "Disable" : "Enable"}</button></td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Failed to load rules (admin only).</td></tr>`;
  }
}

async function toggleAlertRule(id, enabled) {
  try {
    const res = await fetch("/en/api/v1/analytics/alert-rule/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !!enabled }),
    });
    const data = await res.json();
    if (data.success) loadAlertRules();
    else alert(data.error || "Failed to update rule");
  } catch (e) {
    alert("Failed to update rule.");
  }
}

function initAlertRuleForm() {
  const form = document.getElementById("anRuleForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: formData.get("name"),
      metric: formData.get("metric"),
      scopeType: formData.get("scopeType"),
      scopeId: formData.get("scopeId") ? parseInt(formData.get("scopeId")) : null,
      thresholdType: formData.get("thresholdType"),
      thresholdValue: formData.get("thresholdValue") ? parseFloat(formData.get("thresholdValue")) : null,
      comparisonWindowDays: formData.get("comparisonWindowDays") ? parseInt(formData.get("comparisonWindowDays")) : 7,
    };
    try {
      const res = await fetch("/en/api/v1/analytics/alert-rule/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        form.reset();
        loadAlertRules();
      } else {
        alert(data.error || "Failed to create rule (admin only)");
      }
    } catch (e) {
      alert("Failed to create rule.");
    }
  });
}

async function loadOpenAlerts() {
  const tbody = document.getElementById("anAlertsTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="muted">Loading...</td></tr>`;

  try {
    const res = await fetch("/en/api/v1/analytics/alerts/list?status=open");
    const data = await res.json();
    const alerts = data.alerts || [];
    if (!alerts.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No open alerts.</td></tr>`;
      return;
    }
    tbody.innerHTML = alerts.map(a => {
      let detail = "";
      try { detail = JSON.stringify(JSON.parse(a.details_json || "{}")); } catch (e) { detail = a.details_json || ""; }
      return `
        <tr>
          <td>${escapeHtmlAn(a.rule_name)}</td>
          <td>${escapeHtmlAn(a.metric)}</td>
          <td>${escapeHtmlAn(a.scope_type)}${a.scope_id ? " #" + a.scope_id : ""}</td>
          <td>${a.triggered_at}</td>
          <td>${escapeHtmlAn(detail)}</td>
          <td><button class="btn btn--sm" onclick="acknowledgeAlert(${a.id})">Acknowledge</button></td>
        </tr>
      `;
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Failed to load alerts.</td></tr>`;
  }
}

async function acknowledgeAlert(id) {
  try {
    const res = await fetch("/en/api/v1/analytics/alert/acknowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) {
      loadOpenAlerts();
    } else {
      alert(data.error || "Failed to acknowledge alert");
    }
  } catch (e) {
    alert("Failed to acknowledge alert.");
  }
}

function escapeHtmlAn(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderStatCards(rows) {
  const totals = rows.reduce((acc, r) => ({
    views: acc.views + (r.views || 0),
    clicks: acc.clicks + (r.clicks || 0),
    conversions: acc.conversions + (r.conversions || 0),
    revenue: acc.revenue + (r.revenue || 0),
    commission: acc.commission + (r.commission || 0)
  }), { views: 0, clicks: 0, conversions: 0, revenue: 0, commission: 0 });

  document.getElementById("anTotalViews").textContent = fmtNum(totals.views);
  document.getElementById("anTotalClicks").textContent = fmtNum(totals.clicks);
  document.getElementById("anTotalConversions").textContent = fmtNum(totals.conversions);
  document.getElementById("anTotalRevenue").textContent = fmtMoney(totals.revenue);
  document.getElementById("anTotalCommission").textContent = fmtMoney(totals.commission);
}

function renderPerformanceTable(rows) {
  const tbody = document.getElementById("anTableBody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="muted">No data for this range.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.dimensionId ?? "—"}</td>
      <td>${r.currency}</td>
      <td>${fmtNum(r.views)}</td>
      <td>${fmtNum(r.clicks)}</td>
      <td>${fmtNum(r.conversions)}</td>
      <td>${fmtMoney(r.revenue)}</td>
      <td>${fmtMoney(r.commission)}</td>
      <td>${fmtPct(r.ctr)}</td>
      <td>${fmtPct(r.cvr)}</td>
      <td>${fmtMoney(r.epc)}</td>
      <td>${fmtMoney(r.rpc)}</td>
      <td>${fmtMoney(r.cpa)}</td>
    </tr>
  `).join("");
}

async function loadGeoPerformance(startDate, endDate, currency) {
  const tbody = document.getElementById("anGeoTableBody");
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  if (currency) params.set("currency", currency);

  try {
    const res = await fetch(`/en/api/v1/analytics/geo?${params}`);
    const data = await res.json();
    if (!data.success || !data.rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted">No data for this range.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.rows.map(r => `
      <tr>
        <td>${r.country || "Unknown"}</td>
        <td>${fmtNum(r.clicks)}</td>
        <td>${fmtNum(r.conversions)}</td>
        <td>${fmtMoney(r.revenue)}</td>
        <td>${fmtMoney(r.commission)}</td>
        <td>${fmtPct(r.cvr)}</td>
        <td>${fmtMoney(r.epc)}</td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Failed to load GEO data.</td></tr>`;
  }
}
