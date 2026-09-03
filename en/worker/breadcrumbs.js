import { getSiteContext } from "./site-context.js";
// =====================================================
// TENANT BREADCRUMB ENGINE
// =====================================================

const ROUTES = {
  home: [],

  casinoList: [
    { label: "All Casinos", url: "/en/casino" }
  ],

  reviewList: [
    { label: "All Reviews", url: "/en/review" }
  ],

  newsList: [
    { label: "News", url: "/en/news" }
  ],

  updatesList: [
    { label: "Platform Updates", url: "/en/updates" }
  ],

  authorList: [
    { label: "Authors", url: "/en/author" }
  ],

  categoryList: [
    { label: "Categories", url: "/en/category" }
  ],

  countryList: [
    { label: "Countries", url: "/en/country" }
  ],

  dashboard: [
    { label: "Dashboard", url: null }
  ]
};

export function buildBreadcrumbs(route, data = {}) {
  if (route === "home") {
    return [];
  }

  const crumbs = [
    {
      label: "Home",
      url: "/en"
    }
  ];

  if (ROUTES[route]) {
    crumbs.push(...ROUTES[route]);
    return crumbs;
  }

  switch (route) {

    case "casino":
      crumbs.push(
        { label: "All Casinos", url: "/en/casino" },
        { label: data.name || data.title, url: null }
      );
      break;

    case "review":
      crumbs.push(
        { label: "All Reviews", url: "/en/review" },
        { label: data.title, url: null }
      );
      break;

    case "news":
      crumbs.push(
        { label: "News", url: "/en/news" },
        { label: data.title, url: null }
      );
      break;

    case "update":
      crumbs.push(
        { label: "Platform Updates", url: "/en/updates" },
        { label: data.title, url: null }
      );
      break;


    case "category":
      crumbs.push(
        { label: "Categories", url: "/en/category" },
        { label: data.category || data.title, url: null }
      );
      break;

    case "country":
      crumbs.push(
        { label: "Countries", url: "/en/country" },
        { label: data.name || data.title, url: null }
      );
      break;

    case "countryCustomPage":
      crumbs.push(
        { label: "Countries", url: "/en/country" },
        { label: data.countryName, url: `/en/country/${data.countryCode}` },
        { label: data.title, url: null }
      );
      break;

    case "categoryCountryPage":
      crumbs.push(
        { label: "Categories", url: "/en/category" },
        { label: data.categoryName, url: `/en/category/${data.categorySlug}` },
        { label: data.countryName, url: null }
      );
      break;

    case "author":
      crumbs.push(
        { label: "Authors", url: "/en/author" },
        { label: data.author_name || data.name, url: null }
      );
      break;

    case "affiliate":
      crumbs.push({
        label: data.title,
        url: null
      });
      break;

    case "page":
      crumbs.push({
        label: data.title,
        url: null
      });
      break;
  }

  return crumbs;
}

// =====================================================
// HTML Breadcrumbs
// =====================================================

export function renderBreadcrumbs(crumbs = []) {

  crumbs = Array.isArray(crumbs) ? crumbs : [];
  if (!crumbs.length) {
    return "";
  }

  const items = crumbs.map(c => {

    if (c.url) {
      return `<li><a href="${c.url}">${c.label}</a></li>`;
    }

    return `<li aria-current="page">${c.label}</li>`;

  }).join("");

  return `
<nav class="breadcrumbs" aria-label="Breadcrumb">
  <ol>
    ${items}
  </ol>
</nav>
`;

}

// =====================================================
// Breadcrumb JSON-LD
// =====================================================

export function buildBreadcrumbSchema(
  crumbs = [],
  siteOrigin = ""
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",

    itemListElement: crumbs.map((crumb, index) => {
      const item = {
        "@type": "ListItem",
        position: index + 1,
        name: crumb.label
      };

      if (crumb.url) {
        item.item = `${siteOrigin}${crumb.url}`;
      }

      return item;
    })
  };
}
