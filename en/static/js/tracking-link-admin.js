document.addEventListener("DOMContentLoaded", () => {
  initTrackingLinksPage();
});

let currentTlId = null;

async function initTrackingLinksPage() {
  const form = document.getElementById("tlForm");
  if (!form) return; // not on this page

  await Promise.all([
    populateTlCasinoDropdowns(),
    populateTlPartnerDropdown(),
    populateTlProgramDropdown(),
  ]);
  loadTrackingLinksTable();
  initTlForm();
  initTlGeoDestForm();

  document.getElementById("tlCasinoFilter")?.addEventListener("change", loadTrackingLinksTable);
  document.getElementById("tlStatusFilter")?.addEventListener("change", loadTrackingLinksTable);
  document.getElementById("tlHealthFilter")?.addEventListener("change", loadTrackingLinksTable);
  document.getElementById("tlSearch")?.addEventListener("input", debounceTlFilter);

  document.getElementById("tlCasinoSelect")?.addEventListener("change", (e) => {
    populateTlOfferDropdown(e.target.value);
  });
}

let tlFilterTimeout = null;
function debounceTlFilter() {
  clearTimeout(tlFilterTimeout);
  tlFilterTimeout = setTimeout(loadTrackingLinksTable, 300);
}

async function populateTlCasinoDropdowns() {
  try {
    const res = await fetch("/en/api/v1/casinos/list");
    const data = await res.json();
    const casinoList = data.casinos || [];
    const options = casinoList.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

    const filterSelect = document.getElementById("tlCasinoFilter");
    if (filterSelect) filterSelect.innerHTML = '<option value="">All Casinos</option>' + options;
    const formSelect = document.getElementById("tlCasinoSelect");
    if (formSelect) formSelect.innerHTML = '<option value="">None</option>' + options;
  } catch { /* leave empty on failure */ }
}

