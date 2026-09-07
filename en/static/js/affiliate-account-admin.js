document.addEventListener("DOMContentLoaded", () => {
  initAccountsPage();
});

async function initAccountsPage() {
  const tbody = document.getElementById("accountsTableBody");
  if (!tbody) return; // not on this page

  await populateProgramDropdownsForAccounts();
  loadAccountsTable();
  initAccountForm();

  const programFilter = document.getElementById("accountProgramFilter");
  if (programFilter) programFilter.addEventListener("change", loadAccountsTable);
}

async function populateProgramDropdownsForAccounts() {
  try {
    const res = await fetch("/en/api/v1/affiliate-programs/list?status=active");
    const data = await res.json();
    const programs = data.programs || [];
    const options = programs.map(p => `<option value="${p.id}">${escapeHtml(p.partner_name)} — ${escapeHtml(p.name)}</option>`).join("");

    const filterSelect = document.getElementById("accountProgramFilter");
    if (filterSelect) filterSelect.innerHTML = '<option value="">All Programs</option>' + options;

    const formSelect = document.getElementById("accountProgramSelect");
    if (formSelect) formSelect.innerHTML = options;
  } catch { /* leave dropdowns empty on failure */ }
}

async function loadAccountsTable() {
  const tbody = document.getElementById("accountsTableBody");
  if (!tbody) return;
  try {
    const programId = document.getElementById("accountProgramFilter")?.value || "";
    const params = new URLSearchParams();
    if (programId) params.set("program_id", programId);

    const res = await fetch(`/en/api/v1/affiliate-accounts/list?${params}`);
    const data = await res.json();
    const accounts = data.accounts || [];
    if (accounts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No affiliate accounts yet.</td></tr>';
      return;
    }
    tbody.innerHTML = accounts.map(a => `
      <tr>
        <td><strong>${escapeHtml(a.account_name)}</strong></td>
        <td>${escapeHtml(a.program_name)}</td>
        <td>${affStatusBadge(a.status)}</td>
        <td>${escapeHtml(a.external_account_id || "-")}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editAccount(${a.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteAccount(${a.id})">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

function initAccountForm() {
  const form = document.getElementById("accountForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("accountFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);
    const isEdit = !!formData.get("id");
    const endpoint = isEdit ? "/en/api/v1/affiliate-account/update" : "/en/api/v1/affiliate-account/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      program_id: parseInt(formData.get("program_id")),
      account_name: formData.get("account_name"),
      external_account_id: formData.get("external_account_id") || null,
      status: formData.get("status"),
      portal_url: formData.get("portal_url") || null,
      credential_reference: formData.get("credential_reference") || null,
      notes: formData.get("notes") || null,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, isEdit ? "Account updated!" : "Account created!", true);
        cancelAccountEdit();
        loadAccountsTable();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

async function editAccount(id) {
  try {
    const res = await fetch(`/en/api/v1/affiliate-account/get?id=${id}`);
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to load account"); return; }
    const a = data.account;
    const form = document.getElementById("accountForm");
    form.querySelector("[name='id']").value = a.id;
    form.querySelector("[name='program_id']").value = a.program_id;
    form.querySelector("[name='account_name']").value = a.account_name;
    form.querySelector("[name='external_account_id']").value = a.external_account_id || "";
    form.querySelector("[name='status']").value = a.status || "active";
    form.querySelector("[name='portal_url']").value = a.portal_url || "";
    form.querySelector("[name='credential_reference']").value = a.credential_reference || "";
    form.querySelector("[name='notes']").value = a.notes || "";
    document.getElementById("accountSubmitBtn").textContent = "Update Account";
    document.getElementById("accountCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load account"); }
}

function cancelAccountEdit() {
  const form = document.getElementById("accountForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("accountSubmitBtn").textContent = "Create Account";
  document.getElementById("accountCancelEdit").style.display = "none";
}

async function deleteAccount(id) {
  if (!confirm("Delete this affiliate account? This will fail if commercial terms are still attached to it.")) return;
  try {
    const res = await fetch("/en/api/v1/affiliate-account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Delete failed"); return; }
    loadAccountsTable();
  } catch { alert("Network error"); }
}
