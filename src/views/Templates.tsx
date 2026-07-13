import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutTemplate, Copy, ArrowRight, Sparkles, Database, Bell,
  Globe2, Brain, Bot, FileText
} from 'lucide-react';
import { setDoc } from '../lib/firestore';

interface TemplateNode {
  id: string;
  type: string;
  data: { type: string; label: string; value?: string };
  position: { x: number; y: number };
}

interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  nodeCount: number;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

function makeNodes(steps: { type: string; label: string; value?: string }[]): TemplateNode[] {
  return steps.map((step, i) => ({
    id: `n${i + 1}`,
    type: 'boutiqueNode',
    data: { type: step.type, label: step.label, value: step.value },
    position: { x: 300, y: 50 + i * 140 },
  }));
}

function makeEdges(count: number): TemplateEdge[] {
  return Array.from({ length: count - 1 }, (_, i) => ({
    id: `e${i + 1}-${i + 2}`,
    source: `n${i + 1}`,
    target: `n${i + 2}`,
    sourceHandle: 'bottom',
    targetHandle: 'top',
  }));
}

const templates: Template[] = [
  {
    id: 'tpl-google-search',
    name: 'Google Search Scraper',
    description: 'Navigate to Google, enter a search query, click search, wait for results to load, then scrape the search results.',
    category: 'Scraping',
    nodeCount: 5,
    nodes: makeNodes([
      { type: 'trigger', label: 'Open Google', value: 'google.com' },
      { type: 'type', label: 'Enter Search Query', value: 'search query' },
      { type: 'click', label: 'Click Search Button', value: 'search button' },
      { type: 'wait', label: 'Wait for Results', value: '2s' },
      { type: 'scrape', label: 'Scrape Results', value: 'results' },
    ]),
    edges: makeEdges(5),
  },
  {
    id: 'tpl-price-monitor',
    name: 'Price Monitor',
    description: 'Monitor a product page for price changes. Trigger on the product URL, scrape the price element, and alert on changes.',
    category: 'Monitoring',
    nodeCount: 3,
    nodes: makeNodes([
      { type: 'trigger', label: 'Open Product Page', value: 'product URL' },
      { type: 'scrape', label: 'Scrape Price', value: 'price element' },
      { type: 'monitor', label: 'Monitor Price Change', value: 'price change' },
    ]),
    edges: makeEdges(3),
  },
  {
    id: 'tpl-slack-bot',
    name: 'Slack Notification Bot',
    description: 'Scrape data from any URL and send it directly to a Slack channel via webhook integration.',
    category: 'Notification',
    nodeCount: 3,
    nodes: makeNodes([
      { type: 'trigger', label: 'Open Target URL', value: 'URL' },
      { type: 'scrape', label: 'Scrape Data', value: 'data' },
      { type: 'send_slack', label: 'Send to Slack', value: 'webhook' },
    ]),
    edges: makeEdges(3),
  },
  {
    id: 'tpl-linkedin-scraper',
    name: 'LinkedIn Profile Scraper',
    description: 'Search LinkedIn for profiles, enter a query, click search, wait for results, then scrape the profile data.',
    category: 'Scraping',
    nodeCount: 5,
    nodes: makeNodes([
      { type: 'trigger', label: 'Open LinkedIn Search', value: 'linkedin.com/search' },
      { type: 'type', label: 'Enter Search Query', value: 'search query' },
      { type: 'click', label: 'Click Search', value: 'search' },
      { type: 'wait', label: 'Wait for Results', value: '3s' },
      { type: 'scrape', label: 'Scrape Results', value: 'results' },
    ]),
    edges: makeEdges(5),
  },
  {
    id: 'tpl-email-page-change',
    name: 'Email on Page Change',
    description: 'Monitor a web page for content changes and send an email notification when something updates.',
    category: 'Monitoring',
    nodeCount: 3,
    nodes: makeNodes([
      { type: 'trigger', label: 'Open Target URL', value: 'URL' },
      { type: 'monitor', label: 'Monitor Page Content', value: 'page content' },
      { type: 'send_email', label: 'Send Email Notification', value: 'notification' },
    ]),
    edges: makeEdges(3),
  },
  {
    id: 'tpl-api-fetcher',
    name: 'API Data Fetcher',
    description: 'Fetch data from a REST API endpoint and transform the response to extract the fields you need.',
    category: 'API',
    nodeCount: 2,
    nodes: makeNodes([
      { type: 'http_request', label: 'GET Users', value: 'jsonplaceholder.typicode.com/users' },
      { type: 'transform', label: 'Extract Names', value: 'extract names' },
    ]),
    edges: makeEdges(2),
  },
  {
    id: 'tpl-multi-page',
    name: 'Multi-Page Scraper',
    description: 'Scrape data across multiple pages by navigating through pagination and collecting results from each page.',
    category: 'Scraping',
    nodeCount: 4,
    nodes: makeNodes([
      { type: 'trigger', label: 'Open First Page', value: 'URL' },
      { type: 'scrape', label: 'Scrape Page 1', value: 'page 1' },
      { type: 'click', label: 'Click Next Page', value: 'next' },
      { type: 'scrape', label: 'Scrape Page 2', value: 'page 2' },
    ]),
    edges: makeEdges(4),
  },
  {
    id: 'tpl-wikipedia-summarizer',
    name: 'Wikipedia Summarizer',
    description: 'Navigate to a Wikipedia article, scrape the full text, then use AI to generate a concise summary.',
    category: 'AI',
    nodeCount: 3,
    nodes: makeNodes([
      { type: 'trigger', label: 'Open Wikipedia Article', value: 'wikipedia.org' },
      { type: 'scrape', label: 'Scrape Article Text', value: 'article text' },
      { type: 'ai_prompt', label: 'Summarize Article', value: 'summarize' },
    ]),
    edges: makeEdges(3),
  },
  {
    id: 'tpl-hackernews-digest',
    name: 'Hacker News Digest',
    description: 'Scrape the top stories from Hacker News, transform to get the first 5, and send a digest to Slack.',
    category: 'Scraping',
    nodeCount: 4,
    nodes: makeNodes([
      { type: 'trigger', label: 'Open Hacker News', value: 'news.ycombinator.com' },
      { type: 'scrape', label: 'Scrape Top Stories', value: 'top stories' },
      { type: 'transform', label: 'Get First 5', value: 'first 5' },
      { type: 'send_slack', label: 'Send Digest to Slack', value: 'digest' },
    ]),
    edges: makeEdges(4),
  },
  {
    id: 'tpl-form-autofill',
    name: 'Form Auto-Fill',
    description: 'Automatically fill out a web form by typing into multiple fields and clicking the submit button.',
    category: 'Automation',
    nodeCount: 5,
    nodes: makeNodes([
      { type: 'trigger', label: 'Open Form Page', value: 'form URL' },
      { type: 'type', label: 'Fill Field 1', value: 'field 1' },
      { type: 'type', label: 'Fill Field 2', value: 'field 2' },
      { type: 'type', label: 'Fill Field 3', value: 'field 3' },
      { type: 'click', label: 'Click Submit', value: 'submit' },
    ]),
    edges: makeEdges(5),
  },
];

