import { createServer } from 'vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateWorkflow } = require('../stanley-cloud-run/src/workflowContract.js');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const module = await server.ssrLoadModule('/src/views/Templates.tsx');
  const result = module.validateBuiltInTemplates(module.BUILT_INS);
  for (const template of module.BUILT_INS) validateWorkflow({ name: template.name, ...template.workflow, requiredVaultRefs: template.requiredVaultRefs });
  if (result.aiTemplates < 3) throw new Error('The catalog needs at least three explicitly AI-assisted templates.');
  console.log(`Built-in template audit passed: ${result.templates} executable templates, ${result.aiTemplates} explicitly AI-assisted.`);
} finally {
  await server.close();
}
