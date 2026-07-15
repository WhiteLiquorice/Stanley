const crypto = require('crypto');
const { normalizeWorkflowContract, validateWorkflowInput } = require('../workflow-platform/contract');

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
class McpService {
  constructor({ db, loadWorkflow, submitRun, clock = () => new Date().toISOString() }) { Object.assign(this, { db, loadWorkflow, submitRun, clock }); }
  credential(uid) { return this.db.collection('stanley_users').doc(uid).collection('credentials').doc('mcp'); }
  async rotateKey(uid) { const secret = crypto.randomBytes(32).toString('base64url'); const key = `${Buffer.from(uid).toString('base64url')}.${secret}`; await this.credential(uid).set({ keyHash: digest(key), rotatedAt: this.clock() }); return key; }
  async authenticate(key) { const [encodedUid] = String(key || '').split('.'); if (!encodedUid) return null; let uid; try { uid = Buffer.from(encodedUid, 'base64url').toString('utf8'); } catch { return null; } const snap = await this.credential(uid).get(); if (!snap.exists) return null; const supplied = Buffer.from(digest(key)); const expected = Buffer.from(String(snap.data().keyHash || '')); return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected) ? uid : null; }
  async tools(uid) { const snap = await this.db.collection('stanley_users').doc(uid).collection('workflows').limit(200).get(); return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((workflow) => workflow.activeProductionReleaseId).map((workflow) => { const contract = normalizeWorkflowContract(workflow); return { name: `workflow_${workflow.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`, title: workflow.name, description: contract.description || `Run Stanley workflow ${workflow.name}`, inputSchema: contract.inputSchema, _meta: { workflowId: workflow.id, releaseId: workflow.activeProductionReleaseId } }; }); }
  async call(uid, name, args) { const tools = await this.tools(uid); const tool = tools.find((item) => item.name === name); if (!tool) throw Object.assign(new Error('MCP tool not found or not published.'), { code: -32602 }); const workflow = await this.loadWorkflow(uid, tool._meta.workflowId); validateWorkflowInput(workflow, args || {}); const run = await this.submitRun(uid, workflow.id, { input: args || {}, trigger: 'MCP', idempotencyKey: '' }); return { content: [{ type: 'text', text: JSON.stringify({ runId: run.id, state: run.state, output: run.output || run.scraped || null }) }], isError: run.state === 'failed' }; }
}
module.exports = { McpService, digest };
