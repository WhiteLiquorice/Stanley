import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, Bot, Brain, Check, Database, FileText, Globe2, LayoutTemplate, RefreshCw, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { setDoc } from '../lib/firestore';
import { approveTemplate, listDynamicTemplates, publishTemplate, recordTemplateUse, updateTemplate, type WorkflowTemplate } from '../lib/templateClient';

type NodeSpec = { type: string; label: string; data: Record<string, unknown>; nextCondition?: Record<string, unknown>; linkNext?: boolean };
type BuiltInOptions = { inputSchema?: Record<string, unknown>; outputSchema?: Record<string, unknown>; outputNodeId?: string; executionPolicy?: Record<string, unknown>; modelPolicy?: Record<string, unknown>; contextPolicy?: Record<string, unknown>; requiredVaultRefs?: string[] };
const stringField = (description: string, format?: string) => ({ type: 'string', minLength: 1, description, ...(format ? { format } : {}) });
const inputs = (required: string[], properties: Record<string, unknown>) => ({ type: 'object', required, properties, additionalProperties: false });

function builtIn(templateId: string, name: string, description: string, category: string, steps: NodeSpec[], options: BuiltInOptions = {}): WorkflowTemplate {
  const mission = { id: 'mission', type: 'mission', label: 'Mission', data: { prompt: description }, position: { x: 40, y: 40 } };
  const nodes = steps.map((step, index) => ({ id: `n${index + 1}`, type: step.type, label: step.label, data: step.data, position: { x: 320, y: 40 + index * 140 } }));
  const edges: Array<Record<string, unknown>> = [{ source: 'mission', target: 'n1', kind: 'context' }];
  for (let index = 0; index < nodes.length - 1; index++) if (steps[index].linkNext !== false) edges.push({ source: nodes[index].id, target: nodes[index + 1].id, ...(steps[index].nextCondition ? { condition: steps[index].nextCondition } : {}) });
  const template: WorkflowTemplate = { templateId, version: 'v1', name, description, category, state: 'published', visibility: 'public', requiredVaultRefs: options.requiredVaultRefs || [], workflow: { nodes: [mission, ...nodes], edges, inputSchema: options.inputSchema || inputs([], {}), outputSchema: options.outputSchema || {}, ...(options.outputNodeId ? { outputNodeId: options.outputNodeId } : {}), ...(options.executionPolicy ? { executionPolicy: options.executionPolicy } : {}), ...(options.modelPolicy ? { modelPolicy: options.modelPolicy } : {}), ...(options.contextPolicy ? { contextPolicy: options.contextPolicy } : {}) }, provenance: { type: 'builtin' }, health: { successCount: 0, failureCount: 0, verifiedSuccessRate: 0, usageCount: 0, compatibility: 'current', driftCount: 0 } };
  assertBuiltInQuality(template);
  return template;
}

