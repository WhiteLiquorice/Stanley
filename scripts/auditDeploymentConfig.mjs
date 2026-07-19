import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { throw new Error(`Deployment configuration audit failed: ${message}`); };

const firebase = JSON.parse(read('firebase.json'));
if (firebase.firestore?.rules !== 'firestore.rules') fail('firebase.json must deploy firestore.rules.');
if (firebase.firestore?.indexes !== 'firestore.indexes.json') fail('firebase.json must deploy firestore.indexes.json.');

const indexes = JSON.parse(read('firestore.indexes.json'));
const hasSchedule = indexes.indexes?.some((index) => index.collectionGroup === 'schedules' && index.queryScope === 'COLLECTION_GROUP' && index.fields?.some((field) => field.fieldPath === 'enabled') && index.fields?.some((field) => field.fieldPath === 'nextRunMs'));
if (!hasSchedule) fail('the due-schedule collection-group index is missing.');
const hasTenantOverride = indexes.fieldOverrides?.some((override) => override.collectionGroup === 'versions' && override.fieldPath === 'tenantId' && override.indexes?.some((index) => index.queryScope === 'COLLECTION_GROUP' && index.order === 'ASCENDING'));
if (!hasTenantOverride) fail('the versions.tenantId collection-group ascending index is missing.');

const rules = read('firestore.rules');
if (/match \/\{document=\*\*\}\s*\{\s*allow read, write: if isOwner\(\)/m.test(rules)) fail('the owner wildcard exposes server-owned runtime records.');
for (const collection of ['workflows', 'vault', 'schedules', 'triggers', 'runs']) if (!rules.includes(`match /${collection}/`)) fail(`explicit ${collection} rules are missing.`);

const triggers = read('functions/stanleyTriggers.js');
if (!triggers.includes('/v1/internal/workflows/${workflowId}/runs')) fail('Functions still target the legacy internal runner route.');
if (!triggers.includes('await invokeRunner({')) fail('webhook submission is not awaited.');
if (!triggers.includes('idempotencyKey: `schedule:')) fail('scheduled submissions lack deterministic idempotency.');

const exampleEnv = read('.env.example');
if (!exampleEnv.includes('VITE_CONVERSATION_PLANNER_ENABLED=true')) fail('the production planner build flag is undocumented.');
const dockerfile = read('stanley-cloud-run/Dockerfile');
if (!dockerfile.includes('STANLEY_RELIABILITY_V2=true')) fail('the production reliability profile is not enabled in the image.');
const runnerReadme = read('stanley-cloud-run/README.md');
for (const key of ['CLOUD_TASKS_QUEUE', 'CLOUD_TASKS_LOCATION', 'RUNNER_SERVICE_URL']) if (!runnerReadme.includes(key)) fail(`the deployment checklist omits ${key}.`);

console.log('Deployment configuration audit passed: rules, indexes, triggers, planner flag, reliability profile, and queue requirements are declared.');
