document.addEventListener("DOMContentLoaded", () => {
  loadPartnersTable();
  initPartnerForm();
  initPartnerContactForm();

  const search = document.getElementById("partnerSearch");
  const statusFilter = document.getElementById("partnerStatusFilter");
  if (search) search.addEventListener("input", debouncePartnerFilter);
  if (statusFilter) statusFilter.addEventListener("change", loadPartnersTable);
});

let partnerFilterTimeout = null;
function debouncePartnerFilter() {
  clearTimeout(partnerFilterTimeout);
  partnerFilterTimeout = setTimeout(loadPartnersTable, 300);
}

async function loadPartnersTable() {
  const tbody = document.getElementById("partnersTableBody");
  if (!tbody) return;
  try {
    const search = document.getElementById("partnerSearch")?.value || "";
    const status = document.getElementById("partnerStatusFilter")?.value || "";
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);

    const res = await fetch(`/en/api/v1/affiliate-partners/list?${params}`);
    const data = await res.json();
    const partners = data.partners || [];
    if (partners.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No affiliate partners yet.</td></tr>';
      return;
    }
    tbody.innerHTML = partners.map(p => `
      <tr>
        <td><strong>${escapeHtml(p.name)}</strong><br><span class="muted">${escapeHtml(p.slug)}</span></td>
        <td>${escapeHtml(p.partner_type || "network")}</td>
        <td>${affStatusBadge(p.status)}</td>
        <td>${escapeHtml(p.contact_name || "-")}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editPartner(${p.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deletePartner(${p.id})">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

function affStatusBadge(status) {
  const cls = status === "active" ? "status-published" : "status-draft";
  return `<span class="status-badge ${cls}">${escapeHtml(status || "active")}</span>`;
}

function initPartnerForm() {
  const form = document.getElementById("partnerForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("partnerFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);
    const isEdit = !!formData.get("id");
    const endpoint = isEdit ? "/en/api/v1/affiliate-partner/update" : "/en/api/v1/affiliate-partner/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      name: formData.get("name"),
      slug: formData.get("slug") || undefined,
      partner_type: formData.get("partner_type"),
      status: formData.get("status"),
      website: formData.get("website") || null,
      description: formData.get("description") || null,
      contact_name: formData.get("contact_name") || null,
      contact_email: formData.get("contact_email") || null,
      contact_phone: formData.get("contact_phone") || null,
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
        affShowAlert(alertEl, isEdit ? "Partner updated!" : "Partner created!", true);
        cancelPartnerEdit();
        loadPartnersTable();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

function affShowAlert(el, message, success) {
  if (!el) return;
  el.className = success ? "alert alert--success" : "alert alert--error";
  el.textContent = message;
  el.style.display = "block";
}

async function editPartner(id) {
  try {
    const res = await fetch(`/en/api/v1/affiliate-partner/get?id=${id}`);
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to load partner"); return; }
    const p = data.partner;
    const form = document.getElementById("partnerForm");
    form.querySelector("[name='id']").value = p.id;
    form.querySelector("[name='name']").value = p.name;
    form.querySelector("[name='slug']").value = p.slug;
    form.querySelector("[name='partner_type']").value = p.partner_type || "network";
    form.querySelector("[name='status']").value = p.status || "active";
    form.querySelector("[name='website']").value = p.website || "";
    form.querySelector("[name='description']").value = p.description || "";
    form.querySelector("[name='contact_name']").value = p.contact_name || "";
    form.querySelector("[name='contact_email']").value = p.contact_email || "";
    form.querySelector("[name='contact_phone']").value = p.contact_phone || "";
    form.querySelector("[name='notes']").value = p.notes || "";
    document.getElementById("partnerSubmitBtn").textContent = "Update Partner";
    document.getElementById("partnerCancelEdit").style.display = "";

    renderPartnerContacts(p.id, p.name, p.contacts || []);
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load partner"); }
}

function cancelPartnerEdit() {
  const form = document.getElementById("partnerForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("partnerSubmitBtn").textContent = "Create Partner";
  document.getElementById("partnerCancelEdit").style.display = "none";
  document.getElementById("partnerContactsSection").style.display = "none";
}

async function deletePartner(id) {
  if (!confirm("Delete this affiliate partner? This will fail if any affiliate programs are still attached — archive it instead if you just want to deactivate it.")) return;
  try {
    const res = await fetch("/en/api/v1/affiliate-partner/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Delete failed"); return; }
    loadPartnersTable();
  } catch { alert("Network error"); }
}

// ── Contacts sub-section ──

function renderPartnerContacts(partnerId, partnerName, contacts) {
  const section = document.getElementById("partnerContactsSection");
  section.style.display = "";
  document.getElementById("partnerContactsName").textContent = partnerName;
  document.getElementById("contactPartnerId").value = partnerId;

  const body = document.getElementById("partnerContactsBody");
  if (!contacts.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted">No additional contacts.</td></tr>';
    return;
  }
  body.innerHTML = contacts.map(c => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.role || "-")}</td>
      <td>${escapeHtml(c.email || "-")}</td>
      <td>${escapeHtml(c.phone || "-")}</td>
      <td class="table-actions"><button class="btn btn--danger btn--sm" onclick="deletePartnerContact(${c.id}, ${partnerId})">Delete</button></td>
    </tr>
  `).join("");
}

function initPartnerContactForm() {
  const form = document.getElementById("partnerContactForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const payload = {
      partner_id: parseInt(formData.get("partner_id")),
      name: formData.get("name"),
      role: formData.get("role") || null,
      email: formData.get("email") || null,
      phone: formData.get("phone") || null,
    };
    try {
      const res = await fetch("/en/api/v1/affiliate-partner/contact/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        form.reset();
        form.querySelector("[name='partner_id']").value = payload.partner_id;
        editPartner(payload.partner_id);
      } else {
        alert(data.error || "Failed to add contact");
      }
    } catch { alert("Network error"); }
  });
}

async function deletePartnerContact(id, partnerId) {
  if (!confirm("Delete this contact?")) return;
  try {
    await fetch("/en/api/v1/affiliate-partner/contact/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    editPartner(partnerId);
  } catch { alert("Network error"); }
}
