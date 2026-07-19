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
import { getPromptIntegrationList } from './integrationsCatalog';

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

const COMPILE_SYSTEM = `You are the constrained planning layer of Project Stanley, a hybrid browser and API automation system.
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
- 'integration': Call a 3rd party API natively. Supported "integrationName" values:
  ${getPromptIntegrationList()}

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
- CRITICAL RULE: Every single generated or updated workflow MUST contain exactly one 'mission' node (containing the overall goal of the workflow in data.prompt). If a mission node does not exist, add it and connect it to the starting node (usually the trigger node) with a context edge ("kind": "context").
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
    systemInstruction: COMPILE_SYSTEM,
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  });

  const response = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `Translate this user prompt into a structured workflow:\n"${prompt}"` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.0
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
    systemInstruction: CHAT_SYSTEM,
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
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

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  data: Record<string, any>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  source: string;
  target: string;
  kind?: string;
}

export interface CompiledWorkflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export function getExecutionTier(nodeType: string): 'local' | 'browser' | 'agent' {
  switch (nodeType) {
    case 'wait':
    case 'parameter':
    case 'mission':
    case 'integration':
    case 'webhook_trigger':
    case 'schedule_trigger':
      return 'local';
    case 'trigger':
    case 'navigate':
    case 'click':
    case 'type':
    case 'scrape':
    case 'open_tab':
    case 'switch_tab':
    case 'close_tab':
    case 'if':
      return 'browser';
    case 'ai_prompt':
    case 'vision':
    case 'approval':
    case 'ai_agent':
    case 'agent':
      return 'agent';
    default:
      return 'browser';
  }
}

export async function compileWorkflow(prompt: string): Promise<CompiledWorkflow> {
  const lmKey = await getLmStudioKey();
  const systemPrompt = `You are the constrained planning layer of Project Stanley, a hybrid browser and API automation system.
Your task is to take a natural language request from a user and translate it into a structured, step-by-step automation workflow containing nodes and edges.

Available node types:
1. trigger: The start node. Data: { "url": "URL string" }
2. navigate: Navigate to a URL. Data: { "url": "URL string" }
3. click: Click an element. Data: { "description": "Element description", "selector": "CSS selector if known" }
4. type: Type text into an input. Data: { "description": "Input description", "value": "value to type" }
5. wait: Delay timer. Data: { "ms": "milliseconds as string" }
6. scrape: Scrape visible text. Data: { "selector": "CSS selector to scope" }
7. open_tab: Open new tab. Data: { "url": "Optional URL" }
8. switch_tab: Switch to a tab. Data: { "index": "tab index as string" }
9. close_tab: Close a tab. Data: { "index": "tab index as string" }
10. if: Condition fork. Data: { "condition": { "type": "contains|equals|exists", "value": "check value", "variable": "check variable" } }
11. ai_prompt: Run an AI prompt. Data: { "prompt": "AI prompt text" }
12. mission: Super-node storing the overall request goal. Connect to start node with context edge. Data: { "prompt": "User's goal" }
13. parameter: Sub-node storing parameter inputs. Connect to target step with context edge. Data: { "value": "parameter value" }
14. integration: Call a 3rd party API natively. Supported "integrationName" values:
  ${getPromptIntegrationList()}
15. agent: Bounded browser planner. Data: { "goal": "Agent goal", "maxSteps": "1-8" }
16. approval: Human approval checkpoint immediately before a side effect. Data: { "context": "What the operator is approving" }
17. scroll_until: Scroll a window or nested feed until enough repeated items are loaded. Data: { "containerSelector": "optional scroll container", "itemSelector": "repeated item selector", "targetCount": "count", "maxScrolls": "bounded count" }
18. dom_extract_list: Deterministically extract repeated DOM records including href/src attributes. Data: { "itemSelector": "repeated item selector", "fields": "JSON object mapping names to selector/attribute specs", "dedupeBy": "field name", "maxItems": "bounded count" }
19. visit_each: Visit each URL from an earlier list and merge deterministic detail fields. Data: { "sourceNodeId": "list node id", "urlField": "URL field", "fields": "JSON object", "maxItems": "bounded count" }
20. filter_list: Select records using explicit AI criteria. Data: { "sourceNodeId": "list node id", "criteria": "selection rules", "schema": "JSON array shape" }
21. assertion: Fail the run unless a list satisfies its promised count and fields. Data: { "sourceNodeId": "list node id", "minItems": "minimum count", "requiredFields": "comma-separated fields", "uniqueBy": "optional unique field" }

