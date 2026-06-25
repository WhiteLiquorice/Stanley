const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions";

// Default fallback campaigns for all 7 demos if LM Studio is offline
const MOCK_CAMPAIGNS = {
  "morning-briefing": {
    topHook: "Logging into 5 client dashboards at 8 AM to write a PDF summary?\nYou are a glorified copy-paste script.",
    hookStage2: "Pass off the repetitive tasks to Stanley.",
    explainerText: "Stanley logs in, takes dashboard snapshots, and compiles your briefing PDF automatically.",
    bottomCTA: "Let Stanley build your briefs."
  },
  "price-tracker": {
    topHook: "Refreshing competitor pages manually to check for a $5 price drop.\nTruly a riveting career choice.",
    hookStage2: "Pass off the repetitive tasks to Stanley.",
    explainerText: "Stanley monitors pricing pages and alerts your team of any updates.",
    bottomCTA: "Automate tracking with Stanley."
  },
  "job-hunt": {
    topHook: "Manually scrolling through 400 identical job postings to find one that isn't ghost-hiring.\nYour mouse finger deserves better.",
    hookStage2: "Pass off the repetitive tasks to Stanley.",
    explainerText: "Stanley scrapes new listings, filters out spam, and matches job descriptions.",
    bottomCTA: "Let Stanley scan them."
  },
  "competitor-pulse": {
    topHook: "Stalking competitor websites like an ex's social media profile.\nGet help. Or get Stanley.",
    hookStage2: "Pass off the repetitive tasks to Stanley.",
    explainerText: "Stanley crawls competitor product features and logs changes to your dashboard.",
    bottomCTA: "Track competitors on autopilot."
  },
  "review-monitor": {
    topHook: "Refreshing Yelp and Google reviews waiting for someone to complain about your product.\nSave your eyes.",
    hookStage2: "Pass off the repetitive tasks to Stanley.",
    explainerText: "Stanley tracks review feeds in real-time and raises flags for negative ratings.",
    bottomCTA: "Monitor reviews with Stanley."
  },
  "form-autopilot": {
    topHook: "Entering timesheets by hand is corporate torture.",
    hookStage2: "Dump the grunt work on Stanley.",
    explainerText: "Stanley autofills portal web forms and submits the weekly timesheets instantly.",
    bottomCTA: "Autopilot forms with Stanley."
  },
  "lead-research": {
    topHook: "Stalking B2B prospects manually is corporate torture.",
    hookStage2: "Dump the grunt work on Stanley.",
    explainerText: "Stanley scrapes the web for business info and saves the B2B leads instantly.",
    bottomCTA: "Extract leads with Stanley."
  }
};

