import { getRoute }
from "./routes.js";
import { serveMedia } from './media-upload.js';
import {
  renderHome,
  renderAuthor,
  renderAuthorList,
  renderDashboardAuthors,
  renderNews,
  renderCasino,
  renderReview,
  renderCountry,
  renderCategory,
  renderAffiliate,
  renderDashboardPage,
  renderCasinoList,
  renderReviewList,
  renderNewsList,
  renderUpdatesList,
  renderUpdate,
  renderDashboardComponents,
  renderDashboardMedia,
  renderDashboardNav,
  renderDashboardPermissions,
  renderDashboardItemAccess,
  renderDashboardUsers,
  renderDashboardInquiries,
  renderDashboardSubmissions,
  renderDashboardNotifications,
  renderDashboardBanners,
  renderDashboardSeo,
  renderDashboardCasinos,
  renderDashboardCasinoCreate,
  renderDashboardReviews,
  renderDashboardNews,
  renderDashboardUpdates,
  renderDashboardPages,
  renderDashboardSettings,
  renderDashboardAI,
  renderCategoryList,
  renderCountryList,
  renderDashboardCategories,
  renderDashboardCountries,
  renderDashboardCasinoEdit,
  dashboardStatsAPI,

  renderUserDashboard,
  renderUserSubmitCasino,
  renderUserInquiries,
  renderUserProfile,
  renderUserNotifications,
  renderUserBookmarks,
  renderDynamicPage,
  handleAffiliateRedirect,
  renderLogin,
  renderRegister,
  robots,
  render404,
  renderSitemapPage
}
from "./controllers.js";

import {
  handleAPI
}
from "./api.js";

import {
  sitemapEngine
}
from "./sitemap.js";
import {
  getCurrentUser
}
from "./auth.js";
import { cleanupExpiredSessions } from "./cron.js";

import { cleanupExpiredConversations } from "./ai/memory.js";

import { handleLummetRequest } from "./lummet/router.js";
import { getSiteContext } from "./site-context.js";

export default {

  async fetch(request, env, ctx) {

    const url = new URL(request.url);

    // ── Check if this is the Lummet subdomain ──
    // ── Check if this is the tenant's Lummet subdomain ──
    if (url.hostname.startsWith("lummet.")) {
      const lummetResponse = await handleLummetRequest(request, env, ctx);

      if (lummetResponse) {
        return lummetResponse;
      }
    }


    // Serve static assets
    if (
      url.pathname.startsWith("/static/")
    ) {
      return env.ASSETS.fetch(request);
    }

    const route = getRoute(request);

    switch (route.type) {

      case "home":
        return renderHome(request, env);
      case "login":
  return renderLogin(
    request,
    env
  );
      case "register":
  return renderRegister(
    request,
    env
  );



      case "casino":
        return renderCasino(
          request,
          env,
          route.slug
        );

      case "review":
        return renderReview(
          request,
          env,
          route.slug
        );
      case "news":
        return renderNews(
          request,
          env,
          route.slug
        );

      case "country":
        return renderCountry(
          request,
          env,
          route.slug
        );

      case "category":
        return renderCategory(
          request,
          env,
          route.slug
        );

      case "affiliate":
        return renderAffiliate(
          request,
          env,
          route.slug
        );

      case "go":
        return handleAffiliateRedirect(
          request,
          env,
          route.slug
        );

      case "dashboard":
        return renderDashboardPage(
          request,
          env
        );

      case "casinoList":
        return renderCasinoList(request, env);
      case "reviewList":
        return renderReviewList(request, env);
      case "newsList":
        return renderNewsList(request, env);


      case "updatesList":
        return renderUpdatesList(request, env);

      case "update":
        return renderUpdate(
          request,
          env,
          route.slug
        );

      case "categoryList":
        return renderCategoryList(request, env);
      case "countryList":
        return renderCountryList(request, env);
      case "dashboardCasinos":
        return renderDashboardCasinos(request, env);
      case "dashboardCasinoCreate":
        return renderDashboardCasinoCreate(request, env);
      case "dashboardReviews":
        return renderDashboardReviews(request, env);
      case "dashboardNews":
        return renderDashboardNews(request, env);
      case "dashboardUpdates":
        return renderDashboardUpdates(request, env);
      case "dashboardPages":
        return renderDashboardPages(request, env);
      case "dashboardSettings":
        return renderDashboardSettings(request, env);
      case "dashboardAI":
        return renderDashboardAI(request, env);
      case "dashboardCategories":
        return renderDashboardCategories(request, env);
      case "dashboardCountries":
        return renderDashboardCountries(request, env);
      case "authorList":
        return renderAuthorList(request, env);
      case "author":
        return renderAuthor(request, env, route.slug);
      case "dashboardAuthors":
        return renderDashboardAuthors(request, env);
      case "dashboardMedia":
        return renderDashboardMedia(request, env);
      case "dashboardNav":
        return renderDashboardNav(request, env);
      case "dashboardPermissions":
        return renderDashboardPermissions(request, env);
      case "dashboardItemAccess":
        return renderDashboardItemAccess(request, env);

      case "dashboardUsers":
        return renderDashboardUsers(request, env);
      case "dashboardInquiries":
        return renderDashboardInquiries(request, env);
      case "dashboardSubmissions":
        return renderDashboardSubmissions(request, env);
      case "dashboardNotifications":
        return renderDashboardNotifications(request, env);
      case "dashboardBanners":
        return renderDashboardBanners(request, env);

      case "dashboardCasinoEdit":
        return renderDashboardCasinoEdit(request, env, route.slug);
      case "dashboardComponents":
        return renderDashboardComponents(request, env);
      case "dashboardSeo":
        return renderDashboardSeo(request, env);

      case "userDashboard":
        return renderUserDashboard(request, env);
      case "userSubmitCasino":
        return renderUserSubmitCasino(request, env);
      case "userInquiries":
        return renderUserInquiries(request, env);
      case "userProfile":
        return renderUserProfile(request, env);
      case "userNotifications":
        return renderUserNotifications(request, env);
      case "userBookmarks":
        return renderUserBookmarks(request, env);

      case "media":
        return serveMedia(request, env, route.key);
      case "favicon":
        return env.ASSETS.fetch(request);
      case "api":

  const user =
    await getCurrentUser(
      request,
      env
    );

  return handleAPI(
    request,
    env,
    route.path,
    user
  );

      // REPLACE WITH:
      case "redirect":
        return new Response(null, { status: 302, headers: { Location: route.target } });
      case "sitemap":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "all"
  );

case "sitemap-page":
  return renderSitemapPage(request, env);

case "sitemap-index":
  return sitemapEngine.generateIndex(
    request,
    env,
    env.DB
  );

case "sitemap-casinos":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "casinos"
  );

case "sitemap-reviews":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "reviews"
  );

case "sitemap-news":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "news"
  );

case "sitemap-updates":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "updates"
  );

case "sitemap-authors":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "authors"
  );

case "sitemap-categories":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "categories"
  );

case "sitemap-countries":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "countries"
  );

case "sitemap-pages":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "pages"
  );
      case "robots":
        return robots(request, env);

      case "page":
        return renderDynamicPage(
          request,
          env,
          route.slug
        );
      case "not_found":
        return render404(request, env);

      default:
        return render404(request, env);

    }
  },
  async scheduled(event, env, ctx) {
        ctx.waitUntil(cleanupExpiredConversations(env.DB));

        ctx.waitUntil(
            cleanupExpiredSessions(env)
        );

    }
};
