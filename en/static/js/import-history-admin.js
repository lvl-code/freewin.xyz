document.addEventListener("DOMContentLoaded", () => {
  initImportHistoryPage();
});

async function initImportHistoryPage() {
  const table = document.getElementById("impTableBody");
  if (!table) return; // not on this page

  await populateImportAccountDropdown();
  await loadImportBatches();
  initImportForm();
}

async function populateImportAccountDropdown() {
  try {
    const res = await fetch("/en/api/v1/affiliate-accounts/list");
    const data = await res.json();
    const accounts = data.accounts || [];
    document.getElementById("impAccountSelect").innerHTML =
      accounts.map(a => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join("")
      || '<option value="">No affiliate accounts yet — create one first</option>';
  } catch { /* leave empty on failure */ }
}

async function loadImportBatches() {
  const tbody = document.getElementById("impTableBody");
  try {
    const res = await fetch("/en/api/v1/imports/list");
    if (res.status === 403) {
      tbody.innerHTML = '<tr><td colspan="8" class="muted">You do not have access to imports.</td></tr>';
      return;
    }
    const data = await res.json();
    const batches = data.batches || [];

    tbody.innerHTML = batches.length
      ? batches.map(b => `
        <tr>
          <td>${escapeHtml(b.created_at)}</td>
          <td>${escapeHtml(b.account_name)}${b.label ? ` — ${escapeHtml(b.label)}` : ""}</td>
          <td>${escapeHtml(b.format)}</td>
          <td>${b.total_rows}</td>
          <td>${b.imported_count}</td>
          <td>${b.duplicate_count}</td>
          <td>${b.unattributed_count}</td>
          <td>${b.error_count > 0 ? `<span class="badge badge--danger">${b.error_count}</span> <button class="btn btn--sm" onclick="viewImportErrors(${b.id})">View</button>` : "0"}</td>
        </tr>
      `).join("")
      : '<tr><td colspan="8" class="muted">No imports yet.</td></tr>';
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" class="muted">Failed to load.</td></tr>';
  }
}

async function viewImportErrors(id) {
  try {
    const res = await fetch(`/en/api/v1/import/get?id=${id}`);
    const data = await res.json();
    const errors = data.batch?.errors || [];
    alert(errors.length
      ? errors.map(e => `Row ${e.row}: ${e.message}`).join("\n")
      : "No errors recorded for this batch.");
  } catch {
    alert("Failed to load errors.");
  }
}

function initImportForm() {
  const form = document.getElementById("impForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("impFormAlert");
    alertEl.style.display = "none";
    const formData = new FormData(form);

    const fileInput = document.getElementById("impFile");
    let content = document.getElementById("impContent").value;
    if (fileInput.files && fileInput.files[0]) {
      content = await fileInput.files[0].text();
    }
    if (!content || !content.trim()) {
      affShowAlert(alertEl, "Provide a file or paste content to import", false);
      return;
    }

    const payload = {
      account_id: parseInt(formData.get("account_id")),
      format: formData.get("format"),
      label: formData.get("label") || null,
      content,
      field_mapping: formData.get("field_mapping_json") ? JSON.parse(formData.get("field_mapping_json")) : null,
    };

    try {
      const res = await fetch("/en/api/v1/imports/conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, "Import complete — see results below.", true);
        renderImportResult(data);
        form.reset();
        document.getElementById("impContent").value = "";
        await loadImportBatches();
      } else {
        affShowAlert(alertEl, data.error || "Import failed", false);
      }
    } catch (err) {
      affShowAlert(alertEl, err instanceof SyntaxError ? "Field Mapping is not valid JSON" : "Network error", false);
    }
  });
}

function renderImportResult(data) {
  const panel = document.getElementById("impResultPanel");
  const summary = document.getElementById("impResultSummary");
  const errorsEl = document.getElementById("impResultErrors");
  panel.style.display = "block";

  summary.innerHTML = `
    <li>Total rows: ${data.totalRows}</li>
    <li class="checklist-pass">✓ Imported: ${data.importedCount}</li>
    <li>Duplicates skipped: ${data.duplicateCount}</li>
    <li>Unattributed (no click match): ${data.unattributedCount}</li>
    <li class="${data.errorCount > 0 ? "checklist-fail" : ""}">${data.errorCount > 0 ? "✗" : "✓"} Errors: ${data.errorCount}</li>
  `;

  if (data.errors && data.errors.length) {
    errorsEl.style.display = "block";
    errorsEl.textContent = data.errors.map(e => `Row ${e.row}: ${e.message}`).join("\n");
  } else {
    errorsEl.style.display = "none";
  }
}