async function executeAssemblyLine() {
  const publicDir = path.join(__dirname, 'public');
  const reelsDir = path.join(publicDir, 'stanley_reels');
  
  // 1. Scan for pre-recorded demo reels
  let demoFiles = [];
  if (fs.existsSync(reelsDir)) {
    demoFiles = fs.readdirSync(reelsDir).filter(file => file.endsWith('.mp4'));
  }
  
  console.log(`[1/3] Found ${demoFiles.length} Stanley product demo reels.`);

  // Map demo filenames to demo IDs (e.g. "reel-01-morning-briefing.mp4" -> "morning-briefing")
  const allDemos = demoFiles.map(file => {
    const match = file.match(/reel-\d+-(.+)\.mp4/);
    return {
      filename: file,
      id: match ? match[1] : file.replace('.mp4', '')
    };
  });

  if (allDemos.length === 0) {
    console.error("No product demo reels found in public/stanley_reels");
    return;
  }

  // Parse command line arguments to support one-at-a-time compilation for rapid iteration
  let demoList = [];
  const targetId = process.argv[2];
  if (targetId) {
    const filtered = allDemos.filter(d => d.id === targetId || d.filename === targetId);
    if (filtered.length > 0) {
      demoList = filtered;
      console.log(`>> Rapid iteration mode active. Targeted demo: "${targetId}"`);
    } else {
      console.warn(`>> Targeted demo "${targetId}" not found. Available: ${allDemos.map(d => d.id).join(', ')}`);
      console.log(">> Defaulting to first demo.");
      demoList = [allDemos[0]];
    }
  } else {
    console.log(">> No target specified. Defaulting to first demo for rapid iteration.");
    console.log("   (Usage: 'node Orchestrator.js [demo-id]' to render others. Available: " + allDemos.map(d => d.id).join(', ') + ")");
    demoList = [allDemos[0]];
  }

  // Read adjacent Playwright automation scripts for context
  const demosContexts = demoList.map(demo => {
    const scriptFilename = demo.filename.replace('reel-', '').replace('.mp4', '.ts');
    const scriptPath = path.join(__dirname, '..', 'legacy-backup', 'demos', scriptFilename);
    let scriptContent = "// Automation script code not found.";
    if (fs.existsSync(scriptPath)) {
      scriptContent = fs.readFileSync(scriptPath, 'utf8');
    }
    return `
=== DEMO ID: "${demo.id}" ===
Filename: ${demo.filename}
Playwright Script Code:
\`\`\`typescript
${scriptContent}
\`\`\`
`;
  }).join('\n');

  const SYSTEM_PROMPT = `
You are the Headless B2B Marketing Director for 'Stanley', an unhinged local browser automation engine. 
Your target audience is exhausted digital agency owners, real estate operators, and solo developers.

Below are the Playwright/automation scripts that define what happens in each video. Analyze the scripts to understand exactly what manual tasks are being automated in the videos.

${demosContexts}

Output strictly a JSON object matching this exact schema:
{
  "reels": [
    {
      "id": "demo_id_here", // Must match exactly one of the demo IDs listed above
      "topHook": "Blunt, cynical 2-line statement about the manual web task this demo automates.",
      "hookStage2": "Sleek 1-line transitional hook, e.g. 'Pass off the repetitive tasks to Stanley.'",
      "explainerText": "Sleek 1-line explainer showing how Stanley automates this workflow in the background.",
      "bottomCTA": "Short call to action."
    }
  ]
}

Generate exactly ${demoList.length} campaign concepts—one for each demo listed above. Zero buzzwords. Keep the tone highly cynical, unhinged, and funny.`;

  let campaignCopy = {};
  // Pre-populate with mock campaigns
  for (const demo of demoList) {
    campaignCopy[demo.id] = MOCK_CAMPAIGNS[demo.id] || {
      topHook: `Manual task automation for ${demo.id}.`,
      hookStage2: "Pass off the repetitive tasks to Stanley.",
      explainerText: `Stanley runs the ${demo.id} workflow in the background.`,
      bottomCTA: "Automate with Stanley."
    };
  }

  console.log(">> Pinging local LM Studio server for unhinged copy payloads...");
  try {
    const response = await fetch(LM_STUDIO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "local-model",
        temperature: 0.85,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: SYSTEM_PROMPT }]
      })
    });

    if (response.ok) {
      const rawData = await response.json();
      let content = rawData.choices[0].message.content.trim();
      
      // Clean markdown code blocks if the LLM outputted them
      if (content.startsWith("```")) {
        content = content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      }
      
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.reels)) {
        for (const r of parsed.reels) {
          if (campaignCopy[r.id]) {
            campaignCopy[r.id] = {
              topHook: r.topHook,
              hookStage2: r.hookStage2 || "Pass off the repetitive tasks to Stanley.",
              explainerText: r.explainerText,
              bottomCTA: r.bottomCTA
            };
          }
        }
        console.log(">> Successfully fetched custom campaign copy from LM Studio!");
      }
    } else {
      console.warn(">> LM Studio returned an error. Using offline fallback campaigns.");
    }
  } catch (error) {
    console.warn(">> Local LM Studio offline or unreachable. Using offline fallback campaigns.");
  }

  // Ensure output directory exists
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log(">> Created ./dist directory");
  }

  // Get all Pexels stock video files (filter for HD videos; exclude heavy 4K UHD videos to prevent render timeouts)
  const pexelsDir = path.join(publicDir, 'pexels');
  let stockVideos = [];
  if (fs.existsSync(pexelsDir)) {
    stockVideos = fs.readdirSync(pexelsDir)
      .filter(file => file.endsWith('.mp4') && file.includes('-hd_'))
      .map(file => `pexels/${file}`);
  }

  console.log(`[2/3] Engaging Remotion compiler for ${demoList.length} ads...\n`);

  for (let i = 0; i < demoList.length; i++) {
    const demo = demoList[i];
    const adCopy = campaignCopy[demo.id];
    console.log(`>> Spawning render thread for: dist/ad-${demo.id}.mp4`);
    
    // Assign stock video background round-robin
    const assignedBg = stockVideos.length > 0 ? stockVideos[i % stockVideos.length] : undefined;
    const mediaUrl = `stanley_reels/${demo.filename}`;

    if (assignedBg) {
      console.log(`   Background stock: ${assignedBg}`);
    }
    console.log(`   Center product demo: ${mediaUrl}`);

    // We stringify the JSON and escape the quotes so the CLI shell doesn't choke on it
    const safeProps = JSON.stringify({
      topHook: adCopy.topHook,
      hookStage2: adCopy.hookStage2,
      explainerText: adCopy.explainerText,
      bottomCTA: adCopy.bottomCTA,
      mediaType: 'video',
      mediaUrl: mediaUrl,
      bgVideo: assignedBg
    }).replace(/"/g, '\\"');

    // Programmatically drive the Remotion CLI with constrained concurrency to prevent Chromium out-of-memory crashes
    try {
      execSync(
        `npx remotion render src/index.tsx StanleyAd dist/ad-${demo.id}.mp4 --props="${safeProps}" --concurrency=2`,
        { stdio: 'inherit' } // Passes Remotion's live green progress bar to your terminal
      );
      console.log(`>> Render completed: dist/ad-${demo.id}.mp4\n`);
    } catch (renderError) {
      console.error(`>> Failed to render ${demo.id}:`, renderError.message);
    }
  }

  console.log("[3/3] Assembly line shut down safely. All artifacts compiled to ./dist/");
}

executeAssemblyLine();