function assertBuiltInQuality(template: WorkflowTemplate) {
  const nodes = template.workflow.nodes;
  const edges = template.workflow.edges;
  const nodesById = new Map(nodes.map((node) => [String(node.id), node]));
  if (nodes.filter((node) => node.type === 'mission').length !== 1) throw new Error(`${template.name} requires exactly one mission node.`);
  if (nodes.filter((node) => node.type === 'trigger').length !== 1) throw new Error(`${template.name} requires exactly one trigger node.`);
  const mission = nodes.find((node) => node.type === 'mission');
  const trigger = nodes.find((node) => node.type === 'trigger');
  if (!edges.some((edge) => edge.kind === 'context' && edge.source === mission?.id && edge.target === trigger?.id)) throw new Error(`${template.name} must attach its mission to its trigger.`);
  const inputProperties = ((template.workflow.inputSchema?.properties || {}) as Record<string, unknown>);
  const serialized = JSON.stringify(template.workflow);
  for (const match of serialized.matchAll(/\{\{input\.([A-Za-z][A-Za-z0-9_]*)\}\}/g)) if (!(match[1] in inputProperties)) throw new Error(`${template.name} references undeclared input ${match[1]}.`);
  const sideEffects = new Set(['send_email', 'send_slack', 'integration', 'connector', 'native_integration', 'upload_file']);
  for (const node of nodes) {
    const data = (node.data || {}) as Record<string, unknown>;
    if (['click', 'type', 'scrape', 'extract', 'extract_list'].includes(String(node.type)) && !data.selector && !data.description) throw new Error(`${template.name}: ${node.label} needs a selector or description.`);
    if (node.type === 'ai_prompt' && !data.prompt) throw new Error(`${template.name}: ${node.label} needs an AI prompt.`);
    if (node.type === 'agent' && (!data.goal || !data.maxSteps)) throw new Error(`${template.name}: ${node.label} needs a goal and bounded steps.`);
    if (node.type === 'paginate' && (!data.actionNodeId || !nodesById.has(String(data.actionNodeId)))) throw new Error(`${template.name}: ${node.label} needs a valid page action.`);
    if (node.type === 'scroll_until' && (!data.itemSelector || !data.targetCount || !data.maxScrolls)) throw new Error(`${template.name}: ${node.label} needs an item selector, target count, and scroll bound.`);
    if (node.type === 'dom_extract_list' && (!data.itemSelector || !data.fields || !data.dedupeBy)) throw new Error(`${template.name}: ${node.label} needs deterministic fields and a dedupe key.`);
    if (node.type === 'visit_each' && (!data.sourceNodeId || !nodesById.has(String(data.sourceNodeId)) || !data.urlField || !data.fields || !data.maxItems)) throw new Error(`${template.name}: ${node.label} needs a valid source list, URL field, detail fields, and bound.`);
    if (node.type === 'filter_list' && (!data.sourceNodeId || !nodesById.has(String(data.sourceNodeId)) || !data.criteria || !data.schema)) throw new Error(`${template.name}: ${node.label} needs a valid source list, criteria, and schema.`);
    if (node.type === 'assertion' && (!data.sourceNodeId || !nodesById.has(String(data.sourceNodeId)) || !data.minItems)) throw new Error(`${template.name}: ${node.label} needs a valid source list and minimum count.`);
    if (sideEffects.has(String(node.type))) {
      const approved = edges.some((edge) => edge.target === node.id && nodesById.get(String(edge.source))?.type === 'approval');
      if (!approved) throw new Error(`${template.name}: ${node.label} needs approval immediately before the side effect.`);
    }
  }
  for (const vaultRef of [...serialized.matchAll(/vault:([A-Za-z][A-Za-z0-9_.-]*)/g)].map((match) => match[1])) if (!template.requiredVaultRefs.includes(vaultRef)) throw new Error(`${template.name} must declare vault reference ${vaultRef}.`);
}

export function validateBuiltInTemplates(templates: WorkflowTemplate[] = BUILT_INS) {
  if (templates.length !== 13) throw new Error(`Expected 13 built-in templates, received ${templates.length}.`);
  if (new Set(templates.map((template) => template.templateId)).size !== templates.length) throw new Error('Built-in template ids must be unique.');
  templates.forEach(assertBuiltInQuality);
  return { templates: templates.length, aiTemplates: templates.filter((template) => template.workflow.nodes.some((node) => ['ai_prompt', 'agent', 'ai_agent', 'vision'].includes(String(node.type)))).length };
}

