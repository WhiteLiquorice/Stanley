import { useState } from 'react';
import { Sparkles, FileText, Plus, X } from 'lucide-react';

// Built-in starter templates
// Built-in starter templates
const TEMPLATES = [
  {
    id: 'hn-digest',
    name: 'HN Frontpage Bullet Summary',
    description: 'Scrape HN front page → AI bullet summary',
    icon: '📰',
    nodes: [
      { id: '1', type: 'trigger',   label: 'Start Trigger',     data: { url: 'https://news.ycombinator.com' }, position: { x: 250, y: 50  } },
      { id: '2', type: 'scrape',    label: 'Scrape Headlines',  data: { selector: 'span.titleline > a' },       position: { x: 250, y: 190 } },
      { id: '3', type: 'ai_prompt', label: 'AI Summary',        data: { prompt: 'Summarize these HN headlines into 5 engaging bullet points: {{lastScrape}}' }, position: { x: 250, y: 330 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
    ],
  },
  {
    id: 'google-maps-leads',
    name: 'Google Maps Local Leads',
    description: 'Find local businesses, reviews and phone numbers',
    icon: '📍',
    nodes: [
      { id: '1', type: 'trigger',   label: 'Google Maps Search', data: { url: 'https://www.google.com/maps/search/dentists+in+chicago' }, position: { x: 250, y: 50  } },
      { id: '2', type: 'scrape',    label: 'Scrape Names & Ratings', data: { selector: 'div.fontHeadlineSmall' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'js_code',    label: 'Extract Details', data: { code: '// Custom JS to extract business phone numbers & links from the DOM\nconst elements = Array.from(document.querySelectorAll(".fontHeadlineSmall"));\nreturn elements.map(el => el.textContent);' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'save_file', label: 'Save Leads List', data: { filename: 'local_leads.csv' }, position: { x: 250, y: 470 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
    ],
  },
  {
    id: 'amazon-price-tracker',
    name: 'Amazon Price Monitor',
    description: 'Monitor Amazon product price & trigger Webhook alert',
    icon: '💰',
    nodes: [
      { id: '1', type: 'trigger',   label: 'Amazon Product', data: { url: 'https://www.amazon.com/dp/B08N5WRWNW' }, position: { x: 250, y: 50  } },
      { id: '2', type: 'scrape',    label: 'Scrape Price', data: { selector: '.a-price-whole' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'js_code',    label: 'Check Price Limit', data: { code: 'const price = parseFloat(context.lastScrape);\nif (price < 99.99) {\n  return { alert: true, price };\n} else {\n  throw new Error("Price still above threshold");\n}' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'http_send',  label: 'Send Slack Webhook', data: { url: 'https://hooks.slack.com/services/EXAMPLE' }, position: { x: 250, y: 470 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
    ],
  },
  {
    id: 'linkedin-outreach',
    name: 'LinkedIn Outreach Drafts',
    description: 'Scrape LinkedIn job listings → AI-drafted cover letter',
    icon: '💼',
    nodes: [
      { id: '1', type: 'trigger',   label: 'LinkedIn Jobs Search', data: { url: 'https://www.linkedin.com/jobs/search/?keywords=react+developer' }, position: { x: 250, y: 50  } },
      { id: '2', type: 'scrape',    label: 'Scrape Job Info', data: { selector: '.job-details-block' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'ai_prompt', label: 'Draft Cover Letter', data: { prompt: 'Write a highly personalized cover letter for this React Developer role. Match my background to this job info: {{lastScrape}}' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'save_file', label: 'Save PDF / Text', data: { filename: 'cover_letter.txt' }, position: { x: 250, y: 470 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
    ],
  },
  {
    id: 'paywall-bypass',
    name: 'Paywalled Article Archiver',
    description: 'Bypass Paywalls using Vault login session',
    icon: '🔓',
    nodes: [
      { id: '1', type: 'trigger',   label: 'Subscription Portal', data: { url: 'https://medium.com/signin' }, position: { x: 250, y: 50  } },
      { id: '2', type: 'type',      label: 'Enter Email (Vault)', data: { selector: 'input[type=email]', value: 'vault:Medium_Email' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'click',     label: 'Submit Sign In', data: { selector: 'button[type=submit]' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'trigger',   label: 'Open Premium Article', data: { url: 'https://medium.com/premium-article-url' }, position: { x: 250, y: 470 } },
      { id: '5', type: 'scrape',    label: 'Scrape Section Content', data: { selector: 'article section' }, position: { x: 250, y: 610 } },
      { id: '6', type: 'save_file', label: 'Save Offline Copy', data: { filename: 'archived_post.txt' }, position: { x: 250, y: 750 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
      { id: 'e4-5', source: '4', target: '5', type: 'smoothstep' },
      { id: 'e5-6', source: '5', target: '6', type: 'smoothstep' },
    ],
  },
  {
    id: 'crm-sync',
    name: 'CRM Leads Extractor',
    description: 'Log into HubSpot → Scrape leads table → Extract emails',
    icon: '🔄',
    nodes: [
      { id: '1', type: 'trigger',   label: 'HubSpot CRM Login', data: { url: 'https://app.hubspot.com/login' }, position: { x: 250, y: 50 } },
      { id: '2', type: 'type',      label: 'Enter CRM Username', data: { selector: 'input#username', value: 'vault:CRM_User' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'type',      label: 'Enter CRM Password', data: { selector: 'input#password', value: 'vault:CRM_Password' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'click',     label: 'Submit Login', data: { selector: 'button#loginBtn' }, position: { x: 250, y: 470 } },
      { id: '5', type: 'trigger',   label: 'Open Leads List', data: { url: 'https://app.hubspot.com/contacts/leads' }, position: { x: 250, y: 610 } },
      { id: '6', type: 'scrape',    label: 'Scrape Leads Table', data: { selector: 'a.email-link' }, position: { x: 250, y: 750 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
      { id: 'e4-5', source: '4', target: '5', type: 'smoothstep' },
      { id: 'e5-6', source: '5', target: '6', type: 'smoothstep' },
    ],
  },
  {
    id: 'recursive-pagination',
    name: 'Multi-Page Pagination Loop',
    description: 'Scrape multiple catalog pages with click-loops (Costs $0)',
    icon: '🔄',
    nodes: [
      { id: '1', type: 'trigger',   label: 'Directory Page 1', data: { url: 'https://example-directory.com/companies' }, position: { x: 250, y: 50 } },
      { id: '2', type: 'scrape',    label: 'Scrape Listings', data: { selector: '.company-card-title' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'click',     label: 'Click Next Page', data: { selector: 'a.next-page' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'scrape',    label: 'Scrape Listings 2', data: { selector: '.company-card-title' }, position: { x: 250, y: 470 } },
      { id: '5', type: 'click',     label: 'Click Next Page 2', data: { selector: 'a.next-page' }, position: { x: 250, y: 610 } },
      { id: '6', type: 'scrape',    label: 'Scrape Listings 3', data: { selector: '.company-card-title' }, position: { x: 250, y: 750 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
      { id: 'e4-5', source: '4', target: '5', type: 'smoothstep' },
      { id: 'e5-6', source: '5', target: '6', type: 'smoothstep' },
    ],
  },
  {
    id: 'subreddit-monitor',
    name: 'Reddit Sentiment Analyzer',
    description: 'Monitor Reddit → AI extract pain-points and opportunities',
    icon: '🤖',
    nodes: [
      { id: '1', type: 'trigger',   label: 'SaaS Subreddit', data: { url: 'https://www.reddit.com/r/SaaS/new' }, position: { x: 250, y: 50 } },
      { id: '2', type: 'scrape',    label: 'Scrape Post Text', data: { selector: 'a[slot="title"]' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'ai_prompt', label: 'Find Opportunities', data: { prompt: 'Identify posts complaining about Zapier pricing or Make.com complexity: {{lastScrape}}' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'clipboard', label: 'Copy to Clipboard', data: { text: '{{lastAiResponse}}' }, position: { x: 250, y: 470 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
    ],
  },
  {
    id: 'gov-form-filler',
    name: 'Registry Form Auto-Filler',
    description: 'Autofill SEC / Government forms using secure Vault assets',
    icon: '📋',
    nodes: [
      { id: '1', type: 'trigger',   label: 'Edgar Filing Form', data: { url: 'https://www.sec.gov/edgar/filing' }, position: { x: 250, y: 50 } },
      { id: '2', type: 'type',      label: 'Fill Tax ID', data: { selector: 'input[name=ein]', value: 'vault:Business_EIN' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'type',      label: 'Fill Corporate Address', data: { selector: 'input[name=address]', value: 'vault:Corporate_Address' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'click',     label: 'Select Entity Type', data: { selector: 'input[value=LLC]' }, position: { x: 250, y: 470 } },
      { id: '5', type: 'click',     label: 'Submit SEC Filing', data: { selector: 'button#submit-filing' }, position: { x: 250, y: 610 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
      { id: 'e4-5', source: '4', target: '5', type: 'smoothstep' },
    ],
  },
  {
    id: 'competitor-audit',
    name: 'Competitor Pricing Auditor',
    description: 'Compare competitor prices → AI SWOT Analysis report',
    icon: '📊',
    nodes: [
      { id: '1', type: 'trigger',   label: 'Competitor A Prices', data: { url: 'https://competitor-a.com/pricing' }, position: { x: 250, y: 50 } },
      { id: '2', type: 'scrape',    label: 'Scrape Rates A', data: { selector: '.price-amount' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'trigger',   label: 'Competitor B Prices', data: { url: 'https://competitor-b.com/pricing' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'scrape',    label: 'Scrape Rates B', data: { selector: '.price-tier-cost' }, position: { x: 250, y: 470 } },
      { id: '5', type: 'ai_prompt', label: 'AI SWOT Analysis', data: { prompt: 'Compile competitor pricing: Competitor A ({{scrape:2}}) and Competitor B ({{scrape:4}}). Output a strategic SWOT pricing markdown report.' }, position: { x: 250, y: 610 } },
      { id: '6', type: 'save_file', label: 'Save SWOT Report', data: { filename: 'pricing_swot.md' }, position: { x: 250, y: 750 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
      { id: 'e4-5', source: '4', target: '5', type: 'smoothstep' },
      { id: 'e5-6', source: '5', target: '6', type: 'smoothstep' },
    ],
  },
  {
    id: 'pinterest-scroll',
    name: 'Pinterest Dynamic Scraper',
    description: 'Dynamic scrolling grid → Extract lazy-loaded images',
    icon: '📌',
    nodes: [
      { id: '1', type: 'trigger',   label: 'Pinterest Search', data: { url: 'https://www.pinterest.com/search/pins/?q=minimalist+web+design' }, position: { x: 250, y: 50 } },
      { id: '2', type: 'js_code',    label: 'Scroll Page Down 1', data: { code: 'window.scrollTo(0, document.body.scrollHeight);\nawait new Promise(r => setTimeout(r, 2000));' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'js_code',    label: 'Scroll Page Down 2', data: { code: 'window.scrollTo(0, document.body.scrollHeight);\nawait new Promise(r => setTimeout(r, 2000));' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'scrape',    label: 'Scrape Image Assets', data: { selector: 'img.h-100' }, position: { x: 250, y: 470 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
    ],
  },
  {
    id: 'github-stargazers',
    name: 'GitHub Stargazer Outreach',
    description: 'Scrape repo stargazers → AI personalize cold outreach',
    icon: '⭐',
    nodes: [
      { id: '1', type: 'trigger',   label: 'GitHub Stargazers', data: { url: 'https://github.com/facebook/react/stargazers' }, position: { x: 250, y: 50 } },
      { id: '2', type: 'scrape',    label: 'Scrape Usernames', data: { selector: 'ol.follow-list-items h3 a' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'ai_prompt', label: 'AI Personalize Outreach', data: { prompt: 'Write a thank-you cold email pitching them about local web automations: {{lastScrape}}' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'save_file', label: 'Export Text Drafts', data: { filename: 'stargazer_outreach.txt' }, position: { x: 250, y: 470 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
    ],
  },
  {
    id: 'pdf-invoice',
    name: 'Invoice PDF Formatter',
    description: 'Scrape Stripe transactions → JS Code invoice → Save PDF',
    icon: '📄',
    nodes: [
      { id: '1', type: 'trigger',   label: 'Stripe Test Invoices', data: { url: 'https://dashboard.stripe.com/test/invoices' }, position: { x: 250, y: 50 } },
      { id: '2', type: 'scrape',    label: 'Scrape Row Sums', data: { selector: '.InvoiceRow-amount' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'js_code',    label: 'Format Invoice HTML', data: { code: '// Custom JS to format scraped data into layout structure\nconst items = context.lastScrape;\nreturn `<html><body><h1>Invoice Report</h1><p>${items}</p></body></html>`;' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'save_file', label: 'Save Local invoice.html', data: { filename: 'invoice.html' }, position: { x: 250, y: 470 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
    ],
  },
  {
    id: 'apiless-gpt',
    name: 'ChatGPT API-less Solver',
    description: 'Autofill ChatGPT UI → Scrape response without API fees',
    icon: '💬',
    nodes: [
      { id: '1', type: 'trigger',   label: 'ChatGPT UI', data: { url: 'https://chatgpt.com' }, position: { x: 250, y: 50 } },
      { id: '2', type: 'type',      label: 'Autofill Prompt Input', data: { selector: '#prompt-textarea', value: 'Draft a short summary of how local browser agents are better than cloud servers.' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'click',     label: 'Click Send Message', data: { selector: 'button[data-testid="send-button"]' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'wait',      label: 'Wait for Chat Answer', data: { ms: '5000' }, position: { x: 250, y: 470 } },
      { id: '5', type: 'scrape',    label: 'Scrape Result Output', data: { selector: 'div.markdown' }, position: { x: 250, y: 610 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
      { id: 'e4-5', source: '4', target: '5', type: 'smoothstep' },
    ],
  },
  {
    id: 'instagram-influencers',
    name: 'Instagram Influencer Finder',
    description: 'Explore nocode tags → Dynamic scroll → Scrape profiles',
    icon: '📸',
    nodes: [
      { id: '1', type: 'trigger',   label: 'Instagram Explore Tag', data: { url: 'https://www.instagram.com/explore/tags/nocode/' }, position: { x: 250, y: 50 } },
      { id: '2', type: 'js_code',    label: 'Scroll Photo Grid', data: { code: 'window.scrollTo(0, document.body.scrollHeight);\nawait new Promise(r => setTimeout(r, 2000));' }, position: { x: 250, y: 190 } },
      { id: '3', type: 'scrape',    label: 'Scrape Post Profiles', data: { selector: 'article a' }, position: { x: 250, y: 330 } },
      { id: '4', type: 'ai_prompt', label: 'Extract Profiles Links', data: { prompt: 'Compile a unique CSV list of Instagram profiles: {{lastScrape}}' }, position: { x: 250, y: 470 } },
      { id: '5', type: 'save_file', label: 'Save CSV List', data: { filename: 'instagram_influencers.csv' }, position: { x: 250, y: 610 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
      { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
      { id: 'e3-4', source: '3', target: '4', type: 'smoothstep' },
      { id: 'e4-5', source: '4', target: '5', type: 'smoothstep' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Automation',
    description: 'Start from scratch with just a trigger',
    icon: '⚡',
    nodes: [
      { id: '1', type: 'trigger', label: 'Start Trigger', data: { url: 'https://' }, position: { x: 250, y: 60 } },
    ],
    edges: [],
  },
];

interface Props {
  onSelectTemplate: (template: typeof TEMPLATES[number]) => void;
  onDescribe: () => void;
  onBuildScratch: () => void;
  onClose: () => void;
}

export function WelcomeModal({ onSelectTemplate, onDescribe, onBuildScratch, onClose }: Props) {
  const [view, setView] = useState<'main' | 'templates'>('main');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="relative bg-white border border-[#D1D7E4] rounded-2xl shadow-2xl w-full max-w-xl p-6">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {view === 'main' ? (
          <>
            <div className="flex items-center gap-3 mb-2">
              <img src="/favicon.svg" alt="Stanley" className="w-8 h-8" />
              <h2 className="text-lg font-bold text-slate-850">Welcome to Stanley</h2>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Build browser automations visually, run them with AI, and schedule them to work while you sleep.
            </p>

            <div className="grid gap-3">
              {/* Describe option */}
              <button
                onClick={onDescribe}
                className="flex items-start gap-3 p-4 rounded-xl bg-[#6C47FF]/8 border border-[#6C47FF]/20 hover:border-[#6C47FF]/45 hover:bg-[#6C47FF]/12 transition-all text-left group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-[#6C47FF]/15 mt-0.5">
                  <Sparkles size={16} className="text-[#6C47FF]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-[#5535E0] transition-colors">
                    Describe what to automate
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tell Stanley what you want in plain English — it will build the workflow for you.
                  </p>
                </div>
              </button>

              {/* Template option */}
              <button
                onClick={() => setView('templates')}
                className="flex items-start gap-3 p-4 rounded-xl bg-white border border-[#D1D7E4] hover:border-[#B0BACC] hover:bg-[#EEF1F6]/50 transition-all text-left group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-slate-100 mt-0.5">
                  <FileText size={16} className="text-slate-650" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Start from a template</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pick from 15 ready-made automation starters.
                  </p>
                </div>
              </button>

              {/* Scratch option */}
              <button
                onClick={onBuildScratch}
                className="flex items-start gap-3 p-4 rounded-xl bg-white border border-[#D1D7E4] hover:border-[#B0BACC] hover:bg-[#EEF1F6]/50 transition-all text-left group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-slate-100 mt-0.5">
                  <Plus size={16} className="text-slate-650" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Build from scratch</p>
                  <p className="text-xs text-slate-500 mt-0.5">Start with a blank canvas.</p>
                </div>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setView('main')} className="text-slate-500 hover:text-slate-800 transition-colors text-xs cursor-pointer">
                ← Back
              </button>
              <h2 className="text-base font-bold text-slate-850">Choose a template</h2>
            </div>

            <div className="grid grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => onSelectTemplate(t)}
                  className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-white border border-[#D1D7E4] hover:border-[#6C47FF]/40 hover:bg-[#6C47FF]/6 transition-all text-left cursor-pointer"
                >
                  <span className="text-2xl">{t.icon}</span>
                  <p className="text-xs font-bold text-slate-800">{t.name}</p>
                  <p className="text-[10px] text-slate-500 leading-snug">{t.description}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
