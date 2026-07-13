const { evaluateAssertions } = require('./assertions');
const { redactEvidence } = require('./evidence');
const { prepareTrustWorkflow, validateTrustConfiguration } = require('./trustPolicy');
const { buildResumePlan, shouldSkipCompletedNode, workflowFingerprint } = require('./resume');

class TrustConfigurationError extends Error {
  constructor(issues) {
    super(`Invalid trust configuration: ${issues.join(' ')}`);
    this.name = 'TrustConfigurationError';
    this.issues = issues;
  }
}

class TrustRuntime {
  constructor({ store, uid, runId, workflow, overrides = {}, resumeCheckpoint = null }) {
    if (!store || !uid || !runId || !workflow) throw new Error('TrustRuntime requires store, uid, runId, and workflow.');
    const validation = validateTrustConfiguration(workflow, overrides);
    if (!validation.valid) throw new TrustConfigurationError(validation.issues);
    const prepared = prepareTrustWorkflow(workflow, overrides);
    this.store = store;
    this.uid = uid;
    this.runId = runId;
    this.workflowId = workflow.id || null;
    this.originalWorkflow = workflow;
    this.workflow = prepared.workflow;
    this.policy = prepared.policy;
    this.assertions = prepared.assertions;
    this.plannedActions = prepared.plannedActions;
    this.workflowFingerprint = workflowFingerprint(workflow);
    this.resumePlan = resumeCheckpoint ? buildResumePlan(workflow, resumeCheckpoint) : null;
    this.completedNodeIds = new Set(this.resumePlan?.completedNodeIds || []);
    this.sequence = this.resumePlan?.sequence || 0;
  }

  async begin(input = {}) {
    const checkpoint = await this.checkpoint(null, this.resumePlan ? 'run_resumed' : 'run_started', { input });
    if (!this.resumePlan) {
      for (const action of this.plannedActions) {
        await this.receipt('planned_side_effect', action.nodeId, 'simulated', { action });
      }
    }
    return {
      workflow: this.workflow,
      policy: this.policy,
      checkpoint,
      plannedActions: this.plannedActions,
    };
  }

  async beforeNode(node, context = {}) {
    if (!this.policy.checkpointEveryNode) return null;
    return this.checkpoint(node.id, 'before', {
      nodeType: node.type,
      context: summarizeContext(context),
    });
  }

  async afterNode(node, output, context = {}) {
    if (node?.id) this.completedNodeIds.add(node.id);
    const outcome = node.data?.trustShadowed ? 'simulated' : 'succeeded';
    if (this.policy.requireProofReceipts) {
      await this.receipt('node_execution', node.id, outcome, {
        nodeType: node.data?.trustOriginalType || node.type,
        output,
      });
    }
    if (!this.policy.checkpointEveryNode) return null;
    return this.checkpoint(node.id, 'after', {
      nodeType: node.type,
      output,
      context: summarizeContext(context),
    });
  }

  async nodeFailed(node, error, context = {}) {
    const evidence = {
      nodeType: node?.type,
      error: { name: error?.name, message: error?.message, code: error?.code },
      context: summarizeContext(context),
    };
    await this.receipt('node_execution', node?.id, 'failed', evidence);
    if (!this.policy.openExceptionOnFailure) return null;
    return this.store.openException(this.uid, {
      runId: this.runId,
      workflowId: this.workflowId,
      nodeId: node?.id,
      kind: 'execution_failure',
      title: `${node?.label || node?.type || 'Workflow step'} failed`,
      summary: error?.message || 'The step failed without an error message.',
      evidence,
    });
  }

  async finish({ input = {}, scraped = {}, run = {} } = {}) {
    const evaluation = evaluateAssertions(this.assertions, { input, scraped, run });
    for (const result of evaluation.results) {
      await this.receipt('assertion', result.id, result.passed ? 'passed' : 'failed', { assertion: result });
    }
    if (evaluation.failures.length && this.policy.openExceptionOnAssertionFailure) {
      await this.store.openException(this.uid, {
        runId: this.runId,
        workflowId: this.workflowId,
        kind: 'assertion_failure',
        severity: evaluation.passed ? 'warning' : 'error',
        title: `${evaluation.failures.length} workflow assertion${evaluation.failures.length === 1 ? '' : 's'} failed`,
        summary: evaluation.failures.map((failure) => failure.message || failure.label).join('; '),
        evidence: { failures: evaluation.failures },
      });
    }
    await this.checkpoint(null, evaluation.passed ? 'run_completed' : 'needs_attention', {
      assertionSummary: { passed: evaluation.passed, failures: evaluation.failures.length },
    });
    await this.receipt('run_outcome', null, evaluation.passed ? 'verified' : 'unverified', {
      assertions: evaluation.results,
      mode: this.policy.mode,
    });
    return {
      verified: evaluation.passed,
      mode: this.policy.mode,
      assertions: evaluation.results,
      failures: evaluation.failures,
      plannedActions: this.plannedActions,
    };
  }

  async checkpoint(nodeId, phase, state = {}) {
    this.sequence += 1;
    return this.store.writeCheckpoint(this.uid, this.runId, {
      sequence: this.sequence,
      nodeId,
      phase,
      workflowFingerprint: this.workflowFingerprint,
      retentionDays: this.policy.evidenceRetentionDays,
      state: redactEvidence({
        ...state,
        workflowFingerprint: this.workflowFingerprint,
        completedNodeIds: [...this.completedNodeIds],
      }),
      resumable: phase === 'after' || phase === 'run_started' || phase === 'run_resumed' || phase === 'needs_attention',
    });
  }

  shouldSkip(node) {
    return shouldSkipCompletedNode(node, this.resumePlan);
  }

  receipt(kind, nodeId, outcome, evidence = {}) {
    return this.store.writeReceipt(this.uid, {
      runId: this.runId,
      workflowId: this.workflowId,
      nodeId,
      kind,
      outcome,
      mode: this.policy.mode,
      policy: this.policy,
      evidence,
    });
  }
}

function summarizeContext(context = {}) {
  return redactEvidence({
    lastError: context.lastError ? { message: context.lastError.message } : null,
    lastConditionResult: context.lastConditionResult,
    lastScrape: context.lastScrape,
    data: context.data,
  }, { maxStringLength: 500 });
}

module.exports = { TrustConfigurationError, TrustRuntime, summarizeContext };
