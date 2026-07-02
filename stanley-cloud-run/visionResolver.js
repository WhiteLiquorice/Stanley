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
async function callGemini(body) {
  let url;
  const headers = { 'Content-Type': 'application/json' };

  if (API_KEY) {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  } else {
    const token = await getAccessToken();
    headers['Authorization'] = `Bearer ${token}`;
    url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
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

module.exports = { resolveElement, generateText };
