const { GoogleAuth } = require('google-auth-library');

const PROJECT_ID = process.env.STANLEY_PROJECT_ID || 'bridgeway-db29e';
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.VISION_MODEL || 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY || '';

const API_SYSTEM = `You are an expert Python API automation engineer.
Your task is to write a standalone Python 3 script that uses standard libraries or 'requests'/'beautifulsoup4' to accomplish the user's goal via an HTTP API or web scraping, bypassing the need for a real browser.

REQUIREMENTS:
1. The script must take NO command line arguments.
2. If there are vault secrets or inputs, they will be hardcoded in the prompt you receive.
3. The script MUST print its final result to stdout as a single, valid JSON object or JSON array. DO NOT print any conversational text.
4. The script should use a 15 second timeout for network requests.
5. You must return ONLY the Python code. No markdown formatting (\`\`\`python) and no explanations.

Example Output:
import requests
import json
res = requests.get("https://api.example.com/search?q=iphone")
print(json.dumps({"success": True, "results": res.json()}))
`;

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

async function callGemini(body) {
  let url;
  const headers = { 'Content-Type': 'application/json' };

  if (API_KEY) {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  } else {
    url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
    headers['Authorization'] = `Bearer ${await getAccessToken()}`;
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API Error (${res.status}): ${text}`);
  }
  
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Generates a Python script using Gemini to accomplish the workflow step goal.
 */
async function generatePythonApi(goal, url, htmlContext, secretsMap) {
  let promptText = `Write a Python script to accomplish this goal: "${goal}"\n`;
  if (url) promptText += `Target URL/Endpoint: ${url}\n`;
  
  const safeSecrets = Object.entries(secretsMap || {}).map(([k,v]) => `${k}='${v}'`).join('\n');
  if (safeSecrets) {
    promptText += `Available Secrets/Inputs to hardcode into your script:\n${safeSecrets}\n`;
  }

  if (htmlContext && htmlContext.length > 50) {
    // Truncate HTML context if it's too large, just enough to give hints
    const truncatedHtml = htmlContext.slice(0, 10000);
    promptText += `\nHere is a snippet of the page HTML for structural hints (use BeautifulSoup to parse if needed):\n${truncatedHtml}\n`;
  }

  const payload = {
    systemInstruction: { parts: [{ text: API_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    generationConfig: { temperature: 0.1 }, // Low temp for reliable code generation
  };

  const rawCode = await callGemini(payload);
  
  // Strip markdown fences if the model still outputs them despite instructions
  let cleanedCode = rawCode.trim();
  if (cleanedCode.startsWith('```python')) cleanedCode = cleanedCode.replace(/^```python\n/, '');
  if (cleanedCode.startsWith('```')) cleanedCode = cleanedCode.replace(/^```\n?/, '');
  if (cleanedCode.endsWith('```')) cleanedCode = cleanedCode.replace(/```$/, '');
  
  return cleanedCode.trim();
}

module.exports = { generatePythonApi };
