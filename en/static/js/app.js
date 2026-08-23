// =====================================================
// Tenant FRONTEND APP
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  initNavToggle();
  initSidebar();
  initSidebarNews();
  initSidebarCategories();
  initSidebarCountries();
  initHomeNews();
  initHeaderAuth();
  initMobileSearch();
  initMobileNav();
  initScrollToTop();
});


// ---- Mobile nav toggle ----

function initNavToggle() {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("mainNav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("active");

    toggle.innerHTML = isOpen ? "&times;" : "&#9776;";
    toggle.setAttribute(
      "aria-label",
      isOpen ? "Close menu" : "Open menu"
    );
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("active");
      toggle.innerHTML = "&#9776;";
      toggle.setAttribute("aria-label", "Open menu");
    });
  });
}

// ---- Sidebar: load top casinos (geo-aware) ----
async function initSidebar() {
  const container = document.getElementById("sidebarTopCasinos");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/casinos/geo");
    const data = await res.json();

    if (!data.casinos || data.casinos.length === 0) {
      container.innerHTML = '<p class="muted">No casinos yet.</p>';
      return;
    }

    // Sort: available first, then by rating
    data.casinos.sort((a, b) => {
      const aAvail = a.geo_status === "allowed" ? 1 : 0;
      const bAvail = b.geo_status === "allowed" ? 1 : 0;
      if (aAvail !== bAvail) return bAvail - aAvail;
      return (b.rating || 0) - (a.rating || 0);
    });

    const top5 = data.casinos.slice(0, 5);
    const countryCode = data.country || "RW";
    const flag = countryCode.replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt()));

    container.innerHTML = top5.map(c => {
      const geoIcon = c.geo_status === "allowed" ? "✓" : "✕";
      const geoClass = c.geo_status === "allowed" ? "geo-allowed" : "geo-blocked";
      return `
      <a href="/en/casino/${c.slug}" class="sidebar-casino">
        <img src="${c.logo || "/static/images/default.png"}" alt="${c.name}" onerror="this.src='/static/images/default.png'">
        <div>
          <strong>${c.name}</strong>
          <span class="rating">★ ${c.rating || "N/A"} <span class="${geoClass}" style="font-size:10px;margin-left:4px">${flag} ${geoIcon}</span></span>
        </div>
      </a>`;
    }).join("");
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

// ---- Sidebar: load latest news ----
async function initSidebarNews() {
  const container = document.getElementById("sidebarNews");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/news/list");
    const data = await res.json();

    if (!data.news || data.news.length === 0) {
      container.innerHTML = '<p class="muted">No news yet.</p>';
      return;
    }

    const top3 = data.news.slice(0, 3);
    container.innerHTML = top3.map(n => `
      <a href="/en/news/${n.slug}" class="sidebar-news-item">
        <strong>${n.title}</strong>
        <span class="news-date">${new Date(n.created_at).toLocaleDateString()}</span>
      </a>
    `).join("");
  } catch {
    container.innerHTML = '<p class="muted">Failed to load news.</p>';
  }
}

// ---- Sidebar: load categories ----
async function initSidebarCategories() {
  const container = document.getElementById("sidebarCategories");
  const moreBtn = document.getElementById("sidebarCategoriesMore");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/categories/list");
    const data = await res.json();
    const cats = data.categories || [];

    if (cats.length === 0) {
      container.innerHTML = '<p class="muted">No categories yet.</p>';
      return;
    }

    const renderCats = (list) => list.map(c => `<a href="/en/category/${c.slug}" class="chip">${c.name}</a>`).join("");
    
    // Show first 5
    container.innerHTML = renderCats(cats.slice(0, 5));

    if (cats.length > 5) {
      moreBtn.style.display = "block";
      let expanded = false;
      moreBtn.addEventListener("click", () => {
        if (expanded) {
          container.innerHTML = renderCats(cats.slice(0, 5));
          moreBtn.textContent = "Load More";
          expanded = false;
        } else {
          container.innerHTML = renderCats(cats);
          moreBtn.textContent = "Show Less";
          expanded = true;
        }
      });
    }
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

// ---- Sidebar: load countries with search ----
async function initSidebarCountries() {
  const container = document.getElementById("sidebarCountries");
  const searchInput = document.getElementById("sidebarCountrySearch");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/countries/list");
    const data = await res.json();
    let countries = data.countries || [];

    // If no countries in DB, fallback to hardcoded top 5
    if (countries.length === 0) {
      countries = [
        { code: "GB", name: "United Kingdom" },
        { code: "DE", name: "Germany" },
        { code: "SG", name: "Singapore" },
        { code: "US", name: "United States" },
        { code: "CA", name: "Canada" }
      ];
    }

    const renderCountries = (list) => {
      if (list.length === 0) return '<p class="muted">No countries found.</p>';
      return list.map(c => `<a href="/en/country/${c.code}" class="chip">${c.name}</a>`).join("");
    };

    // Show top 5 initially
    let displayCountries = countries.slice(0, 5);
    container.innerHTML = renderCountries(displayCountries);

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length === 0) {
          container.innerHTML = renderCountries(countries.slice(0, 5));
        } else {
          const filtered = countries.filter(c => 
            c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query)
          );
          container.innerHTML = renderCountries(filtered.slice(0, 20)); // Limit search results
        }
      });
    }
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

