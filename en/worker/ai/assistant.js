// =====================================================
// LUMMET AI — Main Assistant (Two-Pass: Understand → Retrieve → Respond)
// =====================================================

import { understand } from './understand.js';
import { retrieve } from './retrieval.js';
import { buildSystemPrompt, buildMessages } from './prompt.js';
import { getRecentHistory, appendMessages } from './memory.js';
import { validateInput, detectInjection } from './security.js';

import { getSiteContext } from '../site-context.js';
const MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

//const MODEL = '@cf/zai-org/glm-4.7-flash';
const MAX_TOKENS = 800;
const TEMPERATURE = 0.3;

const COUNTRY_NAMES = {
  RW:'Rwanda',US:'United States',CA:'Canada',GB:'United Kingdom',DE:'Germany',FR:'France',
  IT:'Italy',ES:'Spain',NL:'Netherlands',AU:'Australia',NZ:'New Zealand',JP:'Japan',
  CN:'China',IN:'India',BR:'Brazil',MX:'Mexico',ZA:'South Africa',NG:'Nigeria',KE:'Kenya',
  EG:'Egypt',SE:'Sweden',NO:'Norway',DK:'Denmark',FI:'Finland',PL:'Poland',PT:'Portugal',
  GR:'Greece',TR:'Turkey',RU:'Russia',UA:'Ukraine',AE:'United Arab Emirates',SA:'Saudi Arabia',
  QA:'Qatar',KR:'South Korea',TH:'Thailand',VN:'Vietnam',PH:'Philippines',ID:'Indonesia',
  MY:'Malaysia',SG:'Singapore',AR:'Argentina',CL:'Chile',CO:'Colombia',PE:'Peru',AT:'Austria',
  CH:'Switzerland',IE:'Ireland',BE:'Belgium',CZ:'Czech Republic',HU:'Hungary',RO:'Romania',
  BG:'Bulgaria',HR:'Croatia',MT:'Malta',CY:'Cyprus',LU:'Luxembourg',IS:'Iceland'
};

/**
 * Handle a chat request — non-streaming (backward compatible)
 */
export async function chat(env, message, userContext = {}, request) {
  const country = userContext.country || 'RW';
  const sessionId = userContext.sessionId || 'anonymous';
  const userId = userContext.userId || null;
  const db = env.DB;
  const site = await getSiteContext(request, env);
  // 1. Validate input
  const validation = validateInput(message);
  if (!validation.valid) return { success: false, answer: validation.error, intent: null };
  const sanitized = validation.sanitized;

  // 2. Detect injection
  const injection = detectInjection(sanitized);
  if (injection.isInjection) {
    return {
      success: true,
      answer: `I'm Lummet AI, here to help you explore ${site.siteName}'s editorial content. I can help you find casino reviews, compare casinos, check bonuses, or answer questions about payment methods. What would you like to know?`,
      intent: 'security_block'
    };
  }

  // 3. Get conversation history
  const conversationHistory = await getRecentHistory(db, sessionId, 6);

  // 4. PASS 1 — Understand: AI analyzes intent and creates search plan
  const plan = await understand(env, sanitized, conversationHistory, request);

  // 5. PASS 2 — Retrieve: Database queries based on AI's plan
  const context = await retrieve(env, sanitized, country, plan, conversationHistory, request);

  console.log('Lummet retrieval results:', JSON.stringify({
    casinos: context.casinos?.length || 0,
    reviews: context.reviews?.length || 0,
    news: context.news?.length || 0,
    platformUpdates: context.platformUpdates?.length || 0,
    pages: context.pages?.length || 0,
    faqs: context.faqs?.length || 0,
    intent: plan?.intent
  }));

  // 6. Build prompt
  const systemPrompt = await buildSystemPrompt(context, country, plan?.intent, conversationHistory, request, env);
  const messages = buildMessages(systemPrompt, sanitized, conversationHistory);

  // 7. PASS 3 — Respond: AI generates human-like response
  let answer;
  try {
    if (!env.AI) {
      console.warn('Lummet: AI binding missing, using fallback');
      answer = await generateFallback(sanitized, context, country, request, env);
    } else {
      const result = await env.AI.run(MODEL, {
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS
      });

      answer = result?.response || result?.choices?.[0]?.message?.content || result?.result?.response || result?.output?.text || null;
      if (!answer) {
        console.warn('Lummet: AI returned empty, using fallback');
        answer = await generateFallback(sanitized, context, country, request, env);
      }
    }
  } catch (error) {
    console.error('Lummet AI inference error:', error.message);
    answer = await generateFallback(sanitized, context, country, request, env);
  }

  answer = answer.trim();

  // 8. Save to conversation memory
  try { await appendMessages(db, sessionId, sanitized, answer, userId); }
  catch (e) { console.error('Lummet memory save error:', e.message); }

  return { success: true, answer, intent: plan?.intent, sessionId };
}

