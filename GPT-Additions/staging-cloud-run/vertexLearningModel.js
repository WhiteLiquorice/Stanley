const crypto = require('crypto');
const { callConnectorModel } = require('./vertexConnectorModel');

async function proposeRepairOperations(request) {
  const system = `You are Stanley's constrained repair proposer. Return one JSON object only. Use only operation types and node-data keys supplied by the caller. Never add code, URLs, credentials, workflow nodes, edges, integrations, or side effects. Prefer the smallest single change. Schema: {"rationale":"short","operations":[{"type":"update_node_data","nodeId":"existing id","changes":{"selector":"string"}}]}.`;
  const user = JSON.stringify({ failure: request.learningCase, workflow: request.workflow, allowedOperations: request.allowedOperations, allowedNodeDataKeys: request.allowedNodeDataKeys });
  const result = await callConnectorModel({ system, user }); let parsed;
  try { parsed = JSON.parse(result.text); } catch { throw new Error('Learning proposer returned invalid JSON.'); }
  return { rationale: parsed.rationale, operations: parsed.operations, model: result.model, callId: crypto.createHash('sha256').update(result.text).digest('hex').slice(0, 20) };
}

module.exports = { proposeRepairOperations };
