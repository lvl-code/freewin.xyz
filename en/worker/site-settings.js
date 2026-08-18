// ============================================================
// SITE SETTINGS
// Tenant-specific branding, icons, hero and footer compliance.
// Uses the existing `settings` database table.
// ============================================================

import { getSetting } from "./database/settings.js";

const DEFAULTS = {
  logo: "/static/images/logo.png",
  ogImage: "/static/images/og-image.png",

  favicon96: "/static/icon/favicon-96x96.png",
  faviconSvg: "/static/icon/favicon.svg",
  faviconIco: "/static/icon/favicon.ico",
  appleTouchIcon: "/static/icon/apple-touch-icon.png",
  manifest: "/static/icon/site.webmanifest",

  heroImage: "",

    homepageSections: [
    {
      id: "features",
      enabled: true,
      type: "features",
      title: "Why Choose Us",
      subtitle: "",
      description: "",
      alignment: "center",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      cards: [
        {
          id: "expert-reviews",
          enabled: true,
          title: "Expert Reviews",
          text: "In-depth analysis from industry veterans with years of experience.",
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
          id: "exclusive-bonuses",
          enabled: true,
          title: "Exclusive Bonuses",
          text: "Access special bonus offers available only through {{site_name}}.",
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
          id: "geo-targeted",
          enabled: true,
          title: "Geo-Targeted",
          text: "See casinos available in your country with localized bonus offers.",
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
          id: "real-data",
          enabled: true,
          title: "Real Data",
          text: "Click tracking and player analytics for transparent recommendations.",
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
      ],
      paragraphs: [],
      buttonText: "",
      buttonUrl: "",
      buttonStyle: "primary"
    }
  ],
  footerDisclaimer:
    " ${site.siteName} is an independent casino comparison and affiliate platform. We do not operate gambling services or take bets. Operator availability depends on your jurisdiction. Users are responsible for complying with local laws. We may earn a commission via affiliate links.",

  responsibleText:
    "18+ | Gambling can be addictive, please play responsibly.",

  responsibleUrl: "/en/responsible-gambling",

  responsibleHelpText:
    "If you or someone you know needs help, visit",

  responsibleHelpUrl:
    "https://www.gambleaware.org/",

  responsibleHelpLabel:
    "GambleAware.org",

  compliance: [
    {
      image: "/static/images/logo/18plus.png",
      url: "",
      alt: "18+ Only"
    },
    {
      image: "/static/images/logo/gamble-aware-logo.svg",
      url: "https://www.gambleaware.org/",
      alt: "GambleAware"
    },
    {
      image: "/static/images/logo/curacao-gaming-contro-board-license.svg",
      url: "https://www.gamingcontrolcuracao.org/",
      alt: "Curaçao Gaming Control Board"
    },
    {
      image: "/static/images/logo/malta-gaming-authority-mga.svg",
      url: "https://www.mga.org.mt/",
      alt: "Malta Gaming Authority"
    },
    {
      image: "/static/images/logo/uk-gc-rectangle.svg",
      url: "https://www.gamblingcommission.gov.uk/",
      alt: "UK Gambling Commission"
    },
    {
      image: "/static/images/logo/gamstop.svg",
      url: "https://www.gamstop.co.uk/",
      alt: "GAMSTOP"
    },
    {
      image: "/static/images/logo/betblocker.svg",
      url: "https://betblocker.org/",
      alt: "BetBlocker"
    }
  ]
};


// ------------------------------------------------------------
// URL handling
// ------------------------------------------------------------

function resolveUrl(value, origin, fallback = "") {
  const input = String(value || "").trim();

  if (!input) {
    return fallback
      ? new URL(fallback, origin).href
      : "";
  }

  try {
    const url = new URL(input, origin);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback
        ? new URL(fallback, origin).href
        : "";
    }

    return url.href;
  } catch {
    return fallback
      ? new URL(fallback, origin).href
      : "";
  }
}


// ------------------------------------------------------------
// HTML escaping
// ------------------------------------------------------------

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// ------------------------------------------------------------
// Read JSON setting safely
// ------------------------------------------------------------

function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}



function parseHomepageSections(value) {
  if (!value) {
    return DEFAULTS.homepageSections;
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return DEFAULTS.homepageSections;
    }

    return parsed;
  } catch {
    return DEFAULTS.homepageSections;
  }
}
// ------------------------------------------------------------
// Load all tenant site settings
// ------------------------------------------------------------

