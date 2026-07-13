const { hash } = require('../../connector-engine');

const FALLBACK_CODES = new Set(['NOT_PUBLISHED', 'PYTHON_UNAVAILABLE', 'INSPECTION_FAILED', 'VAULT_POLICY_VIOLATION']);

function goalKey(goal, url) {
  let origin = ''; try { const parsed = new URL(url); origin = `${parsed.origin}${parsed.pathname}`; } catch {}
  return hash({ goal: String(goal || '').trim().toLowerCase(), url: origin });
}

function createConnectorRuntime({ service, resolveSecrets, logger = () => {} }) {
  if (!service) throw new Error('Connector runtime requires ConnectorService.');
  async function select({ uid, node, goal, url }) {
    if (node?.data?.connectorId) return service.store.getActive(uid, node.data.connectorId);
    let host = ''; try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
    const candidates = await service.store.list(uid, { state: 'published' });
    const key = goalKey(goal, url);
    return candidates.find((artifact) => artifact.targetDomains.includes(host) && (artifact.generationMetadata?.goalKey === key || artifact.operationName === node?.data?.operationName)) || null;
  }
  return {
    async executeForNode({ uid, runId, workflowId, node, goal, url, input = {}, approval, trustMode = 'live' }) {
      const artifact = await select({ uid, node, goal, url });
      if (!artifact) return { executed: false, reason: 'unavailable' };
      try {
        const secrets = await resolveSecrets(uid, artifact.requiredVaultRefs);
        const result = await service.execute({ tenantId: uid, connectorId: artifact.connectorId, version: artifact.version, input: { ...input, ...(node.data?.connectorInput || {}) }, secrets, approval, mode: trustMode, runId, workflowId, nodeId: node.id });
        logger({ kind: 'connector_execution', connectorId: artifact.connectorId, version: artifact.version, success: true });
        return { executed: true, result: result.output, connectorId: artifact.connectorId, version: artifact.version };
      } catch (error) {
        logger({ kind: 'connector_execution', connectorId: artifact.connectorId, version: artifact.version, success: false, code: error.code });
        if (FALLBACK_CODES.has(error.code)) return { executed: false, reason: error.code.toLowerCase() };
        throw error;
      }
    },
    goalKey,
  };
}

module.exports = { FALLBACK_CODES, createConnectorRuntime, goalKey };
