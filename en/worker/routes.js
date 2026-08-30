// =====================================================
// TENANT ROUTER
// Equivalent to Django urls.py
// =====================================================

export function getRoute(request) {

  const url = new URL(request.url);

  let path = url.pathname;

  // remove trailing slash except root
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  // Add right after: if (path.length > 1 && path.endsWith("/")) { path = path.slice(0, -1); }
  if (path === "/" || path === "") {
      return { type: "redirect", target: "/en" };
  }

  // =====================================================
  // HOME
  // =====================================================

  if (path === "/en" || path === "/en/home") {
    return {
      type: "home"
    };
  }

    // LISTING PAGES
  if (path === "/en/casino") return { type: "casinoList" };
  if (path === "/en/review") return { type: "reviewList" };
  if (path === "/en/news") return { type: "newsList" };
  if (path === "/en/updates") return { type: "updatesList" };
  if (path === "/en/author") return { type: "authorList" };

  // =====================================================
  // CASINO
  // /en/casino/bcgame
  // =====================================================

  const casinoMatch =
    path.match(/^\/en\/casino\/([^/]+)$/);

  if (casinoMatch) {
    return {
      type: "casino",
      slug: casinoMatch[1]
    };
  }

  // =====================================================
  // REVIEW
  // /en/review/bcgame
  // =====================================================

  const reviewMatch =
    path.match(/^\/en\/review\/([^/]+)$/);

  if (reviewMatch) {
    return {
      type: "review",
      slug: reviewMatch[1]
    };
  }

  // =====================================================
  // NEWS
  // /en/news/new-license
  // =====================================================

  const newsMatch =
    path.match(/^\/en\/news\/([^/]+)$/);

  if (newsMatch) {
    return {
      type: "news",
      slug: newsMatch[1]
    };
  }

  // =====================================================
// PLATFORM UPDATE
// /en/updates/new-lummet-ai-feature
// =====================================================

  const updateMatch =
    path.match(/^\/en\/updates\/([^/]+)$/);

  if (updateMatch) {
    return {
      type: "update",
      slug: updateMatch[1]
    };
  }

  // =====================================================
  // COUNTRY
  // /en/country/rwanda
  // =====================================================

  const countryMatch =
    path.match(/^\/en\/country\/([^\/]+)$/);

  if (countryMatch) {
    return {
      type: "country",
      slug: countryMatch[1]
    };
  }

  // =====================================================
  // CATEGORY
  // /en/category/crypto
  // =====================================================

  const categoryMatch =
    path.match(/^\/en\/category\/([^\/]+)$/);

  if (categoryMatch) {
    return {
      type: "category",
      slug: categoryMatch[1]
    };
  }

    // =====================================================
  // AUTHOR PROFILE
  // /en/author/elie-bizimana
  // =====================================================

  const authorMatch = path.match(/^\/en\/author\/([^\/]+)$/);
  if (authorMatch) {
    return { type: "author", slug: authorMatch[1] };
  }

  // =====================================================
  // AFFILIATE LANDING PAGE
  // /en/affiliate/become-affiliate
  // =====================================================

  const affiliateMatch =
    path.match(/^\/en\/affiliate\/([^\/]+)$/);

  if (affiliateMatch) {
    return {
      type: "affiliate",
      slug: affiliateMatch[1]
    };
  }

  // =====================================================
  // GO TRACKING
  // /en/go/bcgame
  // =====================================================

  const goMatch =
    path.match(/^\/en\/go\/([^\/]+)$/);

  if (goMatch) {
    return {
      type: "go",
      slug: goMatch[1]
    };
  }

  // =====================================================
  // DASHBOARD
  // =====================================================
  if (path === "/en/dashboard") return { type: "dashboard" };
  if (path === "/en/dashboard/casinos") return { type: "dashboardCasinos" };
  if (path === "/en/dashboard/casino/create") return { type: "dashboardCasinoCreate" };
  if (path === "/en/dashboard/reviews") return { type: "dashboardReviews" };
  if (path === "/en/dashboard/news") return { type: "dashboardNews" };
  if (path === "/en/dashboard/updates")  return { type: "dashboardUpdates" };
  if (path === "/en/dashboard/pages") return { type: "dashboardPages" };
  if (path === "/en/dashboard/settings") return { type: "dashboardSettings" };
  if (path === "/en/dashboard/ai") return { type: "dashboardAI" };
  if (path === "/en/category") return { type: "categoryList" };
  if (path === "/en/country") return { type: "countryList" };
  if (path === "/en/dashboard/categories") return { type: "dashboardCategories" };
  if (path === "/en/dashboard/countries") return { type: "dashboardCountries" };
  if (path === "/en/dashboard/authors") return { type: "dashboardAuthors" };
  if (path === "/en/dashboard/media") return { type: "dashboardMedia" };
  if (path === "/en/dashboard/nav") return { type: "dashboardNav" };
  if (path === "/en/dashboard/permissions") return { type: "dashboardPermissions" };
  if (path === "/en/dashboard/item-access") return { type: "dashboardItemAccess" };
  if (path === "/en/dashboard/users") return { type: "dashboardUsers" };
  if (path === "/en/dashboard/inquiries") return { type: "dashboardInquiries" };
  if (path === "/en/dashboard/submissions") return { type: "dashboardSubmissions" };
  if (path === "/en/dashboard/notifications") return { type: "dashboardNotifications" };
  if (path === "/en/dashboard/banners") return { type: "dashboardBanners" };

  const casinoEditMatch = path.match(/^\/en\/dashboard\/casino\/edit\/([^/]+)$/);
  if (casinoEditMatch) return { type: "dashboardCasinoEdit", slug: casinoEditMatch[1] };

  if (path === "/en/dashboard/components") return { type: "dashboardComponents" };
  if (path === "/en/dashboard/seo") return { type: "dashboardSeo" };


  // =====================================================
  // AUTH
  // =====================================================

  if (path === "/en/login") {
    return {
      type: "login"
    };
  }

  if (path === "/en/register") {
    return {
      type: "register"
    };
  }



  if (path === "/en/user/dashboard") return { type: "userDashboard" };
  if (path === "/en/user/submit-casino") return { type: "userSubmitCasino" };
  if (path === "/en/user/inquiries") return { type: "userInquiries" };
  if (path === "/en/user/profile") return { type: "userProfile" };
  if (path === "/en/user/notifications") return { type: "userNotifications" };
  if (path === "/en/user/bookmarks") return { type: "userBookmarks" };
 
  // =====================================================
// MEDIA FILES
// =====================================================

  if (path.startsWith("/media/") && request.method === "GET") {
    return {
      type: "media",
      key: path.substring(1)
    };
  }
  // =====================================================
// FAVICON
// =====================================================

if (path === "/favicon.ico") {
  return {
    type: "favicon"
  };
}

  // =====================================================
  // SUPER API (Lummet control-plane channel)
  // Must be matched before the generic API catch-all below.
  // =====================================================
  if (path.startsWith("/en/api/super/")) {
    return {
      type: "superApi",
      path
    };
  }

  // =====================================================
  // API 
  // =====================================================
  if (path.startsWith("/api/") || path.startsWith("/en/api/")) {
    return {
      type: "api",
      path: path.replace(/^\/en/, "")
    };
  }

  // Sitemap routes — accessible at both root and /en/
  if (path === "/sitemap.xml" || path === "/en/sitemap.xml") {
      return { type: "sitemap" };
  }
  if (path === "/en/sitemap" || path === "/sitemap") {
      return { type: "sitemap-page" };
  }
  if (path === "/sitemap-index.xml" || path === "/en/sitemap-index.xml") {
      return { type: "sitemap-index" };
  }
  if (path === "/sitemap-casinos.xml" || path === "/en/sitemap-casinos.xml") {
      return { type: "sitemap-casinos" };
  }
  if (path === "/sitemap-reviews.xml" || path === "/en/sitemap-reviews.xml") {
      return { type: "sitemap-reviews" };
  }
  if (path === "/sitemap-news.xml" || path === "/en/sitemap-news.xml") {
      return { type: "sitemap-news" };
  }
  if (path === "/sitemap-updates.xml" || path === "/en/sitemap-updates.xml") {
      return { type: "sitemap-updates" };
  }

  if (path === "/sitemap-authors.xml" || path === "/en/sitemap-authors.xml") {
      return { type: "sitemap-authors" };
  }

  if (path === "/sitemap-categories.xml" || path === "/en/sitemap-categories.xml") {
      return { type: "sitemap-categories" };
  }
  if (path === "/sitemap-countries.xml" || path === "/en/sitemap-countries.xml") {
      return { type: "sitemap-countries" };
  }
  if (path === "/sitemap-pages.xml" || path === "/en/sitemap-pages.xml") {
      return { type: "sitemap-pages" };
  }
  if (path === "/robots.txt") {
      return { type: "robots" };
  }

  // =====================================================
  // FALLBACK DYNAMIC PAGE ENGINE
  // =====================================================
  // /en/about
  // /en/contact
  // /en/privacy
  // /en/terms
  // =====================================================

  const dynamicPage =
    path.match(/^\/en\/(.+)$/);

  if (dynamicPage) {

    return {
      type: "page",
      slug: dynamicPage[1]
    };

  }

  // =====================================================
  // 404
  // =====================================================

  return {
    type: "not_found"
  };

}