export async function getSiteSettings(db, origin) {
  const keys = [
    "site_logo",
    "site_og_image",

    "site_favicon_96",
    "site_favicon_svg",
    "site_favicon_ico",
    "site_apple_touch_icon",
    "site_manifest",

    "site_hero_enabled",
    "site_hero_image",
    "site_hero_badge",
    "site_hero_title",
    "site_hero_subtitle",
    "site_hero_description",
    "site_hero_button_text",
    "site_hero_button_url",
    "site_hero_alignment",
    "site_hero_overlay",

    "homepage_sections",

    "footer_disclaimer",
    "footer_responsible_text",
    "footer_responsible_url",
    "footer_responsible_help_text",
    "footer_responsible_help_url",
    "footer_responsible_help_label",

    "footer_compliance"
  ];

  const values = {};

  if (db) {
    const results = await Promise.all(
      keys.map(async key => {
        try {
          return [key, await getSetting(db, key)];
        } catch {
          return [key, null];
        }
      })
    );

    for (const [key, value] of results) {
      values[key] = value;
    }
  }

  const compliance = parseJson(
    values.footer_compliance,
    DEFAULTS.compliance
  );

  const safeCompliance = Array.isArray(compliance)
    ? compliance
        .filter(item => item && item.image)
        .map(item => ({
          image: resolveUrl(
            item.image,
            origin,
            ""
          ),
          url: resolveUrl(
            item.url,
            origin,
            ""
          ),
          alt: String(item.alt || "Compliance")
        }))
        .filter(item => item.image)
    : DEFAULTS.compliance;

  return {
    logoUrl: resolveUrl(
      values.site_logo,
      origin,
      DEFAULTS.logo
    ),

    ogImageUrl: resolveUrl(
      values.site_og_image,
      origin,
      DEFAULTS.ogImage
    ),

    favicon96Url: resolveUrl(
      values.site_favicon_96,
      origin,
      DEFAULTS.favicon96
    ),

    faviconSvgUrl: resolveUrl(
      values.site_favicon_svg,
      origin,
      DEFAULTS.faviconSvg
    ),

    faviconIcoUrl: resolveUrl(
      values.site_favicon_ico,
      origin,
      DEFAULTS.faviconIco
    ),

    appleTouchIconUrl: resolveUrl(
      values.site_apple_touch_icon,
      origin,
      DEFAULTS.appleTouchIcon
    ),

    manifestUrl: resolveUrl(
      values.site_manifest,
      origin,
      DEFAULTS.manifest
    ),

    heroEnabled:
  values.site_hero_enabled !== "false",

heroImageUrl: resolveUrl(
  values.site_hero_image,
  origin,
  ""
),

heroBadge:
  values.site_hero_badge ||
  "Find Your Perfect Casino",

heroTitle:
  values.site_hero_title ||
  "Find Your Perfect Casino",

heroSubtitle:
  values.site_hero_subtitle ||
  "Expert reviews, exclusive bonuses, and real player data for {{casino_count}}+ casinos worldwide.",

heroDescription:
  values.site_hero_description ||
  "",

heroButtonText:
  values.site_hero_button_text ||
  "Browse Casinos",

heroButtonUrl:
  values.site_hero_button_url ||
  "/en/casino",

heroAlignment:
  values.site_hero_alignment ||
  "center",

heroOverlay:
  values.site_hero_overlay !== "false",



    footerDisclaimer:
      values.footer_disclaimer ||
      DEFAULTS.footerDisclaimer,

    responsibleText:
      values.footer_responsible_text ||
      DEFAULTS.responsibleText,

    responsibleUrl:
      values.footer_responsible_url ||
      DEFAULTS.responsibleUrl,

    responsibleHelpText:
      values.footer_responsible_help_text ||
      DEFAULTS.responsibleHelpText,

    responsibleHelpUrl:
      resolveUrl(
        values.footer_responsible_help_url,
        origin,
        DEFAULTS.responsibleHelpUrl
      ),

    responsibleHelpLabel:
      values.footer_responsible_help_label ||
      DEFAULTS.responsibleHelpLabel,

    compliance: safeCompliance,

    homepageSections:
  parseHomepageSections(
    values.homepage_sections
  )

  };
}


//-------------------------------------------------------------
//Render homepage sections
//-------------------------------------------------------------
function escapeAttribute(value = "") {
  return escapeHtml(String(value || ""));
}


