const mission = (prompt) => ({ id: 'mission', type: 'mission', label: 'Mission', data: { prompt } });
const context = (target = 'trigger') => ({ source: 'mission', target, kind: 'context' });

const goldenWorkflows = Object.freeze({
  apiOnlyRead: {
    id: 'gold-api-read', name: 'Golden API read', nodes: [mission('Read repositories.'), { id: 'trigger', type: 'trigger', label: 'Start', data: { url: 'https://example.com' } }, { id: 'read', type: 'integration', label: 'Read', data: { integrationName: 'github_list_repos', params: '{}' } }], edges: [context(), { source: 'trigger', target: 'read' }],
  },
  approvedWrite: {
    id: 'gold-approved-write', name: 'Golden approved write', nodes: [mission('Send one approved message.'), { id: 'trigger', type: 'trigger', label: 'Start', data: { url: 'https://example.com' } }, { id: 'approval', type: 'approval', label: 'Approve', data: { context: 'Send?' } }, { id: 'send', type: 'send_slack', label: 'Send', data: { webhook: 'vault:SlackWebhook' } }], edges: [context(), { source: 'trigger', target: 'approval' }, { source: 'approval', target: 'send' }],
  },
  monitoredNotification: {
    id: 'gold-monitor', name: 'Golden monitor', nodes: [mission('Notify after a verified change.'), { id: 'trigger', type: 'trigger', label: 'Start', data: { url: 'https://example.com' } }, { id: 'monitor', type: 'monitor', label: 'Observe', data: { selector: '#value' } }, { id: 'if', type: 'if', label: 'Changed?', data: { condition: { type: 'true' } } }, { id: 'approval', type: 'approval', label: 'Approve', data: { context: 'Notify?' } }, { id: 'email', type: 'send_email', label: 'Email', data: { to: 'owner@example.com' } }], edges: [context(), { source: 'trigger', target: 'monitor' }, { source: 'monitor', target: 'if' }, { source: 'if', target: 'approval', condition: { type: 'true' } }, { source: 'approval', target: 'email' }],
  },
  browserAgent: {
    id: 'gold-browser', name: 'Golden browser', nodes: [mission('Find a factual answer.'), { id: 'trigger', type: 'trigger', label: 'Start', data: { url: 'https://example.com' } }, { id: 'agent', type: 'agent', label: 'Research', data: { goal: 'Find the answer.', maxSteps: 3 } }], edges: [context(), { source: 'trigger', target: 'agent' }],
  },
});

module.exports = { goldenWorkflows };
