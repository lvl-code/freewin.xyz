// =====================================================
// CASINO DETAIL PAGE
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  loadCasinoReviews();
  loadGeoInfo();
});

// ---- Load reviews for this casino ----
async function loadCasinoReviews() {
  const container = document.getElementById("reviewsContainer");
  if (!container) return;

  const slug = window.location.pathname.split("/").pop();

  try {
    const res = await fetch(`/en/api/v1/public/reviews/list`);
    const data = await res.json();

    const casinoReviews = (data.reviews || []).filter(
      (r) => r.casino_slug === slug
    );

    if (casinoReviews.length === 0) {
      container.innerHTML = '<p class="muted">No reviews yet.</p>';
      return;
    }

    container.innerHTML = casinoReviews
      .map(
        (r) => `
      <div class="review-item">
        <h4><a href="/en/review/${r.slug}">${r.title}</a></h4>
        <span class="review-rating">★ ${r.rating ? r.rating + "/5" : "N/A"}</span>
        <p class="review-excerpt">${(r.content || "").substring(0, 200)}...</p>
      </div>
    `
      )
      .join("");
  } catch {
    container.innerHTML = '<p class="muted">Failed to load reviews.</p>';
  }
}

// ---- Load geo info ----
async function loadGeoInfo() {
  const card = document.getElementById("geoCard");
  if (!card) return;

  const slug = window.location.pathname.split("/").pop();

  try {
    const res = await fetch(`/en/api/v1/geo/check?slug=${slug}`);
    const data = await res.json();

    if (data.status === "allowed") {
      card.innerHTML = `
        <h4>Your Region</h4>
        <p class="geo-allowed">✓ Available in ${data.countryName || data.country}</p>
        ${data.bonusOverride ? `<span class="bonus-override">${data.bonusOverride}</span>` : ""}
      `;
    } else if (data.status === "blocked") {
      card.innerHTML = `
        <h4>Your Region</h4>
        <p class="geo-blocked">✕ Not available in ${data.countryName || data.country}</p>
      `;
    } else {
      card.innerHTML = `
        <h4>Your Region</h4>
        <p class="geo-restricted">⚠ Restricted in ${data.countryName || data.country}</p>
      `;
    }
  } catch {
    card.innerHTML = `
      <h4>Your Region</h4>
      <p class="muted">Geo data unavailable.</p>
    `;
  }
}