// ---- Homepage: load latest news ----
// ---- Homepage: load latest news ----
async function initHomeNews() {
  const container = document.getElementById("homeNews");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/news/list", {
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error("Failed to load news");
    }

    const data = await res.json();

    if (!data.news || data.news.length === 0) {
      container.innerHTML =
        '<p class="muted">No news articles yet.</p>';
      return;
    }

    const top3 = data.news.slice(0, 3);

    container.innerHTML = top3.map(n => {
      const image =
        n.featured_image_url ||
        n.featured_image_thumbnail ||
        "";

      const imageAlt =
        n.featured_image_alt ||
        n.title ||
        "News article";

      const excerpt =
        n.excerpt ||
        "";

      const publishedDate =
        n.published_at ||
        n.created_at;

      return `
        <article class="news-card">
          <a
            href="/en/news/${n.slug}"
            class="news-card__link"
          >
            ${
              image
                ? `
                  <div class="news-card__image">
                    <img
                      src="${image}"
                      alt="${imageAlt}"
                      loading="lazy"
                      decoding="async"
                    >
                  </div>
                `
                : ""
            }

            <div class="news-card__body">
              <h3>${n.title}</h3>

              ${
                excerpt
                  ? `<p>${excerpt}</p>`
                  : ""
              }

              <span class="news-date">
                ${new Date(publishedDate).toLocaleDateString()}
              </span>
            </div>
          </a>
        </article>
      `;
    }).join("");

  } catch (error) {
    console.error("Homepage news error:", error);

    container.innerHTML =
      '<p class="muted">Failed to load news.</p>';
  }
}
async function initHomeNewsbackip() {
  const container = document.getElementById("homeNews");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/news/list");
    const data = await res.json();

    if (!data.news || data.news.length === 0) {
      container.innerHTML = '<p class="muted">No news articles yet.</p>';
      return;
    }

    const top3 = data.news.slice(0, 3);
    container.innerHTML = top3
      .map(
        (n) => `
      <a href="/en/news/${n.slug}" class="news-card">
        <h3>${n.title}</h3>
        <p>${(n.content || "").substring(0, 120)}...</p>
        <span class="news-date">${new Date(n.created_at).toLocaleDateString()}</span>
      </a>
    `
      )
      .join("");
  } catch {
    container.innerHTML = '<p class="muted">Failed to load news.</p>';
  }
}


async function initHeaderAuth() {
  try {
    const res = await fetch("/en/api/v1/user/profile");
    if (res.ok) {
      const loginBtn = document.getElementById("headerLoginBtn");
      const logoutBtn = document.getElementById("headerLogoutBtn");
      const dashBtn = document.getElementById("headerDashboardBtn");
      if (loginBtn) loginBtn.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "";
      if (dashBtn) dashBtn.style.display = "";
    }
  } catch {
    // Not logged in — keep login button visible
  }
}


// ---- Mobile search toggle ----
function initMobileSearch() {
  const btn = document.getElementById("mobileSearchBtn");
  const container = document.getElementById("mobileSearchContainer");
  const closeBtn = document.getElementById("mobileSearchClose");
  const input = document.getElementById("mobileSearchInput");
  const results = document.getElementById("mobileSearchResults");
  if (!btn || !container) return;

  btn.addEventListener("click", () => {
    container.classList.add("active");
    if (input) input.focus();
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      container.classList.remove("active");
      if (results) results.classList.remove("active");
      if (input) input.value = "";
    });
  }

  if (input && results) {
    let debounceTimer;
    input.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim();
      if (query.length < 2) { results.classList.remove("active"); return; }
      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch("/en/api/v1/public/casinos/list");
          const data = await res.json();
          const matches = (data.casinos || []).filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
          if (matches.length === 0) {
            results.innerHTML = '<div class="search-result-item muted">No results</div>';
          } else {
            results.innerHTML = matches.slice(0, 8).map(c => `
              <a href="/en/casino/${c.slug}" class="search-result-item">
                <img src="${c.logo || "/static/images/default.png"}" alt="${c.name}" onerror="this.src='/static/images/default.png'">
                <div><strong>${c.name}</strong><span class="muted">★ ${c.rating || "N/A"}</span></div>
              </a>`).join("");
          }
          results.classList.add("active");
        } catch { results.classList.remove("active"); }
      }, 300);
    });
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target) && !btn.contains(e.target)) {
        results.classList.remove("active");
      }
    });
  }
}

// ---- Mobile bottom nav active state ----
function initMobileNav() {
  const nav = document.getElementById("mobileBottomNav");
  if (!nav) return;

  const currentPath = window.location.pathname;
  const items = nav.querySelectorAll(".mobile-nav-item");

  let bestMatch = null;
  let bestMatchLen = 0;

  items.forEach(item => {
    const href = item.getAttribute("data-href") || item.getAttribute("href");
    if (!href) return;

    // Exact match or prefix match (longest prefix wins)
    if (href === currentPath) {
      bestMatch = item;
      bestMatchLen = href.length;
    } else if (currentPath.startsWith(href + "/") && href.length > bestMatchLen) {
      bestMatch = item;
      bestMatchLen = href.length;
    }
  });

  if (bestMatch) bestMatch.classList.add("active");
}

