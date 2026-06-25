/**
 * test-recorder.js — validates the recorder's capture → convert → replay pipeline.
 *
 * Part A (always runs): pure-function check of timelineToWorkflow().
 * Part B (needs Playwright + Chrome): drives a real page, captures the interaction
 *   timeline, converts it to a workflow, then REPLAYS that workflow with the same
 *   branching engine the app uses — proving the captured selectors actually work.
 *
 * Run: node test-recorder.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const { timelineToWorkflow } = require('./stanley-daemon/recorder.js');
const { StanleyFoundationEnhanced } = require('./stanley-daemon/foundationAgent.enhanced.js');
const { executeGraph } = require('./stanley-daemon/branchingEngine.js');

let failures = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ✓ ${name}`))
    .catch((err) => { failures++; console.error(`  ✗ ${name}\n      ${err.message}`); });
}

// ── Part A: converter unit checks ────────────────────────────────────────────────
async function partA() {
  console.log('\nPart A — timelineToWorkflow() conversion');

  await check('builds a trigger + nodes from a timeline', () => {
    const timeline = [
      { eventType: 'change', selector: '#q', value: 'hello', textContent: '', currentUrl: 'x', timestamp: 1 },
      { eventType: 'click', selector: '#go', value: null, textContent: 'Search', currentUrl: 'x', timestamp: 2 },
      { eventType: 'submit', selector: 'form', value: null, textContent: '', currentUrl: 'x', timestamp: 3 },
    ];
    const wf = timelineToWorkflow(timeline, 'https://example.com', 'My Flow');
    assert.strictEqual(wf.name, 'My Flow');
    assert.strictEqual(wf.nodes[0].type, 'trigger');
    assert.strictEqual(wf.nodes[0].data.url, 'https://example.com');
    const types = wf.nodes.map(n => n.type);
    assert.deepStrictEqual(types, ['trigger', 'type', 'click', 'wait']);
    // type node carries selector + value
    assert.strictEqual(wf.nodes[1].data.selector, '#q');
    assert.strictEqual(wf.nodes[1].data.value, 'hello');
    // edges chain linearly: trigger->type->click->wait (3 edges)
    assert.strictEqual(wf.edges.length, 3);
  });

  await check('masks password fields into a vault placeholder', () => {
    const wf = timelineToWorkflow(
      [{ eventType: 'change', selector: '#pw', value: '********', textContent: '', currentUrl: 'x', timestamp: 1 }],
      'https://example.com'
    );
    assert.strictEqual(wf.nodes[1].data.value, 'vault:CHANGE_ME');
  });

  await check('handles an empty timeline (trigger only)', () => {
    const wf = timelineToWorkflow([], 'https://example.com');
    assert.strictEqual(wf.nodes.length, 1);
    assert.strictEqual(wf.edges.length, 0);
  });
}

// ── Part B: live capture + replay ─────────────────────────────────────────────────
async function partB() {
  console.log('\nPart B — live capture + replay (Playwright)');

  // Note: Stanley's scrapeContent only extracts text-bearing tags (p, li, span, h1-6…),
  // so the result lands in a <p> and we scrape 'body'.
  const html = `<!doctype html><html><body>
    <input id="q" name="q" placeholder="Search">
    <button id="go" onclick="document.getElementById('out').textContent='RESULT:'+document.getElementById('q').value">Search</button>
    <p id="out"></p>
  </body></html>`;
  const tmp = path.join(os.tmpdir(), `stanley-rec-test-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf-8');
  const fileUrl = 'file:///' + tmp.replace(/\\/g, '/');

  let recordAgent;
  let captured;
  try {
    recordAgent = new StanleyFoundationEnhanced({ headless: true });
    await recordAgent.initialize();
    await recordAgent.navigate(fileUrl);

    // Drive real DOM events so the injected capture listener records them.
    await recordAgent.page.fill('#q', 'hello world');
    await recordAgent.page.click('#go');
    await recordAgent.wait(200);

    captured = recordAgent.getTimeline();
  } catch (err) {
    console.warn(`  ⚠ Skipped live test (browser unavailable): ${err.message.split('\n')[0]}`);
    if (recordAgent) await recordAgent.cleanup().catch(() => {});
    fs.unlinkSync(tmp);
    return;
  }

  await check('captured at least a change and a click event', () => {
    const kinds = captured.map(e => e.eventType);
    assert.ok(kinds.includes('change'), `expected a change event, got: ${kinds.join(',')}`);
    assert.ok(kinds.includes('click'), `expected a click event, got: ${kinds.join(',')}`);
  });

  const workflow = timelineToWorkflow(captured, fileUrl, 'Replay Test');
  // Append a scrape so we can verify the replay actually drove the page.
  const scrapeId = 'scrape-verify';
  const lastNode = workflow.nodes[workflow.nodes.length - 1];
  workflow.nodes.push({ id: scrapeId, type: 'scrape', label: 'Verify', data: { selector: 'body' }, position: { x: 250, y: 999 } });
  workflow.edges.push({ source: lastNode.id, target: scrapeId });

  await recordAgent.cleanup().catch(() => {});

  await check('replays the generated workflow and reaches expected state', async () => {
    const replayAgent = new StanleyFoundationEnhanced({ headless: true });
    await replayAgent.initialize();
    try {
      const scraped = await executeGraph(replayAgent, workflow, { onLog: () => {} });
      const out = scraped[scrapeId] || '';
      assert.ok(out.includes('RESULT:hello world'), `replay produced unexpected output: "${out}"`);
    } finally {
      await replayAgent.cleanup().catch(() => {});
    }
  });

  fs.unlinkSync(tmp);
}

(async () => {
  await partA();
  await partB();
  console.log(failures === 0 ? '\nAll recorder checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
