/**
 * recorder.js (Claude-additions) — "record once, replay" capture for Stanley.
 *
 * The foundation already injects a DOM listener that captures clicks / input
 * changes / form submits into an interaction timeline (see foundationAgent's
 * `logStanleyEvent` + `getTimeline`). That power was never surfaced in the UI.
 *
 * This module manages live recording sessions and converts a captured timeline
 * into a standard workflow graph (the same {nodes, edges} the Editor and runner
 * use), so users can demonstrate a task in a real browser and get an editable
 * workflow instead of hand-building every node.
 *
 * Wired into server.js via /api/record/start and /api/record/stop.
 */

const { StanleyFoundationEnhanced } = require('./foundationAgent.enhanced.js');

// recordingId -> { agent, startUrl, startedAt }
const sessions = {};

function newId() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Launches a headful browser and begins capturing the user's interactions.
 * The browser stays open until stopRecording() is called.
 */
async function startRecording(startUrl) {
  const agent = new StanleyFoundationEnhanced({ headless: false });
  await agent.initialize();
  if (startUrl) {
    try {
      await agent.navigate(startUrl);
    } catch (err) {
      // Navigation failure shouldn't abort the recording — the user may type a URL themselves.
      console.error('[Recorder] Initial navigation failed:', err.message);
    }
  }
  const recordingId = newId();
  sessions[recordingId] = { agent, startUrl: startUrl || '', startedAt: Date.now() };
  return recordingId;
}

/**
 * Stops a recording, closes the browser, and returns the generated workflow.
 */
async function stopRecording(recordingId, name) {
  const session = sessions[recordingId];
  if (!session) throw new Error('No active recording with that id.');

  const timeline = session.agent.getTimeline();
  const workflow = timelineToWorkflow(timeline, session.startUrl, name);

  try {
    await session.agent.cleanup();
  } finally {
    delete sessions[recordingId];
  }
  return workflow;
}

/** Discards a recording without generating a workflow (closes the browser). */
async function cancelRecording(recordingId) {
  const session = sessions[recordingId];
  if (!session) return;
  try {
    await session.agent.cleanup();
  } finally {
    delete sessions[recordingId];
  }
}

/**
 * Converts a captured interaction timeline into a workflow graph.
 *  - click  -> click node (selector)
 *  - change -> type node  (selector + value; masked passwords become a vault hint)
 *  - submit -> wait node  (let the resulting navigation settle)
 */
function timelineToWorkflow(timeline, startUrl, name) {
  const nodes = [];
  const edges = [];
  let y = 50;
  const stepGap = 140;

  const triggerId = newId();
  nodes.push({
    id: triggerId,
    type: 'trigger',
    label: 'Recorded Start',
    data: { url: startUrl || (timeline[0] && timeline[0].currentUrl) || 'https://' },
    position: { x: 250, y },
  });
  let prevId = triggerId;

  for (const event of timeline || []) {
    y += stepGap;
    const id = newId();
    let node = null;

    if (event.eventType === 'click') {
      node = {
        id,
        type: 'click',
        label: event.textContent ? `Click "${event.textContent.slice(0, 24)}"` : 'Click Element',
        data: { selector: event.selector },
        position: { x: 250, y },
      };
    } else if (event.eventType === 'change') {
      const masked = event.value === '********';
      node = {
        id,
        type: 'type',
        label: 'Type Value',
        // Masked password fields become a vault placeholder the user can point at a secret.
        data: { selector: event.selector, value: masked ? 'vault:CHANGE_ME' : (event.value || '') },
        position: { x: 250, y },
      };
    } else if (event.eventType === 'submit') {
      node = {
        id,
        type: 'wait',
        label: 'Wait After Submit',
        data: { ms: '2000' },
        position: { x: 250, y },
      };
    }

    if (!node) {
      y -= stepGap;
      continue;
    }
    nodes.push(node);
    edges.push({ source: prevId, target: id });
    prevId = id;
  }

  return {
    id: newId(),
    name: name || `Recorded Flow ${new Date().toLocaleString()}`,
    nodes,
    edges,
  };
}

module.exports = { startRecording, stopRecording, cancelRecording, timelineToWorkflow };
