const puppeteer = require('puppeteer');
const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');
const { JSDOM } = require('jsdom');
const fs = require('fs');

async function scrapeToMarkdown(url) {
  console.log(`Navigating to ${url}...`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    // 1. Fetch the page, allowing JS to render
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // 2. Extract the raw HTML after JS rendering
    const html = await page.content();
    
    // 3. Use JSDOM to parse the HTML for Readability
    console.log('Parsing DOM and extracting core article content...');
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    
    // Readability strips out navbars, footers, sidebars, and ads
    const article = reader.parse();
    
    if (!article) {
      throw new Error('Failed to parse article content from the page.');
    }
    
    // 4. Convert the clean HTML into Markdown
    console.log('Converting clean HTML to Markdown...');
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });
    
    // Add custom rules for tables or specific elements if needed
    turndownService.addRule('strikethrough', {
      filter: ['del', 's', 'strike'],
      replacement: function (content) {
        return '~' + content + '~'
      }
    });

    const markdown = turndownService.turndown(article.content);
    
    console.log('\n--- SUCCESS! Extracted Clean Markdown ---\n');
    console.log(`Title: ${article.title}`);
    console.log(`Byline: ${article.byline || 'N/A'}`);
    console.log(`Length: ${markdown.length} characters\n`);
    
    // Save to file for demonstration
    fs.writeFileSync('output.md', `# ${article.title}\n\n${markdown}`);
    console.log('Saved result to output.md');
    
    return markdown;

  } finally {
    await browser.close();
  }
}

// Example usage:
const targetUrl = process.argv[2] || 'https://en.wikipedia.org/wiki/Web_scraping';
scrapeToMarkdown(targetUrl).catch(console.error);
