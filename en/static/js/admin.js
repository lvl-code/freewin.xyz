// =====================================================
// ADMIN: REVIEWS, NEWS, PAGES, SETTINGS, AI
// Handles all admin sub-pages beyond dashboard + casinos
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  loadReviewsTable();
  loadNewsTable();
  loadPagesTable();
  loadSettingsForm();
  initReviewForm();
  initNewsForm();
  initPageForm();
  initSettingsForm();
  initAIGenerator();
  loadCategoriesTable();
  initCategoryForm();
  loadCountriesTable();
  initCountryForm();
});

// ============================================
// REVIEWS
// ============================================

async function loadReviewsTable() {
  const tbody = document.getElementById("reviewsTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/reviews/list");
    const data = await res.json();
    const reviews = data.reviews || [];

    if (reviews.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No reviews yet.</td></tr>';
      return;
    }

    tbody.innerHTML = reviews
      .map(
        (r) => `
      <tr>
        <td><strong>${r.title}</strong></td>
        <td>${r.casino_slug || "—"}</td>
        <td>${r.country_code || "Global"}</td>
        <td>★ ${r.rating || "N/A"}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editReview('${r.slug}')">Edit</button>
          <a href="/en/review/${r.slug}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <button class="btn btn--danger btn--sm" onclick="deleteReview('${r.slug}')">Delete</button>
        </td>

      </tr>
    `
      )
      .join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

function initReviewForm() {
  const form = document.getElementById("reviewForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("reviewFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/review/update" : "/en/api/v1/review/create";
  //  const payload = {
    //  slug: formData.get("slug"),
     // casino_slug: formData.get("casino_slug"),
     // country_code: formData.get("country_code") || null,
     // title: formData.get("title"),
     // content: formData.get("content"),
     // pros: formData.get("pros") ? formData.get("pros").split("\n").map((p) => p.trim()).filter(Boolean) : [],
     // cons: formData.get("cons") ? formData.get("cons").split("\n").map((c) => c.trim()).filter(Boolean) : [],
     // rating: parseFloat(formData.get("rating")) || 0,
     // seo_title: formData.get("seo_title") || null,
     // seo_description: formData.get("seo_description") || null,
     // author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
   // };

const payload = {
  slug: formData.get("slug"),
  casino_slug: formData.get("casino_slug"),
  country_code: formData.get("country_code") || null,

  title: formData.get("title"),

  overview: formData.get("overview") || "",
  games: formData.get("games") || "",
  bonuses: formData.get("bonuses") || "",
  payments: formData.get("payments") || "",
  licenses: formData.get("licenses") || "",
  verdict: formData.get("verdict") || "",

  content: formData.get("content") || "",

  pros: formData.get("pros")
    ? formData.get("pros")
        .split("\n")
        .map(p => p.trim())
        .filter(Boolean)
    : [],

  cons: formData.get("cons")
    ? formData.get("cons")
        .split("\n")
        .map(c => c.trim())
        .filter(Boolean)
    : [],

  faq_json: formData.get("faq_json") || "[]",
  rating: parseFloat(formData.get("rating")) || 0,

  seo_title: formData.get("seo_title") || null,

  seo_description: formData.get("seo_description") || null,

  author_id: formData.get("author_id")
    ? parseInt(formData.get("author_id"))
    : null
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
          alertEl.textContent = isEdit ? "Review updated!" : "Review created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("reviewSubmitBtn").textContent = "Create Review";
        document.getElementById("reviewCancelEdit").style.display = "none";
        loadReviewsTable();
      } else {
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error";
        alertEl.style.display = "block";
      }
    }
  });
}

// ============================================
// NEWS
// ============================================

async function loadNewsTable() {
  const tbody = document.getElementById("newsTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/news/list");
    const data = await res.json();
    const news = data.news || [];

    if (news.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No news articles yet.</td></tr>';
      return;
    }

    tbody.innerHTML = news
      .map(
        (n) => `
      <tr>
        <td><strong>${n.title}</strong></td>
        <td>${n.author || "Admin"}</td>
        <td>${new Date(n.created_at).toLocaleDateString()}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editNews('${n.slug}')">Edit</button>
          <a href="/en/news/${n.slug}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <button class="btn btn--danger btn--sm" onclick="deleteNewsArticle('${n.slug}')">Delete</button>
        </td>

      </tr>
    `
      )
      .join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}

function initNewsForm() {
  const form = document.getElementById("newsForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("newsFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/news/update" : "/en/api/v1/news/create";
    const oldSlug = form.dataset.slug;
    const payload = {
      old_slug: form.dataset.slug,
      slug: formData.get("slug"),
      title: formData.get("title"),
      content: formData.get("content"),
      author: formData.get("author") || "Admin",
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        form.dataset.slug = payload.slug;
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = isEdit ? "Article updated!" : "News article created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("newsSubmitBtn").textContent = "Create Article";
        document.getElementById("newsCancelEdit").style.display = "none";
        loadNewsTable();
      } else {
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error";
        alertEl.style.display = "block";
      }
    }
  });
}