/**
 * Handle a chat request — streaming response
 */
export async function chatStream(env, message, userContext = {}, request) {
  const country = userContext.country || 'RW';
  const sessionId = userContext.sessionId || 'anonymous';
  const userId = userContext.userId || null;
  const db = env.DB;
  const site = await getSiteContext(request, env);
  // 1. Validate input
  const validation = validateInput(message);
  if (!validation.valid) return createErrorStream(validation.error);
  const sanitized = validation.sanitized;

  // 2. Detect injection
  const injection = detectInjection(sanitized);
  if (injection.isInjection) {
    return createSSEStream([
      { type: 'delta', content: `I'm Lummet AI, here to help you explore ${site.siteName}'s editorial content. What would you like to know?` },
      { type: 'done' }
    ]);
  }

  // 3. Get conversation history
  const conversationHistory = await getRecentHistory(db, sessionId, 6);

  // 4. PASS 1 — Understand
  const plan = await understand(env, sanitized, conversationHistory, request);

  // 5. PASS 2 — Retrieve
  const context = await retrieve(env, sanitized, country, plan, conversationHistory, request);
  
  console.log('Lummet stream retrieval:', JSON.stringify({
    casinos: context.casinos?.length || 0,
    reviews: context.reviews?.length || 0,
    news: context.news?.length || 0,
    platformUpdates: context.platformUpdates?.length || 0,
    faqs: context.faqs?.length || 0,
    intent: plan?.intent
  }));
 // console.log('Lummet stream retrieval:', JSON.stringify({
   // casinos: context.casinos?.length || 0, reviews: context.reviews?.length || 0, faqs: context.faqs?.length || 0, intent: plan?.intent
 // }));

  // 6. Build prompt
  const systemPrompt = await buildSystemPrompt(context, country, plan?.intent, conversationHistory, request, env);
  const messages = buildMessages(systemPrompt, sanitized, conversationHistory);

  // 7. PASS 3 — Respond (streaming)
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullAnswer = '';

      try {
        if (!env.AI) {
          fullAnswer = await generateFallback(sanitized, context, country, request, env);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: fullAnswer })}\n\n`));
        } else {
          const result = await env.AI.run(MODEL, { messages, temperature: TEMPERATURE, max_tokens: MAX_TOKENS, stream: true });

          if (result instanceof ReadableStream) {
            const reader = result.getReader();
            const decoder = new TextDecoder();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.response || data.token || data.delta?.text) {
                      const token = data.response || data.token || data.delta?.text || '';
                      if (token) {
                        fullAnswer += token;
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: token })}\n\n`));
                      }
                    }
                  } catch {}
                }
              }
            }
          } else {
            fullAnswer = result?.response || result?.choices?.[0]?.message?.content || await generateFallback(sanitized, context, country, request, env);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: fullAnswer })}\n\n`));
          }
        }
      } catch (error) {
        console.error('Lummet stream error:', error.message);
        fullAnswer = await generateFallback(sanitized, context, country, request, env);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: fullAnswer })}\n\n`));
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', intent: plan?.intent, sessionId })}\n\n`));

      try { await appendMessages(db, sessionId, sanitized, fullAnswer, userId); }
      catch (e) { console.error('Lummet memory save error:', e.message); }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  });
}

// ── Helper functions ──

function createSSEStream(events) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

function createErrorStream(message) {
  return createSSEStream([{ type: 'error', content: message }, { type: 'done' }]);
}

