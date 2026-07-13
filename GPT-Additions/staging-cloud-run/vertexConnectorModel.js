const { GoogleAuth } = require('google-auth-library');

const projectId = process.env.STANLEY_PROJECT_ID || 'bridgeway-db29e';
const location = process.env.VERTEX_LOCATION || 'us-central1';
const model = process.env.CONNECTOR_MODEL || 'gemini-2.5-flash';
let client;

async function callConnectorModel(request) {
  if (!client) client = await new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' }).getClient();
  const { token } = await client.getAccessToken(); if (!token) throw new Error('Connector generation could not obtain a Vertex access token.');
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const startedAt = Date.now();
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: request.system }] }, contents: [{ role: 'user', parts: [{ text: request.user }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }) });
  if (!response.ok) throw new Error(`Connector generation failed with status ${response.status}.`);
  const payload = await response.json();
  return { text: payload.candidates?.[0]?.content?.parts?.[0]?.text || '', model, durationMs: Date.now() - startedAt, costMicros: 0 };
}

module.exports = { callConnectorModel };
