const crypto = require('crypto');
const { stableStringify } = require('./evidence');

function workflowFingerprint(workflow) {
  const executable = {
    id: workflow.id || null,
    nodes: workflow.nodes || [],
    edges: workflow.edges || [],
    assertions: workflow.assertions || [],
    trustPolicy: workflow.trustPolicy || {},
  };
  return crypto.createHash('sha256').update(stableStringify(executable)).digest('hex');
}

function buildResumePlan(workflow, checkpoint) {
  if (!checkpoint || checkpoint.resumable === false) throw new Error('Checkpoint is not resumable.');
  const expected = workflowFingerprint(workflow);
  const stored = checkpoint.workflowFingerprint || checkpoint.state?.workflowFingerprint;
  if (!stored) throw new Error('Checkpoint does not identify its workflow version.');
  if (stored !== expected) throw new Error('Workflow changed after this checkpoint; create a new run or explicitly migrate it.');
  const completedNodeIds = Array.isArray(checkpoint.state?.completedNodeIds)
    ? [...new Set(checkpoint.state.completedNodeIds.filter(Boolean))]
    : [];
  return {
    checkpointId: checkpoint.id,
    sequence: Number(checkpoint.sequence || 0),
    resumeAfterNodeId: checkpoint.phase === 'after' ? checkpoint.nodeId : null,
    completedNodeIds,
    workflowFingerprint: expected,
  };
}

function shouldSkipCompletedNode(node, resumePlan) {
  return Boolean(node?.id && resumePlan?.completedNodeIds?.includes(node.id));
}

module.exports = { buildResumePlan, shouldSkipCompletedNode, workflowFingerprint };