// ---- Scroll to top button ----
function initScrollToTop() {
  const btn = document.getElementById("scrollToTop");
  if (!btn) return;

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        if (window.scrollY > 400) {
          btn.classList.add("visible");
        } else {
          btn.classList.remove("visible");
        }
        ticking = false;
      });
      ticking = true;
    }
  });

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}


// =====================================================
// CASINO BOOKMARKS
// =====================================================

let userBookmarks = new Set();

document.addEventListener("DOMContentLoaded", () => {
  initCasinoBookmarks();
});

async function initCasinoBookmarks() {
  const buttons = document.querySelectorAll("[data-bookmark-slug]");

  if (!buttons.length) return;

  /*
   * Guests will receive an authentication error from this endpoint.
   * That is expected. We simply leave the cards in their default state.
   */
  try {
    const res = await fetch("/en/api/v1/user/bookmarks", {
      credentials: "same-origin",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      return;
    }

    const data = await res.json();

    userBookmarks = new Set(
      (data.bookmarks || [])
        .map(bookmark => bookmark.slug || bookmark.casino_slug)
        .filter(Boolean)
    );

    updateBookmarkButtons();
  } catch {
    // Guest or unavailable session.
  }

  buttons.forEach(button => {
    if (button.dataset.bookmarkInitialized === "true") {
      return;
    }

    button.dataset.bookmarkInitialized = "true";

    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();

      await toggleCasinoBookmark(button);
    });
  });

  updateBookmarkButtons();
}

function updateBookmarkButtons() {
  document.querySelectorAll("[data-bookmark-slug]").forEach(button => {
    const slug = button.dataset.bookmarkSlug;
    const bookmarked = userBookmarks.has(slug);

    button.classList.toggle(
      "is-bookmarked",
      bookmarked
    );

    button.setAttribute(
      "aria-pressed",
      bookmarked ? "true" : "false"
    );

    const icon = button.querySelector(".bookmark-icon");

    if (icon) {
      icon.textContent = bookmarked ? "♥" : "♡";
    }

    const card = button.closest(".casino-card");
    const name = card?.querySelector("h3")?.textContent?.trim() || "casino";

    button.setAttribute(
      "aria-label",
      bookmarked
        ? `Remove ${name} from bookmarks`
        : `Save ${name} to bookmarks`
    );

    button.setAttribute(
      "title",
      bookmarked
        ? `Remove ${name} from bookmarks`
        : `Save ${name} to bookmarks`
    );
  });
}

async function toggleCasinoBookmark(button) {
  const slug = button.dataset.bookmarkSlug;

  if (!slug) return;

  const currentlyBookmarked = userBookmarks.has(slug);

  button.disabled = true;
  button.classList.add("is-loading");

  try {
    // Check whether the user is actually authenticated.
    const profileRes = await fetch("/en/api/v1/user/profile", {
      credentials: "same-origin",
      headers: {
        "Accept": "application/json"
      }
    });

    const profileData = await profileRes.json().catch(() => ({}));

    // Not authenticated
    if (
      !profileRes.ok ||
      !profileData.user ||
      !profileData.user.id
    ) {
      window.location.href =
        `/en/login?redirect=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}`;
      return;
    }

    const endpoint = currentlyBookmarked
      ? "/en/api/v1/user/bookmark/remove"
      : "/en/api/v1/user/bookmark/add";

    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        casino_slug: slug
      })
    });

    if (res.status === 401 || res.status === 403) {
      window.location.href =
        `/en/login?redirect=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}`;
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Bookmark request failed");
    }

    if (currentlyBookmarked) {
      userBookmarks.delete(slug);
    } else {
      userBookmarks.add(slug);
    }

    updateBookmarkButtons();

  } catch (error) {
    console.error("Bookmark error:", error);
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
  }
}

async function toggleCasinoBookmarkbackup(button) {
  const slug = button.dataset.bookmarkSlug;

  if (!slug) return;

  /*
   * If we don't know the user is authenticated, first attempt the
   * request. The existing API remains the source of truth.
   */
  const currentlyBookmarked = userBookmarks.has(slug);

  button.disabled = true;
  button.classList.add("is-loading");

  try {
    const endpoint = currentlyBookmarked
      ? "/en/api/v1/user/bookmark/remove"
      : "/en/api/v1/user/bookmark/add";

    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        casino_slug: slug
      })
    });

    if (res.status === 401 || res.status === 403) {
      window.location.href =
        `/en/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;

      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Bookmark request failed");
    }

    if (currentlyBookmarked) {
      userBookmarks.delete(slug);
    } else {
      userBookmarks.add(slug);
    }

    updateBookmarkButtons();

  } catch (error) {
    console.error("Bookmark error:", error);
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
  }
}
