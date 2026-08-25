// =====================================================
// USER DASHBOARD JS
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  initUserDashboard();
  initBookmarksPage();
  initInquiryForm();
  initInquiriesList();
  initNotificationsPage();
  initUserCasinoForm();
  initUserSubmissionsList();
  initProfileForm();
});

// ── Dashboard Overview ──

async function initUserDashboard() {
  const bookmarkCount = document.getElementById("bookmarkCount");
  const inquiryCount = document.getElementById("inquiryCount");
  const notifCount = document.getElementById("notifCount");
  const submissionCount = document.getElementById("submissionCount");

  if (bookmarkCount) {
    try {
      const res = await fetch("/en/api/v1/user/bookmarks");
      const data = await res.json();
      bookmarkCount.textContent = (data.bookmarks || []).length;
    } catch { bookmarkCount.textContent = "0"; }
  }

  if (inquiryCount) {
    try {
      const res = await fetch("/en/api/v1/user/inquiries");
      const data = await res.json();
      inquiryCount.textContent = (data.inquiries || []).length;
    } catch { inquiryCount.textContent = "0"; }
  }

  if (notifCount) {
    try {
      const res = await fetch("/en/api/v1/user/notifications");
      const data = await res.json();
      const unread = (data.notifications || []).filter(n => !n.is_read).length;
      notifCount.textContent = unread;
    } catch { notifCount.textContent = "0"; }
  }

  if (submissionCount) {
    try {
      const res = await fetch("/en/api/v1/user/submissions");
      const data = await res.json();
      submissionCount.textContent = (data.submissions || []).length;
    } catch { submissionCount.textContent = "0"; }
  }
}

// ── Bookmarks Page ──
async function initBookmarksPage() {
  const container = document.getElementById("bookmarksContainer");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/user/bookmarks");
    const data = await res.json();
    const bookmarks = data.bookmarks || [];

    if (bookmarks.length === 0) {
      container.innerHTML = '<p class="muted">No bookmarks yet. Browse casinos and click the heart icon to save them.</p>';
      return;
    }

    container.innerHTML = bookmarks.map(c => `
      <div class="casino-card" data-casino-slug="${c.slug}">
        ${c.geoBadge || ''}
        <button
          type="button"
          class="casino-card__bookmark"
          data-bookmark-slug="${c.slug}"
          aria-label="Remove ${c.name} from bookmarks"
          aria-pressed="true"
          title="Remove ${c.name}"
          onclick="removeBookmark('${c.slug}')"
        >
          <span class="bookmark-icon" aria-hidden="true">♥</span>
        </button>

        <div class="casino-card__header">
          <div class="casino-card__logo-wrap">
            <img src="${c.logo || '/static/images/default.png'}" alt="${c.name}" class="casino-card__logo" onerror="this.src='/static/images/default.png'" loading="lazy">
          </div>
          <div class="casino-card__title-group">
            <h3 class="casino-card__name">${c.name}</h3>
            <div class="casino-card__rating">${'★'.repeat(Math.round(c.rating || 0))}${'☆'.repeat(5 - Math.round(c.rating || 0))}</div>
          </div>
        </div>

        <div class="casino-card__body">
          <div class="casino-card__bonus">
            <span class="bonus-title">${c.bonus_title || 'Welcome Bonus'}</span>
            <span class="bonus-value">${c.bonus_value || ''}</span>
          </div>
          ${c.geoStatusText || ''}
          ${c.complianceHtml || ''}
        </div>

        <div class="casino-card__actions">
          <a href="/en/casino/${c.slug}" class="btn btn--secondary">Review</a>
          <a href="/en/go/${c.slug}" class="btn btn--primary" rel="nofollow sponsored">Visit</a>
        </div>
      </div>
    `).join("");

  } catch {
    container.innerHTML = '<p class="muted">Failed to load bookmarks.</p>';
  }
}
async function initBookmarksPagebackup() {
  const container = document.getElementById("bookmarksContainer");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/user/bookmarks");
    const data = await res.json();
    const bookmarks = data.bookmarks || [];

    if (bookmarks.length === 0) {
      container.innerHTML = '<p class="muted">No bookmarks yet. Browse casinos and click the heart icon to save them.</p>';
      return;
    }

container.innerHTML = bookmarks.map(c => {
  const rating = Math.round(c.rating || 0);
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  return `
    <div class="casino-card" data-casino-slug="${c.slug}">

      <button
        type="button"
        class="casino-card__bookmark"
        data-bookmark-slug="${c.slug}"
        aria-label="Remove ${c.name} from bookmarks"
        aria-pressed="true"
        title="Remove ${c.name} from bookmarks"
      >
        <span class="bookmark-icon" aria-hidden="true">♥</span>
      </button>

      <div class="casino-card__header">
        <div class="casino-card__logo-wrap">
          <img
            src="${c.logo || '/static/images/default.png'}"
            alt="${c.name}"
            class="casino-card__logo"
            onerror="this.src='/static/images/default.png'"
            loading="lazy"
          >
        </div>

        <div class="casino-card__title-group">
          <h3 class="casino-card__name">${c.name}</h3>
          <div class="casino-card__rating">${stars}</div>
        </div>
      </div>

      <div class="casino-card__body">

        <div class="casino-card__bonus">
          <span class="bonus-title">${c.bonus_title || 'Welcome Bonus'}</span>
          <span class="bonus-value">${c.bonus_value || ''}</span>
        </div>

      </div>

      <div class="casino-card__actions">
        <a
          href="/en/casino/${c.slug}"
          class="btn btn--secondary"
        >Review</a>

        <a
          href="/en/go/${c.slug}"
          class="btn btn--primary"
          rel="nofollow sponsored"
        >Visit</a>
      </div>

    </div>
  `;
}).join("");

  } catch {
    container.innerHTML = '<p class="muted">Failed to load bookmarks.</p>';
  }
}

