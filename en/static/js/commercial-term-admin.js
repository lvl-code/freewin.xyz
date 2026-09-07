document.addEventListener("DOMContentLoaded", () => {
  initTermsPage();
});

async function initTermsPage() {
  const form = document.getElementById("termForm");
  if (!form) return; // not on this page

  await populateTermDropdowns();
  initTermTypeToggle();
  initTermForm();

  const programFilter = document.getElementById("termsProgramFilter");
  const casinoFilter = document.getElementById("termsCasinoFilter");
  if (programFilter) {
    programFilter.addEventListener("change", () => {
      document.getElementById("termProgramSelect").value = programFilter.value;
      loadAccountAndCasinoOptionsForProgram(programFilter.value);
      loadTermsTable();
    });
  }
  if (casinoFilter) casinoFilter.addEventListener("change", loadTermsTable);
}

async function populateTermDropdowns() {
  try {
    const res = await fetch("/en/api/v1/affiliate-programs/list?status=active");
    const data = await res.json();
    const programs = data.programs || [];
    const options = '<option value="">Select a program...</option>' +
      programs.map(p => `<option value="${p.id}">${escapeHtml(p.partner_name)} — ${escapeHtml(p.name)}</option>`).join("");

    document.getElementById("termsProgramFilter").innerHTML = options;
    document.getElementById("termProgramSelect").innerHTML = options.replace('Select a program...', 'Select a program...');
  } catch { /* leave empty on failure */ }

  document.getElementById("termProgramSelect").addEventListener("change", (e) => {
    loadAccountAndCasinoOptionsForProgram(e.target.value);
  });
}

async function loadAccountAndCasinoOptionsForProgram(programId) {
  const accountSelect = document.getElementById("termAccountSelect");
  const casinoSelect = document.getElementById("termCasinoSelect");
  const casinoFilter = document.getElementById("termsCasinoFilter");

  accountSelect.innerHTML = '<option value="">Program-wide</option>';
  casinoSelect.innerHTML = '<option value="">All casinos</option>';
  if (casinoFilter) casinoFilter.innerHTML = '<option value="">All casinos</option>';
  if (!programId) return;

  try {
    const [accountsRes, casinosRes] = await Promise.all([
      fetch(`/en/api/v1/affiliate-accounts/list?program_id=${programId}`),
      fetch(`/en/api/v1/affiliate-program/casinos?program_id=${programId}`),
    ]);
    const accountsData = await accountsRes.json();
    const casinosData = await casinosRes.json();

    const accounts = accountsData.accounts || [];
    accountSelect.innerHTML += accounts.map(a => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join("");

    const casinoList = casinosData.casinos || [];
    const casinoOptions = casinoList.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    casinoSelect.innerHTML += casinoOptions;
    if (casinoFilter) casinoFilter.innerHTML += casinoOptions;
  } catch { /* leave partially populated on failure */ }
}

function initTermTypeToggle() {
  const select = document.getElementById("termTypeSelect");
  if (!select) return;
  select.addEventListener("change", () => {
    document.querySelectorAll(".term-fields").forEach(el => {
      el.style.display = el.dataset.for === select.value ? "" : "none";
    });
  });
}

async function loadTermsTable() {
  const tbody = document.getElementById("termsTableBody");
  if (!tbody) return;
  const programId = document.getElementById("termsProgramFilter")?.value || "";
  if (!programId) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Select a program to view its commercial term history.</td></tr>';
    return;
  }
  try {
    const casinoId = document.getElementById("termsCasinoFilter")?.value || "";
    const params = new URLSearchParams({ program_id: programId });
    if (casinoId) params.set("casino_id", casinoId);

    const res = await fetch(`/en/api/v1/commercial-terms/history?${params}`);
    const data = await res.json();
    const terms = data.terms || [];
    if (terms.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No commercial terms recorded for this program yet.</td></tr>';
      return;
    }
    tbody.innerHTML = terms.map(t => `
      <tr>
        <td>${describeScopeLabel(t)}</td>
        <td>${escapeHtml(t.term_type)}</td>
        <td>${describeRate(t)}</td>
        <td>${escapeHtml(t.effective_date)}</td>
        <td>${escapeHtml(t.expiry_date || "open-ended")}</td>
        <td>${affStatusBadge(t.status)}</td>
        <td class="table-actions">
          ${t.status === "active" ? `<button class="btn btn--ghost btn--sm" onclick="supersedeTerm(${t.id})">Supersede</button>` : ""}
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Failed to load.</td></tr>';
  }
}

function describeScopeLabel(t) {
  const parts = [];
  parts.push(t.account_id ? "Account" : "Program");
  if (t.casino_id) parts.push("+ Casino");
  if (t.geo_code) parts.push(`+ ${escapeHtml(t.geo_code)}`);
  return parts.join(" ");
}

function describeRate(t) {
  switch (t.term_type) {
    case "cpa": return `$${t.cpa_amount ?? "-"} CPA`;
    case "revshare": return `${t.revshare_percent ?? "-"}% RevShare`;
    case "hybrid": return `$${t.hybrid_cpa_amount ?? 0} + ${t.hybrid_revshare_percent ?? 0}%`;
    case "fixed_fee": return `$${t.fixed_fee_amount ?? "-"} fixed`;
    default: return "custom";
  }
}

function initTermForm() {
  const form = document.getElementById("termForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("termFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);

    const payload = {
      program_id: parseInt(formData.get("program_id")),
      account_id: formData.get("account_id") ? parseInt(formData.get("account_id")) : null,
      casino_id: formData.get("casino_id") ? parseInt(formData.get("casino_id")) : null,
      geo_code: formData.get("geo_code") ? formData.get("geo_code").toUpperCase() : null,
      term_type: formData.get("term_type"),
      currency: formData.get("currency") || "USD",
      cpa_amount: formData.get("cpa_amount") ? parseFloat(formData.get("cpa_amount")) : null,
      revshare_percent: formData.get("revshare_percent") ? parseFloat(formData.get("revshare_percent")) : null,
      hybrid_cpa_amount: formData.get("hybrid_cpa_amount") ? parseFloat(formData.get("hybrid_cpa_amount")) : null,
      hybrid_revshare_percent: formData.get("hybrid_revshare_percent") ? parseFloat(formData.get("hybrid_revshare_percent")) : null,
      fixed_fee_amount: formData.get("fixed_fee_amount") ? parseFloat(formData.get("fixed_fee_amount")) : null,
      custom_terms_json: formData.get("custom_terms_json") || null,
      effective_date: formData.get("effective_date"),
      expiry_date: formData.get("expiry_date") || null,
      notes: formData.get("notes") || null,
    };

    try {
      const res = await fetch("/en/api/v1/commercial-term/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, "Commercial term created!", true);
        form.reset();
        document.getElementById("termsProgramFilter").value = payload.program_id;
        loadTermsTable();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

async function supersedeTerm(id) {
  const expiry = prompt("Supersede this term as of which date? (YYYY-MM-DD, leave blank for today)");
  if (expiry === null) return;
  try {
    const res = await fetch("/en/api/v1/commercial-term/supersede", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, expiry_date: expiry || null })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to supersede term"); return; }
    loadTermsTable();
  } catch { alert("Network error"); }
}
