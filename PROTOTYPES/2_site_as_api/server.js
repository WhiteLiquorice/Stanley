const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

// Maxun Philosophy: Turn any site into an API
// Example: POST /api/scrape
// Body: { "searchQuery": "Laptop" }
app.post('/api/scrape', async (req, res) => {
  const { searchQuery } = req.body;
  if (!searchQuery) return res.status(400).json({ error: 'searchQuery is required' });

  let browser;
  try {
    console.log(`Starting headless run for query: "${searchQuery}"`);
    browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // 1. Navigate to target
    console.log('Navigating to Wikipedia...');
    await page.goto('https://en.wikipedia.org/wiki/Main_Page', { waitUntil: 'networkidle2' });
    
    // 2. Type into field
    console.log('Typing search query...');
    const searchInputSelector = 'input[name="search"]';
    await page.waitForSelector(searchInputSelector);
    await page.type(searchInputSelector, searchQuery);
    
    // 3. Submit search
    console.log('Submitting search...');
    await Promise.all([
      page.keyboard.press('Enter'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    
    // 4. Scrape the resulting page title and first paragraph
    console.log('Scraping results...');
    const result = await page.evaluate(() => {
      const title = document.querySelector('h1#firstHeading')?.innerText || 'No title found';
      
      // Find the first paragraph in the main content area that isn't empty
      const paragraphs = Array.from(document.querySelectorAll('.mw-parser-output > p'));
      const firstParagraph = paragraphs.find(p => p.innerText.trim().length > 10);
      const text = firstParagraph ? firstParagraph.innerText : 'No description found';
      
      return { title, description: text };
    });

    console.log('Scrape complete!', result);
    
    // 5. Return as JSON API response
    res.json({
      success: true,
      data: result,
      metadata: {
        source: 'Wikipedia',
        query: searchQuery,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = 3005;
app.listen(PORT, () => {
  console.log(`Sites-as-API Prototype running on http://localhost:${PORT}`);
  console.log(`Try running: curl -X POST http://localhost:${PORT}/api/scrape -H "Content-Type: application/json" -d '{"searchQuery":"Artificial Intelligence"}'`);
});