async function populateTlPartnerDropdown() {
  try {
    const res = await fetch("/en/api/v1/affiliate-partners/list?status=active");
    const data = await res.json();
    const options = (data.partners || []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    document.getElementById("tlPartnerSelect").innerHTML = '<option value="">None</option>' + options;
  } catch { /* leave empty on failure */ }
}

async function populateTlProgramDropdown() {
  try {
    const res = await fetch("/en/api/v1/affiliate-programs/list?status=active");
    const data = await res.json();
    const options = (data.programs || []).map(p => `<option value="${p.id}">${escapeHtml(p.partner_name)} — ${escapeHtml(p.name)}</option>`).join("");
    document.getElementById("tlProgramSelect").innerHTML = '<option value="">None</option>' + options;
  } catch { /* leave empty on failure */ }
}

async function populateTlOfferDropdown(casinoId) {
  const select = document.getElementById("tlOfferSelect");
  select.innerHTML = '<option value="">None</option>';
  if (!casinoId) return;
  try {
    const res = await fetch(`/en/api/v1/offers/list?casino_id=${casinoId}`);
    const data = await res.json();
    select.innerHTML += (data.offers || []).map(o => `<option value="${o.id}">${escapeHtml(o.internal_name)} (${escapeHtml(o.status)})</option>`).join("");
  } catch { /* leave partially populated on failure */ }
}

async function loadTrackingLinksTable() {
  const tbody = document.getElementById("tlTableBody");
  if (!tbody) return;
  try {
    const casinoId = document.getElementById("tlCasinoFilter")?.value || "";
    const status = document.getElementById("tlStatusFilter")?.value || "";
    const healthStatus = document.getElementById("tlHealthFilter")?.value || "";
    const search = document.getElementById("tlSearch")?.value || "";
    const params = new URLSearchParams();
    if (casinoId) params.set("casino_id", casinoId);
    if (status) params.set("status", status);
    if (healthStatus) params.set("health_status", healthStatus);
    if (search) params.set("search", search);

    const res = await fetch(`/en/api/v1/tracking-links/list?${params}`);
    const data = await res.json();
    const links = data.tracking_links || [];
    if (links.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No tracking links yet.</td></tr>';
      return;
    }
    tbody.innerHTML = links.map(l => `
      <tr>
        <td><strong>${escapeHtml(l.internal_name)}</strong><br><span class="muted">${escapeHtml(l.tracking_code)}</span></td>
        <td>${l.casino_id ? `#${l.casino_id}` : '<span class="muted">—</span>'}</td>
        <td class="muted" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(l.destination_url)}</td>
        <td>${affStatusBadge(l.status)}</td>
        <td>${healthBadge(l.health_status)}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editTrackingLink(${l.id})">Edit</button>
          <button class="btn btn--secondary btn--sm" onclick="runHealthCheckNow(${l.id})">Test Now</button>
          ${l.status === 'active'
            ? `<button class="btn btn--danger btn--sm" onclick="setTlStatus(${l.id}, 'disabled')">Disable</button>`
            : `<button class="btn btn--ghost btn--sm" onclick="setTlStatus(${l.id}, 'active')">Reactivate</button>`}
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

function healthBadge(status) {
  const cls = status === 'healthy' ? 'status-published'
    : (status === 'broken' ? 'status-draft' : 'status-draft');
  return `<span class="status-badge ${cls}">${escapeHtml(status || 'unknown')}</span>`;
}

function initTlForm() {
  const form = document.getElementById("tlForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("tlFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);
    const isEdit = !!formData.get("id");
    const endpoint = isEdit ? "/en/api/v1/tracking-link/update" : "/en/api/v1/tracking-link/create";

    const toGeoList = (raw) => raw ? raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) : null;

    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      internal_name: formData.get("internal_name"),
      tracking_code: formData.get("tracking_code") || undefined,
      destination_url: formData.get("destination_url"),
      casino_id: formData.get("casino_id") ? parseInt(formData.get("casino_id")) : null,
      partner_id: formData.get("partner_id") ? parseInt(formData.get("partner_id")) : null,
      program_id: formData.get("program_id") ? parseInt(formData.get("program_id")) : null,
      offer_id: formData.get("offer_id") ? parseInt(formData.get("offer_id")) : null,
      campaign: formData.get("campaign") || null,
      source: formData.get("source") || null,
      medium: formData.get("medium") || null,
      allowed_geos: toGeoList(formData.get("allowed_geos")),
      blocked_geos: toGeoList(formData.get("blocked_geos")),
      priority: parseInt(formData.get("priority") || "0"),
      status: formData.get("status"),
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, isEdit ? "Tracking link updated!" : `Tracking link created! Code: ${data.tracking_code || ''}`, true);
        cancelTlEdit();
        loadTrackingLinksTable();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

async function editTrackingLink(id) {
  try {
    const res = await fetch(`/en/api/v1/tracking-link/get?id=${id}`);
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to load tracking link"); return; }
    const l = data.tracking_link;
    currentTlId = id;

    const form = document.getElementById("tlForm");
    form.querySelector("[name='id']").value = l.id;
    form.querySelector("[name='internal_name']").value = l.internal_name;
    form.querySelector("[name='tracking_code']").value = l.tracking_code;
    form.querySelector("[name='destination_url']").value = l.destination_url;
    form.querySelector("[name='casino_id']").value = l.casino_id || "";
    form.querySelector("[name='partner_id']").value = l.partner_id || "";
    form.querySelector("[name='program_id']").value = l.program_id || "";
    form.querySelector("[name='campaign']").value = l.campaign || "";
    form.querySelector("[name='source']").value = l.source || "";
    form.querySelector("[name='medium']").value = l.medium || "";
    form.querySelector("[name='priority']").value = l.priority || 0;
    form.querySelector("[name='status']").value = l.status || "active";
    form.querySelector("[name='allowed_geos']").value = l.allowed_geos ? JSON.parse(l.allowed_geos).join(", ") : "";
    form.querySelector("[name='blocked_geos']").value = l.blocked_geos ? JSON.parse(l.blocked_geos).join(", ") : "";

    if (l.casino_id) {
      await populateTlOfferDropdown(l.casino_id);
    }
    form.querySelector("[name='offer_id']").value = l.offer_id || "";

    document.getElementById("tlSubmitBtn").textContent = "Update Tracking Link";
    document.getElementById("tlCancelEdit").style.display = "";

    renderGeoDestinations(l.geo_destinations || []);
    await loadHealthHistory(id);
    document.getElementById("tlDetailSection").style.display = "";
    document.getElementById("tlDetailName").textContent = l.internal_name;

    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load tracking link"); }
}

function cancelTlEdit() {
  const form = document.getElementById("tlForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("tlSubmitBtn").textContent = "Create Tracking Link";
  document.getElementById("tlCancelEdit").style.display = "none";
  document.getElementById("tlDetailSection").style.display = "none";
  currentTlId = null;
}

async function setTlStatus(id, status) {
  if (!confirm(`Set this tracking link's status to "${status}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/tracking-link/status/update", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to update status"); return; }
    loadTrackingLinksTable();
  } catch { alert("Network error"); }
}

async function runHealthCheckNow(id) {
  try {
    const res = await fetch("/en/api/v1/tracking-link/health-check/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Health check failed to run"); return; }
    alert(`Result: ${data.result.healthStatus}${data.result.errorMessage ? ' — ' + data.result.errorMessage : ''}`);
    loadTrackingLinksTable();
    if (currentTlId === id) await loadHealthHistory(id);
  } catch { alert("Network error"); }
}

// ── GEO destination overrides ──

function renderGeoDestinations(destinations) {
  const body = document.getElementById("tlGeoDestBody");
  if (!destinations.length) {
    body.innerHTML = '<tr><td colspan="2" class="muted">No GEO-specific overrides — the default destination URL is used everywhere.</td></tr>';
    return;
  }
  body.innerHTML = destinations.map(d => `<tr><td>${escapeHtml(d.country_code)}</td><td class="muted">${escapeHtml(d.destination_url)}</td></tr>`).join("");
}

function initTlGeoDestForm() {
  // Handled via the addGeoDestination() button click directly (see HTML onclick).
}

async function addGeoDestination() {
  if (!currentTlId) { alert("Save the tracking link first, then add GEO overrides."); return; }
  const country = document.getElementById("tlGeoDestCountry").value.trim().toUpperCase();
  const url = document.getElementById("tlGeoDestUrl").value.trim();
  if (!country || !url) { alert("Country code and override URL are both required."); return; }

  try {
    // Fetch existing destinations first so we REPLACE-with-addition, not wipe the rest.
    const existingRes = await fetch(`/en/api/v1/tracking-link/geo-destinations?tracking_link_id=${currentTlId}`);
    const existingData = await existingRes.json();
    const destinations = (existingData.geo_destinations || [])
      .filter(d => d.country_code !== country)
      .map(d => ({ country_code: d.country_code, destination_url: d.destination_url }));
    destinations.push({ country_code: country, destination_url: url });

    const res = await fetch("/en/api/v1/tracking-link/geo-destinations/assign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracking_link_id: currentTlId, destinations })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to add override"); return; }
    renderGeoDestinations(destinations);
    document.getElementById("tlGeoDestCountry").value = "";
    document.getElementById("tlGeoDestUrl").value = "";
  } catch { alert("Network error"); }
}

// ── Health history ──

async function loadHealthHistory(linkId) {
  const body = document.getElementById("tlHealthHistoryBody");
  try {
    const res = await fetch(`/en/api/v1/tracking-link/health-history?tracking_link_id=${linkId}`);
    const data = await res.json();
    const history = data.history || [];
    if (!history.length) {
      body.innerHTML = '<tr><td colspan="6" class="muted">No health checks recorded yet — use "Test Now" above.</td></tr>';
      return;
    }
    body.innerHTML = history.map(h => `
      <tr>
        <td>${escapeHtml(h.checked_at)}</td>
        <td>${healthBadge(h.health_status)}</td>
        <td>${h.http_status ?? '-'}</td>
        <td>${h.redirect_count ?? '-'}</td>
        <td>${h.response_time_ms != null ? h.response_time_ms + 'ms' : '-'}</td>
        <td class="muted">${escapeHtml(h.error_message || '')}</td>
      </tr>
    `).join("");
  } catch {
    body.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

// ── Resolve preview ──

async function runTlPreview() {
  const identifier = document.getElementById("tlPreviewIdentifier").value.trim();
  const country = document.getElementById("tlPreviewCountry").value.trim().toUpperCase();
  const resultEl = document.getElementById("tlPreviewResult");
  if (!identifier || !country) { alert("Identifier and country code are both required."); return; }

  try {
    const res = await fetch(`/en/api/v1/tracking-link/resolve-preview?identifier=${encodeURIComponent(identifier)}&country_code=${country}`);
    const data = await res.json();
    resultEl.style.display = "block";
    if (!data.success) {
      resultEl.className = "alert alert--error";
      resultEl.textContent = data.error || "Preview failed";
      return;
    }
    resultEl.className = "alert alert--success";
    if (data.type === "tracking_link") {
      resultEl.textContent = `Would redirect via tracking link "${data.trackingLink.internal_name}" to: ${data.destinationUrl}`;
    } else if (data.type === "legacy_casino") {
      resultEl.textContent = `Would redirect via legacy casino URL to: ${data.destinationUrl}`;
    } else if (data.type === "unavailable") {
      resultEl.className = "alert alert--error";
      resultEl.textContent = `Unavailable (${data.reason}). ${data.fallbackUrl ? 'Would fall back to: ' + data.fallbackUrl : 'No fallback available — visitor would see a not-found page.'}`;
    } else {
      resultEl.className = "alert alert--error";
      resultEl.textContent = "Not found — this identifier matches no tracking link or casino.";
    }
  } catch {
    resultEl.style.display = "block";
    resultEl.className = "alert alert--error";
    resultEl.textContent = "Network error";
  }
}
