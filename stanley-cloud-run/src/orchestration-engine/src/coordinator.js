const crypto = require('crypto');
const { evaluateAssertions } = require('../../trust-engine');
const { appendTimeline, transition, waitRecord } = require('./stateMachine');
const { hash } = require('../../connector-engine');

class WorkflowSuspended extends Error { constructor(wait) { super(`Workflow suspended for ${wait.type}.`); this.name = 'WorkflowSuspended'; this.code = 'WORKFLOW_SUSPENDED'; this.wait = wait; } }

class OrchestrationCoordinator {
  constructor({ store, dispatch = async () => {}, clock = () => new Date().toISOString(), compensate = async () => {} }) { if (!store) throw new Error('Coordinator requires store.'); this.store = store; this.dispatch = dispatch; this.clock = clock; this.compensate = compensate; }
  async pause(uid, runId, node, spec, checkpoint) {
    let run = await this.store.get(uid, runId); if (!run) throw new Error('Durable run not found.'); if (run.state !== 'running') throw new Error('Only a running orchestration may pause.');
    const created = waitRecord(run, node, spec, checkpoint, { clock: this.clock }); const { token, ...persisted } = created;
    run.waits[persisted.id] = persisted; run.cursor = { nodeId: node.id, phase: 'waiting', checkpointId: checkpoint?.id || null }; run.nodeState[node.id] = { state: 'waiting', input: checkpoint?.nodeInput, output: null, updatedAt: this.clock() };
    run = transition(run, 'waiting', { waitId: persisted.id, waitType: persisted.type, nodeId: node.id }, this.clock); await this.store.save(uid, run);
    return { ...persisted, token };
  }
  async signal(uid, runId, { correlationId, token, eventId, type, payload }) {
    let run = await this.store.get(uid, runId); if (!run || run.state !== 'waiting') throw new Error('Run is not waiting.');
    if (!eventId) throw new Error('Correlated event requires eventId.'); if ((run.processedEventIds || []).includes(eventId)) return { duplicate: true, run };
    const wait = Object.values(run.waits).find((item) => item.state === 'pending' && item.correlationId === correlationId); if (!wait) throw new Error('Matching wait not found.');
    if (wait.tokenHash !== hash(String(token || ''))) throw new Error('Invalid correlation token.'); if (type && type !== wait.type) throw new Error('Event type does not match wait.');
    const event = { id: eventId, type: type || wait.type, payload, receivedAt: this.clock() };
    if (wait.resumeWhen?.length) { const evaluation = evaluateAssertions(wait.resumeWhen, { input: payload, event: payload, run }); if (!evaluation.passed) throw new Error('Event did not satisfy wait conditions.'); }
    wait.receivedEvents.push(event); run.processedEventIds = [...(run.processedEventIds || []), eventId].slice(-500);
    run.timeline = appendTimeline(run, { kind: 'event_received', waitId: wait.id, eventId, eventType: event.type }, this.clock);
    if (wait.receivedEvents.length >= wait.requiredEvents) { wait.state = 'satisfied'; wait.satisfiedAt = this.clock(); run.nodeState[wait.nodeId] = { ...(run.nodeState[wait.nodeId] || {}), state: 'satisfied', output: wait.receivedEvents.map((item) => item.payload), updatedAt: this.clock() }; run = transition(run, 'queued', { waitId: wait.id, nodeId: wait.nodeId }, this.clock); await this.store.save(uid, run); await this.dispatch(uid, run.id); return { resumed: true, run }; }
    await this.store.save(uid, run); return { resumed: false, remainingEvents: wait.requiredEvents - wait.receivedEvents.length, run };
  }
  async processDue(uid, now = this.clock()) {
    const due = await this.store.listDue(uid, now); const results = [];
    for (let run of due) {
      const wait = Object.values(run.waits).find((item) => item.state === 'pending' && ((item.wakeAt && item.wakeAt <= now) || (item.timeoutAt && item.timeoutAt <= now))); if (!wait) continue;
      if (wait.wakeAt && wait.wakeAt <= now) { wait.state = 'satisfied'; wait.satisfiedAt = now; run.nodeState[wait.nodeId] = { ...(run.nodeState[wait.nodeId] || {}), state: 'satisfied', output: { wokeAt: now }, updatedAt: now }; run = transition(run, 'queued', { waitId: wait.id, reason: 'scheduled_wakeup' }, this.clock); await this.store.save(uid, run); await this.dispatch(uid, run.id); results.push({ runId: run.id, action: 'resumed' }); continue; }
      wait.state = 'timed_out'; wait.timedOutAt = now; run.timeline = appendTimeline(run, { kind: 'wait_timed_out', waitId: wait.id, escalation: wait.escalation || null }, this.clock);
      if (wait.escalation?.extendMs) { wait.state = 'pending'; wait.timeoutAt = new Date(Date.parse(now) + Number(wait.escalation.extendMs)).toISOString(); wait.escalationCount = Number(wait.escalationCount || 0) + 1; await this.store.save(uid, run); results.push({ runId: run.id, action: 'escalated' }); }
      else { run = transition(run, run.compensationStack?.length ? 'failed' : 'failed', { waitId: wait.id, reason: 'timeout' }, this.clock); await this.store.save(uid, run); if (run.compensationStack?.length) await this.runCompensation(uid, run.id); results.push({ runId: run.id, action: 'failed' }); }
    }
    return results;
  }
  async processAllDue(now = this.clock()) { if (typeof this.store.dueTenants !== 'function') throw new Error('Store does not support global due-wait scanning.'); const tenants = await this.store.dueTenants(now); const results = []; for (const uid of tenants) results.push(...await this.processDue(uid, now)); return results; }
  async claimResume(uid, runId, workflowFingerprint) { const leaseId = crypto.randomBytes(12).toString('hex'); const run = await this.store.claimResume(uid, runId, leaseId); if (!run) return null; if (run.workflowFingerprint !== workflowFingerprint) { run.state = 'failed'; run.timeline = appendTimeline(run, { kind: 'resume_rejected', reason: 'workflow_fingerprint_mismatch' }, this.clock); await this.store.save(uid, run); throw new Error('Workflow fingerprint changed; durable resume rejected.'); } return run; }
  async completeNode(uid, runId, nodeId, { input, output, compensation } = {}) { const run = await this.store.get(uid, runId); if (!run) throw new Error('Run not found.'); run.nodeState[nodeId] = { state: 'completed', input, output, completedAt: this.clock() }; if (compensation) run.compensationStack.push({ nodeId, action: compensation, state: 'pending' }); run.cursor = { nodeId, phase: 'after' }; run.timeline = appendTimeline(run, { kind: 'node_completed', nodeId }, this.clock); return this.store.save(uid, run); }
  async completeRun(uid, runId, details = {}) { let run = await this.store.get(uid, runId); if (!run) throw new Error('Run not found.'); if (run.state === 'completed') return run; if (run.state !== 'running') throw new Error('Only a running orchestration may complete.'); run = transition(run, 'completed', { resultFingerprint: details.resultFingerprint || null }, this.clock); run.lease = null; return this.store.save(uid, run); }
  async cancelRun(uid, runId, reason = 'cancel_requested') { let run = await this.store.get(uid, runId); if (!run) throw new Error('Run not found.'); if (run.state === 'cancelled') return run; if (!['created', 'running', 'waiting', 'queued'].includes(run.state)) throw new Error(`Run cannot be cancelled from ${run.state}.`); run = transition(run, 'cancelled', { reason }, this.clock); run.lease = null; return this.store.save(uid, run); }
  async failRun(uid, runId, error, details = {}) { let run = await this.store.get(uid, runId); if (!run) throw new Error('Run not found.'); if (['failed', 'compensated'].includes(run.state)) return run; if (run.state !== 'running') throw new Error('Only a running orchestration may fail.'); run = transition(run, 'failed', { error: error?.message || String(error || 'Workflow failed.'), code: error?.code || null, ...details }, this.clock); run.lease = null; await this.store.save(uid, run); return run.compensationStack?.length ? this.runCompensation(uid, runId) : run; }
  async claimEffect(uid, runId, nodeId, idempotencyKey) { return this.store.claimEffect(uid, runId, hash({ nodeId, idempotencyKey })); }
  async runCompensation(uid, runId) { let run = await this.store.get(uid, runId); if (!run) throw new Error('Run not found.'); if (run.state === 'failed') run = transition(run, 'compensating', {}, this.clock); for (const item of [...run.compensationStack].reverse()) { if (item.state === 'completed') continue; try { await this.compensate(item.action, { uid, runId, nodeId: item.nodeId }); item.state = 'completed'; item.completedAt = this.clock(); run.timeline = appendTimeline(run, { kind: 'compensation_completed', nodeId: item.nodeId }, this.clock); } catch (error) { item.state = 'failed'; item.error = error.message; run.timeline = appendTimeline(run, { kind: 'compensation_failed', nodeId: item.nodeId }, this.clock); await this.store.save(uid, run); throw error; } } run = transition(run, 'compensated', {}, this.clock); return this.store.save(uid, run); }
}