const categories = ['All', 'Scraping', 'Monitoring', 'Notification', 'API', 'AI', 'Automation'];

const categoryIcons: Record<string, React.ReactNode> = {
  Scraping: <Database size={12} />,
  Monitoring: <Bell size={12} />,
  Notification: <Bell size={12} />,
  API: <Globe2 size={12} />,
  AI: <Brain size={12} />,
  Automation: <Bot size={12} />,
};



export function Templates() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('All');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filtered = activeCategory === 'All'
    ? templates
    : templates.filter(t => t.category === activeCategory);

  const useTemplate = async (template: Template) => {
    try {
      setLoadingId(template.id);
      const newId = Math.random().toString(36).substring(2, 9);
      const newWorkflow = {
        id: newId,
        name: template.name,
        description: template.description,
        nodes: JSON.parse(JSON.stringify(template.nodes)),
        edges: JSON.parse(JSON.stringify(template.edges)),
        createdAt: new Date().toISOString(),
      };
      await setDoc('workflows', newId, newWorkflow);
      navigate(`/dashboard/canvas?id=${newId}`);
    } catch (err) {
      console.error('Failed to create workflow from template:', err);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#FDFBF7] text-[#1C1A17] p-6 overflow-y-auto font-sans">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <LayoutTemplate size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Workflow Templates</h2>
            <p className="text-xs text-slate-500 mt-0.5">Start with a pre-built template and customize it for your needs.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
              activeCategory === cat
                ? 'bg-indigo-600/10 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700 hover:bg-slate-50/50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(template => (
          <div
            key={template.id}
            className="bg-white border border-[#EAE6DF] rounded-2xl p-5 shadow-sm flex flex-col gap-4 hover:border-slate-300 transition-all group"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                {template.name}
              </h3>
              <span className={`flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                template.category === 'Scraping' ? 'bg-amber-50 text-amber-700 border-amber-200/50' :
                template.category === 'Monitoring' ? 'bg-rose-50 text-rose-700 border-rose-200/50' :
                template.category === 'Notification' ? 'bg-sky-50 text-sky-700 border-sky-200/50' :
                template.category === 'API' ? 'bg-teal-50 text-teal-700 border-teal-200/50' :
                template.category === 'AI' ? 'bg-purple-50 text-purple-700 border-purple-200/50' :
                'bg-indigo-50 text-indigo-700 border-indigo-200/50'
              }`}>
                {categoryIcons[template.category]}
                {template.category}
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed flex-1">
              {template.description}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-[#EAE6DF]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                  <FileText size={11} />
                  {template.nodeCount} steps
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                  <Copy size={11} />
                  Clone & edit
                </span>
              </div>
              <button
                onClick={() => useTemplate(template)}
                disabled={loadingId === template.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-[11px] font-bold text-white shadow-md shadow-indigo-600/10 border border-indigo-600/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                {loadingId === template.id ? (
                  <>
                    <Sparkles size={12} className="animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    Use Template <ArrowRight size={12} />
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex-1 flex flex-col justify-center items-center py-16">
          <LayoutTemplate size={48} className="text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-500">No templates in this category</h3>
          <p className="text-sm text-slate-450 mt-2">Try selecting a different category filter.</p>
        </div>
      )}
    </div>
  );
}
