import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const claims = JSON.parse(fs.readFileSync(path.join(root, 'certification', 'advertised-use-cases.json'), 'utf8'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const failures = [];
try {
  const { BUILT_INS } = await server.ssrLoadModule('/src/views/Templates.tsx');
  for (const claim of claims) {
    const template = BUILT_INS.find((item) => item.templateId === claim.templateId);
    if (!fs.existsSync(path.join(root, claim.ad))) failures.push(`${claim.id}: rendered ad is missing`);
    if (!template) { failures.push(`${claim.id}: template ${claim.templateId} is missing`); continue; }
    const nodeTypes = new Set(template.workflow.nodes.map((node) => node.type));
    for (const type of claim.requiredNodeTypes) if (!nodeTypes.has(type)) failures.push(`${claim.id}: missing ${type} capability`);
    const targetDefault = Number(template.workflow.inputSchema?.properties?.targetCount?.default);
    if (targetDefault !== claim.expectedCount) failures.push(`${claim.id}: ad promises ${claim.expectedCount}, template defaults to ${targetDefault}`);
    const outputNode = template.workflow.nodes.find((node) => node.id === template.workflow.outputNodeId);
    if (outputNode?.type !== 'assertion') failures.push(`${claim.id}: declared output is not the fail-closed assertion`);
    const required = new Set(template.workflow.outputSchema?.items?.required || []);
    for (const field of claim.requiredOutputFields) if (!required.has(field)) failures.push(`${claim.id}: output does not require ${field}`);
  }
} finally {
  await server.close();
}

if (failures.length) {
  console.error(`Advertised use-case audit failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Advertised use-case audit passed: ${claims.length} ads map to count-matched, fail-closed executable templates.`);
