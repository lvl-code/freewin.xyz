document.addEventListener("DOMContentLoaded", () => {
  initOffersPage();
});

async function initOffersPage() {
  const tbody = document.getElementById("offersTableBody");
  if (!tbody) return; // not on this page

  await Promise.all([populateOfferCasinoDropdowns(), populateOfferProgramDropdown()]);
  loadOffersTable();
  initOfferForm();

  const casinoFilter = document.getElementById("offerCasinoFilter");
  const statusFilter = document.getElementById("offerStatusFilter");
  const search = document.getElementById("offerSearch");
  if (casinoFilter) casinoFilter.addEventListener("change", loadOffersTable);
  if (statusFilter) statusFilter.addEventListener("change", loadOffersTable);
  if (search) search.addEventListener("input", debounceOfferFilter);
}

let offerFilterTimeout = null;
function debounceOfferFilter() {
  clearTimeout(offerFilterTimeout);
  offerFilterTimeout = setTimeout(loadOffersTable, 300);
}

async function populateOfferCasinoDropdowns() {
  try {
    const res = await fetch("/en/api/v1/casinos/list");
    const data = await res.json();
    const casinoList = data.casinos || [];
    const options = casinoList.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

    const filterSelect = document.getElementById("offerCasinoFilter");
    if (filterSelect) filterSelect.innerHTML = '<option value="">All Casinos</option>' + options;

    const formSelect = document.getElementById("offerCasinoSelect");
    if (formSelect) formSelect.innerHTML = options;

    const previewSelect = document.getElementById("previewCasinoSelect");
    if (previewSelect) previewSelect.innerHTML = casinoList.map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join("");
  } catch { /* leave dropdowns empty on failure */ }
}

async function populateOfferProgramDropdown() {
  try {
    const res = await fetch("/en/api/v1/affiliate-programs/list?status=active");
    const data = await res.json();
    const programs = data.programs || [];
    const options = programs.map(p => `<option value="${p.id}">${escapeHtml(p.partner_name)} — ${escapeHtml(p.name)}</option>`).join("");
    const select = document.getElementById("offerProgramSelect");
    if (select) select.innerHTML = '<option value="">Not linked yet</option>' + options;
  } catch { /* leave dropdown with just the default option */ }
}

