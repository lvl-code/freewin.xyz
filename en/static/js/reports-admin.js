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
  form.addEventListener("submit", handleReportFormSubmit);
  document.getElementById("rptType")?.addEventListener("change", (e) => loadColumnOptions(e.target.value));
  loadColumnOptions(document.getElementById("rptType").value);
}

/**
 * Fetches the column manifest for a report type and renders:
 * - a checkbox per available column (leave all unchecked = show all)
 * - a "Group by" dropdown populated with only the groupable columns
 * Called on page load (for the default-selected type), whenever the
 * report type dropdown changes, and when opening an existing report
 * for editing (in which case preselectedColumns/preselectedGroupBy
 * check the boxes / set the dropdown to that report's saved values).
 */
async function loadColumnOptions(reportType, preselectedColumns = [], preselectedGroupBy = "") {
  const checklist = document.getElementById("rptColumnChecklist");
  const groupBySelect = document.getElementById("rptGroupBy");
  checklist.innerHTML = `<span class="muted">Loading...</span>`;
  groupBySelect.innerHTML = `<option value="">No grouping</option>`;

  try {
    const res = await fetch(`/en/api/v1/report/column-options?report_type=${encodeURIComponent(reportType)}`);
    const data = await res.json();
    const columns = data.columns || [];

    if (!columns.length) {
      checklist.innerHTML = `<span class="muted">${data.note || "No column customization available for this report type."}</span>`;
      return;
    }

    checklist.innerHTML = columns.map(c => `
      <label class="checklist-item">
        <input type="checkbox" name="rptColumn" value="${escapeHtml(c.key)}" ${preselectedColumns.includes(c.key) ? "checked" : ""}>
        ${escapeHtml(c.label)}
      </label>
    `).join("");

    const groupable = columns.filter(c => c.groupable);
    for (const c of groupable) {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = c.label;
      if (c.key === preselectedGroupBy) opt.selected = true;
      groupBySelect.appendChild(opt);
    }
  } catch (e) {
    checklist.innerHTML = `<span class="muted">Failed to load column options.</span>`;
  }
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
        <td class="table-actions"><button class="btn btn--sm" onclick="selectReport(${r.id}, '${escapeHtml(r.name).replace(/'/g, "\\'")}')">Open / Edit</button></td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Failed to load reports.</td></tr>`;
  }
}

async function handleReportFormSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById("rptEditId").value;
  const name = document.getElementById("rptName").value;
  const reportType = document.getElementById("rptType").value;
  const groupBy = document.getElementById("rptGroupBy").value;
  const selectedColumns = Array.from(document.querySelectorAll('input[name="rptColumn"]:checked')).map(cb => cb.value);

  const endpoint = editId ? "/en/api/v1/report/update" : "/en/api/v1/report/create";
  const payload = editId
    ? { id: parseInt(editId), name, columns: selectedColumns.length > 0 ? selectedColumns : [], grouping: groupBy || null }
    : { name, reportType, columns: selectedColumns.length > 0 ? selectedColumns : undefined, grouping: groupBy || undefined };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      const wasEditing = !!editId;
      resetReportForm();
      loadReportsTable();
      if (wasEditing) {
        selectReport(parseInt(editId), name);
      } else {
        selectReport(data.id, name);
      }
    } else {
      alert(data.error || "Failed to save report");
    }
  } catch (e) {
    alert("Failed to save report");
  }
}

/**
 * Opens a report's run panel AND loads it into the form above for
 * editing (name + column selection + grouping). Report TYPE is locked
 * during edit -- /report/update doesn't accept changing it (a report's
 * type determines which columns even exist; changing it would orphan
 * a saved column selection), so the type dropdown is disabled with an
 * explanatory note instead of silently ignoring a changed value.
 */
async function selectReport(id, name) {
  currentReportId = id;
  document.getElementById("rptRunName").textContent = name;
  document.getElementById("rptRunPanel").style.display = "block";
  document.getElementById("rptPreviewOutput").style.display = "none";
  loadRuns();
  window.scrollTo({ top: document.getElementById("rptRunPanel").offsetTop - 20, behavior: "smooth" });

  try {
    const res = await fetch(`/en/api/v1/report/get?id=${id}`);
    const data = await res.json();
    if (!data.success) return;
    const report = data.report;

    document.getElementById("rptEditId").value = report.id;
    document.getElementById("rptName").value = report.name;
    document.getElementById("rptType").value = report.report_type;
    document.getElementById("rptType").disabled = true;
    document.getElementById("rptTypeLockedNote").style.display = "inline";
    document.getElementById("rptFormHeading").textContent = `Edit: ${report.name}`;
    document.getElementById("rptSubmitBtn").textContent = "Save Changes";
    document.getElementById("rptCancelEditBtn").style.display = "inline-block";

    let savedColumns = [];
    let savedGroupBy = "";
    try { savedColumns = report.columns_json ? JSON.parse(report.columns_json) : []; } catch (e) {}
    try { savedGroupBy = report.grouping_json ? JSON.parse(report.grouping_json) : ""; } catch (e) {}

    await loadColumnOptions(report.report_type, savedColumns, savedGroupBy);
  } catch (e) {
    // Run panel still works even if the edit-form population failed --
    // fail soft here rather than blocking the ability to just run the report.
  }
}

function resetReportForm() {
  const form = document.getElementById("rptForm");
  form.reset();
  document.getElementById("rptEditId").value = "";
  document.getElementById("rptType").disabled = false;
  document.getElementById("rptTypeLockedNote").style.display = "none";
  document.getElementById("rptFormHeading").textContent = "New Report";
  document.getElementById("rptSubmitBtn").textContent = "Create Report";
  document.getElementById("rptCancelEditBtn").style.display = "none";
  loadColumnOptions(document.getElementById("rptType").value);
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