CRITICAL RULE: Every single generated workflow MUST contain exactly one 'mission' node that describes the user's overall goal. Connect this mission node to the starting trigger node using a context edge (set "kind": "context" in the edge definition).
CRITICAL RULE: Put an approval node immediately before any integration write or browser action that submits, publishes, deletes, sends, purchases, or otherwise creates an external side effect. Never emit custom-code, goto, label, or recorder nodes.

Return the final compiled workflow graph matching the requested schema.`;

  const vertexSchema = {
    type: "OBJECT",
    properties: {
      name: { type: "STRING", description: "A creative, short name for the automation (e.g. 'Gmail Lead Extractor')" },
      nodes: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            id: { type: "STRING" },
            type: { 
              type: "STRING"
            },
            label: { type: "STRING" },
            data: {
              type: "OBJECT",
              properties: {
                url: { type: "STRING" },
                selector: { type: "STRING" },
                value: { type: "STRING" },
                ms: { type: "STRING" },
                label: { type: "STRING" },
                description: { type: "STRING" },
                goal: { type: "STRING" },
                prompt: { type: "STRING" },
                system: { type: "STRING" },
                integrationName: { type: "STRING" },
                query: { type: "STRING" },
                role: { type: "STRING" },
                maxSteps: { type: "STRING" },
                context: { type: "STRING" },
                containerSelector: { type: "STRING" },
                itemSelector: { type: "STRING" },
                uniqueByAttribute: { type: "STRING" },
                targetCount: { type: "STRING" },
                maxScrolls: { type: "STRING" },
                scrollAmount: { type: "STRING" },
                settleMs: { type: "STRING" },
                fields: { type: "STRING" },
                dedupeBy: { type: "STRING" },
                maxItems: { type: "STRING" },
                sourceNodeId: { type: "STRING" },
                urlField: { type: "STRING" },
                criteria: { type: "STRING" },
                schema: { type: "STRING" },
                minItems: { type: "STRING" },
                requiredFields: { type: "STRING" },
                uniqueBy: { type: "STRING" },
                dropIncomplete: { type: "STRING" },
                outputLimit: { type: "STRING" }
              }
            }
          },
          required: ["id", "type", "label"]
        }
      },
      edges: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            source: { type: "STRING" },
            target: { type: "STRING" },
            kind: { type: "STRING" }
          },
          required: ["source", "target"]
        }
      }
    },
    required: ["name", "nodes", "edges"]
  };

  if (lmKey) {
    const text = await callLmStudio(
      systemPrompt,
      `Translate this user prompt into a structured workflow matching the schema:\n"${prompt}"`,
      lmKey
    );
    const workflow = JSON.parse(cleanJson(text)) as Omit<CompiledWorkflow, 'id'> & { id?: string };
    return { ...workflow, id: workflow.id || crypto.randomUUID() };
  }

  // Use Firebase AI Logic (Vertex AI client SDK)
  const vertex = getVertexInstance();
  const model = getGenerativeModel(vertex, { 
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt,
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  });

  const response = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `Translate this user prompt into a structured workflow:\n"${prompt}"` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: vertexSchema as any,
      temperature: 0.0
    }
  });

  const text = response.response.text();
  const workflow = JSON.parse(cleanJson(text)) as Omit<CompiledWorkflow, 'id'> & { id?: string };
  return { ...workflow, id: workflow.id || crypto.randomUUID() };
}
