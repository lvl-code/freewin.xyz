document.addEventListener("DOMContentLoaded", () => {
  initProviderAdaptersPage();
});

async function initProviderAdaptersPage() {
  const table = document.getElementById("paTableBody");
  if (!table) return; // not on this page

  await populateProviderAdapterAccountDropdown();
  await loadProviderAdapters();
  initProviderAdapterForm();
}

async function populateProviderAdapterAccountDropdown() {
  try {
    const res = await fetch("/en/api/v1/affiliate-accounts/list");
    const data = await res.json();
    const accounts = data.accounts || [];
    document.getElementById("paAccountSelect").innerHTML =
      accounts.map(a => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join("")
      || '<option value="">No affiliate accounts yet — create one first</option>';
  } catch { /* leave empty on failure */ }
}

async function loadProviderAdapters() {
  const tbody = document.getElementById("paTableBody");
  try {
    const res = await fetch("/en/api/v1/provider-adapters/list");
    if (res.status === 403) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">Provider adapters are admin-only.</td></tr>';
      return;
    }
    const data = await res.json();
    const configs = data.configs || [];

    const providerSelect = document.getElementById("paProviderSelect");
    if (providerSelect) {
      providerSelect.innerHTML = (data.available_providers || []).map(p => `<option value="${p}">${p}</option>`).join("")
        || '<option value="">No adapters registered</option>';
    }

    tbody.innerHTML = configs.length
      ? configs.map(c => `
        <tr>
          <td>${escapeHtml(c.label)}</td>
          <td>${escapeHtml(c.account_name)}</td>
          <td>${escapeHtml(c.provider_key)}</td>
          <td>
            ${c.status === "active" ? '<span class="badge badge--success">active</span>' : '<span class="badge">disabled</span>'}
            ${c.last_sync_status === "error" ? '<span class="badge badge--danger" title="' + escapeHtml(c.last_sync_error || "") + '">sync error</span>' : ""}
          </td>
          <td>${c.last_sync_at ? escapeHtml(c.last_sync_at) : '<span class="muted">never</span>'}</td>
          <td>every ${c.sync_frequency_minutes}m</td>
          <td>
            <button class="btn btn--sm" onclick="syncProviderAdapterNow(${c.id})">Sync Now</button>
            ${c.status === "active" ? `<button class="btn btn--sm btn--danger" onclick="archiveProviderAdapter(${c.id})">Archive</button>` : ""}
          </td>
        </tr>
      `).join("")
      : '<tr><td colspan="7" class="muted">No provider adapters yet — create one below.</td></tr>';
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Failed to load.</td></tr>';
  }
}

function initProviderAdapterForm() {
  const form = document.getElementById("paForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("paFormAlert");
    alertEl.style.display = "none";
    const formData = new FormData(form);

    const payload = {
      account_id: parseInt(formData.get("account_id")),
      label: formData.get("label"),
      provider_key: formData.get("provider_key"),
      api_base_url: formData.get("api_base_url"),
      credential_reference: formData.get("credential_reference"),
      conversions_path: formData.get("conversions_path") || null,
      auth_header_name: formData.get("auth_header_name") || null,
      auth_scheme: formData.get("auth_scheme") || null,
      date_param_since: formData.get("date_param_since") || null,
      date_param_until: formData.get("date_param_until") || null,
      response_array_path: formData.get("response_array_path") || null,
      sync_frequency_minutes: formData.get("sync_frequency_minutes") ? parseInt(formData.get("sync_frequency_minutes")) : 60,
      field_mapping_json: formData.get("field_mapping_json") || null,
    };

    try {
      const res = await fetch("/en/api/v1/provider-adapter/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, "Provider adapter created. Use \"Sync Now\" to test it before waiting for the schedule.", true);
        form.reset();
        await loadProviderAdapters();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

async function syncProviderAdapterNow(id) {
  try {
    const res = await fetch("/en/api/v1/provider-adapter/sync-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.ok && data.error) {
      alert(`Sync failed: ${data.error}`);
    } else {
      alert(`Sync complete — ${data.importedCount} imported, ${data.duplicateCount} duplicates, ${data.unattributedCount} unattributed, ${data.errorCount} errors.`);
    }
    loadProviderAdapters();
  } catch {
    alert("Network error");
  }
}

async function archiveProviderAdapter(id) {
  if (!confirm("Archive this provider adapter? It will stop syncing.")) return;
  try {
    const res = await fetch("/en/api/v1/provider-adapter/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to archive"); return; }
    loadProviderAdapters();
  } catch { alert("Network error"); }
}