function safeUrl(value, origin) {
  const input = String(value || "").trim();

  if (!input) return "";

  try {
    const url = new URL(input, origin);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}


function renderIcon(card, origin) {
  const iconType =
    String(card.iconType || "icon").toLowerCase();

  if (
    iconType === "image" &&
    card.imageUrl
  ) {
    const image =
      safeUrl(card.imageUrl, origin);

    if (!image) return "";

    return `
      <div class="feature-icon feature-icon--image">
        <img
          src="${escapeAttribute(image)}"
          alt=""
          loading="lazy"
        >
      </div>
    `;
  }

  return `
    <div
      class="feature-icon"
      ${card.iconColor
        ? `style="color:${escapeAttribute(card.iconColor)}"`
        : ""}
    >
      ${escapeHtml(card.icon || "★")}
    </div>
  `;
}


function renderHomepageCard(card, origin) {
  if (!card || card.enabled === false) {
    return "";
  }

  const title =
    escapeHtml(card.title || "");

  const text =
    escapeHtml(card.text || "");

  const url =
    safeUrl(card.url, origin);

  const cardStyles = [];

  if (card.backgroundColor) {
    cardStyles.push(
      `background-color:${escapeAttribute(
        card.backgroundColor
      )}`
    );
  }

  if (card.backgroundImage) {
    const bg =
      safeUrl(
        card.backgroundImage,
        origin
      );

    if (bg) {
      cardStyles.push(
        `background-image:url('${escapeAttribute(bg)}')`,
        "background-size:cover",
        "background-position:center"
      );
    }
  }

  if (card.textColor) {
    cardStyles.push(
      `color:${escapeAttribute(card.textColor)}`
    );
  }

  const style =
    cardStyles.length
      ? ` style="${cardStyles.join(";")}"`
      : "";

  const content = `
    ${renderIcon(card, origin)}

    ${
      title
        ? `<h3>${title}</h3>`
        : ""
    }

    ${
      text
        ? `<p>${text}</p>`
        : ""
    }
  `;

  if (url) {
    const target =
      card.target === "_blank"
        ? "_blank"
        : "_self";

    const rel =
      target === "_blank"
        ? ` rel="noopener noreferrer"`
        : "";

    return `
      <a
        href="${escapeAttribute(url)}"
        class="feature-card"
        target="${target}"${rel}${style}
      >
        ${content}
      </a>
    `;
  }

  return `
    <div
      class="feature-card"${style}
    >
      ${content}
    </div>
  `;
}


function renderHomepageSection(section, origin) {
  if (
    !section ||
    section.enabled === false
  ) {
    return "";
  }

  const type =
    String(section.type || "features")
      .toLowerCase();

  const sectionStyles = [];

  if (section.backgroundColor) {
    sectionStyles.push(
      `background-color:${escapeAttribute(
        section.backgroundColor
      )}`
    );
  }

  if (section.backgroundImage) {
    const bg =
      safeUrl(
        section.backgroundImage,
        origin
      );

    if (bg) {
      sectionStyles.push(
        `background-image:url('${escapeAttribute(bg)}')`,
        "background-size:cover",
        "background-position:center"
      );
    }
  }

  if (section.textColor) {
    sectionStyles.push(
      `color:${escapeAttribute(
        section.textColor
      )}`
    );
  }

  const sectionStyle =
    sectionStyles.length
      ? ` style="${sectionStyles.join(";")}"`
      : "";

  const alignment =
    ["left", "center", "right"].includes(
      section.alignment
    )
      ? section.alignment
      : "center";

  const title =
    escapeHtml(section.title || "");

  const subtitle =
    escapeHtml(section.subtitle || "");

  const description =
    escapeHtml(section.description || "");

  const paragraphs =
    Array.isArray(section.paragraphs)
      ? section.paragraphs
          .filter(Boolean)
          .map(
            paragraph => `
              <p class="homepage-section__paragraph">
                ${escapeHtml(paragraph)}
              </p>
            `
          )
          .join("")
      : "";

  const buttonUrl =
    safeUrl(
      section.buttonUrl,
      origin
    );

  const button =
    section.buttonText &&
    buttonUrl
      ? `
        <div class="homepage-section__actions">
          <a
            href="${escapeAttribute(buttonUrl)}"
            class="btn btn--${
              ["primary", "ghost"].includes(
                section.buttonStyle
              )
                ? section.buttonStyle
                : "primary"
            } btn--lg"
          >
            ${escapeHtml(
              section.buttonText
            )}
          </a>
        </div>
      `
      : "";

  const cards =
    Array.isArray(section.cards)
      ? section.cards
          .map(card =>
            renderHomepageCard(
              card,
              origin
            )
          )
          .join("")
      : "";

  /*
   * FEATURES
   */
  if (type === "features") {
    return `
      <section
        class="section section--alt homepage-section homepage-section--features"
        ${sectionStyle}
      >
        <div class="container">

          ${
            title ||
            subtitle ||
            description
              ? `
                <div
                  class="section-header homepage-section__header homepage-section__header--${alignment}"
                >
                  ${
                    title
                      ? `<h2>${title}</h2>`
                      : ""
                  }

                  ${
                    subtitle
                      ? `<p class="homepage-section__subtitle">${subtitle}</p>`
                      : ""
                  }

                  ${
                    description
                      ? `<p class="homepage-section__description">${description}</p>`
                      : ""
                  }
                </div>
              `
              : ""
          }

          ${
            paragraphs
              ? `
                <div class="homepage-section__text">
                  ${paragraphs}
                </div>
              `
              : ""
          }

          ${
            cards
              ? `
                <div class="features-grid">
                  ${cards}
                </div>
              `
              : ""
          }

          ${button}

        </div>
      </section>
    `;
  }


  /*
   * TEXT SECTION
   */
  if (type === "text") {
    return `
      <section
        class="section homepage-section homepage-section--text"
        ${sectionStyle}
      >
        <div class="container">

          <div
            class="homepage-section__content homepage-section__content--${alignment}"
          >

            ${
              title
                ? `<h2>${title}</h2>`
                : ""
            }

            ${
              subtitle
                ? `<p class="homepage-section__subtitle">${subtitle}</p>`
                : ""
            }

            ${
              description
                ? `<p class="homepage-section__description">${description}</p>`
                : ""
            }

            ${
              paragraphs
                ? `
                  <div class="homepage-section__paragraphs">
                    ${paragraphs}
                  </div>
                `
                : ""
            }

            ${button}

          </div>

        </div>
      </section>
    `;
  }


  /*
   * CARDS SECTION
   */
  if (type === "cards") {
    return `
      <section
        class="section homepage-section homepage-section--cards"
        ${sectionStyle}
      >
        <div class="container">

          ${
            title
              ? `<h2 class="homepage-section__title homepage-section__title--${alignment}">${title}</h2>`
              : ""
          }

          ${
            subtitle
              ? `<p class="homepage-section__subtitle homepage-section__subtitle--${alignment}">${subtitle}</p>`
              : ""
          }

          ${
            paragraphs
              ? `
                <div class="homepage-section__paragraphs">
                  ${paragraphs}
                </div>
              `
              : ""
          }

          <div class="features-grid">
            ${cards}
          </div>

          ${button}

        </div>
      </section>
    `;
  }


  /*
   * DEFAULT / UNKNOWN SECTION
   *
   * This makes the system forward-compatible.
   */
  return `
    <section
      class="section homepage-section"
      ${sectionStyle}
    >
      <div class="container">

        ${
          title
            ? `<h2>${title}</h2>`
            : ""
        }

        ${
          description
            ? `<p>${description}</p>`
            : ""
        }

        ${
          paragraphs
            ? `<div>${paragraphs}</div>`
            : ""
        }

        ${
          cards
            ? `<div class="features-grid">${cards}</div>`
            : ""
        }

        ${button}

      </div>
    </section>
  `;
}


export function buildHomepageSectionsHtml(
  sections,
  origin
) {
  if (!Array.isArray(sections)) {
    return "";
  }

  return sections
    .filter(section => section?.enabled !== false)
    .map(section =>
      renderHomepageSection(
        section,
        origin
      )
    )
    .join("\n");
}

// ------------------------------------------------------------
// Render compliance logos safely
// ------------------------------------------------------------

export function buildComplianceHtml(siteSettings) {
  const items = siteSettings?.compliance || [];

  return items
    .map(item => {
      const image = escapeHtml(item.image);
      const alt = escapeHtml(item.alt);

      if (item.url) {
        return `
          <a
            href="${escapeHtml(item.url)}"
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            <img
              src="${image}"
              alt="${alt}"
              style="height:36px;width:auto;object-fit:contain;"
            >
          </a>
        `;
      }

      return `
        <img
          src="${image}"
          alt="${alt}"
          style="height:36px;width:auto;object-fit:contain;"
        >
      `;
    })
    .join("\n");
}
