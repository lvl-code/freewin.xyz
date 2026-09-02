// =====================================================
// NAVIGATION ADMIN
// =====================================================

// Friendly display labels for the "location" column. "page" is
// the new Page Navigation location added alongside header/footer/
// mobile — see migration 0017_page_nav_geo.sql.
const NAV_LOCATION_LABELS = {
  header: "Header",
  footer_casinos: "Footer — Casinos",
  footer_company: "Footer — Company",
  footer_support: "Footer — Support",
  footer_legal: "Footer — Legal",
  mobile: "Mobile Bottom Nav",
  page: "Page Navigation"
};

document.addEventListener("DOMContentLoaded", () => {
  loadNavTable();
  initNavForm();
  initLocationHint();
});

function initLocationHint() {
  const locationSelect = document.querySelector("#navForm [name='location']");
  const hint = document.getElementById("pageNavHint");
  if (!locationSelect || !hint) return;

  const toggleHint = () => {
    hint.style.display = locationSelect.value === "page" ? "block" : "none";
  };

  locationSelect.addEventListener("change", toggleHint);
  toggleHint();
}

async function loadNavTable() {
  const tbody = document.getElementById("navTableBody");
  if (!tbody) return;

  const filter = document.getElementById("navLocationFilter")?.value || "";
  const url = filter
    ? `/en/api/v1/nav/list?location=${filter}`
    : "/en/api/v1/nav/list";

  try {
    const res = await fetch(url);
    const data = await res.json();
    const items = data.nav || [];

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No nav items yet.</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(n => `
      <tr>
        <td><strong>${n.icon ? n.icon + " " : ""}${n.label}</strong></td>
        <td><a href="${n.url}" target="_blank">${n.url}</a></td>
        <td>${NAV_LOCATION_LABELS[n.location] || n.location}</td>
        <td>${n.position}</td>
        <td>${n.is_external ? "✓" : "—"}</td>
        <td>${n.enabled ? '<span class="status-badge status-published">Yes</span>' : '<span class="status-badge status-draft">No</span>'}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editNavItem(${n.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteNavItem(${n.id})">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Failed to load.</td></tr>';
  }
}

function initNavForm() {
  const form = document.getElementById("navForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("navFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/nav/update" : "/en/api/v1/nav/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : null,
      label: formData.get("label"),
      url: formData.get("url"),
      location: formData.get("location"),
      position: parseInt(formData.get("position")) || 0,
      is_external: formData.get("is_external") === "1",
      enabled: formData.get("enabled") === "1",
      icon: formData.get("icon") || null,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = isEdit ? "Nav item updated!" : "Nav item created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("navSubmitBtn").textContent = "Add Nav Item";
        document.getElementById("navCancelEdit").style.display = "none";
        hidePageNavGeoSection();
        loadNavTable();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

async function editNavItem(id) {
  try {
    const res = await fetch("/en/api/v1/nav/list");
    const data = await res.json();
    const item = (data.nav || []).find(n => n.id === id);
    if (!item) return;
    const form = document.getElementById("navForm");
    form.querySelector("[name='id']").value = item.id;
    form.querySelector("[name='label']").value = item.label;
    form.querySelector("[name='url']").value = item.url;
    form.querySelector("[name='location']").value = item.location;
    form.querySelector("[name='position']").value = item.position;
    form.querySelector("[name='is_external']").value = item.is_external ? "1" : "0";
    form.querySelector("[name='enabled']").value = item.enabled ? "1" : "0";
    form.querySelector("[name='icon']").value = item.icon || "";
    document.getElementById("navSubmitBtn").textContent = "Update Nav Item";
    document.getElementById("navCancelEdit").style.display = "";

    const hint = document.getElementById("pageNavHint");
    if (hint) hint.style.display = item.location === "page" ? "block" : "none";

    if (item.location === "page") {
      showPageNavGeoSection(item.id, item.label);
    } else {
      hidePageNavGeoSection();
    }

    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load nav item"); }
}

function cancelNavEdit() {
  const form = document.getElementById("navForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("navSubmitBtn").textContent = "Add Nav Item";
  document.getElementById("navCancelEdit").style.display = "none";

  const hint = document.getElementById("pageNavHint");
  if (hint) hint.style.display = "none";

  hidePageNavGeoSection();
}

async function deleteNavItem(id) {
  if (!confirm("Delete this nav item?")) return;
  try {
    await fetch("/en/api/v1/nav/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    hidePageNavGeoSection();
    loadNavTable();
  } catch { alert("Network error"); }
}

// =====================================================
// PAGE NAV — GEO VISIBILITY EDITOR
// =====================================================
// Only shown while editing an existing Page Navigation item.
// GEO rules are keyed to an existing nav_item id, so this panel
// cannot be used for an item that hasn't been saved yet.

let currentPageNavGeoItemId = null;

function showPageNavGeoSection(navItemId, label) {
  currentPageNavGeoItemId = navItemId;

  const section = document.getElementById("pageNavGeoSection");
  const labelEl = document.getElementById("pageNavGeoItemLabel");
  if (labelEl) labelEl.textContent = label || "";
  if (section) section.style.display = "block";

  loadPageNavGeoRules();
}

function hidePageNavGeoSection() {
  currentPageNavGeoItemId = null;
  const section = document.getElementById("pageNavGeoSection");
  if (section) section.style.display = "none";
}

async function loadPageNavGeoRules() {
  const tbody = document.getElementById("pageNavGeoTableBody");
  if (!tbody || !currentPageNavGeoItemId) return;

  tbody.innerHTML = '<tr><td colspan="3" class="muted">Loading...</td></tr>';

  try {
    const res = await fetch(
      `/en/api/v1/nav/geo/list?nav_item_id=${currentPageNavGeoItemId}`,
      { credentials: "same-origin" }
    );
    const data = await res.json();
    const rules = data.rules || [];

    if (rules.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="muted">No GEO rules — visible to everyone.</td></tr>';
      return;
    }

    tbody.innerHTML = rules.map(r => `
      <tr>
        <td><strong>${r.country_code}</strong></td>
        <td>${r.status}</td>
        <td class="table-actions">
          <button class="btn btn--danger btn--sm" onclick="removePageNavGeoRule(${r.id})">Remove</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="3" class="muted">Failed to load GEO rules.</td></tr>';
  }
}

async function addPageNavGeoRule() {
  const alertEl = document.getElementById("pageNavGeoAlert");
  if (alertEl) alertEl.style.display = "none";

  if (!currentPageNavGeoItemId) return;

  const countryInput = document.getElementById("pageNavGeoCountry");
  const statusSelect = document.getElementById("pageNavGeoStatus");

  const countryCode = (countryInput?.value || "").trim().toUpperCase();
  const status = statusSelect?.value || "allowed";

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    if (alertEl) {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Enter a valid 2-letter country code (e.g. CA, NZ, GB).";
      alertEl.style.display = "block";
    }
    return;
  }

  try {
    const res = await fetch("/en/api/v1/nav/geo/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        nav_item_id: currentPageNavGeoItemId,
        country_code: countryCode,
        status
      })
    });
    const data = await res.json();

    if (data.success) {
      if (countryInput) countryInput.value = "";
      loadPageNavGeoRules();
    } else if (alertEl) {
      alertEl.className = "alert alert--error";
      alertEl.textContent = data.error || "Failed to add GEO rule";
      alertEl.style.display = "block";
    }
  } catch {
    if (alertEl) {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error";
      alertEl.style.display = "block";
    }
  }
}

async function removePageNavGeoRule(id) {
  if (!confirm("Remove this GEO rule?")) return;
  try {
    await fetch("/en/api/v1/nav/geo/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id })
    });
    loadPageNavGeoRules();
  } catch {
    alert("Network error");
  }
}