async function removeBookmark(slug) {
  try {
    const res = await fetch("/en/api/v1/user/bookmark/remove", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        casino_slug: slug
      })
    });

    if (!res.ok) {
      throw new Error("Failed to remove bookmark");
    }

    const data = await res.json();

    if (data.success === false) {
      throw new Error(data.error || "Failed to remove bookmark");
    }

    await initBookmarksPage();

  } catch (error) {
    console.error("Remove bookmark:", error);
    alert("Failed to remove bookmark");
  }
}

// ── Inquiries ──

function initInquiryForm() {
  const form = document.getElementById("inquiryForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("inquiryFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const payload = {
      subject: formData.get("subject"),
      message: formData.get("message"),
    };

    try {
      const res = await fetch("/en/api/v1/user/inquiry/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = "Inquiry sent! We'll respond soon.";
          alertEl.style.display = "block";
        }
        form.reset();
        initInquiriesList();
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

async function initInquiriesList() {
  const container = document.getElementById("inquiriesList");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/user/inquiries");
    const data = await res.json();
    const inquiries = data.inquiries || [];

    if (inquiries.length === 0) {
      container.innerHTML = '<p class="muted">No inquiries yet.</p>';
      return;
    }

    container.innerHTML = inquiries.map(i => `
      <div class="admin-section" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong>${i.subject}</strong>
          <span class="status-badge ${i.status === 'answered' ? 'status-published' : 'status-draft'}">${i.status}</span>
        </div>
        <p style="color:var(--gray);font-size:14px">${i.message}</p>
        <p class="muted" style="font-size:12px;margin-top:8px">${new Date(i.created_at).toLocaleDateString()}</p>
        ${i.admin_reply ? `
        <div style="background:var(--bg);border-radius:8px;padding:12px;margin-top:12px;border-left:3px solid var(--primary)">
          <strong style="font-size:13px">Admin Response:</strong>
          <p style="font-size:14px;margin-top:4px">${i.admin_reply}</p>
        </div>` : ""}
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<p class="muted">Failed to load inquiries.</p>';
  }
}

// ── Notifications ──

async function initNotificationsPage() {
  const container = document.getElementById("notificationsList");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/user/notifications");
    const data = await res.json();
    const notifications = data.notifications || [];

    if (notifications.length === 0) {
      container.innerHTML = '<p class="muted">No notifications yet.</p>';
      return;
    }

    container.innerHTML = notifications.map(n => `
      <div class="admin-section" style="margin-bottom:12px;${!n.is_read ? 'border-left:3px solid var(--primary)' : ''}" onclick="${n.link ? `window.location='${n.link}'` : ''}" style="cursor:${n.link ? 'pointer' : 'default'}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${n.title}</strong>
          <div>
            ${!n.is_read ? `<span class="status-badge status-published" style="font-size:10px">New</span>` : ""}
            <span class="muted" style="font-size:12px;margin-left:8px">${new Date(n.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        ${n.message ? `<p style="color:var(--gray);font-size:14px;margin-top:6px">${n.message}</p>` : ""}
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<p class="muted">Failed to load notifications.</p>';
  }
}

async function markAllRead() {
  try {
    await fetch("/en/api/v1/user/notifications/read-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    initNotificationsPage();
  } catch { alert("Failed"); }
}

// ── Casino Submissions ──

function initUserCasinoForm() {
  const form = document.getElementById("userCasinoForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("userCasinoAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const payload = {
      name: formData.get("name"),
      website_url: formData.get("website_url"),
      affiliate_url: formData.get("affiliate_url") || null,
      bonus_value: formData.get("bonus_value") || null,
      notes: formData.get("notes") || null,
    };

    try {
      const res = await fetch("/en/api/v1/user/submit-casino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = "Casino submitted for review!";
          alertEl.style.display = "block";
        }
        form.reset();
        initUserSubmissionsList();
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

async function initUserSubmissionsList() {
  const container = document.getElementById("userSubmissionsList");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/user/submissions");
    const data = await res.json();
    const submissions = data.submissions || [];

    if (submissions.length === 0) {
      container.innerHTML = '<p class="muted">No submissions yet.</p>';
      return;
    }

    container.innerHTML = submissions.map(s => `
      <div class="admin-section" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${s.name}</strong>
          <span class="status-badge ${s.status === 'approved' ? 'status-published' : s.status === 'rejected' ? 'status-draft' : ''}">${s.status}</span>
        </div>
        <p style="font-size:13px;color:var(--gray);margin-top:4px">${s.website_url}</p>
        <p class="muted" style="font-size:12px">Submitted: ${new Date(s.created_at).toLocaleDateString()}</p>
        ${s.admin_notes ? `<p style="font-size:13px;margin-top:8px;background:var(--bg);padding:8px;border-radius:6px"><strong>Admin notes:</strong> ${s.admin_notes}</p>` : ""}
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<p class="muted">Failed to load submissions.</p>';
  }
}

// ── Profile ──

function initProfileForm() {
  const form = document.getElementById("profileForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("profileFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const payload = {
      email: formData.get("email"),
    };

    try {
      const res = await fetch("/en/api/v1/user/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = "Profile updated!";
          alertEl.style.display = "block";
        }
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