// ============================================
// PAGES
// ============================================

async function loadPagesTable() {
  const tbody = document.getElementById("pagesTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/pages/list");
    const data = await res.json();
    const pages = data.pages || [];

    if (pages.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No pages yet.</td></tr>';
      return;
    }

    tbody.innerHTML = pages
      .map(
        (p) => `
      <tr>
        <td><strong>${p.title}</strong></td>
        <td>${p.slug}</td>
        <td>${p.type}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editPage('${p.slug}')">Edit</button>
          <a href="/en/${p.slug}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <button class="btn btn--danger btn--sm" onclick="deletePage('${p.slug}')">Delete</button>
        </td>

      </tr>
    `
      )
      .join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}

function initPageForm() {
  const form = document.getElementById("pageForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("pageFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/page/update" : "/en/api/v1/page/create";
    const payload = {
      slug: formData.get("slug"),
      type: formData.get("type") || "page",
      template: formData.get("template") || "page",
      title: formData.get("title"),
      content_json: formData.get("content_json") || {},
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
    };

    // Try to parse content_json if it's a string
    if (typeof payload.content_json === "string") {
      try {
        payload.content_json = JSON.parse(payload.content_json);
      } catch {
        payload.content_json = { text: payload.content_json };
      }
    }

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
          alertEl.textContent = isEdit ? "Page updated!" : "Page created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("pageSubmitBtn").textContent = "Create Page";
        document.getElementById("pageCancelEdit").style.display = "none";
        loadPagesTable();
      } else {
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error";
        alertEl.style.display = "block";
      }
    }
  });
}


// ============================================================
// SITE SETTINGS
// ============================================================

let currentComplianceItems = [];

async function loadSettingsForm() {

  const form =
    document.getElementById("settingsForm");

  if (!form) return;

  try {

    const res =
      await fetch("/en/api/v1/settings/get");

    if (!res.ok) {
      throw new Error(
        `Settings request failed: ${res.status}`
      );
    }

    const data =
      await res.json();

    const settings =
      data.settings || {};


    // --------------------------------------------------------
    // Populate normal fields
    // --------------------------------------------------------

    form.querySelectorAll(
      "input[name], textarea[name]"
    ).forEach(input => {

      const key =
        input.name;

      if (
        key === "footer_compliance"
      ) {
        return;
      }

      if (
        settings[key] !== undefined &&
        settings[key] !== null
      ) {
        input.value =
          settings[key];
      }
    });


    // --------------------------------------------------------
    // Compliance JSON
    // --------------------------------------------------------

    currentComplianceItems = [];

    if (settings.footer_compliance) {

      try {

        const parsed =
          JSON.parse(
            settings.footer_compliance
          );

        if (Array.isArray(parsed)) {
          currentComplianceItems =
            parsed;
        }

      } catch (error) {

        console.warn(
          "Invalid footer compliance JSON"
        );

      }
    }


    renderComplianceRows();

  } catch (error) {

    console.error(
      "Failed to load settings:",
      error
    );

  }
}


// ------------------------------------------------------------
// Compliance rows
// ------------------------------------------------------------

function renderComplianceRows() {

  const container =
    document.getElementById(
      "complianceRows"
    );

  if (!container) return;

  container.innerHTML = "";

  currentComplianceItems.forEach(
    (item, index) => {

      const row =
        document.createElement("div");

      row.className =
        "site-compliance-row";

      row.style.cssText = `
        border:1px solid var(--border);
        border-radius:8px;
        padding:16px;
        margin:12px 0;
      `;

      row.innerHTML = `
        <div class="form-group">
          <label>Image URL</label>
          <input
            type="url"
            class="compliance-image"
            value="${escapeHtmlAttribute(item.image || "")}"
            placeholder="/static/images/logo/example.svg"
          >
        </div>

        <div class="form-group">
          <label>Link URL</label>
          <input
            type="url"
            class="compliance-url"
            value="${escapeHtmlAttribute(item.url || "")}"
            placeholder="https://..."
          >
        </div>

        <div class="form-group">
          <label>Alt Text</label>
          <input
            type="text"
            class="compliance-alt"
            value="${escapeHtmlAttribute(item.alt || "")}"
            placeholder="Compliance organization"
          >
        </div>

        <button
          type="button"
          class="btn btn--ghost remove-compliance"
        >
          Remove
        </button>
      `;

      row
        .querySelector(
          ".remove-compliance"
        )
        .addEventListener(
          "click",
          () => {

            currentComplianceItems
              .splice(index, 1);

            renderComplianceRows();

          }
        );

      container.appendChild(row);
    }
  );
}


// ------------------------------------------------------------
// Add compliance item
// ------------------------------------------------------------

