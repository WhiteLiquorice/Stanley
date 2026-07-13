const { CloudTasksClient } = require('@google-cloud/tasks');

function createDispatcher({ projectId, inlineExecutor }) {
  const location = process.env.CLOUD_TASKS_LOCATION || 'us-central1';
  const queue = process.env.CLOUD_TASKS_QUEUE || '';
  const serviceUrl = (process.env.RUNNER_SERVICE_URL || '').replace(/\/$/, '');
  const internalKey = process.env.RUNNER_INTERNAL_KEY || '';

  if (!queue || !serviceUrl) {
    return { mode: 'inline', dispatch: (uid, runId) => inlineExecutor(uid, runId) };
  }

  const client = new CloudTasksClient();
  const parent = client.queuePath(projectId, location, queue);
  return {
    mode: 'cloud-tasks',
    async dispatch(uid, runId, delaySeconds = 0) {
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
      if (delaySeconds > 0) task.scheduleTime = { seconds: Math.floor(Date.now() / 1000) + delaySeconds };
      await client.createTask({ parent, task });
      return { queued: true };
    },
  };
}

module.exports = { createDispatcher };
