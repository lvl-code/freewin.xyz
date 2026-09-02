// =====================================================
// PAGE NAV — Progressive AJAX Navigation
// =====================================================
// Enhances clicks on PageNav links (".pagenav__link", rendered
// by Renderer.buildPageNavHtml() in render.js) to swap only the
// <main id="mainContent"> region instead of a full page reload,
// using the ?partial=1 JSON response added to render() in
// render.js.
//
// SEO-first / progressive enhancement (see master spec Part 43):
// every PageNav link is already a real, crawlable <a href> that
// performs a normal full navigation with JavaScript disabled or
// on any error. This script only ENHANCES that link when JS is
// available and the request succeeds — it never replaces it.
//
// Scope: this script intentionally only intercepts clicks on
// ".pagenav__link" anchors — not every link on the site. PageNav
// itself lives in layout/base.html (outside <main>), so it is
// never destroyed/re-rendered by the content swap below; no
// re-binding of these listeners is ever needed after navigation.
// =====================================================

(function () {
  "use strict";

  const MAIN_CONTENT_ID = "mainContent";
  let activeController = null; // AbortController for the in-flight navigation

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const pagenavs = document.querySelectorAll(".pagenav");
    if (pagenavs.length === 0) return;

    pagenavs.forEach(nav => {
      nav.addEventListener("click", onPagenavClick);
    });

    window.addEventListener("popstate", onPopState);

    // Normalize the initial history entry so popstate has a
    // consistent starting point to compare against.
    history.replaceState({ pagenavAjax: true }, "", location.href);
  }

  function onPagenavClick(event) {
    const link = event.target.closest(".pagenav__link");
    if (!link) return;
    if (!isEligibleForAjax(link, event)) return;

    event.preventDefault();
    navigateTo(link.getAttribute("href"), link);
  }

  // ── Eligibility (Part 17) ────────────────────────────
  function isEligibleForAjax(link, event) {
    // Respect modifier keys / non-primary clicks (new tab, etc.)
    if (event.defaultPrevented) return false;
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

    // Respect target="_blank" (server sets this for is_external items)
    if (link.target && link.target !== "_self") return false;

    // Respect an explicit opt-out, if a future admin option adds one
    if (link.hasAttribute("data-no-ajax")) return false;

    const href = link.getAttribute("href");
    if (!href) return false;

    // Only plain internal GET navigations — never files, mailto,
    // tel, external domains, or hash-only links.
    if (/^(https?:)?\/\//i.test(href) && !href.startsWith(location.origin)) return false;
    if (/^(mailto|tel|javascript):/i.test(href)) return false;
    if (href.startsWith("#")) return false;

    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return false;
    }
    if (url.origin !== location.origin) return false;

    return true;
  }

  // ── Perform the AJAX navigation ──────────────────────
  async function navigateTo(href, triggerLink) {
    const url = new URL(href, location.href);
    const partialUrl = new URL(url.href);
    partialUrl.searchParams.set("partial", "1");

    // Cancel any navigation already in flight (rapid successive clicks)
    if (activeController) {
      activeController.abort();
    }
    activeController = new AbortController();
    const { signal } = activeController;

    setLoadingState(true, triggerLink);

    try {
      const res = await fetch(partialUrl.href, {
        method: "GET",
        credentials: "same-origin",
        signal
      });

      if (!res.ok) {
        throw new Error(`Partial navigation failed with status ${res.status}`);
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Partial response was not valid JSON");
      }

      if (!data || !data.partial || typeof data.html !== "string") {
        throw new Error("Partial response missing expected fields");
      }

      applyPartialResponse(data, url);
      history.pushState({ pagenavAjax: true }, "", url.pathname + url.search + url.hash);
      updateActiveLinkStates(url.pathname);
    } catch (err) {
      if (err && err.name === "AbortError") {
        // A newer navigation superseded this one — do nothing,
        // the newer request's own handler will finish the job.
        return;
      }
      // Fail open: never trap the user on a broken state (Part 18).
      console.error("PageNav AJAX navigation failed, falling back:", err.message);
      window.location.href = href;
      return;
    } finally {
      setLoadingState(false, triggerLink);
      activeController = null;
    }
  }

  // ── Swap content + update document head/title ────────
  function applyPartialResponse(data, url) {
    const mainEl = document.getElementById(MAIN_CONTENT_ID);
    if (!mainEl) {
      // Content region not found — safest thing is a real navigation.
      window.location.href = url.href;
      return;
    }

    mainEl.innerHTML = data.html;

    if (data.title) {
      document.title = data.title;
    }

    if (typeof data.metaDescription === "string") {
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.setAttribute("name", "description");
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute("content", data.metaDescription);
    }

    if (data.canonical) {
      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) {
        canonicalLink = document.createElement("link");
        canonicalLink.setAttribute("rel", "canonical");
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute("href", data.canonical);
    }

    // Let any other script on the page know new content landed,
    // in case it needs to reinitialize something inside it. This
    // script does not assume what that might be (out of scope —
    // see Phase 6 report).
    document.dispatchEvent(new CustomEvent("pagenav:contentReplaced", {
      detail: { url: url.href }
    }));

    restoreFocusAndScroll(mainEl);
  }

  function restoreFocusAndScroll(mainEl) {
    // Move focus to the new content region for screen reader users
    // (a normal full navigation would reset focus to <body>/top).
    if (!mainEl.hasAttribute("tabindex")) {
      mainEl.setAttribute("tabindex", "-1");
    }
    mainEl.focus({ preventScroll: true });

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
  }

  // ── Active-state sync (Part 12) ──────────────────────
  // PageNav lives outside <main>, so it is never re-rendered by
  // the swap above — its "active" class has to be updated here
  // in JS instead of coming fresh from the server each time.
  function updateActiveLinkStates(currentPath) {
    let normalizedPath = currentPath.split("?")[0].split("#")[0];
    if (normalizedPath.length > 1 && normalizedPath.endsWith("/")) {
      normalizedPath = normalizedPath.slice(0, -1);
    }

    document.querySelectorAll(".pagenav__link").forEach(link => {
      const linkPath = (link.getAttribute("href") || "").split("?")[0].split("#")[0];
      const normalizedLinkPath = linkPath.length > 1 && linkPath.endsWith("/")
        ? linkPath.slice(0, -1)
        : linkPath;

      const isActive = normalizedLinkPath === normalizedPath;
      link.classList.toggle("pagenav__link--active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  // ── Loading UX (Part 18) ──────────────────────────────
  function setLoadingState(isLoading, triggerLink) {
    document.querySelectorAll(".pagenav").forEach(nav => {
      nav.classList.toggle("pagenav--loading", isLoading);
    });
    if (triggerLink) {
      // Prevent duplicate clicks on the same link mid-navigation.
      if (isLoading) {
        triggerLink.setAttribute("aria-busy", "true");
      } else {
        triggerLink.removeAttribute("aria-busy");
      }
    }
  }

  // ── Browser Back / Forward ────────────────────────────
  function onPopState() {
    // Always re-derive from the current URL rather than trusting
    // cached HTML in history.state — simpler and avoids serving
    // stale content if the underlying page has since changed.
    const url = new URL(location.href);
    const partialUrl = new URL(url.href);
    partialUrl.searchParams.set("partial", "1");

    if (activeController) {
      activeController.abort();
    }
    activeController = new AbortController();
    const { signal } = activeController;

    setLoadingState(true, null);

    fetch(partialUrl.href, { method: "GET", credentials: "same-origin", signal })
      .then(res => {
        if (!res.ok) throw new Error(`Partial navigation failed with status ${res.status}`);
        return res.text();
      })
      .then(text => {
        const data = JSON.parse(text);
        if (!data || !data.partial || typeof data.html !== "string") {
          throw new Error("Partial response missing expected fields");
        }
        applyPartialResponse(data, url);
        updateActiveLinkStates(url.pathname);
      })
      .catch(err => {
        if (err && err.name === "AbortError") return;
        // A broken Back/Forward experience is worse than a reload.
        console.error("PageNav AJAX popstate navigation failed, reloading:", err.message);
        window.location.reload();
      })
      .finally(() => {
        setLoadingState(false, null);
        activeController = null;
      });
  }
})();
