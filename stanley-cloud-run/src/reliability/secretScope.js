const { getOperation } = require('../native-integration-engine');

function collectVaultReferences(value, found = new Set(), seen = new WeakSet()) {
  if (typeof value === 'string') {
    const matches = value.matchAll(/vault:([A-Za-z0-9_.:-]{1,128})/g);
    for (const match of matches) found.add(match[1]);
    return found;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return found;
  seen.add(value);
  if (typeof value.vaultKey === 'string') found.add(value.vaultKey.replace(/^vault:/, ''));
  if (Array.isArray(value.requiredVaultRefs)) value.requiredVaultRefs.forEach((ref) => found.add(String(ref)));
  if (value.type === 'integration' || value.type === 'native_integration') {
    const operation = getOperation(value.data?.integrationName || value.data?.integrationType);
    operation?.requiredVaultRefs?.forEach((ref) => found.add(ref));
  }
  for (const child of Object.values(value)) collectVaultReferences(child, found, seen);
  return found;
}

module.exports = { collectVaultReferences };
