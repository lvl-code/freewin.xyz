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

  tbody.innerHTML = '<tr><td colspan="5" class="muted">Loading...</td></tr>';

  try {
    const res = await fetch("/en/api/v1/news/list");
    const data = await res.json();
    const articles = data.news || [];

    if (articles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No news articles yet.</td></tr>';
      return;
    }

    tbody.innerHTML = articles.map(article => {
      const image = article.featured_image_url || article.featured_image_thumbnail || "";
      const status = Number(article.published) === 1;
      const date = article.published_at || article.created_at;

      const imageCell = image
        ? `<img src="${escapeHtml(image)}" alt="" width="72" height="45" loading="lazy" style="width:72px;height:45px;object-fit:cover;border-radius:6px;flex:none">`
        : `<div style="width:72px;height:45px;border-radius:6px;background:var(--bg);display:flex;align-items:center;justify-content:center;color:var(--gray);font-size:11px;flex:none">No image</div>`;

      return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:12px">
            ${imageCell}
            <div>
              <strong>${escapeHtml(article.title || "")}</strong>
              <div class="muted" style="font-size:12px;margin-top:3px">/en/news/${escapeHtml(article.slug || "")}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(article.author_name || article.author || "Admin")}</td>
        <td>
          <span style="display:inline-block;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;background:${status ? "#e6fff5" : "var(--bg)"};color:${status ? "#059669" : "var(--gray)"}">
            ${status ? "Published" : "Draft"}
          </span>
        </td>
        <td>${date ? escapeHtml(new Date(date).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"})) : "—"}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editNews('${escapeJs(article.slug)}')">Edit</button>
          <a href="/en/news/${encodeURIComponent(article.slug)}" class="btn btn--ghost btn--sm" target="_blank" rel="noopener">View</a>
          <button class="btn btn--danger btn--sm" onclick="deleteNewsArticle('${escapeJs(article.slug)}')">Delete</button>
        </td>
      </tr>
      `;
    }).join("");

  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function loadNewsTablebackup() {
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

  // ── Featured image picker buttons ──────────────────
  const selectBtn = document.getElementById("newsSelectFeaturedImage");
  const changeBtn = document.getElementById("newsChangeFeaturedImage");
  const removeBtn = document.getElementById("newsRemoveFeaturedImage");

  if (selectBtn) selectBtn.addEventListener("click", openNewsFeaturedImagePicker);
  if (changeBtn) changeBtn.addEventListener("click", openNewsFeaturedImagePicker);
  if (removeBtn) removeBtn.addEventListener("click", clearNewsFeaturedImage);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("newsFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/news/update" : "/en/api/v1/news/create";

    const payload = {
      old_slug: form.dataset.slug || null,
      slug: formData.get("slug"),
      title: formData.get("title"),
      content: formData.get("content"),
      author: formData.get("author") || "Admin",
      author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
      featured_image: formData.get("featured_image") ? parseInt(formData.get("featured_image")) : null,
      excerpt: formData.get("excerpt") || null,
      tags: formData.get("tags") || null,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      published: parseInt(formData.get("published") || "1"),
      published_at: formData.get("published_at") || null,
      ai_generated: parseInt(formData.get("ai_generated") || "0")
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
          alertEl.textContent = isEdit ? "Article updated!" : "News article created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.dataset.slug = "";
        form.querySelector("[name='id']").value = "";
        clearNewsFeaturedImage();
        if (window.RichEditor && typeof RichEditor.set === "function") {
          RichEditor.set("news-content", "");
        }
        document.getElementById("newsSubmitBtn").textContent = "Create Article";
        document.getElementById("newsCancelEdit").style.display = "none";
        document.getElementById("newsFormTitle").textContent = "Add News Article";
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

function openNewsFeaturedImagePicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media || !media.id) return;
    setNewsFeaturedImage(media.id, media.url || media.thumbnail_url || "", media.alt_text || "Featured image");
  }, "news");
}

function setNewsFeaturedImage(id, url, alt) {
  const idInput = document.getElementById("newsFeaturedImageId");
  const imgEl = document.getElementById("newsFeaturedImageImg");
  const preview = document.getElementById("newsFeaturedImagePreview");
  const selectBtn = document.getElementById("newsSelectFeaturedImage");

  if (idInput) idInput.value = String(id);
  if (imgEl) { imgEl.src = url; imgEl.alt = alt; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearNewsFeaturedImage() {
  const idInput = document.getElementById("newsFeaturedImageId");
  const imgEl = document.getElementById("newsFeaturedImageImg");
  const preview = document.getElementById("newsFeaturedImagePreview");
  const selectBtn = document.getElementById("newsSelectFeaturedImage");

  if (idInput) idInput.value = "";
  if (imgEl) { imgEl.src = ""; imgEl.alt = ""; }
  if (preview) preview.style.display = "none";
  if (selectBtn) selectBtn.style.display = "";
}


function initNewsFormbackup() {
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

    homepageSections = [];

if (settings.homepage_sections) {
  try {
    const parsed =
      JSON.parse(
        settings.homepage_sections
      );

    if (Array.isArray(parsed)) {
      homepageSections = parsed;
    }
  } catch (error) {
    console.warn(
      "Invalid homepage_sections JSON",
      error
    );
  }
}

if (!homepageSections.length) {
  homepageSections = [
    createHomepageSection(
      "features"
    )
  ];

  homepageSections[0].title =
    "Why Choose Us";

  homepageSections[0].cards = [
    {
      id: homepageId("card"),
      enabled: true,
      title: "Expert Reviews",
      text:
        "In-depth analysis from industry veterans with years of experience.",
      iconType: "icon",
      icon: "★",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    },
    {
      id: homepageId("card"),
      enabled: true,
      title: "Exclusive Bonuses",
      text:
        "Access special bonus offers available only through {{site_name}}.",
      iconType: "icon",
      icon: "🔒",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    },
    {
      id: homepageId("card"),
      enabled: true,
      title: "Geo-Targeted",
      text:
        "See casinos available in your country with localized bonus offers.",
      iconType: "icon",
      icon: "🌐",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    },
    {
      id: homepageId("card"),
      enabled: true,
      title: "Real Data",
      text:
        "Click tracking and player analytics for transparent recommendations.",
      iconType: "icon",
      icon: "📊",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    }
  ];
}

renderHomepageSections();

    const heroEnabled =
  document.getElementById("siteHeroEnabled");

if (heroEnabled) {
  heroEnabled.checked =
    settings.site_hero_enabled !== "false";
}

const heroOverlay =
  document.getElementById("siteHeroOverlay");

if (heroOverlay) {
  heroOverlay.checked =
    settings.site_hero_overlay !== "false";
}

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








// ============================================================
// HOMEPAGE SECTION BUILDER
// ============================================================

let homepageSections = [];


// ------------------------------------------------------------
// Escape HTML attribute
// ------------------------------------------------------------

function homepageEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// ------------------------------------------------------------
// Create IDs
// ------------------------------------------------------------

function homepageId(prefix = "item") {
  return (
    prefix +
    "-" +
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}


// ------------------------------------------------------------
// Default card
// ------------------------------------------------------------

function createHomepageCard() {

  return {
    id: homepageId("card"),

    enabled: true,

    title: "New Feature",

    text:
      "Add your feature description here.",

    iconType: "icon",

    icon: "★",

    imageUrl: "",

    url: "",

    target: "_self",

    backgroundColor: "",

    backgroundImage: "",

    textColor: "",

    iconColor: ""
  };
}


// ------------------------------------------------------------
// Default section
// ------------------------------------------------------------

function createHomepageSection(type) {

  const section = {

    id:
      homepageId("section"),

    enabled: true,

    type,

    title: "",

    subtitle: "",

    description: "",

    alignment: "center",

    backgroundColor: "",

    backgroundImage: "",

    textColor: "",

    cards: [],

    paragraphs: [],

    buttonText: "",

    buttonUrl: "",

    buttonStyle: "primary"
  };


  if (type === "features") {

    section.title =
      "Why Choose Us";

    section.cards = [
      createHomepageCard()
    ];

  }


  if (type === "cards") {

    section.title =
      "Featured";

    section.cards = [
      createHomepageCard()
    ];

  }


  return section;
}


// ------------------------------------------------------------
// Render builder
// ------------------------------------------------------------

function renderHomepageSections() {

  const container =
    document.getElementById(
      "homepageSections"
    );

  if (!container) return;

  container.innerHTML = "";

  homepageSections.forEach(
    (section, sectionIndex) => {

      const wrapper =
        document.createElement("div");

      wrapper.className =
        "homepage-admin-section";

      wrapper.style.cssText = `
        border:1px solid var(--border);
        border-radius:10px;
        padding:18px;
        margin:16px 0;
      `;

      wrapper.innerHTML = `
        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
            margin-bottom:16px;
          "
        >

          <strong>
            Section ${sectionIndex + 1}
          </strong>

          <div style="display:flex;gap:6px">

            <button
              type="button"
              class="btn btn--ghost move-up"
            >
              ↑
            </button>

            <button
              type="button"
              class="btn btn--ghost move-down"
            >
              ↓
            </button>

            <button
              type="button"
              class="btn btn--ghost duplicate-section"
            >
              Duplicate
            </button>

            <button
              type="button"
              class="btn btn--ghost remove-section"
            >
              Remove
            </button>

          </div>

        </div>


        <div class="form-group">

          <label>
            Enabled
          </label>

          <input
            type="checkbox"
            class="section-enabled"
            ${section.enabled !== false ? "checked" : ""}
          >

        </div>


        <div class="form-group">

          <label>
            Section Type
          </label>

          <select class="section-type">

            <option
              value="features"
              ${section.type === "features" ? "selected" : ""}
            >
              Featured Grid
            </option>

            <option
              value="cards"
              ${section.type === "cards" ? "selected" : ""}
            >
              Cards
            </option>

            <option
              value="text"
              ${section.type === "text" ? "selected" : ""}
            >
              Text / Paragraphs
            </option>

          </select>

        </div>


        <div class="form-group">

          <label>
            Section Title
          </label>

          <input
            type="text"
            class="section-title"
            value="${homepageEscape(section.title)}"
          >

        </div>


        <div class="form-group">

          <label>
            Section Subtitle
          </label>

          <input
            type="text"
            class="section-subtitle"
            value="${homepageEscape(section.subtitle)}"
          >

        </div>


        <div class="form-group">

          <label>
            Section Description
          </label>

          <textarea
            class="section-description"
            rows="3"
          >${homepageEscape(section.description)}</textarea>

        </div>


        <div class="form-group">

          <label>
            Alignment
          </label>

          <select class="section-alignment">

            <option
              value="left"
              ${section.alignment === "left" ? "selected" : ""}
            >
              Left
            </option>

            <option
              value="center"
              ${section.alignment === "center" ? "selected" : ""}
            >
              Center
            </option>

            <option
              value="right"
              ${section.alignment === "right" ? "selected" : ""}
            >
              Right
            </option>

          </select>

        </div>


        <div class="form-group">

          <label>
            Background Color
          </label>

          <input
            type="text"
            class="section-background-color"
            value="${homepageEscape(section.backgroundColor)}"
            placeholder="#111827 or rgba(...)"
          >

        </div>


        <div class="form-group">

          <label>
            Background Image URL
          </label>

          <input
            type="url"
            class="section-background-image"
            value="${homepageEscape(section.backgroundImage)}"
            placeholder="https://..."
          >

        </div>


        <div class="form-group">

          <label>
            Text Color
          </label>

          <input
            type="text"
            class="section-text-color"
            value="${homepageEscape(section.textColor)}"
            placeholder="#ffffff"
          >

        </div>


        <div class="form-group">

          <label>
            Button Text
          </label>

          <input
            type="text"
            class="section-button-text"
            value="${homepageEscape(section.buttonText)}"
          >

        </div>


        <div class="form-group">

          <label>
            Button URL
          </label>

          <input
            type="text"
            class="section-button-url"
            value="${homepageEscape(section.buttonUrl)}"
          >

        </div>


        <div class="form-group">

          <label>
            Button Style
          </label>

          <select class="section-button-style">

            <option
              value="primary"
              ${section.buttonStyle === "primary" ? "selected" : ""}
            >
              Primary
            </option>

            <option
              value="ghost"
              ${section.buttonStyle === "ghost" ? "selected" : ""}
            >
              Ghost
            </option>

          </select>

        </div>


        <h3>
          Paragraphs
        </h3>

        <div class="section-paragraphs"></div>

        <button
          type="button"
          class="btn btn--ghost add-paragraph"
        >
          + Add Paragraph
        </button>


        <h3 style="margin-top:24px">
          Cards
        </h3>

        <div class="section-cards"></div>

        <button
          type="button"
          class="btn btn--ghost add-card"
        >
          + Add Card
        </button>
      `;


      // ------------------------------------------------------
      // Paragraphs
      // ------------------------------------------------------

      const paragraphsContainer =
        wrapper.querySelector(
          ".section-paragraphs"
        );

      (section.paragraphs || [])
        .forEach(
          (paragraph, paragraphIndex) => {

            const row =
              document.createElement("div");

            row.style.cssText = `
              display:flex;
              gap:8px;
              margin-bottom:8px;
            `;

            row.innerHTML = `
              <textarea
                rows="3"
                style="flex:1"
                class="paragraph-input"
              >${homepageEscape(paragraph)}</textarea>

              <button
                type="button"
                class="btn btn--ghost remove-paragraph"
              >
                Remove
              </button>
            `;

            row
              .querySelector(
                ".remove-paragraph"
              )
              .addEventListener(
                "click",
                () => {

                  section.paragraphs
                    .splice(
                      paragraphIndex,
                      1
                    );

                  renderHomepageSections();
                }
              );

            paragraphsContainer
              .appendChild(row);
          }
        );


      // ------------------------------------------------------
      // Cards
      // ------------------------------------------------------

      const cardsContainer =
        wrapper.querySelector(
          ".section-cards"
        );


      (section.cards || [])
        .forEach(
          (card, cardIndex) => {

            const cardElement =
              document.createElement("div");

            cardElement.style.cssText = `
              border:1px solid var(--border);
              border-radius:8px;
              padding:16px;
              margin:12px 0;
            `;

            cardElement.innerHTML = `

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  margin-bottom:12px;
                "
              >

                <strong>
                  Card ${cardIndex + 1}
                </strong>

                <button
                  type="button"
                  class="btn btn--ghost remove-card"
                >
                  Remove
                </button>

              </div>


              <div class="form-group">

                <label>
                  Enabled
                </label>

                <input
                  type="checkbox"
                  class="card-enabled"
                  ${card.enabled !== false ? "checked" : ""}
                >

              </div>


              <div class="form-group">

                <label>
                  Title
                </label>

                <input
                  type="text"
                  class="card-title"
                  value="${homepageEscape(card.title)}"
                >

              </div>


              <div class="form-group">

                <label>
                  Content
                </label>

                <textarea
                  rows="3"
                  class="card-text"
                >${homepageEscape(card.text)}</textarea>

              </div>


              <div class="form-group">

                <label>
                  Icon Type
                </label>

                <select class="card-icon-type">

                  <option
                    value="icon"
                    ${card.iconType === "icon" ? "selected" : ""}
                  >
                    Text / Emoji / Symbol
                  </option>

                  <option
                    value="image"
                    ${card.iconType === "image" ? "selected" : ""}
                  >
                    Image URL
                  </option>

                </select>

              </div>


              <div class="form-group">

                <label>
                  Icon / Symbol
                </label>

                <input
                  type="text"
                  class="card-icon"
                  value="${homepageEscape(card.icon)}"
                  placeholder="★ 🔒 🌐"
                >

              </div>


              <div class="form-group">

                <label>
                  Icon Image URL
                </label>

                <input
                  type="url"
                  class="card-image-url"
                  value="${homepageEscape(card.imageUrl)}"
                  placeholder="https://..."
                >

              </div>


              <div class="form-group">

                <label>
                  Card URL
                </label>

                <input
                  type="text"
                  class="card-url"
                  value="${homepageEscape(card.url)}"
                  placeholder="/en/review/example"
                >

              </div>


              <div class="form-group">

                <label>
                  Open Link
                </label>

                <select class="card-target">

                  <option
                    value="_self"
                    ${card.target !== "_blank" ? "selected" : ""}
                  >
                    Same Window
                  </option>

                  <option
                    value="_blank"
                    ${card.target === "_blank" ? "selected" : ""}
                  >
                    New Window
                  </option>

                </select>

              </div>


              <div class="form-group">

                <label>
                  Card Background Color
                </label>

                <input
                  type="text"
                  class="card-background-color"
                  value="${homepageEscape(card.backgroundColor)}"
                  placeholder="#111827"
                >

              </div>


              <div class="form-group">

                <label>
                  Card Background Image URL
                </label>

                <input
                  type="url"
                  class="card-background-image"
                  value="${homepageEscape(card.backgroundImage)}"
                  placeholder="https://..."
                >

              </div>


              <div class="form-group">

                <label>
                  Card Text Color
                </label>

                <input
                  type="text"
                  class="card-text-color"
                  value="${homepageEscape(card.textColor)}"
                  placeholder="#ffffff"
                >

              </div>


              <div class="form-group">

                <label>
                  Icon Color
                </label>

                <input
                  type="text"
                  class="card-icon-color"
                  value="${homepageEscape(card.iconColor)}"
                  placeholder="#ffffff"
                >

              </div>
            `;


            cardElement
              .querySelector(
                ".remove-card"
              )
              .addEventListener(
                "click",
                () => {

                  section.cards
                    .splice(
                      cardIndex,
                      1
                    );

                  renderHomepageSections();
                }
              );


            cardsContainer
              .appendChild(
                cardElement
              );
          }
        );


      // ------------------------------------------------------
      // Section controls
      // ------------------------------------------------------

      wrapper
        .querySelector(
          ".remove-section"
        )
        .addEventListener(
          "click",
          () => {

            homepageSections
              .splice(
                sectionIndex,
                1
              );

            renderHomepageSections();
          }
        );


      wrapper
        .querySelector(
          ".duplicate-section"
        )
        .addEventListener(
          "click",
          () => {

            const copy =
              JSON.parse(
                JSON.stringify(section)
              );

            copy.id =
              homepageId("section");

            homepageSections
              .splice(
                sectionIndex + 1,
                0,
                copy
              );

            renderHomepageSections();
          }
        );


      wrapper
        .querySelector(
          ".move-up"
        )
        .addEventListener(
          "click",
          () => {

            if (sectionIndex === 0)
              return;

            [
              homepageSections[
                sectionIndex - 1
              ],
              homepageSections[
                sectionIndex
              ]
            ] = [
              homepageSections[
                sectionIndex
              ],
              homepageSections[
                sectionIndex - 1
              ]
            ];

            renderHomepageSections();
          }
        );


      wrapper
        .querySelector(
          ".move-down"
        )
        .addEventListener(
          "click",
          () => {

            if (
              sectionIndex >=
              homepageSections.length - 1
            ) return;

            [
              homepageSections[
                sectionIndex + 1
              ],
              homepageSections[
                sectionIndex
              ]
            ] = [
              homepageSections[
                sectionIndex
              ],
              homepageSections[
                sectionIndex + 1
              ]
            ];

            renderHomepageSections();
          }
        );


      wrapper
        .querySelector(
          ".add-paragraph"
        )
        .addEventListener(
          "click",
          () => {

            section.paragraphs =
              section.paragraphs || [];

            section.paragraphs.push(
              "New paragraph..."
            );

            renderHomepageSections();
          }
        );


      wrapper
        .querySelector(
          ".add-card"
        )
        .addEventListener(
          "click",
          () => {

            section.cards =
              section.cards || [];

            section.cards.push(
              createHomepageCard()
            );

            renderHomepageSections();
          }
        );


      container.appendChild(
        wrapper
      );
    }
  );
}

function collectHomepageSections() {

  const containers =
    document.querySelectorAll(
      "#homepageSections .homepage-admin-section"
    );

  return Array.from(containers)
    .map((wrapper, sectionIndex) => {

      const original =
        homepageSections[sectionIndex] ||
        createHomepageSection(
          "features"
        );

      const paragraphs =
        Array.from(
          wrapper.querySelectorAll(
            ".paragraph-input"
          )
        )
        .map(input =>
          input.value.trim()
        )
        .filter(Boolean);


      const cards =
        Array.from(
          wrapper.querySelectorAll(
            ".section-cards > div"
          )
        )
        .map(cardElement => ({

          id:
            homepageId("card"),

          enabled:
            cardElement.querySelector(
              ".card-enabled"
            )?.checked !== false,

          title:
            cardElement.querySelector(
              ".card-title"
            )?.value.trim() || "",

          text:
            cardElement.querySelector(
              ".card-text"
            )?.value.trim() || "",

          iconType:
            cardElement.querySelector(
              ".card-icon-type"
            )?.value || "icon",

          icon:
            cardElement.querySelector(
              ".card-icon"
            )?.value || "",

          imageUrl:
            cardElement.querySelector(
              ".card-image-url"
            )?.value.trim() || "",

          url:
            cardElement.querySelector(
              ".card-url"
            )?.value.trim() || "",

          target:
            cardElement.querySelector(
              ".card-target"
            )?.value === "_blank"
              ? "_blank"
              : "_self",

          backgroundColor:
            cardElement.querySelector(
              ".card-background-color"
            )?.value.trim() || "",

          backgroundImage:
            cardElement.querySelector(
              ".card-background-image"
            )?.value.trim() || "",

          textColor:
            cardElement.querySelector(
              ".card-text-color"
            )?.value.trim() || "",

          iconColor:
            cardElement.querySelector(
              ".card-icon-color"
            )?.value.trim() || ""
        }));


      return {

        id:
          original.id ||
          homepageId("section"),

        enabled:
          wrapper.querySelector(
            ".section-enabled"
          )?.checked !== false,

        type:
          wrapper.querySelector(
            ".section-type"
          )?.value || "features",

        title:
          wrapper.querySelector(
            ".section-title"
          )?.value.trim() || "",

        subtitle:
          wrapper.querySelector(
            ".section-subtitle"
          )?.value.trim() || "",

        description:
          wrapper.querySelector(
            ".section-description"
          )?.value.trim() || "",

        alignment:
          wrapper.querySelector(
            ".section-alignment"
          )?.value || "center",

        backgroundColor:
          wrapper.querySelector(
            ".section-background-color"
          )?.value.trim() || "",

        backgroundImage:
          wrapper.querySelector(
            ".section-background-image"
          )?.value.trim() || "",

        textColor:
          wrapper.querySelector(
            ".section-text-color"
          )?.value.trim() || "",

        cards,

        paragraphs,

        buttonText:
          wrapper.querySelector(
            ".section-button-text"
          )?.value.trim() || "",

        buttonUrl:
          wrapper.querySelector(
            ".section-button-url"
          )?.value.trim() || "",

        buttonStyle:
          wrapper.querySelector(
            ".section-button-style"
          )?.value || "primary"
      };
    });
}




// ============================================================
// THEME PRESETS
// ============================================================

const SITE_THEME_PRESETS = {

  midnight: {
    theme_primary: "#8b5cf6",
    theme_primary_hover: "#7c3aed",
    theme_secondary: "#ec4899",
    theme_secondary_hover: "#db2777",
    theme_accent: "#22d3ee",
    theme_background: "#050505",
    theme_surface: "#0f0f12",
    theme_surface_alt: "#15151a",
    theme_text: "#ffffff",
    theme_text_muted: "#a1a1aa",
    theme_border: "#27272a",
    theme_button_text: "#ffffff"
  },


  ocean: {
    theme_primary: "#0ea5e9",
    theme_primary_hover: "#0284c7",
    theme_secondary: "#06b6d4",
    theme_secondary_hover: "#0891b2",
    theme_accent: "#38bdf8",
    theme_background: "#020617",
    theme_surface: "#0f172a",
    theme_surface_alt: "#172554",
    theme_text: "#ffffff",
    theme_text_muted: "#94a3b8",
    theme_border: "#1e3a5f",
    theme_button_text: "#ffffff"
  },


  emerald: {
    theme_primary: "#10b981",
    theme_primary_hover: "#059669",
    theme_secondary: "#14b8a6",
    theme_secondary_hover: "#0d9488",
    theme_accent: "#34d399",
    theme_background: "#02110c",
    theme_surface: "#071a13",
    theme_surface_alt: "#0b241a",
    theme_text: "#ffffff",
    theme_text_muted: "#9ca3af",
    theme_border: "#164e3b",
    theme_button_text: "#ffffff"
  },


  ruby: {
    theme_primary: "#ef4444",
    theme_primary_hover: "#dc2626",
    theme_secondary: "#f43f5e",
    theme_secondary_hover: "#e11d48",
    theme_accent: "#fb7185",
    theme_background: "#110304",
    theme_surface: "#1c0709",
    theme_surface_alt: "#2a0a0d",
    theme_text: "#ffffff",
    theme_text_muted: "#a1a1aa",
    theme_border: "#4c0519",
    theme_button_text: "#ffffff"
  },


  gold: {
    theme_primary: "#eab308",
    theme_primary_hover: "#ca8a04",
    theme_secondary: "#f59e0b",
    theme_secondary_hover: "#d97706",
    theme_accent: "#facc15",
    theme_background: "#0c0a04",
    theme_surface: "#171207",
    theme_surface_alt: "#211a08",
    theme_text: "#ffffff",
    theme_text_muted: "#a1a1aa",
    theme_border: "#4d3b0a",
    theme_button_text: "#000000"
  },


  light: {
    theme_primary: "#2563eb",
    theme_primary_hover: "#1d4ed8",
    theme_secondary: "#7c3aed",
    theme_secondary_hover: "#6d28d9",
    theme_accent: "#0891b2",
    theme_background: "#ffffff",
    theme_surface: "#f8fafc",
    theme_surface_alt: "#f1f5f9",
    theme_text: "#111827",
    theme_text_muted: "#64748b",
    theme_border: "#e2e8f0",
    theme_button_text: "#ffffff"
  }

};


function applyThemePreset(name) {

  const preset =
    SITE_THEME_PRESETS[name];

  if (!preset) return;

  Object.entries(preset).forEach(
    ([key, value]) => {

      const field =
        document.querySelector(
          `[name="${key}"]`
        );

      if (field) {
        field.value = value;
      }

    }
  );
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


    // ==========================================================
  // THEME PRESET
  // ==========================================================

  const themePreset =
    document.getElementById(
      "themePreset"
    );

  if (themePreset) {

    themePreset.addEventListener(
      "change",
      () => {

        if (
          themePreset.value !== "custom"
        ) {

          applyThemePreset(
            themePreset.value
          );

        }

      }
    );

  }

    // ============================================================
  // LIVE THEME PREVIEW
  // ============================================================

  function updateThemePreview() {

    const preview =
      document.getElementById(
        "themePreview"
      );

    if (!preview) return;


    const getValue = id => {

      const el =
        document.getElementById(id);

      return el
        ? el.value
        : "";

    };


    const primary =
      getValue("themePrimary") ||
      "#8b5cf6";

    const primaryHover =
      getValue("themePrimaryHover") ||
      "#7c3aed";

    const secondary =
      getValue("themeSecondary") ||
      "#ec4899";

    const secondaryHover =
      getValue("themeSecondaryHover") ||
      "#db2777";

    const accent =
      getValue("themeAccent") ||
      "#22d3ee";

    const background =
      getValue("themeBackground") ||
      "#050505";

    const surface =
      getValue("themeSurface") ||
      "#0f0f12";

    const surfaceAlt =
      getValue("themeSurfaceAlt") ||
      "#15151a";

    const text =
      getValue("themeText") ||
      "#ffffff";

    const textMuted =
      getValue("themeTextMuted") ||
      "#a1a1aa";

    const border =
      getValue("themeBorder") ||
      "#27272a";

    const buttonText =
      getValue("themeButtonText") ||
      "#ffffff";


    const cardRadius =
      document.querySelector(
        '[name="theme_card_radius"]'
      )?.value ||
      "12px";


    const buttonRadius =
      document.querySelector(
        '[name="theme_button_radius"]'
      )?.value ||
      "8px";


    // ----------------------------------------------------------
    // Preview container
    // ----------------------------------------------------------

    preview.style.backgroundColor =
      background;

    preview.style.color =
      text;

    preview.style.borderColor =
      border;


    // ----------------------------------------------------------
    // Preview card
    // ----------------------------------------------------------

    const card =
      document.getElementById(
        "themePreviewCard"
      );

    if (card) {

      card.style.backgroundColor =
        surface;

      card.style.borderColor =
        border;

      card.style.borderRadius =
        cardRadius;

      card.style.color =
        text;

    }


    // ----------------------------------------------------------
    // Preview heading
    // ----------------------------------------------------------

    const heading =
      document.getElementById(
        "themePreviewHeading"
      );

    if (heading) {

      heading.style.color =
        text;

    }


    // ----------------------------------------------------------
    // Preview description
    // ----------------------------------------------------------

    const description =
      document.getElementById(
        "themePreviewDescription"
      );

    if (description) {

      description.style.color =
        textMuted;

    }


    // ----------------------------------------------------------
    // Preview muted text
    // ----------------------------------------------------------

    const muted =
      document.getElementById(
        "themePreviewMuted"
      );

    if (muted) {

      muted.style.color =
        textMuted;

    }


    // ----------------------------------------------------------
    // Primary button
    // ----------------------------------------------------------

    const primaryButton =
      document.getElementById(
        "themePreviewPrimary"
      );

    if (primaryButton) {

      primaryButton.style.backgroundColor =
        primary;

      primaryButton.style.color =
        buttonText;

      primaryButton.style.borderColor =
        primary;

      primaryButton.style.borderRadius =
        buttonRadius;

      primaryButton.onmouseenter =
        () => {

          primaryButton.style.backgroundColor =
            primaryHover;

        };

      primaryButton.onmouseleave =
        () => {

          primaryButton.style.backgroundColor =
            primary;

        };

    }


    // ----------------------------------------------------------
    // Secondary button
    // ----------------------------------------------------------

    const secondaryButton =
      document.getElementById(
        "themePreviewSecondary"
      );

    if (secondaryButton) {

      secondaryButton.style.backgroundColor =
        "transparent";

      secondaryButton.style.color =
        secondary;

      secondaryButton.style.borderColor =
        secondary;

      secondaryButton.style.borderRadius =
        buttonRadius;

      secondaryButton.onmouseenter =
        () => {

          secondaryButton.style.backgroundColor =
            secondary;

          secondaryButton.style.color =
            buttonText;

        };

      secondaryButton.onmouseleave =
        () => {

          secondaryButton.style.backgroundColor =
            "transparent";

          secondaryButton.style.color =
            secondary;

        };

    }


    // ----------------------------------------------------------
    // Color swatches
    // ----------------------------------------------------------

    const swatches =
      preview.querySelectorAll(
        "[data-theme-preview-color]"
      );


    swatches.forEach(
      swatch => {

        const type =
          swatch.dataset.themePreviewColor;


        if (type === "primary") {

          swatch.style.backgroundColor =
            primary;

        }


        if (type === "secondary") {

          swatch.style.backgroundColor =
            secondary;

        }


        if (type === "accent") {

          swatch.style.backgroundColor =
            accent;

        }


        if (type === "background") {

          swatch.style.backgroundColor =
            background;

        }


        if (type === "surface") {

          swatch.style.backgroundColor =
            surface;

        }

      }
    );

  }


  // ------------------------------------------------------------
  // Listen to every theme input
  // ------------------------------------------------------------

  const themeInputs = [

    "themePreset",

    "themePrimary",

    "themePrimaryHover",

    "themeSecondary",

    "themeSecondaryHover",

    "themeAccent",

    "themeBackground",

    "themeSurface",

    "themeSurfaceAlt",

    "themeText",

    "themeTextMuted",

    "themeBorder",

    "themeButtonText"

  ];


  themeInputs.forEach(
    id => {

      const input =
        document.getElementById(id);

      if (!input) return;

      input.addEventListener(
        "input",
        updateThemePreview
      );

      input.addEventListener(
        "change",
        updateThemePreview
      );

    }
  );


  const radiusInputs =
    document.querySelectorAll(
      '[name="theme_card_radius"], [name="theme_button_radius"]'
    );


  radiusInputs.forEach(
    input => {

      input.addEventListener(
        "input",
        updateThemePreview
      );

    }
  );


  // Initial preview

  updateThemePreview();

  


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

  const addFeaturesSectionButton =
  document.getElementById(
    "addFeaturesSectionBtn"
  );

if (addFeaturesSectionButton) {
  addFeaturesSectionButton.addEventListener(
    "click",
    () => {

      homepageSections.push(
        createHomepageSection(
          "features"
        )
      );

      renderHomepageSections();
    }
  );
}


const addTextSectionButton =
  document.getElementById(
    "addTextSectionBtn"
  );

if (addTextSectionButton) {
  addTextSectionButton.addEventListener(
    "click",
    () => {

      homepageSections.push(
        createHomepageSection(
          "text"
        )
      );

      renderHomepageSections();
    }
  );
}


const addCardsSectionButton =
  document.getElementById(
    "addCardsSectionBtn"
  );

if (addCardsSectionButton) {
  addCardsSectionButton.addEventListener(
    "click",
    () => {

      homepageSections.push(
        createHomepageSection(
          "cards"
        )
      );

      renderHomepageSections();
    }
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

        const heroEnabled =
  document.getElementById("siteHeroEnabled");

payload.site_hero_enabled =
  heroEnabled && heroEnabled.checked
    ? "true"
    : "false";


const heroOverlay =
  document.getElementById("siteHeroOverlay");

payload.site_hero_overlay =
  heroOverlay && heroOverlay.checked
    ? "true"
    : "false";

        payload.footer_compliance =
          JSON.stringify(
            collectComplianceRows()
          );

        payload.homepage_sections =
          JSON.stringify(
            collectHomepageSections()
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

    const excerptField = form.querySelector("[name='excerpt']");
    if (excerptField) excerptField.value = article.excerpt || "";

    const tagsField = form.querySelector("[name='tags']");
    if (tagsField) tagsField.value = article.tags || "";

    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) authorSelect.value = article.author_id || "";

    form.querySelector("[name='content']").value = article.content || "";
    setTimeout(() => {
      if (window.RichEditor && typeof RichEditor.set === "function") {
        RichEditor.set("news-content", article.content || "");
      }
    }, 300);

    // Featured image
    if (article.featured_image && (article.featured_image_url || article.featured_image_thumbnail)) {
      setNewsFeaturedImage(
        article.featured_image,
        article.featured_image_url || article.featured_image_thumbnail,
        article.featured_image_alt || article.title || "Featured image"
      );
    } else {
      clearNewsFeaturedImage();
    }

    // SEO
    form.querySelector("[name='seo_title']").value = article.seo_title || "";
    form.querySelector("[name='seo_description']").value = article.seo_description || "";

    // Publishing
    const publishedSelect = form.querySelector("[name='published']");
    if (publishedSelect) publishedSelect.value = article.published ? "1" : "0";

    const publishedAtInput = form.querySelector("[name='published_at']");
    if (publishedAtInput) {
      publishedAtInput.value = article.published_at ? toDatetimeLocal(article.published_at) : "";
    }

    const aiGeneratedSelect = form.querySelector("[name='ai_generated']");
    if (aiGeneratedSelect) aiGeneratedSelect.value = article.ai_generated ? "1" : "0";

    document.getElementById("newsSubmitBtn").textContent = "Update Article";
    document.getElementById("newsCancelEdit").style.display = "";
    document.getElementById("newsFormTitle").textContent = "Edit News Article";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load article"); }
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}


async function editNewsbackup(slug) {
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
  form.dataset.slug = "";
  form.querySelector("[name='id']").value = "";
  clearNewsFeaturedImage();
  if (window.RichEditor && typeof RichEditor.set === "function") {
    RichEditor.set("news-content", "");
  }
  document.getElementById("newsSubmitBtn").textContent = "Create Article";
  document.getElementById("newsCancelEdit").style.display = "none";
  document.getElementById("newsFormTitle").textContent = "Add News Article";
}


function cancelNewsEdibackupt() {
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function escapeHtmlbackup(value) {

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