export const BUILT_INS: WorkflowTemplate[] = [
  builtIn('tpl-google-search', 'Google Search Scraper', 'Search Google and extract structured result titles, URLs, and summaries.', 'Scraping', [
    { type: 'trigger', label: 'Open Google', data: { url: 'https://www.google.com' } },
    { type: 'type', label: 'Enter search query', data: { selector: 'textarea[name="q"], input[name="q"]', value: '{{input.query}}' } },
    { type: 'send_keys', label: 'Submit search', data: { keys: 'Enter' } },
    { type: 'wait', label: 'Wait for results', data: { ms: '1500' } },
    { type: 'extract_list', label: 'Extract structured results', data: { selector: '#search', schema: [{ title: 'string', url: 'string', summary: 'string' }] } },
  ], { inputSchema: inputs(['query'], { query: stringField('Search query') }) }),
  builtIn('tpl-price-monitor', 'Price Monitor', 'Monitor a product page and report whether its selected price content changed.', 'Monitoring', [
    { type: 'trigger', label: 'Open product page', data: { url: '{{input.url}}' } },
    { type: 'monitor', label: 'Monitor price element', data: { selector: '{{input.priceSelector}}' } },
  ], { inputSchema: inputs(['url', 'priceSelector'], { url: stringField('Product URL', 'uri'), priceSelector: stringField('CSS selector containing the price') }) }),
  builtIn('tpl-linkedin-scraper', 'LinkedIn Profile Finder', 'Find public LinkedIn profile pages through search and extract structured profile leads.', 'Scraping', [
    { type: 'trigger', label: 'Open Google', data: { url: 'https://www.google.com' } },
    { type: 'type', label: 'Enter profile query', data: { selector: 'textarea[name="q"], input[name="q"]', value: 'site:linkedin.com/in {{input.query}}' } },
    { type: 'send_keys', label: 'Submit search', data: { keys: 'Enter' } },
    { type: 'wait', label: 'Wait for results', data: { ms: '1500' } },
    { type: 'extract_list', label: 'Extract profile leads', data: { selector: '#search', schema: [{ name: 'string', headline: 'string', profileUrl: 'string' }] } },
  ], { inputSchema: inputs(['query'], { query: stringField('Role, company, location, or person to find') }) }),
  builtIn('tpl-slack-bot', 'Slack Page Briefing', 'Extract a page, create a concise AI briefing, and send it to Slack after human approval.', 'Notification', [
    { type: 'trigger', label: 'Open target page', data: { url: '{{input.url}}' } },
    { type: 'scrape', label: 'Extract page content', data: { selector: '{{input.selector}}' } },
    { type: 'ai_prompt', label: 'Create Slack briefing', data: { prompt: 'Create a concise Slack briefing from this content. Preserve important numbers and links:\n\n{{lastScrape}}', system: 'Return a clear plain-text briefing, not markdown tables.' } },
    { type: 'approval', label: 'Approve Slack message', data: { context: 'Review the generated briefing before sending it to Slack.' } },
    { type: 'send_slack', label: 'Send to Slack', data: { webhook: 'vault:SlackWebhook' } },
  ], { inputSchema: inputs(['url', 'selector'], { url: stringField('Page URL', 'uri'), selector: stringField('CSS selector to summarize') }), requiredVaultRefs: ['SlackWebhook'] }),
  builtIn('tpl-email-page-change', 'Email on Page Change', 'Monitor selected page content and email only when a previously captured baseline changes.', 'Monitoring', [
    { type: 'trigger', label: 'Open monitored page', data: { url: '{{input.url}}' } },
    { type: 'monitor', label: 'Compare selected content', data: { selector: '{{input.selector}}' } },
    { type: 'if', label: 'Continue only when changed', data: { condition: { type: 'true' } }, nextCondition: { type: 'true' } },
    { type: 'approval', label: 'Approve notification', data: { context: 'The monitored content changed. Review before sending email.' } },
    { type: 'send_email', label: 'Send change notification', data: { to: '{{input.to}}', subject: '{{input.subject}}' } },
  ], { inputSchema: inputs(['url', 'selector', 'to', 'subject'], { url: stringField('Page URL', 'uri'), selector: stringField('CSS selector to monitor'), to: stringField('Recipient email', 'email'), subject: stringField('Email subject') }), requiredVaultRefs: ['SendGridApiKey', 'SendGridFromEmail'] }),
  builtIn('tpl-api-fetcher', 'Typed REST API Fetcher', 'Call a read-only JSON endpoint and return a deterministically parsed response.', 'API', [
    { type: 'trigger', label: 'Start API workflow', data: { url: 'https://example.com' } },
    { type: 'http_request', label: 'Fetch JSON endpoint', data: { method: 'GET', url: '{{input.url}}', headers: { Accept: 'application/json' } } },
    { type: 'transform', label: 'Parse JSON response', data: { operation: 'json_parse', input: '{{lastScrape}}' } },
  ], { inputSchema: inputs(['url'], { url: stringField('Public JSON endpoint', 'uri') }) }),
  builtIn('tpl-multi-page', 'Multi-Page Product Scraper', 'Traverse a paginated catalog and collect product cards from each page.', 'Scraping', [
    { type: 'trigger', label: 'Open catalog', data: { url: '{{input.url}}' } },
    { type: 'paginate', label: 'Collect paginated results', data: { selector: '{{input.nextSelector}}', maxPages: '{{input.maxPages}}', actionNodeId: 'n3' }, linkNext: false },
    { type: 'extract_list', label: 'Extract current page items', data: { selector: '{{input.itemSelector}}', schema: [{ title: 'string', price: 'string', url: 'string' }] } },
  ], { inputSchema: inputs(['url', 'itemSelector', 'nextSelector', 'maxPages'], { url: stringField('First catalog page', 'uri'), itemSelector: stringField('CSS selector for repeated items'), nextSelector: stringField('CSS selector for the next-page control'), maxPages: { type: 'integer', minimum: 1, maximum: 25 } }) }),
  builtIn('tpl-wikipedia-summarizer', 'Article Summarizer', 'Extract an article and produce a concise, factual AI summary with key points.', 'AI', [
    { type: 'trigger', label: 'Open article', data: { url: '{{input.url}}' } },
    { type: 'scrape', label: 'Extract article text', data: { selector: '{{input.selector}}' } },
    { type: 'ai_prompt', label: 'Summarize article', data: { prompt: 'Summarize this article in five factual bullets, followed by a one-sentence takeaway:\n\n{{lastScrape}}', system: 'Use only the supplied article. State uncertainty instead of inventing details.' } },
  ], { inputSchema: inputs(['url', 'selector'], { url: stringField('Article URL', 'uri'), selector: stringField('CSS selector for article content') }) }),
  builtIn('tpl-agent-research', 'Agent Research Assistant', 'Give an Agent a research objective, bounded browser tools, and an explicit step budget.', 'AI', [
    { type: 'trigger', label: 'Open search', data: { url: 'https://www.google.com' } },
    { type: 'agent', label: 'Research objective', data: { goal: 'Research {{input.objective}}. Return concise findings with source URLs and distinguish facts from inference.', maxSteps: 8 } },
  ], { inputSchema: inputs(['objective'], { objective: stringField('Research objective') }) }),
  builtIn('tpl-google-maps-local-leads', 'Google Maps Local Leads', 'Turn a Google Maps search into a verified list of local businesses with names, addresses, phone numbers, websites, ratings, and listing URLs.', 'Research', [
    { type: 'trigger', label: 'Open Google Maps', data: { url: 'https://www.google.com/maps' } },
    { type: 'type', label: 'Enter local business search', data: { selector: '#searchboxinput', description: 'Google Maps search box', value: '{{input.query}} in {{input.location}}' } },
    { type: 'send_keys', label: 'Run Maps search', data: { keys: 'Enter' } },
    { type: 'wait', label: 'Wait for Maps results', data: { ms: '2500' } },
    { type: 'scroll_until', label: 'Load enough business listings', data: { containerSelector: '[role="feed"]', itemSelector: '[role="feed"] a[href*="/maps/place/"]', uniqueByAttribute: 'href', targetCount: '{{input.candidateCount}}', maxScrolls: '60', scrollAmount: '1400', settleMs: '1100', stagnationLimit: '5' } },
    { type: 'dom_extract_list', label: 'Capture listing URLs', data: { itemSelector: '[role="feed"] a[href*="/maps/place/"]', fields: { name: { attribute: 'aria-label', required: true }, listingUrl: { attribute: 'href', required: true }, listingText: { attribute: 'text' } }, dedupeBy: 'listingUrl', maxItems: '{{input.candidateCount}}' } },
    { type: 'visit_each', label: 'Enrich every business', data: { sourceNodeId: 'n6', urlField: 'listingUrl', maxItems: '{{input.candidateCount}}', settleMs: '1200', fields: { name: { selector: 'h1', attribute: 'text', required: true }, address: { selector: '[data-item-id="address"]', attribute: 'aria-label' }, phone: { selector: '[data-item-id^="phone:tel:"]', attribute: 'aria-label' }, website: { selector: 'a[data-item-id="authority"]', attribute: 'href' }, rating: { selector: '[role="img"][aria-label*="stars"]', attribute: 'aria-label' } } } },
    { type: 'assertion', label: 'Verify the promised lead list', data: { sourceNodeId: 'n7', minItems: '{{input.targetCount}}', requiredFields: ['name', 'address', 'phone', 'listingUrl'], uniqueBy: 'listingUrl', dropIncomplete: true, outputLimit: '{{input.targetCount}}' } },
  ], {
    inputSchema: inputs(['query', 'location', 'targetCount', 'candidateCount'], { query: { ...stringField('Business category or search phrase'), default: 'dentists' }, location: { ...stringField('City, region, or postal code'), default: 'Chicago, IL' }, targetCount: { type: 'integer', minimum: 1, maximum: 75, default: 42, description: 'Minimum complete businesses required before the run can succeed' }, candidateCount: { type: 'integer', minimum: 1, maximum: 100, default: 60, description: 'Listings to inspect so incomplete entries do not reduce the promised result' } }),
    outputSchema: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'object', required: ['name', 'address', 'phone', 'listingUrl'], properties: { name: { type: 'string', minLength: 1 }, listingUrl: { type: 'string', format: 'uri' }, address: { type: 'string', minLength: 1 }, phone: { type: 'string', minLength: 1 }, website: { type: 'string' }, rating: { type: 'string' }, listingText: { type: 'string' } } } },
    outputNodeId: 'n8',
    executionPolicy: { maxNodes: 20, maxGraphSteps: 100, maxExecutionMs: 900000, retrySafe: true, maxRunAttempts: 2, requireApprovalForSideEffects: true },
    modelPolicy: { profile: 'deterministic', maxModelCalls: 0, allowVision: false },
  }),
  builtIn('tpl-pinterest-research-collector', 'Pinterest Research Collector', 'Scroll a Pinterest search or board, inspect each pin, keep sources matching explicit research criteria, and fail unless the requested number of unique links is produced.', 'Research', [
    { type: 'trigger', label: 'Open Pinterest research', data: { url: 'https://www.pinterest.com/search/pins/?q={{input.query}}' } },
    { type: 'wait', label: 'Wait for the inspiration grid', data: { ms: '2500' } },
    { type: 'scroll_until', label: 'Load candidate pins', data: { itemSelector: 'a[href*="/pin/"]', uniqueByAttribute: 'href', targetCount: '{{input.candidateCount}}', maxScrolls: '70', scrollAmount: '1500', settleMs: '1000', stagnationLimit: '5' } },
    { type: 'dom_extract_list', label: 'Capture unique pins', data: { itemSelector: 'a[href*="/pin/"]', fields: { pinUrl: { attribute: 'href', required: true }, previewTitle: { selector: 'img[alt]', attribute: 'alt' }, previewImage: { selector: 'img', attribute: 'src' } }, dedupeBy: 'pinUrl', maxItems: '{{input.candidateCount}}' } },
    { type: 'visit_each', label: 'Recover each original source', data: { sourceNodeId: 'n4', urlField: 'pinUrl', maxItems: '{{input.candidateCount}}', settleMs: '1000', fields: { title: { selector: 'h1, [data-test-id="pin-title"]', attribute: 'text' }, description: { selector: '[data-test-id="closeup-description"], [data-test-id="pin-description"]', attribute: 'text' }, sourceUrl: { selector: 'a[data-test-id="visit-site-button"], a[aria-label*="Visit site"], a[rel~="nofollow"][href^="http"]', attribute: 'href' } } } },
    { type: 'filter_list', label: 'Keep sources worth saving', data: { sourceNodeId: 'n5', criteria: 'Keep only records with a non-empty sourceUrl on a non-Pinterest domain that genuinely match this research goal: {{input.criteria}}. Preserve title, description, sourceUrl, pinUrl, previewTitle, and previewImage. Deduplicate semantically equivalent sources and do not invent values.', schema: [{ title: 'string', description: 'string', sourceUrl: 'string', pinUrl: 'string', previewTitle: 'string', previewImage: 'string' }] } },
    { type: 'assertion', label: 'Verify the promised research collection', data: { sourceNodeId: 'n6', minItems: '{{input.targetCount}}', requiredFields: ['sourceUrl', 'pinUrl'], uniqueBy: 'sourceUrl', dropIncomplete: true, outputLimit: '{{input.targetCount}}' } },
  ], {
    inputSchema: inputs(['query', 'criteria', 'targetCount', 'candidateCount'], { query: { ...stringField('Pinterest search phrase'), default: 'minimalist web design' }, criteria: { ...stringField('What makes a source worth keeping'), default: 'Distinct, practical visual references for a modern minimalist landing page' }, targetCount: { type: 'integer', minimum: 1, maximum: 40, default: 24, description: 'Minimum useful source links required before the run can succeed' }, candidateCount: { type: 'integer', minimum: 5, maximum: 100, default: 60, description: 'Pins to inspect before applying the usefulness criteria' } }),
    outputSchema: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'object', required: ['sourceUrl', 'pinUrl'], properties: { title: { type: 'string' }, description: { type: 'string' }, sourceUrl: { type: 'string', format: 'uri' }, pinUrl: { type: 'string', format: 'uri' }, previewTitle: { type: 'string' }, previewImage: { type: 'string' } } } },
    outputNodeId: 'n7',
    executionPolicy: { maxNodes: 20, maxGraphSteps: 100, maxExecutionMs: 900000, retrySafe: true, maxRunAttempts: 2, requireApprovalForSideEffects: true },
    modelPolicy: { profile: 'quality', maxModelCalls: 4, maxContextChars: 60000, allowVision: false, extractionProfile: 'quality' },
  }),
  builtIn('tpl-hackernews-digest', 'Hacker News Slack Digest', 'Collect current Hacker News stories, create an AI digest, and send it to Slack after approval.', 'Notification', [
    { type: 'trigger', label: 'Open Hacker News', data: { url: 'https://news.ycombinator.com' } },
    { type: 'scrape', label: 'Extract current stories', data: { selector: '.titleline' } },
    { type: 'ai_prompt', label: 'Create five-story digest', data: { prompt: 'Select the five most relevant stories for {{input.audience}} and write a concise digest. Include each title and URL when present:\n\n{{lastScrape}}' } },
    { type: 'approval', label: 'Approve digest', data: { context: 'Review the generated Hacker News digest before sending.' } },
    { type: 'send_slack', label: 'Send digest', data: { webhook: 'vault:SlackWebhook' } },
  ], { inputSchema: inputs(['audience'], { audience: stringField('Audience or topic focus') }), requiredVaultRefs: ['SlackWebhook'] }),
  builtIn('tpl-form-autofill', 'Approved Contact Form Auto-Fill', 'Fill a contact form from typed inputs and require approval immediately before submission.', 'Automation', [
    { type: 'trigger', label: 'Open form', data: { url: '{{input.url}}' } },
    { type: 'type', label: 'Fill name', data: { selector: '{{input.nameSelector}}', value: '{{input.name}}' } },
    { type: 'type', label: 'Fill email', data: { selector: '{{input.emailSelector}}', value: '{{input.email}}' } },
    { type: 'approval', label: 'Approve submission', data: { context: 'Review the populated form before submitting it.' } },
    { type: 'click', label: 'Submit form', data: { selector: '{{input.submitSelector}}', expect: '{{input.successSelector}}' } },
  ], { inputSchema: inputs(['url', 'nameSelector', 'emailSelector', 'submitSelector', 'name', 'email'], { url: stringField('Form URL', 'uri'), nameSelector: stringField('Name input CSS selector'), emailSelector: stringField('Email input CSS selector'), submitSelector: stringField('Submit button CSS selector'), successSelector: { type: 'string', description: 'Optional success-state selector' }, name: stringField('Name to enter'), email: stringField('Email to enter', 'email') }) }),
];

