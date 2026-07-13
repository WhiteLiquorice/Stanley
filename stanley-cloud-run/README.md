# Stanley Cloud API

An isolated Cloud Run execution API. It removes the browser's ability to submit
vault secrets and makes Firestore the source of truth for workflow execution.

Before execution, every workflow passes a deterministic contract check. This
requires one mission and one trigger, validates graph references and context
edges, caps agent steps, blocks custom code by default, and requires an explicit
approval node directly before an outbound side effect. The model may propose the
graph; only the validated graph may execute.

Automatic agentic recovery outside that graph is disabled by default in the
container build. Explicit `agent`/`ai_agent` nodes still run with their bounded
step limits. A workflow must set `executionPolicy.allowAgenticRecovery=true` to
authorize the broader recovery path.

## API contract

`POST /v1/workflows/:workflowId/runs`

- Requires a Firebase ID token in `Authorization: Bearer <token>`.
- Reads the workflow from `stanley_users/{uid}/workflows/{workflowId}`.
- Resolves that user's vault on the server.
- Persists the completed run in `stanley_users/{uid}/runs/{runId}`.
- Body is optional: `{ "input": { ... } }` for workflow interpolation.

`POST /v1/internal/workflows/:workflowId/runs`

- For trusted schedulers and webhooks only.
- Requires `X-Stanley-Internal-Key` and `{ "uid": "...", "input": { ... } }`.

## Deployment checklist

Use the repository-level `GPT-Additions/DEPLOYMENT.md` guide. It builds this API
with the existing browser engine and promotes it as a new revision of the
existing `stanley-runner` service; it does not create a second permanent Cloud
Run service.

The promoted revision needs `STANLEY_PROJECT_ID`, the existing
`RUNNER_INTERNAL_KEY` Secret Manager secret, exact Firebase Hosting origins in
`ALLOWED_ORIGINS`, and the same Firestore and Vertex AI permissions as the
current runner. Set the resulting service URL as `VITE_RUNNER_URL` during the
frontend build.

This can remain scale-to-zero before customers. The service URL stays available;
Cloud Run may cold-start the first request, but no always-on instance is required.

Approvals are preflight gates: the run is persisted as `pending_approval` before
browser work begins. Approval launches the full validated graph with approval
nodes converted to deterministic no-ops; rejection cancels it. This avoids
replaying side effects or pretending an in-memory browser can survive a pause.

## Deliberate transition boundary

`src/runnerAdapter.js` temporarily reuses the current Cloud Run engine so that
execution behavior is unchanged while the API boundary is proven. Promote the
engine into this directory only after this API passes staging validation.
