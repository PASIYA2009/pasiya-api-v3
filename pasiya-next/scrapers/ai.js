// Free / low-cost AI endpoints through OFFICIAL provider APIs (no scraping of chat websites).
// Each model name tries a chain of providers and uses the first one that is configured and answers.
// Model ids change often, so every id can be overridden with environment variables (MODEL_GEMINI, MODEL_GPT_OPENROUTER, ...) without touching the code.
import { HttpError, fetchT, param } from '../system/util.js';

const chains = (env) => ({
  // Every model ends with the Cloudflare Workers AI fallback (free; set CF_ACCOUNT_ID + CF_API_TOKEN), so AI works even with no paid provider key.
  gemini: [['gemini', env.MODEL_GEMINI || 'gemini-2.5-flash'], ['workers-ai', env.MODEL_GEMINI_FALLBACK_CF || '@cf/meta/llama-3.3-70b-instruct-fp8-fast']],
  gpt: [
    ['openrouter', env.MODEL_GPT_OPENROUTER || 'openai/gpt-oss-20b:free'],
    ['groq', env.MODEL_GPT_GROQ || 'openai/gpt-oss-20b'],
    ['workers-ai', env.MODEL_GPT_CF || '@cf/openai/gpt-oss-20b']
  ],
  deepseek: [
    ['deepseek', env.MODEL_DEEPSEEK || 'deepseek-chat'],
    ['openrouter', env.MODEL_DEEPSEEK_OPENROUTER || 'deepseek/deepseek-chat-v3.1:free'],
    ['workers-ai', env.MODEL_DEEPSEEK_CF || '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b']
  ],
  // There is no free Claude API. This needs an OpenRouter key with credits.
  claude: [['openrouter', env.MODEL_CLAUDE || 'anthropic/claude-haiku-4.5'], ['workers-ai', env.MODEL_CLAUDE_FALLBACK_CF || '@cf/meta/llama-3.3-70b-instruct-fp8-fast']],
  llama: [
    ['workers-ai', env.MODEL_LLAMA_CF || '@cf/meta/llama-3.1-8b-instruct'],
    ['groq', env.MODEL_LLAMA_GROQ || 'llama-3.1-8b-instant']
  ]
});
export const MODEL_NAMES = ['gemini', 'gpt', 'deepseek', 'claude', 'llama'];

const configured = (prov, env) => ({
  gemini: !!env.GEMINI_API_KEY, openrouter: !!env.OPENROUTER_API_KEY, groq: !!env.GROQ_API_KEY,
  deepseek: !!env.DEEPSEEK_API_KEY, 'workers-ai': !!(env.CF_ACCOUNT_ID && env.CF_API_TOKEN)
}[prov]);

async function openaiStyle(url, key, model, messages, max, extraHeaders = {}) {
  const r = await fetchT(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({ model, messages, max_tokens: max, temperature: 0.7 })
  }, 28000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`);
  const t = d.choices?.[0]?.message?.content;
  if (!t) throw new Error('empty answer');
  return t;
}

async function run(prov, model, messages, max, env) {
  if (prov === 'gemini') {
    const sys = messages.find((m) => m.role === 'system')?.content;
    const user = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n');
    const r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: user }] }], ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}), generationConfig: { maxOutputTokens: max } })
    }, 28000);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`);
    const t = d.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('');
    if (!t) throw new Error('empty answer');
    return t;
  }
  if (prov === 'openrouter') return openaiStyle('https://openrouter.ai/api/v1/chat/completions', env.OPENROUTER_API_KEY, model, messages, max, { 'X-Title': 'PASIYA API' });
  if (prov === 'groq') return openaiStyle('https://api.groq.com/openai/v1/chat/completions', env.GROQ_API_KEY, model, messages, max);
  if (prov === 'deepseek') return openaiStyle('https://api.deepseek.com/chat/completions', env.DEEPSEEK_API_KEY, model, messages, max);
  if (prov === 'workers-ai') { // Cloudflare Workers AI over REST (free tier): needs CF_ACCOUNT_ID + CF_API_TOKEN
    const r = await fetchT(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${model}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.CF_API_TOKEN}` }, body: JSON.stringify({ messages, max_tokens: max })
    }, 28000);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false) throw new Error(d.errors?.[0]?.message || `HTTP ${r.status}`);
    const x = d.result, t = x?.response ?? x?.choices?.[0]?.message?.content ?? x?.output_text;
    if (!t) throw new Error('empty answer');
    return String(t);
  }
  throw new Error('unknown provider');
}

function makeHandler(forced) {
  return async (p, env) => {
    const name = forced || String(p.model || 'gpt').toLowerCase();
    const prompt = String(p.prompt ?? p.q ?? p.text ?? '').trim();
    if (!prompt) throw new HttpError(400, 'prompt is required (example: ?prompt=Hello).');
    if (prompt.length > 4000) throw new HttpError(400, 'prompt is too long (max 4000 characters).');
    const chain = chains(env)[name];
    if (!chain) throw new HttpError(400, `Unknown model "${name}". Use: ${MODEL_NAMES.join(', ')}`);
    const usable = chain.filter(([prov]) => configured(prov, env));
    if (!usable.length) {
      const need = 'CF_ACCOUNT_ID + CF_API_TOKEN (free Cloudflare Workers AI) or a provider key (GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY)';
      throw new HttpError(503, `The "${name}" model is not enabled on this server. The owner must add ${need}.`);
    }
    const max = Math.min(Number(p.max_tokens) || 700, 1500);
    const messages = [
      ...(p.system ? [{ role: 'system', content: String(p.system).slice(0, 800) }] : []),
      { role: 'user', content: prompt }
    ];
    const tried = [];
    for (const [prov, model] of usable) {
      try {
        const answer = await run(prov, model, messages, max, env);
        return { model: name, provider: prov, modelId: model, answer: answer.trim() };
      } catch (e) { tried.push(`${prov}: ${e.message}`); }
    }
    throw new HttpError(502, 'All providers failed. ' + tried.join(' | '));
  };
}

const prompt = (ex, sys = true) => [param('prompt', ex, 'Your message'), ...(sys ? [param('system', '', 'Optional instruction', false)] : [])];
export default [
  { path: '/api/ai/gemini', category: 'AI', name: 'Gemini', cost: 1, desc: 'Google Gemini chat', params: prompt('Explain Sri Lanka in 2 lines'), run: makeHandler('gemini') },
  { path: '/api/ai/gpt', category: 'AI', name: 'GPT', cost: 1, desc: 'Open GPT model chat (free tiers first)', params: prompt('Write a haiku about rain'), run: makeHandler('gpt') },
  { path: '/api/ai/deepseek', category: 'AI', name: 'DeepSeek', cost: 1, desc: 'DeepSeek chat', params: prompt('What is 17 * 23?'), run: makeHandler('deepseek') },
  { path: '/api/ai/claude', category: 'AI', name: 'Claude', cost: 2, desc: 'Claude chat (real Claude with an OpenRouter key, otherwise a free Llama fallback)', params: prompt('Give me 3 startup ideas'), run: makeHandler('claude') },
  { path: '/api/ai/llama', category: 'AI', name: 'Llama', cost: 1, desc: 'Llama chat on Cloudflare Workers AI / Groq', params: prompt('Tell me a joke', false), run: makeHandler('llama') },
  { path: '/api/ai/chat', hidden: true, cost: 1, run: makeHandler(null) }
];
