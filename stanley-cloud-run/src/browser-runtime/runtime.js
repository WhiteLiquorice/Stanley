const { AccessibilityReferenceMap, captureAccessibilitySnapshot } = require('./accessibility');
const { PrivacySafeTrace } = require('./trace');

class BrowserRunRuntime {
  constructor({ services, uid, runId, workflowId, sessionId, sessionRetentionDays = 30 }) {
    Object.assign(this, { services, uid, runId, workflowId, sessionId: sessionId || workflowId, sessionRetentionDays });
    this.refs = new AccessibilityReferenceMap();
    this.trace = new PrivacySafeTrace({ store: services.store, uid, runId });
    this.prepared = false; this.attached = false; this.agent = null;
  }
  async prepare() {
    if (this.prepared) return this.storageState || null;
    this.services.lifecycle.acquire({ uid: this.uid, runId: this.runId });
    this.storageState = await this.services.store.loadSession(this.uid, this.sessionId);
    this.prepared = true;
    await this.trace.record('runtime_started', { outcome: this.storageState ? 'session_restored' : 'fresh_session' });
    return this.storageState || null;
  }
  async attach(agent) {
    if (this.attached || !agent?.page) return;
    this.agent = agent; this.attached = true; agent._browserRuntime = this; this.trace.attach(agent.page);
    const lease = this.services.lifecycle.assertAlive(this.runId);
    this.expiryTimer = setTimeout(() => {
      agent.cleanup().catch(() => {});
    }, Math.max(1, lease.expiresAt - Date.now()));
    this.expiryTimer.unref?.();
    const snapshot = this.refs.remember(await captureAccessibilitySnapshot(agent.page));
    await this.trace.record('page_attached', { url: agent.page.url(), snapshot });
  }
  async snapshot() {
    if (!this.agent?.page) return null;
    return this.refs.remember(await captureAccessibilitySnapshot(this.agent.page));
  }
  async clickRef(ref) { await this.refs.resolve(this.agent?.page, ref).click({ timeout: 5000 }); }
  async fillRef(ref, value) { await this.refs.resolve(this.agent?.page, ref).fill(String(value), { timeout: 5000 }); }
  async beforeNode(node) {
    if (!this.agent?.page) return;
    this.services.lifecycle.assertAlive(this.runId); this.services.lifecycle.heartbeat(this.runId);
    await this.trace.record('node', { nodeId: node.id, phase: 'before', url: this.agent.page.url(), snapshot: await this.snapshot() });
  }
  async afterNode(node) {
    if (!this.agent?.page) return;
    await this.trace.record('node', { nodeId: node.id, phase: 'after', outcome: 'success', url: this.agent.page.url(), snapshot: await this.snapshot() });
  }
  async nodeFailed(node, error) {
    if (!this.agent?.page) return;
    await this.trace.record('node', { nodeId: node.id, phase: 'after', outcome: 'failed', errorCode: error.code || error.name, url: this.agent.page.url(), snapshot: await this.snapshot() });
  }
  async handleBlocked(agent, block, label) {
    const snapshot = await this.snapshot();
    await this.services.takeover.open(this.uid, this.runId, { reason: `${label}: ${block.hint}`, snapshot });
    await this.trace.record('takeover_requested', { outcome: 'waiting', url: agent.page?.url(), snapshot });
    const deadline = Date.now() + this.services.takeover.waitMs;
    while (Date.now() < deadline) {
      this.services.lifecycle.assertAlive(this.runId); this.services.lifecycle.heartbeat(this.runId);
      const command = await this.services.takeover.nextCommand(this.uid, this.runId);
      if (!command) { await new Promise((resolve) => setTimeout(resolve, this.services.takeover.pollMs)); continue; }
      try {
        if (command.type === 'resume') {
          await this.services.takeover.completeCommand(this.uid, this.runId, command, 'completed');
          await this.services.takeover.close(this.uid, this.runId, 'resumed');
          await this.trace.record('takeover_finished', { outcome: 'resumed', url: agent.page?.url() }); return;
        }
        if (command.type === 'abort') throw Object.assign(new Error('Operator aborted the browser run.'), { code: 'TAKEOVER_ABORTED' });
        const locator = this.refs.resolve(agent.page, command.ref);
        if (command.type === 'click_ref') await locator.click({ timeout: 5000 });
        if (command.type === 'type_ref') await locator.fill(command.value, { timeout: 5000 });
        await this.services.takeover.completeCommand(this.uid, this.runId, command, 'completed');
        await this.snapshot();
      } catch (error) {
        await this.services.takeover.completeCommand(this.uid, this.runId, command, 'failed', error);
        if (error.code === 'TAKEOVER_ABORTED') { await this.services.takeover.close(this.uid, this.runId, 'aborted'); throw error; }
      }
    }
    await this.services.takeover.close(this.uid, this.runId, 'expired');
    throw Object.assign(new Error('Interactive takeover timed out safely.'), { code: 'TAKEOVER_TIMEOUT' });
  }
  async close(agent, outcome = 'completed') {
    try {
      if (this.prepared && agent?.context && this.services.cipher.enabled) {
        await this.services.store.saveSession(this.uid, this.sessionId, await agent.context.storageState(), this.sessionRetentionDays);
      }
      if (this.prepared) await this.trace.record('runtime_finished', { outcome, url: agent?.page?.url?.() || '' });
    } finally {
      if (this.expiryTimer) clearTimeout(this.expiryTimer);
      if (agent?._browserRuntime === this) delete agent._browserRuntime;
      await this.trace.close(); this.refs.clear(); this.services.lifecycle.release(this.runId);
    }
  }
}

module.exports = { BrowserRunRuntime };
