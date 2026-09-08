document.addEventListener("DOMContentLoaded", () => {
  initCampaignsPage();
});

function initCampaignsPage() {
  const form = document.getElementById("cmpForm");
  if (!form) return; // not on this page

  loadCampaignsTable();
  initCmpForm();
  document.getElementById("cmpStatusFilter")?.addEventListener("change", loadCampaignsTable);
}

async function loadCampaignsTable() {
  const status = document.getElementById("cmpStatusFilter").value;
  const params = new URLSearchParams();
  if (status) params.set("status", status);

  const tbody = document.getElementById("cmpTableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="muted">Loading...</td></tr>`;

  try {
    const res = await fetch(`/en/api/v1/campaigns/list?${params}`);
    const data = await res.json();
    const campaigns = data.campaigns || [];
    if (!campaigns.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No campaigns yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = campaigns.map(c => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.utm_campaign || "—")}</td>
        <td>${escapeHtml(c.utm_source || "—")} / ${escapeHtml(c.utm_medium || "—")}</td>
        <td>${escapeHtml(c.status)}</td>
        <td>${c.start_date || "—"} → ${c.end_date || "—"}</td>
        <td class="table-actions">
          <button class="btn btn--sm" onclick="editCampaign(${c.id})">Edit</button>
        </td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Failed to load campaigns.</td></tr>`;
  }
}

async function editCampaign(id) {
  try {
    const res = await fetch(`/en/api/v1/campaign/get?id=${id}`);
    const data = await res.json();
    if (!data.success) return;
    const c = data.campaign;
    document.getElementById("cmpId").value = c.id;
    document.getElementById("cmpName").value = c.name || "";
    document.getElementById("cmpStatus").value = c.status || "active";
    document.getElementById("cmpUtmSource").value = c.utm_source || "";
    document.getElementById("cmpUtmMedium").value = c.utm_medium || "";
    document.getElementById("cmpUtmCampaign").value = c.utm_campaign || "";
    document.getElementById("cmpUtmTerm").value = c.utm_term || "";
    document.getElementById("cmpUtmContent").value = c.utm_content || "";
    document.getElementById("cmpStartDate").value = c.start_date || "";
    document.getElementById("cmpEndDate").value = c.end_date || "";
    document.getElementById("cmpNotes").value = c.notes || "";
    window.scrollTo({ top: document.getElementById("cmpForm").offsetTop - 20, behavior: "smooth" });
  } catch (e) {
    // no-op — leave form as-is
  }
}

function resetCampaignForm() {
  document.getElementById("cmpForm").reset();
  document.getElementById("cmpId").value = "";
}

function initCmpForm() {
  const form = document.getElementById("cmpForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const isEdit = !!formData.get("id");
    const endpoint = isEdit ? "/en/api/v1/campaign/update" : "/en/api/v1/campaign/create";

    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      name: formData.get("name"),
      status: formData.get("status"),
      utmSource: formData.get("utmSource") || null,
      utmMedium: formData.get("utmMedium") || null,
      utmCampaign: formData.get("utmCampaign") || null,
      utmTerm: formData.get("utmTerm") || null,
      utmContent: formData.get("utmContent") || null,
      startDate: formData.get("startDate") || null,
      endDate: formData.get("endDate") || null,
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
        resetCampaignForm();
        loadCampaignsTable();
      } else {
        alert(data.error || "Failed to save campaign");
      }
    } catch (e) {
      alert("Failed to save campaign");
    }
  });
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
