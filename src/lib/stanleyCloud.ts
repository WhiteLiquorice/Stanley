/**
 * stanleyCloud.ts — AI routing for the Stanley web dashboard.
 *
 * Two paths, chosen automatically based on vault contents:
 *
 *   1. LM Studio (local): user has a vault item whose name contains "lmstudio".
 *      The browser calls localhost:1234 directly. Works on the user's own machine.
 *      Requires LM Studio to be running and CORS enabled for the Stanley origin.
 *
 *   2. Gemini via Firebase AI Logic (default): calls Vertex AI for Firebase client-side SDK.
 *      Requires an active Stanley license and Firebase project billing configuration.
 *      Works from any device with no server-side secrets or local setup required.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAI, getGenerativeModel, VertexAIBackend } from 'firebase/ai';
import { listDocs } from './firestore';

const firebaseConfig = {
  projectId: "bridgeway-db29e",
  appId: "1:53861905686:web:37a545446732c3c8420c37",
  storageBucket: "bridgeway-db29e.firebasestorage.app",
  apiKey: "AIzaSyCwyyfUU3DEJAFNFoILSbT2CH8oaNMrVlk",
  authDomain: "bridgeway-db29e.firebaseapp.com",
  messagingSenderId: "53861905686",
  measurementId: "G-5W8CD2WSPL"
};

function getVertexInstance() {
  const apps = getApps();
  const app = apps.length === 0 ? initializeApp(firebaseConfig) : getApp();
  return getAI(app, { backend: new VertexAIBackend('global') });
}

const LM_URL = 'http://localhost:1234/v1/chat/completions';

// ── LM Studio detection ────────────────────────────────────────────────────────

async function getLmStudioKey(): Promise<string | null> {
  try {
    const vault = await listDocs('vault');
    const item = vault.find(
      s => typeof s.name === 'string' &&
           s.name.toLowerCase().replace(/\s+/g, '').includes('lmstudio')
    );
    return item && typeof item.value === 'string' ? item.value : null;
  } catch {
    return null;
  }
}

// ── LM Studio transport helper ──────────────────────────────────────────────────

async function callLmStudio(
  systemPrompt: string,
  userMessage: string,
  apiKey: string
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey !== 'lm-studio' && apiKey !== 'local') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  const res = await fetch(LM_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'local-model',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`LM Studio error: ${res.status}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

function cleanJson(text: string): string {
  return text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
}

// ── System prompts (shared between paths) ───────────────────────────────────────

const COMPILE_SYSTEM = `You are the brain of Project Stanley, a local browser automation butler.
Your task is to take a natural language request from a user and translate it into a structured, step-by-step sequence of automation actions in JSON format.

Available actions you can output:
1. navigate: Goto a URL in the current tab. Keys: "action": "navigate", "url": "URL string"
2. click: Click on a specific element. Keys: "action": "click", "description": "Short plain English description of what element to click"
3. type: Type text into an input field. Keys: "action": "type", "description": "Short description of the input field to type into", "value": "Text value to type"
4. wait: Wait for a specific duration in milliseconds. Keys: "action": "wait", "ms": number of milliseconds
5. scrape: Scrape structured visible text content from the current tab. Keys: "action": "scrape", "selector": "Optional CSS selector to scope scrape to"
6. open_tab: Open a new browser tab and optionally navigate to a URL. Keys: "action": "open_tab", "url": "Optional URL string"
7. switch_tab: Switch the active browser tab to a different tab by index. Keys: "action": "switch_tab", "index": number (0-indexed)
8. close_tab: Close a browser tab by index. Keys: "action": "close_tab", "index": number (0-indexed)

Output MUST be a valid JSON array of objects. Do not wrap it in markdown code fences or backticks. Start with [ and end with ].`;

const CHAT_SYSTEM = `You are "Stanley", the AI Copilot for Project Stanley, an enterprise browser automation suite.
Your goal is to help the user build, edit, and understand their low-code browser automation workflows.
You must respond in strict JSON matching this schema:
{
  "message": "A conversational explanation of what you did or how you answered.",
  "actions": []
}

The current workflow is provided in the prompt as a JSON object with:
- name: string
- nodes: Array of { id, type, label, data: { ... }, position: { x, y } }
- edges: Array of { source, target, condition: ... }

Supported Node Types:
- 'trigger': Start step, takes "url" in data.
- 'navigate': Go to a URL, takes "url" in data.
- 'click': Click an element, takes "description" and optionally "selector" in data.
- 'type': Type text into an input, takes "description", "value" (can be "vault:SecretName"), and optionally "selector" in data.
- 'wait': Wait for milliseconds, takes "ms" (string) in data.
- 'scrape': Extract text from a selector, takes "selector" in data.
- 'open_tab': Open a new tab, takes "url" and "label" in data.
- 'switch_tab': Switch active tab, takes "tab" or "index" in data.
- 'close_tab': Close tab, takes "tab" or "index" in data.
- 'if': Decision node for branching, takes "condition" object in data.
- 'goto': Jump to a labeled step, takes "label" in data.
- 'label': Step label target for goto, takes "label" in data.
- 'ai_prompt': Run AI analysis, takes "prompt" and "system" (optional) in data.
- 'js_code': Execute custom javascript, takes "code" in data.
- 'mission': SUPER NODE — the overall goal for the whole run. Takes "prompt" in data. It is NOT part of the execution flow; connect it to any node with a CONTEXT edge ("kind": "context"). The runner feeds it to the AI on every step so the automation understands the intent, not just the mechanics. There should be at most one.
- 'parameter': SUB NODE — supplies parameters to the single step it is wired to. Takes arbitrary keys in data; "value" sets what gets typed/used (supports "vault:SecretName"), and any other keys (e.g. "account": "Business") become extra AI context. Connect it to its target node with a CONTEXT edge ("kind": "context"). Use this to pick a specific account/login so the AI never has to guess which one.

Supported Actions in your response:
1. {"type": "add_node", "node": { "id": "unique_string", "type": "node_type", "label": "Label", "data": { ... }, "position": { "x": number, "y": number } }}
2. {"type": "delete_node", "nodeId": "node_id_to_delete"}
3. {"type": "update_node", "nodeId": "node_id_to_update", "nodeUpdates": { "label": "New Label", "data": { ... } }}
4. {"type": "add_edge", "edge": { "source": "source_id", "target": "target_id", "condition": ..., "kind": "context" (OPTIONAL — set to "context" ONLY when connecting a mission or parameter node) }}
5. {"type": "delete_edge", "source": "source_id", "target": "target_id"}
6. {"type": "set_workflow", "workflow": { "name": "New Name", "nodes": [...], "edges": [...] }}

Rules:
- Keep the graph clean. When adding nodes, space them 140px down the y-axis.
- Connect nodes using "add_edge" so the workflow has a logical flow.
- If the user asks a general question, explain in "message" and leave "actions" empty.
- Always output valid, parseable JSON with no markdown formatting.`;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compile a natural-language prompt into a flat action array.
 */