async function generateFallback(message, context, country, request, env) {
  const countryNameStr = COUNTRY_NAMES[country] || country || 'your country';
  const text = message.toLowerCase();
  const site = await getSiteContext(request, env);

  if (context.casinos && context.casinos.length > 0) {
    const isGeoQuery = text.includes('available') || text.includes('country') || text.includes('can i play') || text.includes('my country');
    if (isGeoQuery) {
      const available = context.casinos.filter(c => context.geoStatuses[c.slug] === 'allowed');
      const blocked = context.casinos.filter(c => context.geoStatuses[c.slug] === 'blocked');
      if (available.length > 0) {
        const list = available.slice(0, 5).map((c, i) => `${i + 1}. **${c.name}** — ⭐ ${c.rating || 'N/A'}/5${c.bonus_title ? ` — ${c.bonus_title}` : ''}\n   🔗 ${site.url(`/en/casino/${c.slug}`)}`).join('\n\n');
        return `Here are the casinos available in ${countryNameStr} according to the ${site.siteName} database:\n\n${list}\n\nWould you like me to show you the full review for any of these?`;
      } else if (blocked.length > 0) {
        return `Based on the ${site.siteName} database, the casinos I found are not available in ${countryNameStr}. You can browse all casinos at ${site.url("/en/casino/")} to check for alternatives.`;
      }
    }
    const list = context.casinos.slice(0, 5).map((c, i) => {
      const geo = context.geoStatuses[c.slug];
      const geoStr = geo === 'allowed' ? ' ✓ Available' : geo === 'blocked' ? ' ✕ Not available' : '';
      return `${i + 1}. **${c.name}** — ⭐ ${c.rating || 'N/A'}/5${c.bonus_title ? ` — ${c.bonus_title}` : ''}${c.license ? ` — ${c.license}` : ''}${geoStr}\n   🔗 ${site.url(`/en/casino/${c.slug}`)}`;
    }).join('\n\n');
    return `Here are the casinos I found on ${site.siteName}:\n\n${list}\n\nI can also show you reviews, bonuses, or payment details for any of these.`;
  }

  if (context.reviews && context.reviews.length > 0) {
    const list = context.reviews.slice(0, 5).map((r, i) => `${i + 1}. **${r.title}** — ⭐ ${r.rating || 'N/A'}/5${r.overview ? `\n   ${r.overview}` : ''}\n   🔗 ${site.url(`/en/review/${r.slug}`)}`).join('\n\n');
    return `Here are the casino reviews I found on ${site.siteName}:\n\n${list}\n\nWould you like me to summarize any of these reviews?`;
  }

  if (context.news && context.news.length > 0) {
    const list = context.news.slice(0, 5).map((n, i) => `${i + 1}. **${n.title}**${n.excerpt ? `\n   ${n.excerpt}` : ''}\n   🔗 ${site.url(`/en/news/${n.slug}`)}`).join('\n\n');
    return `Here are the latest articles from ${site.siteName}:\n\n${list}\n\nWould you like to know more about any of these?`;
  }

  if (context.faqs && context.faqs.length > 0) {
    if (context.faqs.length === 1) return `**${context.faqs[0].question}**\n\n${context.faqs[0].answer}`;
    const list = context.faqs.slice(0, 5).map((f, i) => `${i + 1}. **${f.question}**\n   ${f.answer}`).join('\n\n');
    return `Here are answers to common questions:\n\n${list}`;
  }

  if (context.pages && context.pages.length > 0) {
    const list = context.pages.slice(0, 5).map((p, i) => `${i + 1}. **${p.title}** — 🔗 ${site.url(`/en/${p.slug}`)}`).join('\n\n');
    return `Here are the pages I found on ${site.siteName}:\n\n${list}\n\nWould you like to explore any of these?`;
  }

  if (context.authors && context.authors.length > 0) {
    const list = context.authors.slice(0, 5).map((a, i) => `${i + 1}. **${a.name}** — ${a.role || 'Editor'}${a.bio ? `\n   ${a.bio}` : ''}\n   🔗 ${site.url(`/en/authors/${a.slug}`)}`).join('\n\n');
    return `Here are the authors I found on ${site.siteName}:\n\n${list}`;
  }

  if (context.countries && context.countries.length > 0) {
    const c = context.countries[0];
    return `**${c.name} (${c.code})**\n\n- Currency: ${c.currency || 'N/A'}\n- Language: ${c.language || 'N/A'}\n- Legal Status: ${c.legal_status || 'N/A'}\n\nWould you like to see casinos available in ${c.name}?`;
  }

  return `I couldn't find that information in the ${site.siteName} database. You can browse our independent casino reviews, guides, news, and responsible gambling resources at ${site.url("/en/")} — or contact us at ${site.url("/en/contact")} and we'll be happy to help.`;
}

export const aiAssistant = {
  chat,
  chatStream
};