function addComplianceRow() {

  currentComplianceItems.push({
    image: "",
    url: "",
    alt: ""
  });

  renderComplianceRows();
}


// ------------------------------------------------------------
// Read compliance rows
// ------------------------------------------------------------

function collectComplianceRows() {

  const rows =
    document.querySelectorAll(
      "#complianceRows .site-compliance-row"
    );

  return Array.from(rows)
    .map(row => ({
      image:
        row.querySelector(
          ".compliance-image"
        )?.value.trim() || "",

      url:
        row.querySelector(
          ".compliance-url"
        )?.value.trim() || "",

      alt:
        row.querySelector(
          ".compliance-alt"
        )?.value.trim() || ""
    }))
    .filter(item => item.image);
}


// ------------------------------------------------------------
// Escape HTML attribute
// ------------------------------------------------------------

function escapeHtmlAttribute(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// ------------------------------------------------------------
// Initialize settings form
// ------------------------------------------------------------

function initSettingsForm() {

  const form =
    document.getElementById(
      "settingsForm"
    );

  if (!form) return;


  const addButton =
    document.getElementById(
      "addComplianceBtn"
    );

  if (addButton) {

    addButton.addEventListener(
      "click",
      addComplianceRow
    );

  }


  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const alertEl =
        document.getElementById(
          "settingsFormAlert"
        );

      try {

        const formData =
          new FormData(form);

        const payload = {};


        for (
          const [key, value]
          of formData.entries()
        ) {

          payload[key] =
            String(value);

        }


        payload.footer_compliance =
          JSON.stringify(
            collectComplianceRows()
          );


        const res =
          await fetch(
            "/en/api/v1/settings/save",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body:
                JSON.stringify(payload)
            }
          );


        const data =
          await res.json();


        if (!res.ok || data.success === false) {

          throw new Error(
            data.error ||
            "Failed to save settings"
          );

        }


        if (alertEl) {

          alertEl.style.display =
            "block";

          alertEl.textContent =
            "Site settings saved successfully.";

        }

      } catch (error) {

        console.error(
          "Failed to save settings:",
          error
        );

        if (alertEl) {

          alertEl.style.display =
            "block";

          alertEl.textContent =
            error.message ||
            "Failed to save settings.";

        }

      }

    }
  );
}

// ============================================
// AI GENERATOR
// ============================================

function initAIGenerator() {
  const form = document.getElementById("aiForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("aiAlert");
    const outputEl = document.getElementById("aiOutput");
    const submitBtn = form.querySelector('button[type="submit"]');

    if (alertEl) alertEl.style.display = "none";
    if (outputEl) outputEl.value = "Generating... please wait.";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Generating...";
    }

    const formData = new FormData(form);
    const payload = {
      casino: formData.get("casino"),
      country: formData.get("country") || "Global",
      slug: formData.get("slug") || formData.get("casino").toLowerCase().replace(/\s+/g, "-"),
    };

    try {
      const res = await fetch("/en/api/v1/ai/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        if (outputEl) outputEl.value = data.content || "No content returned.";
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = "Review generated! Copy the content below.";
          alertEl.style.display = "block";
        }
      } else {
        if (outputEl) outputEl.value = "";
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Generation failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (outputEl) outputEl.value = "";
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error. Try again.";
        alertEl.style.display = "block";
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Generate Review";
      }
    }
  });
}



// ============================================
// CATEGORIES
// ============================================

