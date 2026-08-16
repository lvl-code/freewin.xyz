// =====================================================
// LUMMET AI — Admin Tools (Editorial AI Features)
// =====================================================

import { getSiteContext } from '../site-context.js';
const MODEL = '@cf/zai-org/glm-4.7-flash';

/**
 * Generate a full casino review (admin tool)
 */
export async function generateReview(env, casinoName, countryCode, slug, request) {
    const site = await getSiteContext(request, env);
    const systemPrompt = `You are a professional iGaming editorial writer for ${site.siteName}.

Create an accurate casino review.

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
- Output only the final review text.`;

  const userPrompt = `Write a professional casino review for "${casinoName}" targeted at players from ${countryCode}.
Include specific pros and cons. Include a FAQ section with 3-5 questions.
Make it factual and avoid generic fluff.`;

  try {
    if (!env.AI) return null;
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6,
      max_tokens: 2500
    });
    return result?.response || result?.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error('Lummet admin review error:', e.message);
    return null;
  }
}

/**
 * Generate SEO title and meta description (admin tool)
 */
export async function generateSeo(env, targetDomain, contextData) {
  const systemPrompt = `You are an elite SEO engineer managing the domain portfolio asset ${targetDomain}.
Generate a strict JSON object containing a title tag and meta description optimized for Click-Through Rates (CTR).
Never include code block wrappers. Return raw plain-text valid JSON object only.`;

  const userPrompt = `Context: Type is ${contextData.type}, Slug is ${contextData.slug}, Target Country is ${contextData.country}.
Create a localized SEO title (under 60 chars) and meta description (under 155 chars) targeting VIP casino search intent.`;

  try {
    if (!env.AI) return null;
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3
    });

    if (result?.response) {
      return JSON.parse(result.response.trim());
    }
  } catch (e) {
    console.error('Lummet admin SEO error:', e.message);
  }

  return {
    title: `${contextData.slug?.toUpperCase()} Casino Review & VIP Bonuses [Geo: ${contextData.country}]`,
    description: `Get real-time player data, withdrawal framework details, and high-stakes incentives for ${contextData.slug} in ${contextData.country}.`
  };
}

/**
 * Generate FAQ entries (admin tool)
 */
export async function generateFAQs(env, casinoName, context = '', siteName = 'this site') {
  const systemPrompt = `You are an iGaming FAQ generator for ${siteName}. Generate 5 common questions and answers about a casino.
Return a JSON array of objects with "q" and "a" fields. No code blocks, no markdown. Raw JSON only.`;

  const userPrompt = `Generate 5 FAQs for "${casinoName}". Context: ${context}. Each answer should be factual and concise (2-3 sentences).`;

  try {
    if (!env.AI) return [];
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 800
    });

    if (result?.response) {
      return JSON.parse(result.response.trim());
    }
  } catch (e) {
    console.error('Lummet admin FAQ error:', e.message);
  }
  return [];
}

/**
 * Generate schema markup (admin tool)
 */
export async function generateSchema(env, type, data) {
  const systemPrompt = `You are a structured data expert. Generate valid JSON-LD schema.org markup.
Return raw JSON only. No code blocks, no markdown.`;

  const userPrompt = `Generate ${type} schema for: ${JSON.stringify(data)}`;

  try {
    if (!env.AI) return null;
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 500
    });

    if (result?.response) {
      return JSON.parse(result.response.trim());
    }
  } catch (e) {
    console.error('Lummet admin schema error:', e.message);
  }
  return null;
}

/**
 * Generate article outline (admin tool)
 */
export async function generateOutline(env, topic, contentType = 'review', siteName = 'this site') {
  const systemPrompt = `You are an editorial planner for ${siteName}. Generate a detailed article outline.
Return as a JSON array of section objects with "title" and "points" (array of bullet points). Raw JSON only.`;
  const userPrompt = `Generate an outline for a ${contentType} article about: ${topic}`;

  try {
    if (!env.AI) return [];
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 600
    });

    if (result?.response) {
      return JSON.parse(result.response.trim());
    }
  } catch (e) {
    console.error('Lummet admin outline error:', e.message);
  }
  return [];
}

/**
 * Improve editorial content (admin tool)
 */
export async function improveContent(env, content, improvementType = 'readability', siteName = 'this site') {
  const systemPrompt = `You are an editorial editor for ${siteName}. ${prompts[improvementType] || prompts.readability}
Return only the improved text. No explanations, no markdown.`;

  const prompts = {
    readability: 'Improve readability while keeping all facts. Use shorter sentences, simpler words, and better flow.',
    seo: 'Optimize for SEO. Improve headings, keyword density, and meta-friendly structure. Keep all facts.',
    clarity: 'Improve clarity and conciseness. Remove redundancy. Keep all facts.',
    tone: 'Improve editorial tone to be more professional and neutral. Keep all facts.'
  };

  try {
    if (!env.AI) return content;
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: content }
      ],
      temperature: 0.4,
      max_tokens: 2000
    });
    return result?.response || content;
  } catch (e) {
    console.error('Lummet admin improve error:', e.message);
    return content;
  }
}

/**
 * Suggest internal links (admin tool)
 */
export async function suggestInternalLinks(env, content, availablePages = []) {
  const systemPrompt = `You are an SEO internal linking specialist. Suggest internal links for the given content.
Return a JSON array of objects with "text" (anchor text), "url" (suggested URL), and "context" (why this link is relevant).
Only suggest links from the provided available pages list. Raw JSON only.`;

  const userPrompt = `Content: ${content.substring(0, 1000)}\n\nAvailable pages: ${JSON.stringify(availablePages)}`;

  try {
    if (!env.AI) return [];
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    if (result?.response) {
      return JSON.parse(result.response.trim());
    }
  } catch (e) {
    console.error('Lummet admin links error:', e.message);
  }
  return [];
}
