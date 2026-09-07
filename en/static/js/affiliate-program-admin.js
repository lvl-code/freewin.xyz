document.addEventListener("DOMContentLoaded", () => {
  initProgramsPage();
});

async function initProgramsPage() {
  const tbody = document.getElementById("programsTableBody");
  const partnerSelect = document.getElementById("programPartnerSelect");
  if (!tbody && !partnerSelect) return; // not on this page

  await populatePartnerDropdowns();
  await populateCasinoMultiSelect();
  loadProgramsTable();
  initProgramForm();

  const partnerFilter = document.getElementById("programPartnerFilter");
  const statusFilter = document.getElementById("programStatusFilter");
  if (partnerFilter) partnerFilter.addEventListener("change", loadProgramsTable);
  if (statusFilter) statusFilter.addEventListener("change", loadProgramsTable);
}

async function populatePartnerDropdowns() {
  try {
    const res = await fetch("/en/api/v1/affiliate-partners/list?status=active");
    const data = await res.json();
    const partners = data.partners || [];
    const options = partners.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");

    const filterSelect = document.getElementById("programPartnerFilter");
    if (filterSelect) filterSelect.innerHTML = '<option value="">All Partners</option>' + options;

    const formSelect = document.getElementById("programPartnerSelect");
    if (formSelect) formSelect.innerHTML = options;
  } catch { /* leave dropdowns empty on failure */ }
}

async function populateCasinoMultiSelect() {
  const select = document.getElementById("programCasinoSelect");
  if (!select) return;
  try {
    // Reuses the existing public casino list endpoint (read-only, already permission-gated elsewhere).
    const res = await fetch("/en/api/v1/casinos/list");
    const data = await res.json();
    const casinoList = data.casinos || [];
    select.innerHTML = casinoList.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  } catch { /* leave empty on failure */ }
}

async function loadProgramsTable() {
  const tbody = document.getElementById("programsTableBody");
  if (!tbody) return;
  try {
    const partnerId = document.getElementById("programPartnerFilter")?.value || "";
    const status = document.getElementById("programStatusFilter")?.value || "";
    const params = new URLSearchParams();
    if (partnerId) params.set("partner_id", partnerId);
    if (status) params.set("status", status);

    const res = await fetch(`/en/api/v1/affiliate-programs/list?${params}`);
    const data = await res.json();
    const programs = data.programs || [];
    if (programs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No affiliate programs yet.</td></tr>';
      return;
    }

    // Casino counts are fetched per-row on demand rather than N+1'd here;
    // getProgramCasinos is cheap and only called when a row is expanded via Edit.
    tbody.innerHTML = programs.map(p => `
      <tr>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${escapeHtml(p.partner_name)}</td>
        <td>${affStatusBadge(p.status)}</td>
        <td><span class="muted">view via Edit</span></td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editProgram(${p.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteProgram(${p.id})">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

function initProgramForm() {
  const form = document.getElementById("programForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("programFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);
    const isEdit = !!formData.get("id");
    const endpoint = isEdit ? "/en/api/v1/affiliate-program/update" : "/en/api/v1/affiliate-program/create";
    const casinoIds = Array.from(document.getElementById("programCasinoSelect").selectedOptions).map(o => parseInt(o.value));

    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      partner_id: parseInt(formData.get("partner_id")),
      name: formData.get("name"),
      status: formData.get("status"),
      portal_url: formData.get("portal_url") || null,
      reporting_notes: formData.get("reporting_notes") || null,
      notes: formData.get("notes") || null,
      casino_ids: casinoIds,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, isEdit ? "Program updated!" : "Program created!", true);
        if (isEdit) {
          // update path doesn't take casino_ids -- push the assignment separately
          await fetch("/en/api/v1/affiliate-program/casinos/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ program_id: payload.id, casino_ids: casinoIds })
          });
        }
        cancelProgramEdit();
        loadProgramsTable();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

async function editProgram(id) {
  try {
    const res = await fetch(`/en/api/v1/affiliate-program/get?id=${id}`);
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to load program"); return; }
    const p = data.program;
    const form = document.getElementById("programForm");
    form.querySelector("[name='id']").value = p.id;
    form.querySelector("[name='partner_id']").value = p.partner_id;
    form.querySelector("[name='name']").value = p.name;
    form.querySelector("[name='status']").value = p.status || "active";
    form.querySelector("[name='portal_url']").value = p.portal_url || "";
    form.querySelector("[name='reporting_notes']").value = p.reporting_notes || "";
    form.querySelector("[name='notes']").value = p.notes || "";

    const casinoSelect = document.getElementById("programCasinoSelect");
    const coveredIds = new Set((p.casinos || []).map(c => c.id));
    Array.from(casinoSelect.options).forEach(opt => {
      opt.selected = coveredIds.has(parseInt(opt.value));
    });

    document.getElementById("programSubmitBtn").textContent = "Update Program";
    document.getElementById("programCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load program"); }
}

function cancelProgramEdit() {
  const form = document.getElementById("programForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  const casinoSelect = document.getElementById("programCasinoSelect");
  if (casinoSelect) Array.from(casinoSelect.options).forEach(o => o.selected = false);
  document.getElementById("programSubmitBtn").textContent = "Create Program";
  document.getElementById("programCancelEdit").style.display = "none";
}

async function deleteProgram(id) {
  if (!confirm("Delete this affiliate program? This will fail if any casinos, accounts, or commercial terms are still attached.")) return;
  try {
    const res = await fetch("/en/api/v1/affiliate-program/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Delete failed"); return; }
    loadProgramsTable();
  } catch { alert("Network error"); }
}
