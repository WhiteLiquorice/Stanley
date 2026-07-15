/**
 * visionResolver.js — server-side Gemini client for the headless runner.
 *
 * Two jobs, both used by branchingEngine.js at *execution time* (this is the
 * "neural" half of the neuro-symbolic model — the graph says what to do, Gemini
 * figures out how to do it on the actual page):
 *
 *   1. resolveElement(screenshot, description) — vision fallback. Given a JPEG
 *      screenshot + a plain-English description, returns a Playwright locator
 *      { strategy, value, roleType } the agent can act on. Mirrors the
 *      `resolveWithVision` mode of the askStanleyAI Cloud Function exactly, so
 *      foundationAgent.clickByStrategy / typeByStrategy consume it unchanged.
 *
 *   2. generateText(prompt, system) — plain text generation for `ai_prompt`
 *      nodes inside headless workflows.
 *
 * Auth: prefers Application Default Credentials (the Cloud Run service account)
 * against the Vertex AI endpoint — no API keys, matching the project's Firebase
 * AI Logic direction. If GEMINI_API_KEY is set it uses the Generative Language
 * endpoint instead (handy for local testing). The IAM grant needed for the ADC
 * path is documented in README.md.
 */

const { GoogleAuth } = require('google-auth-library');

const PROJECT_ID = process.env.STANLEY_PROJECT_ID || 'bridgeway-db29e';
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.VISION_MODEL || 'gemini-2.5-flash';
const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || MODEL;
const QUALITY_MODEL = process.env.QUALITY_MODEL || MODEL;
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || '';
const API_KEY = process.env.GEMINI_API_KEY || '';

const VISION_SYSTEM = `You are helping a browser automation tool. Look at this screenshot of a webpage and identify the best Playwright locator to find the element described.
You must return JSON only, with the format:
{
  "strategy": "role" | "text" | "placeholder" | "label",
  "value": "string value to match",
  "roleType": "button" | "link" | "checkbox" | "textbox" | "searchbox" | "spinbutton" (optional, required if strategy is role)
}
Return nothing but the valid JSON string. Do not wrap in markdown fences.`;

let _authClient = null;
async function getAccessToken() {
  if (!_authClient) {
    const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
    _authClient = await auth.getClient();
  }
  const { token } = await _authClient.getAccessToken();
  if (!token) throw new Error('Failed to obtain an access token from ADC.');
  return token;
}

/**
 * POST a generateContent request to whichever Gemini endpoint is configured and
 * return the model's raw text output.
 */
async function callGemini(body, selectedModel = MODEL) {
  let url;
  const headers = { 'Content-Type': 'application/json' };

  if (API_KEY) {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${API_KEY}`;
  } else {
    const token = await getAccessToken();
    headers['Authorization'] = `Bearer ${token}`;
    url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${selectedModel}:generateContent`;
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no candidates.');
  return text.trim();
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    // Be forgiving of stray prose or markdown fences around the JSON object.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not parse JSON from model output: ${text.slice(0, 200)}`);
  }
}

/**
 * Vision fallback: returns a Playwright locator descriptor for the described
 * element, based on a screenshot of the current page.
 */
