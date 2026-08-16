import { getSiteContext } from "./site-context.js";

export const aiEngine = {

  /**
   * Safe execution wrapper for Cloudflare Workers AI.
   */
  async runInference(env, model, inputs) {
    console.log("AI binding check:", !!env.AI);

    if (!env.AI) {
      console.warn("Workers AI binding is missing.");
      return null;
    }

    try {
      return await env.AI.run(model, inputs);
    } catch (error) {
      console.error(
        `Edge AI Inference Failure: ${error.message}`
      );

      return null;
    }
  },


  /**
   * Generates a localized casino review summary.
   */
  async generateReviewSummary(
    env,
    request,
    casinoName,
    countryCode,
    languages = "English"
  ) {
    const model = "@cf/zai-org/glm-4.7-flash";

    const site = await getSiteContext(request, env);

    const systemPrompt = `
You are an expert iGaming industry copywriter working for ${site.siteName}.

The website is an independent casino comparison and editorial platform.

Write a factual, concise three-sentence casino evaluation.

Focus on:
- VIP reward transparency
- withdrawal and cashout considerations
- licensing and trust factors
- jurisdiction-specific availability

Never invent facts.
If information is unavailable, say so.
Do not make unsupported promotional claims.
`.trim();

    const userPrompt = `
Write a localized casino review introduction for "${casinoName}".

Target jurisdiction:
${countryCode}

Language:
${languages}

Website:
${site.siteName}
`.trim();

    const result = await this.runInference(env, model, {
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.6,
      max_tokens: 150
    });

    return result?.response
      ? result.response.trim()
      : `Review information for ${casinoName} is currently unavailable.`;
  },


  /**
   * Generates tenant-aware SEO metadata.
   */
  async generateDynamicSeo(
    env,
    request,
    contextData
  ) {
    const model = "@cf/zai-org/glm-4.7-flash";

    const site = await getSiteContext(request, env);

    const systemPrompt = `
You are an SEO engineer working for ${site.siteName}.

Generate valid JSON containing:
{
  "title": "...",
  "description": "..."
}

Requirements:
- title under 60 characters
- description under 155 characters
- optimize for search intent
- never invent facts
- never include markdown
- return raw JSON only
`.trim();

    const userPrompt = `
Website:
${site.siteName}

Page type:
${contextData.type || ""}

Page slug:
${contextData.slug || ""}

Target country:
${contextData.country || ""}

Create localized SEO metadata appropriate for this website.
`.trim();

    const result = await this.runInference(env, model, {
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 300
    });

    try {
      if (result?.response) {
        const parsed = JSON.parse(result.response.trim());

        return {
          title: parsed.title || "",
          description: parsed.description || ""
        };
      }
    } catch (error) {
      console.error(
        "AI returned malformed SEO JSON:",
        error.message
      );
    }

    /*
     * Do not manufacture a tenant-specific SEO fallback here.
     * Let the normal database/site SEO system provide the fallback.
     */
    return {
      title: "",
      description: ""
    };
  },


  /**
   * Generates a full casino review.
   */
  async generateFullReview(
    env,
    request,
    casinoName,
    countryCode,
    slug
  ) {
    const model = "@cf/zai-org/glm-4.7-flash";

    const site = await getSiteContext(request, env);

    const systemPrompt = `
You are a professional iGaming editorial writer for ${site.siteName}.

Create an accurate independent casino review.

Rules:
- Never invent payment methods, licenses, bonuses, providers, or features.
- If information is uncertain, say availability depends on jurisdiction.
- Avoid promotional exaggerations.
- Write like an independent casino comparison website.
- Include responsible gambling considerations.

Structure:

Overview

Games & Software

Bonuses & Promotions

Payment Methods

Licensing & Security

Pros & Cons

FAQ

Requirements:
- 1000-1200 words
- Plain text only
- Section titles on separate lines
- No markdown symbols
- No internal reasoning
- Output only the final review text.
`.trim();

    const userPrompt = `
Write a professional casino review for "${casinoName}"
targeted at players from ${countryCode}.

Page slug:
${slug}

Website:
${site.siteName}

Include specific pros and cons.
Include a FAQ section with 3-5 questions.
Make it factual and avoid generic fluff.
`.trim();

    const result = await this.runInference(env, model, {
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.6,
      max_tokens: 2500,
      reasoning: {
        enabled: false
      }
    });

    const content =
      result?.response ||
      result?.choices?.[0]?.message?.content ||
      null;

    return content
      ? content.trim()
      : `Unable to generate review content for ${casinoName}.`;
  }

};
