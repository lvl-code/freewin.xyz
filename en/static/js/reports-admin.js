let currentReportId = null;

document.addEventListener("DOMContentLoaded", () => {
  initReportsPage();
});

function initReportsPage() {
  const form = document.getElementById("rptForm");
  if (!form) return; // not on this page

  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  document.getElementById("rptEndDate").value = today.toISOString().slice(0, 10);
  document.getElementById("rptStartDate").value = thirtyDaysAgo.toISOString().slice(0, 10);

  loadReportsTable();
  form.addEventListener("submit", createReport);
}

async function loadReportsTable() {
  const tbody = document.getElementById("rptTableBody");
  tbody.innerHTML = `<tr><td colspan="4" class="muted">Loading...</td></tr>`;
  try {
    const res = await fetch("/en/api/v1/reports/list");
    const data = await res.json();
    const reports = data.reports || [];
    if (!reports.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">No reports yet — create one below.</td></tr>`;
      return;
    }
    tbody.innerHTML = reports.map(r => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.report_type)}</td>
        <td>${r.created_at}</td>
        <td class="table-actions"><button class="btn btn--sm" onclick="selectReport(${r.id}, '${escapeHtml(r.name).replace(/'/g, "\\'")}')">Open</button></td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Failed to load reports.</td></tr>`;
  }
}

async function createReport(e) {
  e.preventDefault();
  const name = document.getElementById("rptName").value;
  const reportType = document.getElementById("rptType").value;

  try {
    const res = await fetch("/en/api/v1/report/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, reportType }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("rptForm").reset();
      loadReportsTable();
      selectReport(data.id, name);
    } else {
      alert(data.error || "Failed to create report");
    }
  } catch (e) {
    alert("Failed to create report");
  }
}

function selectReport(id, name) {
  currentReportId = id;
  document.getElementById("rptRunName").textContent = name;
  document.getElementById("rptRunPanel").style.display = "block";
  document.getElementById("rptPreviewOutput").style.display = "none";
  loadRuns();
  window.scrollTo({ top: document.getElementById("rptRunPanel").offsetTop - 20, behavior: "smooth" });
}

async function runReport(format) {
  if (!currentReportId) return;
  const startDate = document.getElementById("rptStartDate").value;
  const endDate = document.getElementById("rptEndDate").value;

  if (format === "json") {
    const pre = document.getElementById("rptPreviewOutput");
    pre.style.display = "block";
    pre.textContent = "Running...";
    try {
      const res = await fetch("/en/api/v1/report/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentReportId, startDate, endDate, format: "json" }),
      });
      const data = await res.json();
      if (!data.success) {
        pre.textContent = "Error: " + (data.error || "failed to run report");
      } else {
        pre.textContent = JSON.stringify(data.rows, null, 2);
      }
    } catch (e) {
      pre.textContent = "Failed to run report.";
    }
    loadRuns();
    return;
  }

  // csv / html — trigger a download via a real form POST-in-new-tab
  // pattern isn't available for POST+blob easily without a library, so
  // fetch the file and create an object URL, matching how media exports
  // are already handled elsewhere in this admin (fetch -> blob -> <a>).
  try {
    const res = await fetch("/en/api/v1/report/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: currentReportId, startDate, endDate, format }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to run report");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (format === "html") {
      window.open(url, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${currentReportId}-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) {
    alert("Failed to run report.");
  }
  loadRuns();
}

async function createSchedule() {
  if (!currentReportId) return;
  const frequency = document.getElementById("rptScheduleFrequency").value;
  const outputFormat = document.getElementById("rptScheduleFormat").value;

  try {
    const res = await fetch("/en/api/v1/report/schedule/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: currentReportId, frequency, outputFormat }),
    });
    const data = await res.json();
    if (data.success) {
      alert(`Scheduled — first run is ${frequency}.`);
    } else {
      alert(data.error || "Failed to schedule report");
    }
  } catch (e) {
    alert("Failed to schedule report.");
  }
}

async function loadRuns() {
  if (!currentReportId) return;
  const tbody = document.getElementById("rptRunsTableBody");
  tbody.innerHTML = `<tr><td colspan="4" class="muted">Loading...</td></tr>`;
  try {
    const res = await fetch(`/en/api/v1/report/runs/list?report_id=${currentReportId}`);
    const data = await res.json();
    const runs = data.runs || [];
    if (!runs.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">No runs yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = runs.map(r => `
      <tr>
        <td>${r.started_at}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${r.row_count ?? "—"}</td>
        <td>${escapeHtml(r.error_message || "—")}</td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Failed to load runs.</td></tr>`;
  }
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