export async function compilePrompt(prompt: string): Promise<unknown[]> {
  const lmKey = await getLmStudioKey();
  if (lmKey) {
    const text = await callLmStudio(
      COMPILE_SYSTEM,
      `Translate this user prompt into a structured workflow:\n"${prompt}"`,
      lmKey
    );
    return JSON.parse(cleanJson(text)) as unknown[];
  }

  // Use Firebase AI Logic (Vertex AI client SDK)
  const vertex = getVertexInstance();
  const model = getGenerativeModel(vertex, { 
    model: "gemini-2.5-flash",
    systemInstruction: COMPILE_SYSTEM
  });

  const response = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `Translate this user prompt into a structured workflow:\n"${prompt}"` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  });

  const text = response.response.text();
  return JSON.parse(cleanJson(text)) as unknown[];
}

/**
 * Send a Copilot chat message. Returns { message: string, actions: [] }.
 */
export async function chatCopilot(
  message: string,
  workflow: object,
  history: object[]
): Promise<{ message: string; actions: unknown[] }> {
  const lmKey = await getLmStudioKey();
  if (lmKey) {
    const userMsg = `Current workflow:\n${JSON.stringify(workflow, null, 2)}\n\nConversation history:\n${JSON.stringify(history)}\n\nUser: ${message}`;
    const text = await callLmStudio(CHAT_SYSTEM, userMsg, lmKey);
    return JSON.parse(cleanJson(text)) as { message: string; actions: unknown[] };
  }

  // Use Firebase AI Logic (Vertex AI client SDK)
  const vertex = getVertexInstance();
  const model = getGenerativeModel(vertex, { 
    model: "gemini-2.5-flash",
    systemInstruction: CHAT_SYSTEM
  });

  const contents: any[] = [];
  if (history && Array.isArray(history)) {
    history.forEach((h: any) => {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      });
    });
  }

  const currentContext = `Current Workflow State: ${JSON.stringify(workflow || null)}\n\nUser Request: ${message}`;
  contents.push({
    role: 'user',
    parts: [{ text: currentContext }]
  });

  const response = await model.generateContent({
    contents: contents,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const text = response.response.text();
  const parsed = JSON.parse(cleanJson(text));
  return { message: parsed.message || 'Done!', actions: parsed.actions || [] };
}

/**
 * Execute a general AI prompt (used by ai_prompt node)
 */
export async function runAiAnalysis(prompt: string, context: string = ''): Promise<string> {
  const lmKey = await getLmStudioKey();
  const systemInstruction = `You are Stanley, evaluating the result of a web automation. Provide a clear, formatted summary of the findings or answer the prompt based on the context.`;
  const fullPrompt = `${prompt}\n\nContext Data:\n${context}`;

  if (lmKey) {
    return await callLmStudio(systemInstruction, fullPrompt, lmKey);
  }

  const vertex = getVertexInstance();
  const model = getGenerativeModel(vertex, { 
    model: "gemini-2.5-flash",
    systemInstruction
  });

  const response = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
  });

  return response.response.text();
}