class OrchestrationRuntime {
  constructor({ coordinator, uid, runId, workflowFingerprint, maxInlineWaitMs = 30000 }) { this.coordinator = coordinator; this.uid = uid; this.runId = runId; this.workflowFingerprint = workflowFingerprint; this.maxInlineWaitMs = maxInlineWaitMs; }
  waitSpec(node) { if (node.type === 'approval') return { type: 'approval', timeoutMs: node.data?.timeoutMs, escalation: node.data?.escalation }; if (node.type === 'wait_for_event') return { type: node.data?.eventType || 'webhook', requiredEvents: node.data?.requiredEvents, timeoutMs: node.data?.timeoutMs, resumeWhen: node.data?.resumeWhen, escalation: node.data?.escalation }; if (node.type === 'wait_until') return { type: 'date', wakeAt: node.data?.at, timeoutAt: node.data?.timeoutAt }; if (node.type === 'wait' && Number(node.data?.ms || 0) > this.maxInlineWaitMs) return { type: 'date', wakeAt: new Date(Date.now() + Number(node.data.ms)).toISOString() }; return node.data?.waitFor || null; }
  async beforeNode(node, context = {}) { const spec = this.waitSpec(node); if (!spec) return null; const run = await this.coordinator.store.get(this.uid, this.runId); if (run?.nodeState?.[node.id]?.state === 'satisfied' || run?.nodeState?.[node.id]?.state === 'completed') return null; const checkpoint = { id: `orch-${this.runId}-${node.id}`, workflowFingerprint: this.workflowFingerprint, nodeId: node.id, nodeInput: context.stepParams || context.variables || {}, completedNodeIds: Object.entries(run?.nodeState || {}).filter(([, value]) => value.state === 'completed').map(([id]) => id) }; const wait = await this.coordinator.pause(this.uid, this.runId, node, spec, checkpoint); throw new WorkflowSuspended(wait); }
  async afterNode(node, output, context = {}) { return this.coordinator.completeNode(this.uid, this.runId, node.id, { input: context.stepParams || context.variables || {}, output, compensation: node.data?.compensation || null }); }
}
module.exports = { OrchestrationCoordinator, OrchestrationRuntime, WorkflowSuspended };
