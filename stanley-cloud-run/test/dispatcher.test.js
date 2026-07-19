const test = require('node:test');
const assert = require('node:assert/strict');
const { createDispatcher, deterministicTaskId } = require('../src/dispatcher');

function mockClient({ duplicate = false } = {}) {
  const requests = [];
  return {
    requests,
    queuePath: (project, location, queue) => `projects/${project}/locations/${location}/queues/${queue}`,
    taskPath: (project, location, queue, task) => `projects/${project}/locations/${location}/queues/${queue}/tasks/${task}`,
    async createTask(request) {
      requests.push(request);
      if (duplicate) throw Object.assign(new Error('Task already exists'), { code: 6 });
    },
  };
}

const env = {
  CLOUD_TASKS_QUEUE: 'runs',
  CLOUD_TASKS_LOCATION: 'us-central1',
  RUNNER_SERVICE_URL: 'https://runner.example.test',
  RUNNER_INTERNAL_KEY: 'internal',
  STANLEY_DETERMINISTIC_TASK_DISPATCH: 'true',
};

test('deterministic dispatch names are stable per logical delivery', async () => {
  const client = mockClient();
  const dispatcher = createDispatcher({ projectId: 'project', inlineExecutor: async () => {}, client, env });
  await dispatcher.dispatch('user', 'run', 0, { dispatchKey: 'attempt:1' });
  const expected = deterministicTaskId('user', 'run', 'attempt:1');
  assert.match(client.requests[0].task.name, new RegExp(`${expected}$`));
  assert.equal(JSON.parse(Buffer.from(client.requests[0].task.httpRequest.body, 'base64').toString()).uid, 'user');
});

test('a repeated logical delivery is accepted as an idempotent duplicate', async () => {
  const client = mockClient({ duplicate: true });
  const dispatcher = createDispatcher({ projectId: 'project', inlineExecutor: async () => {}, client, env });
  const result = await dispatcher.dispatch('user', 'run', 0, { dispatchKey: 'approval:1' });
  assert.deepEqual(result, { queued: true, duplicate: true });
});