async function loadCategoriesTable() {
  const tbody = document.getElementById("categoriesTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/categories/list");
    const data = await res.json();
    const cats = data.categories || [];
    if (cats.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No categories yet.</td></tr>';
      return;
    }
    tbody.innerHTML = cats.map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td>${c.slug}</td>
        <td>${c.description || ""}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editCategory(${c.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteCategory('${c.slug}')">Delete</button>
        </td>

      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}

async function deleteCategory(slug) {
  if (!confirm(`Delete category "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/category/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadCategoriesTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

function initCategoryForm() {
  const form = document.getElementById("categoryForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("categoryFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/category/update" : "/en/api/v1/category/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : null,
      slug: formData.get("slug"),
      name: formData.get("name"),
      description: formData.get("description") || null,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
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
          alertEl.textContent = isEdit ? "Category updated!" : "Category created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("categorySubmitBtn").textContent = "Create Category";
        document.getElementById("categoryCancelEdit").style.display = "none";
        loadCategoriesTable();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

// ============================================
// COUNTRIES
// ============================================

async function loadCountriesTable() {
  const tbody = document.getElementById("countriesTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/countries/list");
    const data = await res.json();
    const countriesList = data.countries || [];
    if (countriesList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No countries yet.</td></tr>';
      return;
    }
    tbody.innerHTML = countriesList.map(c => `
      <tr>
        <td><strong>${c.code}</strong></td>
        <td>${c.name}</td>
        <td>${c.currency || "—"}</td>
        <td>${c.legal_status || "—"}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editCountry('${c.code}')">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteCountry('${c.code}')">Delete</button>
        </td>

      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function deleteCountry(code) {
  if (!confirm(`Delete country "${code}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/country/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (data.success) loadCountriesTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

function initCountryForm() {
  const form = document.getElementById("countryForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("countryFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);

    const isEdit = form.dataset.editMode === "true";
    const endpoint = isEdit ? "/en/api/v1/country/update" : "/en/api/v1/country/create";
    const payload = {
      code: formData.get("code"),
      name: formData.get("name"),
      currency: formData.get("currency") || null,
      language: formData.get("language") || null,
      legal_status: formData.get("legal_status") || null,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
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
          alertEl.textContent = isEdit ? "Country updated!" : "Country created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='code']").readOnly = false;
        delete form.dataset.editMode;
        document.getElementById("countrySubmitBtn").textContent = "Create Country";
        document.getElementById("countryCancelEdit").style.display = "none";
        loadCountriesTable();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

async function deleteReview(slug) {
  if (!confirm(`Delete review "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/review/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadReviewsTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}


async function deletePage(slug) {
  if (!confirm(`Delete page "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/page/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadPagesTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

async function deleteNewsArticle(slug) {
  if (!confirm(`Delete news article "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/news/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadNewsTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}


// ── Review Edit ──

async function editReview(slug) {
  try {
    const res = await fetch("/en/api/v1/reviews/list");
    const data = await res.json();
    const review = (data.reviews || []).find(r => r.slug === slug);
    if (!review) return;
    const form = document.getElementById("reviewForm");
    form.querySelector("[name='id']").value = review.id;
    form.querySelector("[name='slug']").value = review.slug;
    form.querySelector("[name='casino_slug']").value = review.casino_slug || "";
    form.querySelector("[name='country_code']").value = review.country_code || "";
    form.querySelector("[name='rating']").value = review.rating || 0;
    form.querySelector("[name='title']").value = review.title;
    form.querySelector("[name='overview']").value = review.overview || "";
    form.querySelector("[name='games']").value = review.games || "";
    form.querySelector("[name='bonuses']").value = review.bonuses || "";
    form.querySelector("[name='payments']").value = review.payments || "";
    form.querySelector("[name='licenses']").value = review.licenses || "";
    form.querySelector("[name='verdict']").value = review.verdict || "";

    form.querySelector("[name='content']").value = review.content || "";
   // setTimeout(() => {
     // RichEditor.set("review-overview", review.content || "");
   // }, 300); 
setTimeout(() => {

  RichEditor.set(
    "review-overview",
    review.overview || ""
  );

  RichEditor.set(
    "review-games",
    review.games || ""
  );

  RichEditor.set(
    "review-bonuses",
    review.bonuses || ""
  );

  RichEditor.set(
    "review-payments",
    review.payments || ""
  );

  RichEditor.set(
    "review-licenses",
    review.licenses || ""
  );

  RichEditor.set(
    "review-verdict",
    review.verdict || ""
  );

  RichEditor.set(
    "review-content",
    review.content || ""
  );

}, 300);

    let pros = [];
    try { pros = JSON.parse(review.pros || "[]"); } catch {}
    form.querySelector("[name='pros']").value = pros.join("\n");
    let cons = [];
    try { cons = JSON.parse(review.cons || "[]"); } catch {}
    form.querySelector("[name='cons']").value = cons.join("\n");
    form.querySelector("[name='faq_json']").value = review.faq_json || "[]";
    form.querySelector("[name='seo_title']").value = review.seo_title || "";
    form.querySelector("[name='seo_description']").value = review.seo_description || "";
        // Set author dropdown
    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) authorSelect.value = review.author_id || "";

    document.getElementById("reviewSubmitBtn").textContent = "Update Review";
    document.getElementById("reviewCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load review"); }
}

function cancelReviewEdit() {
  const form = document.getElementById("reviewForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("reviewSubmitBtn").textContent = "Create Review";
  document.getElementById("reviewCancelEdit").style.display = "none";
  RichEditor.set("review-overview", "");
}


// ── News Edit ──

async function editNews(slug) {
  try {
    const res = await fetch("/en/api/v1/news/list");
    const data = await res.json();
    const article = (data.news || []).find(n => n.slug === slug);
    if (!article) return;
    const form = document.getElementById("newsForm");
    form.querySelector("[name='id']").value = article.id;
    form.querySelector("[name='slug']").value = article.slug;
    form.dataset.slug = article.slug;
    form.querySelector("[name='author']").value = article.author || "Admin";
    form.querySelector("[name='title']").value = article.title;
    form.querySelector("[name='content']").value = article.content || "";
    setTimeout(() => {
      RichEditor.set("news-content", article.content || "");
    }, 300);
    form.querySelector("[name='seo_title']").value = article.seo_title || "";
    form.querySelector("[name='seo_description']").value = article.seo_description || "";
        // Set author dropdown
    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) authorSelect.value = article.author_id || "";

    document.getElementById("newsSubmitBtn").textContent = "Update Article";
    document.getElementById("newsCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load article"); }
}

function cancelNewsEdit() {
  const form = document.getElementById("newsForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("newsSubmitBtn").textContent = "Create Article";
  document.getElementById("newsCancelEdit").style.display = "none";
  RichEditor.set("news-content", "");
}




// ── Page Edit new ──
async function editPage(slug) {
  try {
    const res = await fetch("/en/api/v1/pages/list");
    const data = await res.json();

    const page = (data.pages || []).find(p => p.slug === slug);
    if (!page) return;

    const form = document.getElementById("pageForm");
    if (!form) return;

    // Basic fields
    form.querySelector("[name='id']").value = page.id || "";
    form.querySelector("[name='slug']").value = page.slug || "";
    form.querySelector("[name='type']").value = page.type || "page";
    form.querySelector("[name='template']").value = page.template || "page";
    form.querySelector("[name='title']").value = page.title || "";

    // ==========================================
    // CONTENT
    // Supports old JSON + new HTML
    // ==========================================

    let pageContent = page.content_json || "";

    // If stored as JSON string, parse it
    if (typeof pageContent === "string") {
      const trimmed = pageContent.trim();

      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          pageContent = JSON.parse(trimmed);
        } catch {
          // Keep as normal HTML/text
        }
      }
    }

    // If old content is an object/array
    if (typeof pageContent === "object" && pageContent !== null) {

      // Most likely old structures
      pageContent =
        pageContent.html ??
        pageContent.content ??
        pageContent.body ??
        pageContent.text ??
        pageContent.value ??
        pageContent.description ??
        "";

      // If the selected value is still an object/array,
      // convert its useful values to editor content
      if (typeof pageContent === "object" && pageContent !== null) {
        pageContent = Array.isArray(pageContent)
          ? pageContent
              .map(item =>
                typeof item === "string"
                  ? item
                  : item.html ||
                    item.content ||
                    item.body ||
                    item.text ||
                    ""
              )
              .filter(Boolean)
              .join("\n")
          : pageContent.html ||
            pageContent.content ||
            pageContent.body ||
            pageContent.text ||
            "";
      }
    }

    // Final safety
    pageContent = String(pageContent || "");

    console.log("Original:", page.content_json);
    console.log("Editor content:", pageContent);

    // Keep textarea/hidden field synchronized
    const contentField = form.querySelector(
      "[name='content_json']"
    );

    if (contentField) {
      contentField.value = pageContent;
    }

    // ==========================================
    // RICH EDITOR
    // ==========================================

    const setEditor = () => {
      if (
        window.RichEditor &&
        typeof RichEditor.set === "function"
      ) {
        RichEditor.set("page-content", pageContent);
      }
    };

    setEditor();
    setTimeout(setEditor, 300);
    setTimeout(setEditor, 800);

    // SEO
    form.querySelector("[name='seo_title']").value =
      page.seo_title || "";

    form.querySelector("[name='seo_description']").value =
      page.seo_description || "";

    // Author
    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) {
      authorSelect.value = page.author_id || "";
    }

    // Edit mode
    document.getElementById("pageSubmitBtn").textContent =
      "Update Page";

    document.getElementById("pageCancelEdit").style.display = "";

    window.scrollTo({
      top: form.offsetTop - 100,
      behavior: "smooth"
    });

  } catch (err) {
    console.error("Failed to load page:", err);
    alert("Failed to load page");
  }
}

// ── Page Edit legacy ──


async function editPagebackup(slug) {
  try {
    const res = await fetch("/en/api/v1/pages/list");
    const data = await res.json();
    const page = (data.pages || []).find(p => p.slug === slug);
    if (!page) return;
    const form = document.getElementById("pageForm");
    form.querySelector("[name='id']").value = page.id;
    form.querySelector("[name='slug']").value = page.slug;
    form.querySelector("[name='type']").value = page.type || "page";
    form.querySelector("[name='template']").value = page.template || "page";
    form.querySelector("[name='title']").value = page.title;

    let pageContent = page.content_json || "";

    // Convert JSON content into plain editor content
    if (typeof pageContent === "string") {
      try {
        pageContent = JSON.parse(pageContent);
      } catch {
        // Already plain text
      }
    }

    if (pageContent && typeof pageContent === "object") {
      pageContent = pageContent.text || "";
    }

    form.querySelector("[name='content_json']").value = pageContent;

    setTimeout(() => {
      if (window.RichEditor && typeof RichEditor.set === "function") {
        RichEditor.set("page-content", pageContent || "");
      }
    }, 300);
    form.querySelector("[name='seo_title']").value = page.seo_title || "";
    form.querySelector("[name='seo_description']").value = page.seo_description || "";
        // Set author dropdown
    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) authorSelect.value = page.author_id || "";

    document.getElementById("pageSubmitBtn").textContent = "Update Page";
    document.getElementById("pageCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load page"); }
}

function cancelPageEdit() {
  const form = document.getElementById("pageForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("pageSubmitBtn").textContent = "Create Page";
  document.getElementById("pageCancelEdit").style.display = "none";
  RichEditor.set("page-content", "");
}


// ── Category Edit ──

async function editCategory(id) {
  try {
    const res = await fetch(`/en/api/v1/category/get-by-id?id=${id}`);
    const data = await res.json();
    if (!data.success) return;
    const c = data.category;
    const form = document.getElementById("categoryForm");
    form.querySelector("[name='id']").value = c.id;
    form.querySelector("[name='slug']").value = c.slug;
    form.querySelector("[name='name']").value = c.name;
    form.querySelector("[name='description']").value = c.description || "";
    setTimeout(() => {
      RichEditor.set("category-description", c.description || "");
    }, 300);
    form.querySelector("[name='seo_title']").value = c.seo_title || "";
    form.querySelector("[name='seo_description']").value = c.seo_description || "";
    document.getElementById("categorySubmitBtn").textContent = "Update Category";
    document.getElementById("categoryCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load category"); }
}

function cancelCategoryEdit() {
  const form = document.getElementById("categoryForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("categorySubmitBtn").textContent = "Create Category";
  document.getElementById("categoryCancelEdit").style.display = "none";
  RichEditor.set("category-description", "");
}

// ── Country Edit ──
async function editCountry(code) {
  try {
    const res = await fetch(`/en/api/v1/country/get-by-code?code=${code}`);
    const data = await res.json();
    if (!data.success) return;
    const c = data.country;
    const form = document.getElementById("countryForm");
    form.querySelector("[name='code']").value = c.code;
    form.querySelector("[name='code']").readOnly = true; // Prevent changing primary key
    form.querySelector("[name='name']").value = c.name;
    form.querySelector("[name='currency']").value = c.currency || "";
    form.querySelector("[name='language']").value = c.language || "";
    form.querySelector("[name='legal_status']").value = c.legal_status || "";
    form.querySelector("[name='seo_title']").value = c.seo_title || "";
    form.querySelector("[name='seo_description']").value = c.seo_description || "";
    document.getElementById("countrySubmitBtn").textContent = "Update Country";
    document.getElementById("countryCancelEdit").style.display = "";
    form.dataset.editMode = "true";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load country"); }
}
function cancelCountryEdit() {
  const form = document.getElementById("countryForm");
  form.reset();
  form.querySelector("[name='code']").readOnly = false;
  delete form.dataset.editMode;
  document.getElementById("countrySubmitBtn").textContent = "Create Country";
  document.getElementById("countryCancelEdit").style.display = "none";
}



/* =========================================================
PLATFORM UPDATES
========================================================= */

async function loadPlatformUpdatesTable() {
const tbody = document.getElementById("updatesTableBody");

if (!tbody) return;

try {
const res = await fetch(
"/en/api/v1/platform-updates/list"
);

const data = await res.json();

if (!res.ok || !data.success) {
  throw new Error(
    data.error || "Failed to load platform updates."
  );
}

const updates = data.updates || [];

if (!updates.length) {
  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="muted">
        No platform updates yet.
      </td>
    </tr>
  `;

  return;
}

tbody.innerHTML = updates.map(update => {

  const published = Number(update.published) === 1;
  const featured = Number(update.featured) === 1;

  const dateValue =
    update.published_at ||
    update.created_at;

  const date = dateValue
    ? new Date(dateValue).toLocaleDateString()
    : "—";

  const author =
    update.author_name ||
    "No author";

  return `
    <tr>

      <td>
        <strong>
          ${escapeHtml(update.title || "Untitled")}
        </strong>

        <div class="muted">
          /updates/${escapeHtml(update.slug || "")}
        </div>
      </td>

      <td>
        ${escapeHtml(author)}
      </td>

      <td>
        ${
          published
            ? '<span class="status status--success">Published</span>'
            : '<span class="status status--muted">Draft</span>'
        }
      </td>

      <td>
        ${
          featured
            ? '<span class="status status--success">Featured</span>'
            : '<span class="muted">No</span>'
        }
      </td>

      <td>
        ${escapeHtml(date)}
      </td>

      <td class="table-actions">

        ${
          published
            ? `
              <a
                href="/en/updates/${encodeURIComponent(update.slug)}"
                class="btn btn--ghost btn--sm"
                target="_blank"
                rel="noopener"
              >
                View
              </a>
            `
            : ""
        }

        <button
          type="button"
          class="btn btn--ghost btn--sm"
          onclick="editPlatformUpdate(${Number(update.id)})"
        >
          Edit
        </button>

        <button
          type="button"
          class="btn btn--danger btn--sm"
          onclick="deletePlatformUpdate(${Number(update.id)})"
        >
          Delete
        </button>

      </td>

    </tr>
  `;
}).join("");

} catch (error) {

console.error(
  "Failed to load platform updates:",
  error
);

tbody.innerHTML = `
  <tr>
    <td colspan="6" class="muted">
      Failed to load platform updates.
    </td>
  </tr>
`;

}
}

/* =========================================================
INITIALIZE FORM
========================================================= */

function initPlatformUpdateForm() {
const form =
document.getElementById("platformUpdateForm");

if (!form) return;

form.addEventListener(
"submit",
async function(event) {

  event.preventDefault();

  const alertEl =
    document.getElementById(
      "platformUpdateFormAlert"
    );

  if (alertEl) {
    alertEl.style.display = "none";
  }

  const formData =
    new FormData(form);

  const id =
    formData.get("id");

  const isEdit =
    Boolean(id);

  const endpoint =
    isEdit
      ? "/en/api/v1/platform-updates/update"
      : "/en/api/v1/platform-updates/create";

  const payload = {
    id: id
      ? Number(id)
      : null,

    slug:
      String(
        formData.get("slug") || ""
      ).trim(),

    title:
      String(
        formData.get("title") || ""
      ).trim(),

    excerpt:
      String(
        formData.get("excerpt") || ""
      ).trim() || null,

    content:
      formData.get("content") || "",

    featured_image:
      String(
        formData.get("featured_image") || ""
      ).trim() || null,

    seo_title:
      String(
        formData.get("seo_title") || ""
      ).trim() || null,

    seo_description:
      String(
        formData.get("seo_description") || ""
      ).trim() || null,

    author_id:
      formData.get("author_id")
        ? Number(formData.get("author_id"))
        : null,

    published:
      Number(
        formData.get("published") || 0
      ),

    featured:
      Number(
        formData.get("featured") || 0
      ),

    published_at:
      formData.get("published_at")
        || null
  };

  if (!payload.slug) {
    showPlatformUpdateAlert(
      "Slug is required.",
      "error"
    );
    return;
  }

  if (!payload.title) {
    showPlatformUpdateAlert(
      "Title is required.",
      "error"
    );
    return;
  }

  if (!payload.content.trim()) {
    showPlatformUpdateAlert(
      "Content is required.",
      "error"
    );
    return;
  }

  const submitBtn =
    document.getElementById(
      "platformUpdateSubmitBtn"
    );

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent =
      isEdit
        ? "Saving..."
        : "Creating...";
  }

  try {

    const res = await fetch(
      endpoint,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(payload)
      }
    );

    const data =
      await res.json();

    if (!res.ok || !data.success) {
      throw new Error(
        data.error ||
        "Failed to save platform update."
      );
    }

    showPlatformUpdateAlert(
      isEdit
        ? "Platform update updated successfully."
        : "Platform update created successfully.",
      "success"
    );

    resetPlatformUpdateForm();

    await loadPlatformUpdatesTable();

  } catch (error) {

    console.error(
      "Platform update save error:",
      error
    );

    showPlatformUpdateAlert(
      error.message ||
      "Failed to save platform update.",
      "error"
    );

  } finally {

    if (submitBtn) {
      submitBtn.disabled = false;

      submitBtn.textContent =
        "Create Update";
    }
  }
}

);
}

/* =========================================================
EDIT
========================================================= */

async function editPlatformUpdate(id) {

try {

const res = await fetch(
  "/en/api/v1/platform-updates/list"
);

const data =
  await res.json();

if (!res.ok || !data.success) {
  throw new Error(
    data.error ||
    "Failed to load platform updates."
  );
}

const update =
  (data.updates || [])
    .find(
      item =>
        Number(item.id) === Number(id)
    );

if (!update) {
  showPlatformUpdateAlert(
    "Platform update not found.",
    "error"
  );

  return;
}

const form =
  document.getElementById(
    "platformUpdateForm"
  );

if (!form) return;


form.dataset.id =
  String(update.id);


form.querySelector(
  "[name='id']"
).value =
  update.id;


form.querySelector(
  "[name='slug']"
).value =
  update.slug || "";


form.querySelector(
  "[name='title']"
).value =
  update.title || "";


form.querySelector(
  "[name='excerpt']"
).value =
  update.excerpt || "";


form.querySelector(
  "[name='content']"
).value =
  update.content || "";


form.querySelector(
  "[name='featured_image']"
).value =
  update.featured_image || "";


form.querySelector(
  "[name='seo_title']"
).value =
  update.seo_title || "";


form.querySelector(
  "[name='seo_description']"
).value =
  update.seo_description || "";


form.querySelector(
  "[name='author_id']"
).value =
  update.author_id || "";


form.querySelector(
  "[name='published']"
).value =
  Number(update.published) === 1
    ? "1"
    : "0";


form.querySelector(
  "[name='featured']"
).value =
  Number(update.featured) === 1
    ? "1"
    : "0";


const publishedAt =
  form.querySelector(
    "[name='published_at']"
  );

if (publishedAt) {

  publishedAt.value =
    formatDateTimeLocal(
      update.published_at
    );
}


const title =
  document.getElementById(
    "updatesFormTitle"
  );

if (title) {
  title.textContent =
    "Edit Platform Update";
}


const submitBtn =
  document.getElementById(
    "platformUpdateSubmitBtn"
  );

if (submitBtn) {
  submitBtn.textContent =
    "Save Changes";
}


const cancelBtn =
  document.getElementById(
    "platformUpdateCancelBtn"
  );

if (cancelBtn) {
  cancelBtn.style.display =
    "inline-flex";
}

setTimeout(() => {
  RichEditor.set(
    "platform-update-content",
    update.content || ""
  );
}, 300);


form.scrollIntoView({
  behavior: "smooth",
  block: "start"
});

} catch (error) {

console.error(
  "Platform update edit error:",
  error
);

showPlatformUpdateAlert(
  error.message ||
  "Failed to load platform update.",
  "error"
);

}
}

/* =========================================================
DELETE
========================================================= */

async function deletePlatformUpdate(id) {

if (!confirm(
"Delete this platform update permanently?"
)) {
return;
}

try {

const res = await fetch(
  "/en/api/v1/platform-updates/delete",
  {
    method: "POST",

    headers: {
      "Content-Type":
        "application/json"
    },

    body:
      JSON.stringify({
        id: Number(id)
      })
  }
);

const data =
  await res.json();

if (!res.ok || !data.success) {
  throw new Error(
    data.error ||
    "Delete failed."
  );
}

await loadPlatformUpdatesTable();

showPlatformUpdateAlert(
  "Platform update deleted.",
  "success"
);

} catch (error) {

console.error(
  "Platform update delete error:",
  error
);

showPlatformUpdateAlert(
  error.message ||
  "Failed to delete platform update.",
  "error"
);

}
}

/* =========================================================
CANCEL EDIT
========================================================= */

function cancelPlatformUpdateEdit() {
resetPlatformUpdateForm();
}

/* =========================================================
RESET FORM
========================================================= */

function resetPlatformUpdateForm() {

const form =
document.getElementById(
"platformUpdateForm"
);

if (!form) return;

form.reset();

form.dataset.id = "";

const id =
form.querySelector(
"[name='id']"
);

if (id) {
id.value = "";
}

const title =
document.getElementById(
"updatesFormTitle"
);

if (title) {
title.textContent =
"Add Platform Update";
}

const submitBtn =
document.getElementById(
"platformUpdateSubmitBtn"
);

if (submitBtn) {
submitBtn.textContent =
"Create Update";
}

const cancelBtn =
document.getElementById(
"platformUpdateCancelBtn"
);

if (cancelBtn) {
cancelBtn.style.display =
"none";
}

const alertEl =
document.getElementById(
"platformUpdateFormAlert"
);

if (alertEl) {
alertEl.style.display =
"none";
}
}

/* =========================================================
ALERT
========================================================= */
function showPlatformUpdateAlert(message, type = "error") {
  const alertEl = document.getElementById(
    "platformUpdateFormAlert"
  );

  if (!alertEl) return;

  alertEl.className =
    type === "success"
      ? "alert alert--success"
      : "alert alert--error";

  alertEl.textContent = message;
  alertEl.style.display = "block";

  clearTimeout(window.platformUpdateAlertTimer);

  window.platformUpdateAlertTimer = setTimeout(() => {
    alertEl.style.display = "none";
  }, 5000);
}
function showPlatformUpdateAlertbackup(
message,
type = "error"
) {

const alertEl =
document.getElementById(
"platformUpdateFormAlert"
);

if (!alertEl) return;

alertEl.className =
type === "success"
? "alert alert--success"
: "alert alert--error";

alertEl.textContent =
message;

alertEl.style.display =
"block";
}

/* =========================================================
DATETIME HELPER
========================================================= */

function formatDateTimeLocal(value) {

if (!value) return "";

const date =
new Date(value);

if (Number.isNaN(date.getTime())) {
return "";
}

const pad =
number =>
String(number).padStart(2, "0");

return (
date.getFullYear() +
"-" +
pad(date.getMonth() + 1) +
"-" +
pad(date.getDate()) +
"T" +
pad(date.getHours()) +
":" +
pad(date.getMinutes())
);
}

/* =========================================================
HTML ESCAPE
========================================================= */

function escapeHtml(value) {

return String(value ?? "")
.replace(/&/g, "&")
.replace(/</g, "<")
.replace(/>/g, ">")
.replace(/"/g, '&quot;')
.replace(/'/g, "'");
}

/* =========================================================
INITIALIZE
========================================================= */

document.addEventListener(
"DOMContentLoaded",
function() {

if (
  document.getElementById(
    "platformUpdateForm"
  )
) {

  initPlatformUpdateForm();

  loadPlatformUpdatesTable();
}

}
);