async function resolveElement(screenshotBase64, description, missionContext) {
  // The mission/parameter context (when present) gives the model the overall goal
  // and the step's resolved parameters — far more recoverable on ambiguous pages.
  const system = missionContext
    ? `${missionContext}\n\n${VISION_SYSTEM}`
    : VISION_SYSTEM;
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: `Target Element Description: "${description}"` },
        { inlineData: { mimeType: 'image/jpeg', data: screenshotBase64 } },
      ],
    }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  };

  const parsed = extractJson(await callGemini(body));
  if (!parsed || !parsed.strategy || !parsed.value) {
    throw new Error(`Vision returned an unusable locator: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

/**
 * Plain text generation for `ai_prompt` nodes. Returns the model's text reply.
 */
async function generateText(prompt, systemInstruction) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2 },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  return await callGemini(body);
}

/**
 * Image analysis for `vision` nodes. Returns the model's text reply based on the screenshot.
 */
async function visionAnalysis(prompt, systemInstruction, screenshotBase64) {
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/jpeg', data: screenshotBase64 } },
      ],
    }],
    generationConfig: { temperature: 0.2 },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  return await callGemini(body);
}

function extractStructuredJson(text) {
  try { return JSON.parse(text); } catch (_) {
    const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return JSON.parse(cleaned); } catch (_) {
      const start = Math.min(...['{', '['].map((token) => { const index = cleaned.indexOf(token); return index < 0 ? Infinity : index; }));
      const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
      if (Number.isFinite(start) && end > start) return JSON.parse(cleaned.slice(start, end + 1));
      throw new Error(`Could not parse structured JSON from model output: ${cleaned.slice(0, 200)}`);
    }
  }
}

function compactText(value, limit) {
  const text = String(value || ''); if (text.length <= limit) return text;
  const head = Math.floor(limit * 0.7); const tail = limit - head;
  return `${text.slice(0, head)}\n...[CONTEXT COMPACTED: ${text.length - limit} CHARS]...\n${text.slice(-tail)}`;
}

function createRoutedResolver(policy = {}, onUsage = () => {}) {
  const maxCalls = Math.max(0, Number(policy.maxModelCalls ?? 12)); const maxChars = Math.max(2000, Number(policy.maxContextChars || 30000));
  const usage = { calls: 0, fallbacks: 0, failures: 0, profile: policy.profile || 'balanced' };
  const invoke = async (purpose, body, model) => {
    if (usage.calls >= maxCalls) throw Object.assign(new Error(`Model call budget exhausted (${maxCalls}).`), { code: 'MODEL_BUDGET_EXHAUSTED' });
    usage.calls += 1; const startedAt = Date.now();
    try { const value = await callGemini(body, model); onUsage({ purpose, model, durationMs: Date.now() - startedAt, fallback: false }); return value; }
    catch (error) {
      usage.failures += 1;
      if (!policy.fallbackEnabled || !FALLBACK_MODEL || FALLBACK_MODEL === model) throw error;
      if (usage.calls >= maxCalls) throw Object.assign(new Error(`Model call budget exhausted (${maxCalls}) before fallback.`), { code: 'MODEL_BUDGET_EXHAUSTED', cause: error });
      usage.calls += 1; usage.fallbacks += 1;
      const value = await callGemini(body, FALLBACK_MODEL);
      onUsage({ purpose, model: FALLBACK_MODEL, durationMs: Date.now() - startedAt, fallback: true });
      return value;
    }
  };
  const modelFor = (purpose) => purpose === 'extract' ? (policy.extractionProfile === 'quality' ? QUALITY_MODEL : EXTRACTION_MODEL) : policy.profile === 'quality' ? QUALITY_MODEL : MODEL;
  return {
    usage,
    async generateText(prompt, system) { const body = { contents: [{ role: 'user', parts: [{ text: compactText(prompt, maxChars) }] }], generationConfig: { temperature: policy.profile === 'fast' ? 0 : 0.2 } }; if (system) body.systemInstruction = { parts: [{ text: compactText(system, Math.floor(maxChars / 3)) }] }; return invoke('text', body, modelFor('text')); },
    async resolveElement(screenshot, description, mission) { if (policy.allowVision === false) throw new Error('Vision is disabled by the workflow model policy.'); const body = { contents: [{ role: 'user', parts: [{ text: `Target Element Description: "${compactText(description, 1000)}"` }, { inlineData: { mimeType: 'image/jpeg', data: screenshot } }] }], systemInstruction: { parts: [{ text: compactText(mission ? `${mission}\n\n${VISION_SYSTEM}` : VISION_SYSTEM, Math.floor(maxChars / 3)) }] }, generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }; const parsed = extractJson(await invoke('vision', body, modelFor('vision'))); if (!parsed?.strategy || !parsed?.value) throw new Error('Vision returned an unusable locator.'); return parsed; },
    async visionAnalysis(prompt, system, screenshot) { if (policy.allowVision === false) throw new Error('Vision is disabled by policy.'); const body = { contents: [{ role: 'user', parts: [{ text: compactText(prompt, maxChars) }, { inlineData: { mimeType: 'image/jpeg', data: screenshot } }] }], generationConfig: { temperature: 0.2 } }; if (system) body.systemInstruction = { parts: [{ text: compactText(system, Math.floor(maxChars / 3)) }] }; return invoke('vision_analysis', body, modelFor('vision')); },
    async extract(content, schema) {
      const requestedSchema = typeof schema === 'string' ? schema : JSON.stringify(schema || {});
      const body = {
        contents: [{ role: 'user', parts: [{ text: `Extract data from the source content and return only JSON matching the requested shape.\n\nRequested shape/schema:\n${compactText(requestedSchema, Math.floor(maxChars / 4))}\n\nSource content:\n${compactText(content, Math.floor(maxChars * 0.7))}` }] }],
        systemInstruction: { parts: [{ text: 'You are a deterministic structured-data extractor. Never invent missing values. Return valid JSON only, without markdown.' }] },
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      };
      return extractStructuredJson(await invoke('extract', body, modelFor('extract')));
    },
  };
}

module.exports = { compactText, createRoutedResolver, extractStructuredJson, resolveElement, generateText, visionAnalysis };
