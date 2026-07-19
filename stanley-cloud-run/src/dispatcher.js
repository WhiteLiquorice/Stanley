const { CloudTasksClient } = require('@google-cloud/tasks');
const crypto = require('crypto');
const { isReliabilityEnabled } = require('./reliability');

function deterministicTaskId(uid, runId, dispatchKey) {
  return `run-${crypto.createHash('sha256').update(`${uid}:${runId}:${dispatchKey}`).digest('hex').slice(0, 40)}`;
}

function createDispatcher({ projectId, inlineExecutor, client: suppliedClient = null, env = process.env }) {
  const location = env.CLOUD_TASKS_LOCATION || 'us-central1';
  const queue = env.CLOUD_TASKS_QUEUE || '';
  const serviceUrl = (env.RUNNER_SERVICE_URL || '').replace(/\/$/, '');
  const internalKey = env.RUNNER_INTERNAL_KEY || '';

  if (!queue || !serviceUrl) {
    return { mode: 'inline', dispatch: (uid, runId) => inlineExecutor(uid, runId) };
  }

  const client = suppliedClient || new CloudTasksClient();
  const parent = client.queuePath(projectId, location, queue);
  return {
    mode: 'cloud-tasks',
    async dispatch(uid, runId, delaySeconds = 0, options = {}) {
      const task = {
        httpRequest: {
          httpMethod: 'POST',
          url: `${serviceUrl}/v1/internal/runs/${encodeURIComponent(runId)}/execute`,
          headers: {
            'Content-Type': 'application/json',
            'X-Stanley-Internal-Key': internalKey,
          },
          body: Buffer.from(JSON.stringify({ uid })).toString('base64'),
        },
      };
      if (isReliabilityEnabled('DETERMINISTIC_TASK_DISPATCH', env)) {
        const dispatchKey = String(options.dispatchKey || 'initial');
        task.name = client.taskPath(projectId, location, queue, deterministicTaskId(uid, runId, dispatchKey));
      }
      if (delaySeconds > 0) task.scheduleTime = { seconds: Math.floor(Date.now() / 1000) + delaySeconds };
      try {
        await client.createTask({ parent, task });
        return { queued: true, duplicate: false };
      } catch (error) {
        if (task.name && (error?.code === 6 || /already exists/i.test(error?.message || ''))) {
          return { queued: true, duplicate: true };
        }
        throw error;
      }
    },
  };
}

module.exports = { createDispatcher, deterministicTaskId };