async function loadOffersTable() {
  const tbody = document.getElementById("offersTableBody");
  if (!tbody) return;
  try {
    const casinoId = document.getElementById("offerCasinoFilter")?.value || "";
    const status = document.getElementById("offerStatusFilter")?.value || "";
    const search = document.getElementById("offerSearch")?.value || "";
    const params = new URLSearchParams();
    if (casinoId) params.set("casino_id", casinoId);
    if (status) params.set("status", status);
    if (search) params.set("search", search);

    const res = await fetch(`/en/api/v1/offers/list?${params}`);
    const data = await res.json();
    const offerList = data.offers || [];
    if (offerList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No offers yet.</td></tr>';
      return;
    }
    tbody.innerHTML = offerList.map(o => `
      <tr>
        <td>${escapeHtml(o.casino_name)}</td>
        <td><strong>${escapeHtml(o.internal_name)}</strong><br><span class="muted">${escapeHtml(o.public_headline || "no public headline yet")}</span></td>
        <td>${escapeHtml(o.offer_type)}</td>
        <td>${affStatusBadge(o.status)}</td>
        <td>${o.priority}</td>
        <td class="muted">${escapeHtml(o.start_date || "-")} → ${escapeHtml(o.expiry_date || "open")}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editOffer(${o.id})">Edit</button>
          ${offerStatusActionButtons(o)}
          <button class="btn btn--ghost btn--sm" onclick="viewOfferHistory(${o.id}, '${escapeHtml(o.internal_name)}')">History</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Failed to load.</td></tr>';
  }
}

function offerStatusActionButtons(o) {
  // Only surface the transitions that are actually legal from here
  // (mirrors ALLOWED_TRANSITIONS in worker/database/offers.js) so a
  // click can never trigger a transition the server would reject.
  const transitions = {
    draft: ["scheduled", "active", "disabled"],
    scheduled: ["active", "disabled"],
    active: ["expired", "disabled"],
    disabled: ["draft", "active"],
    expired: [],
  };
  const options = transitions[o.status] || [];
  if (!options.length) return "";
  return options.map(s => `<button class="btn btn--ghost btn--sm" onclick="changeOfferStatus(${o.id}, '${s}')">${s}</button>`).join(" ");
}

async function changeOfferStatus(id, newStatus) {
  let reason = null;
  if (newStatus === "expired" || newStatus === "disabled") {
    reason = prompt(`Reason for marking this offer as ${newStatus}? (optional)`) || null;
  }
  try {
    const res = await fetch("/en/api/v1/offer/status/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus, change_reason: reason })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Status change failed"); return; }
    loadOffersTable();
  } catch { alert("Network error"); }
}

function initOfferForm() {
  const form = document.getElementById("offerForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("offerFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);
    const isEdit = !!formData.get("id");
    const endpoint = isEdit ? "/en/api/v1/offer/update" : "/en/api/v1/offer/create";

    const toGeoArray = (val) => {
      const trimmed = (val || "").trim();
      if (!trimmed) return null;
      return trimmed.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    };
    const numOrNull = (val) => (val === "" || val === null || val === undefined) ? null : parseFloat(val);

    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      casino_id: parseInt(formData.get("casino_id")),
      program_id: formData.get("program_id") ? parseInt(formData.get("program_id")) : null,
      offer_type: formData.get("offer_type"),
      internal_name: formData.get("internal_name"),
      public_headline: formData.get("public_headline") || null,
      public_description: formData.get("public_description") || null,
      bonus_amount: numOrNull(formData.get("bonus_amount")),
      bonus_percent: numOrNull(formData.get("bonus_percent")),
      currency: formData.get("currency") || null,
      free_spins_qty: formData.get("free_spins_qty") ? parseInt(formData.get("free_spins_qty")) : null,
      min_deposit: numOrNull(formData.get("min_deposit")),
      max_bonus: numOrNull(formData.get("max_bonus")),
      wagering_multiplier: numOrNull(formData.get("wagering_multiplier")),
      max_bet: numOrNull(formData.get("max_bet")),
      eligible_games: formData.get("eligible_games") || null,
      terms_and_conditions: formData.get("terms_and_conditions") || null,
      start_date: formData.get("start_date") || null,
      expiry_date: formData.get("expiry_date") || null,
      allowed_geos: toGeoArray(formData.get("allowed_geos")),
      blocked_geos: toGeoArray(formData.get("blocked_geos")),
      priority: formData.get("priority") ? parseInt(formData.get("priority")) : 0,
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
        affShowAlert(alertEl, isEdit ? "Offer updated!" : "Offer created!", true);
        cancelOfferEdit();
        loadOffersTable();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

async function editOffer(id) {
  try {
    const res = await fetch(`/en/api/v1/offer/get?id=${id}`);
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to load offer"); return; }
    const o = data.offer;
    const form = document.getElementById("offerForm");
    form.querySelector("[name='id']").value = o.id;
    form.querySelector("[name='casino_id']").value = o.casino_id;
    form.querySelector("[name='program_id']").value = o.program_id || "";
    form.querySelector("[name='offer_type']").value = o.offer_type;
    form.querySelector("[name='internal_name']").value = o.internal_name;
    form.querySelector("[name='public_headline']").value = o.public_headline || "";
    form.querySelector("[name='public_description']").value = o.public_description || "";
    form.querySelector("[name='bonus_amount']").value = o.bonus_amount ?? "";
    form.querySelector("[name='bonus_percent']").value = o.bonus_percent ?? "";
    form.querySelector("[name='currency']").value = o.currency || "USD";
    form.querySelector("[name='free_spins_qty']").value = o.free_spins_qty ?? "";
    form.querySelector("[name='min_deposit']").value = o.min_deposit ?? "";
    form.querySelector("[name='max_bonus']").value = o.max_bonus ?? "";
    form.querySelector("[name='wagering_multiplier']").value = o.wagering_multiplier ?? "";
    form.querySelector("[name='max_bet']").value = o.max_bet ?? "";
    form.querySelector("[name='eligible_games']").value = o.eligible_games || "";
    form.querySelector("[name='terms_and_conditions']").value = o.terms_and_conditions || "";
    form.querySelector("[name='start_date']").value = (o.start_date || "").slice(0, 10);
    form.querySelector("[name='expiry_date']").value = (o.expiry_date || "").slice(0, 10);
    form.querySelector("[name='allowed_geos']").value = (JSON.parse(o.allowed_geos || "null") || []).join(", ");
    form.querySelector("[name='blocked_geos']").value = (JSON.parse(o.blocked_geos || "null") || []).join(", ");
    form.querySelector("[name='priority']").value = o.priority ?? 0;

    // A live/terminal offer's status is changed only via the table's
    // status-action buttons (so a reason gets recorded) -- the form's
    // status field only ever offers the pre-publish states.
    const statusSelect = document.getElementById("offerStatusSelect");
    if (["draft", "scheduled", "active"].includes(o.status)) {
      statusSelect.value = o.status;
      statusSelect.disabled = false;
    } else {
      statusSelect.innerHTML = `<option value="${o.status}">${o.status} (change via table actions)</option>`;
      statusSelect.disabled = true;
    }

    document.getElementById("offerSubmitBtn").textContent = "Update Offer";
    document.getElementById("offerCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load offer"); }
}

function cancelOfferEdit() {
  const form = document.getElementById("offerForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  const statusSelect = document.getElementById("offerStatusSelect");
  statusSelect.innerHTML = `<option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active</option>`;
  statusSelect.disabled = false;
  document.getElementById("offerSubmitBtn").textContent = "Create Offer";
  document.getElementById("offerCancelEdit").style.display = "none";
  document.getElementById("offerHistorySection").style.display = "none";
}

async function viewOfferHistory(id, name) {
  try {
    const res = await fetch(`/en/api/v1/offer/history?offer_id=${id}`);
    const data = await res.json();
    const section = document.getElementById("offerHistorySection");
    section.style.display = "";
    document.getElementById("offerHistoryName").textContent = name;

    const body = document.getElementById("offerHistoryBody");
    const history = data.history || [];
    if (!history.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">No history yet — this offer hasn\'t been edited since it first went live.</td></tr>';
    } else {
      body.innerHTML = history.map(v => {
        const snap = JSON.parse(v.snapshot_json);
        return `
          <tr>
            <td>v${v.version_number}</td>
            <td>${escapeHtml(snap.public_headline || "-")}</td>
            <td>${escapeHtml(v.valid_from)}</td>
            <td>${escapeHtml(v.valid_to || "-")}</td>
            <td>${escapeHtml(v.change_reason || "-")}</td>
          </tr>
        `;
      }).join("");
    }
    section.scrollIntoView({ behavior: "smooth" });
  } catch { alert("Failed to load history"); }
}

async function runOfferPreview() {
  const resultEl = document.getElementById("offerPreviewResult");
  const casinoSlug = document.getElementById("previewCasinoSelect").value;
  const countryCode = document.getElementById("previewCountryCode").value.trim().toUpperCase();
  if (!casinoSlug || !countryCode) return;

  try {
    const res = await fetch(`/en/api/v1/offer/resolve?casino_slug=${encodeURIComponent(casinoSlug)}&country_code=${encodeURIComponent(countryCode)}`);
    const data = await res.json();
    resultEl.style.display = "block";
    if (data.geoBlocked) {
      resultEl.className = "alert alert--error";
      resultEl.textContent = `This casino is GEO-blocked for ${countryCode} — no offer or bonus would be shown at all.`;
    } else if (data.offer) {
      resultEl.className = "alert alert--success";
      resultEl.textContent = `Winning offer: "${data.offer.internal_name}" — headline: "${data.offer.public_headline}" (priority ${data.offer.priority})`;
    } else if (data.geoRule?.bonus_override) {
      resultEl.className = "alert";
      resultEl.textContent = `No eligible offer — would fall back to the legacy GEO override: "${data.geoRule.bonus_override}"`;
    } else {
      resultEl.className = "alert";
      resultEl.textContent = `No eligible offer — would fall back to the casino's default bonus_title/bonus_value.`;
    }
  } catch {
    resultEl.style.display = "block";
    resultEl.className = "alert alert--error";
    resultEl.textContent = "Preview failed.";
  }
}
