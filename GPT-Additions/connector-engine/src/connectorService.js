const { createFailureCase } = require('../../learning-engine');
const { createArtifact, fingerprint, hash } = require('./artifact');
const { inspectArtifact, executeConnector } = require('./connectorExecutor');
const { generateArtifact } = require('./generation');
const { approveArtifact, assertPublishable, createNextVersion, transition } = require('./lifecycle');
const { runConnectorRegressions } = require('./regression');
const { applyRepairProposal, buildRepairRequest, createRepairProposal, parseRepairResponse } = require('./repair');
const { redact } = require('./redaction');

function failureFingerprint(artifact, error) {
  return hash({ connectorId: artifact.connectorId, version: artifact.version, code: error.code || error.name || 'Error', message: String(error.message || '').toLowerCase().replace(/https?:\/\/\S+/g, '[url]').replace(/\b\d+\b/g, '[number]').slice(0, 500) });
}

class ConnectorService {
  constructor({ store, trustStore = null, learningStore = null, callModel = null, clock = () => new Date().toISOString() }) {
    if (!store) throw new Error('ConnectorService requires a store.');
    this.store = store; this.trustStore = trustStore; this.learningStore = learningStore; this.callModel = callModel; this.clock = clock;
  }
  discover(tenantId, fields) {
    return { schemaVersion: 1, discoveryId: fields.discoveryId || `discovery-${hash({ tenantId, goal: fields.goal, operationName: fields.operationName }).slice(0, 16)}`, tenantId, state: 'discovered', goal: String(fields.goal || '').slice(0, 2000), operationName: fields.operationName, readWrite: fields.readWrite || 'read', targetDomains: fields.targetDomains || [], allowedMethods: fields.allowedMethods || ['GET'], requiredVaultRefs: fields.requiredVaultRefs || [], createdAt: this.clock(), ...redact(fields) };
  }
  async generate(discovery) { const artifact = await generateArtifact({ discovery, callModel: this.callModel, now: this.clock() }); return this.store.create(artifact); }
  async createDraft(fields) { return this.store.create(createArtifact(fields, { now: this.clock() })); }
  async inspect(tenantId, connectorId, version) {
    const artifact = await this.requireVersion(tenantId, connectorId, version); const inspectionResult = await inspectArtifact(artifact, { force: true });
    const next = transition(artifact, 'inspected', { inspectionResult }, { now: this.clock() }); return this.store.saveDraft(next);
  }
  async test(tenantId, connectorId, version, secrets = {}) {
    const artifact = await this.requireVersion(tenantId, connectorId, version); if (artifact.publicationState !== 'inspected') throw new Error('Connector must pass inspection before testing.');
    const report = await runConnectorRegressions({ artifact, secrets, now: this.clock() });
    const next = transition(artifact, 'tested', { testResults: [report] }, { now: this.clock() }); return this.store.saveDraft(next);
  }
  async approve(tenantId, connectorId, version, approvedBy) { const artifact = await this.requireVersion(tenantId, connectorId, version); return this.store.saveDraft(approveArtifact(artifact, approvedBy, { now: this.clock() })); }
  async publish(tenantId, connectorId, version) { const artifact = await this.requireVersion(tenantId, connectorId, version); assertPublishable(artifact); return this.store.publish({ ...artifact, publishedAt: this.clock() }); }
  async execute({ tenantId, connectorId, version, input = {}, secrets = {}, approval, mode = 'live', runId = null, workflowId = null, nodeId = null }) {
    const artifact = version ? await this.requireVersion(tenantId, connectorId, version) : await this.store.getActive(tenantId, connectorId);
    if (!artifact) throw new Error('No active connector version was found.');
    if (!approval && artifact.readWrite === 'write' && mode !== 'shadow') {
      const recorded = [...(artifact.approvalHistory || [])].reverse().find((item) => item.action === 'approved' && item.fingerprint === artifact.fingerprint && item.approvedBy?.uid);
      if (recorded) approval = { approvedBy: recorded.approvedBy.uid, connectorFingerprint: artifact.fingerprint, version: artifact.version, approvedAt: recorded.approvedAt };
    }
    const occurredAt = this.clock();
    try {
      const execution = await executeConnector(artifact, input, secrets, { approval, mode });
      await this.store.recordExecution(tenantId, connectorId, artifact.version, { success: true, durationMs: execution.durationMs, executionCostMicros: execution.executionCostMicros, occurredAt });
      if (this.trustStore && runId) await this.trustStore.writeReceipt(tenantId, { runId, workflowId, nodeId, kind: 'connector_execution', outcome: mode === 'shadow' ? 'simulated' : 'verified', mode, evidence: { connectorId, version: artifact.version, assertions: execution.assertions, durationMs: execution.durationMs } });
      return { ...execution, connectorId, version: artifact.version };
    } catch (error) {
      const groupedFingerprint = failureFingerprint(artifact, error);
      const currentGroup = await this.store.getFailureGroup(tenantId, connectorId, groupedFingerprint).catch(() => null);
      const occurrenceCount = Number(currentGroup?.occurrenceCount || 0) + 1;
      const health = await this.store.recordExecution(tenantId, connectorId, artifact.version, { success: false, durationMs: Number(error.details?.durationMs || 0), occurredAt, failureFingerprint: groupedFingerprint, occurrenceCount, code: error.code, message: error.message });
      const total = Number(health.successCount || 0) + Number(health.failureCount || 0); const failureRate = total ? Number(health.failureCount || 0) / total : 0;
      if (artifact.repairProposalId && artifact.rollbackVersion && artifact.healthPolicy?.autoRollbackRepairs !== false && total >= Number(artifact.healthPolicy?.minRuns || 5) && failureRate > Number(artifact.healthPolicy?.maxFailureRate || 0.25)) {
        await this.store.setActiveVersion(tenantId, connectorId, artifact.rollbackVersion);
      }
      if (this.trustStore && runId) {
        await this.trustStore.writeReceipt(tenantId, { runId, workflowId, nodeId, kind: 'connector_execution', outcome: 'failed', mode, evidence: { connectorId, version: artifact.version, code: error.code, message: error.message, failureFingerprint: groupedFingerprint } });
        await this.trustStore.openException(tenantId, { runId, workflowId, nodeId, kind: 'connector_failure', title: `${artifact.name} connector needs attention`, summary: error.message, evidence: { connectorId, version: artifact.version, code: error.code, failureFingerprint: groupedFingerprint } });
      }
      if (this.learningStore) {
        const learningCase = createFailureCase({ workflowId: workflowId || `connector:${connectorId}`, runId, nodeId, nodeType: 'connector', error, url: `https://${artifact.targetDomains[0]}`, nodeData: { connectorId, version: artifact.version, operationName: artifact.operationName } }, { now: occurredAt });
        learningCase.connectorId = connectorId; learningCase.connectorVersion = artifact.version; learningCase.fingerprint = groupedFingerprint; learningCase.occurrenceCount = occurrenceCount;
        await this.learningStore.upsertFailureCase(tenantId, learningCase);
      }
      throw error;
    }
  }
  async createRepair(tenantId, connectorId, version, { failureFingerprint: grouped, proposedSource, rationale, modelMetadata, force = false }) {
    const artifact = await this.requireVersion(tenantId, connectorId, version); const failureGroup = await this.store.getFailureGroup(tenantId, connectorId, grouped);
    const proposal = createRepairProposal({ artifact, failureGroup, proposedSource, rationale, modelMetadata }, { force, now: this.clock() });
    return this.store.saveRepairProposal(tenantId, connectorId, proposal);
  }
  async proposeRepair(tenantId, connectorId, version, grouped) {
    if (typeof this.callModel !== 'function') throw new Error('Repair model is not configured.');
    const artifact = await this.requireVersion(tenantId, connectorId, version); const failureGroup = await this.store.getFailureGroup(tenantId, connectorId, grouped);
    const response = await this.callModel(buildRepairRequest(artifact, failureGroup)); const parsed = parseRepairResponse(response);
    return this.createRepair(tenantId, connectorId, version, { failureFingerprint: grouped, proposedSource: parsed.source, rationale: parsed.rationale, modelMetadata: { model: response?.model, proposedAt: this.clock(), costMicros: response?.costMicros || 0 } });
  }
  async applyStoredRepair(tenantId, connectorId, version, proposalId, options = {}) { const proposal = await this.store.getRepairProposal(tenantId, connectorId, proposalId); if (!proposal) throw new Error('Repair proposal not found.'); return this.applyRepair(tenantId, connectorId, version, proposal, options); }
  async applyRepair(tenantId, connectorId, version, proposal, options = {}) { const artifact = await this.requireVersion(tenantId, connectorId, version); const candidate = applyRepairProposal(artifact, proposal, { ...options, now: this.clock() }); candidate.fingerprint = fingerprint(candidate); return this.store.create(candidate); }
  async rollback(tenantId, connectorId, version, approvedBy) { if (!approvedBy?.uid) throw new Error('Rollback requires a human actor.'); return this.store.setActiveVersion(tenantId, connectorId, version); }
  async promoteShared(tenantId, connectorId, version, approvedBy) {
    const artifact = await this.requireVersion(tenantId, connectorId, version);
    if (artifact.publicationState !== 'published' || !approvedBy?.uid) throw new Error('Only a human-approved published connector may be proposed for sharing.');
    if (artifact.requiredVaultRefs.length || /tenant|customer|workspace/i.test(artifact.source)) throw new Error('Shared connector source must not contain tenant-specific values or vault references.');
    const shared = createArtifact({ ...artifact, tenantId: 'shared', version: 'v1', visibility: 'shared', publicationState: 'generated', tenantSpecificDataRemoved: true, approvalPolicy: { required: true, scope: 'shared_version' }, approvalHistory: [], testResults: [], inspectionResult: null, successCount: 0, failureCount: 0, rollbackVersion: null }, { now: this.clock() });
    return this.store.create(shared);
  }
  async nextVersion(tenantId, connectorId, version, changes, options = {}) { const current = await this.requireVersion(tenantId, connectorId, version); const next = createNextVersion(current, changes, { ...options, now: this.clock() }); next.fingerprint = fingerprint(next); return this.store.create(next); }
  async requireVersion(tenantId, connectorId, version) { const artifact = await this.store.get(tenantId, connectorId, version); if (!artifact) throw new Error('Connector version not found.'); if (artifact.tenantId !== tenantId) throw new Error('Connector tenant mismatch.'); return artifact; }
}

module.exports = { ConnectorService, failureFingerprint };