const categoryIcons: Record<string, React.ReactNode> = { Scraping: <Database size={12}/>, Research: <Globe2 size={12}/>, Monitoring: <Bell size={12}/>, Notification: <Bell size={12}/>, API: <Globe2 size={12}/>, AI: <Brain size={12}/>, Automation: <Bot size={12}/> };

export function Templates() {
  const navigate = useNavigate();
  const [dynamic, setDynamic] = useState<WorkflowTemplate[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState('');

  const load = useCallback(async () => { try { setCatalogError(''); setDynamic(await listDynamicTemplates()); } catch (error) { setCatalogError(error instanceof Error ? error.message : 'Dynamic catalog is unavailable.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  const templates = useMemo(() => [...dynamic, ...BUILT_INS], [dynamic]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(templates.map((item) => item.category)))], [templates]);
  const filtered = activeCategory === 'All' ? templates : templates.filter((template) => template.category === activeCategory);

  const lifecycle = async (template: WorkflowTemplate, action: 'approve' | 'publish') => {
    setLoadingId(`${template.templateId}:${action}`);
    try { action === 'approve' ? await approveTemplate(template) : await publishTemplate(template); toast.success(action === 'approve' ? 'Template approved' : 'Template published'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Template action failed.'); }
    finally { setLoadingId(null); }
  };
  const setVisibility = async (template: WorkflowTemplate, visibility: WorkflowTemplate['visibility']) => { setLoadingId(`${template.templateId}:visibility`); try { await updateTemplate(template, { visibility }); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update visibility.'); } finally { setLoadingId(null); } };

  const useTemplate = async (template: WorkflowTemplate) => {
    if (template.state !== 'published') return toast.error('Approve and publish this template before using it.');
    setLoadingId(`${template.templateId}:use`);
    try {
      if (template.provenance.type !== 'builtin') await recordTemplateUse(template);
      const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11);
      await setDoc('workflows', newId, { id: newId, name: template.name, description: template.description, nodes: structuredClone(template.workflow.nodes), edges: structuredClone(template.workflow.edges), inputSchema: template.workflow.inputSchema || {}, outputSchema: template.workflow.outputSchema || {}, outputNodeId: template.workflow.outputNodeId || null, executionPolicy: template.workflow.executionPolicy || {}, modelPolicy: template.workflow.modelPolicy || {}, contextPolicy: template.workflow.contextPolicy || {}, requiredVaultRefs: template.requiredVaultRefs || [], template: { id: template.templateId, version: template.version, fingerprint: template.fingerprint || null }, createdAt: new Date().toISOString() });
      navigate(`/dashboard/canvas?id=${newId}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create workflow from template.'); }
    finally { setLoadingId(null); }
  };

  return <div className="flex h-full flex-col overflow-y-auto bg-[#FDFBF7] p-6 font-sans text-[#1C1A17]">
    <div className="mb-6 flex items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50"><LayoutTemplate size={20} className="text-indigo-600"/></div><div><h2 className="text-xl font-bold text-slate-800">Workflow Templates</h2><p className="mt-0.5 text-xs text-slate-500">Built-ins plus governed templates learned from verified connectors and skills.</p></div></div><button onClick={() => void load()} className="rounded-xl border bg-white p-2 text-slate-600"><RefreshCw size={15}/></button></div>
    {catalogError && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Built-in templates remain available. Dynamic catalog: {catalogError}</div>}
    <div className="mb-6 flex flex-wrap items-center gap-2">{categories.map((category) => <button key={category} onClick={() => setActiveCategory(category)} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${activeCategory === category ? 'border-indigo-200 bg-indigo-600/10 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}>{category}</button>)}</div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((template) => {
      const runs = Number(template.health.successCount || 0) + Number(template.health.failureCount || 0);
      return <article key={`${template.templateId}:${template.version}`} className="group flex flex-col gap-4 rounded-2xl border border-[#EAE6DF] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600">{template.name}</h3><div className="mt-1 flex flex-wrap gap-1.5"><Badge>{template.provenance.type}</Badge><Badge>{template.visibility}</Badge><Badge tone={template.state === 'published' ? 'green' : 'amber'}>{template.state}</Badge></div></div><span className="flex items-center gap-1 rounded-full border bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">{categoryIcons[template.category]}{template.category}</span></div>
        <p className="flex-1 text-xs leading-relaxed text-slate-500">{template.description}</p>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center text-[10px]"><Metric label="Steps" value={template.workflow.nodes.filter((node) => node.type !== 'mission').length}/><Metric label="Verified" value={runs ? `${Math.round(template.health.verifiedSuccessRate * 100)}%` : 'New'}/><Metric label="Uses" value={template.health.usageCount || 0}/></div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EAE6DF] pt-3"><div className="flex items-center gap-3 text-[10px] font-bold text-slate-400"><span className="flex items-center gap-1"><FileText size={11}/>{template.version}</span>{template.requiredVaultRefs.length > 0 && <span className="flex items-center gap-1"><ShieldCheck size={11}/>{template.requiredVaultRefs.length} credentials</span>}{template.state === 'draft' && template.provenance.type !== 'builtin' && <select aria-label="Template visibility" value={template.visibility} disabled={loadingId === `${template.templateId}:visibility`} onChange={(event) => void setVisibility(template, event.target.value as WorkflowTemplate['visibility'])} className="rounded border bg-white px-1 py-0.5 text-[9px] text-slate-600"><option value="tenant">Private</option><option value="public">Public catalog</option></select>}</div><div className="flex gap-2">{template.state === 'draft' && <SmallButton icon={<Check size={12}/>} label="Approve" busy={loadingId === `${template.templateId}:approve`} onClick={() => void lifecycle(template, 'approve')}/>} {template.state === 'approved' && <SmallButton icon={<Rocket size={12}/>} label="Publish" busy={loadingId === `${template.templateId}:publish`} onClick={() => void lifecycle(template, 'publish')}/>} {template.state === 'published' && <SmallButton icon={loadingId === `${template.templateId}:use` ? <Sparkles size={12} className="animate-spin"/> : <ArrowRight size={12}/>} label="Use" busy={loadingId === `${template.templateId}:use`} onClick={() => void useTemplate(template)} primary/>}</div></div>
      </article>;
    })}</div>
    {!filtered.length && <div className="flex flex-1 flex-col items-center justify-center py-16 text-slate-400"><LayoutTemplate size={48}/><h3 className="mt-4 font-bold">No templates in this category</h3></div>}
  </div>;
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' }) { const styles = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'; return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${styles}`}>{children}</span>; }
function Metric({ label, value }: { label: string; value: React.ReactNode }) { return <div><div className="font-bold text-slate-700">{value}</div><div className="mt-0.5 text-slate-400">{label}</div></div>; }
function SmallButton({ icon, label, onClick, busy, primary = false }: { icon: React.ReactNode; label: string; onClick: () => void; busy: boolean; primary?: boolean }) { return <button onClick={onClick} disabled={busy} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold disabled:opacity-50 ${primary ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{icon}{label}</button>; }
