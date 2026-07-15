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

This endpoint is the draft/manual test surface. Public generated clients use
`POST /v1/workflows/:workflowId/invoke`, which fails closed until a tested
release has been promoted through test and staging to production, then always
executes that immutable production snapshot.

`POST /v1/internal/workflows/:workflowId/runs`

- For trusted schedulers and webhooks only.
- Requires `X-Stanley-Internal-Key` and `{ "uid": "...", "input": { ... } }`.

## Workflow platform

- `GET|PUT /v1/workflows/:workflowId/platform` manages typed input/output
  contracts, model budgets, context budgets, and regression fixtures.
- `/v1/workflows/:workflowId/releases` creates immutable snapshots. A release
  must pass shadow-safe regressions before sequential test, staging, and
  production promotion; tested snapshots may be used as rollback targets.
- `POST /v1/workflows/:workflowId/debug` runs through a selected node while
  replacing side-effecting nodes with deterministic waits.
- `GET /v1/workflows/:workflowId/clients` emits curl, JavaScript, Python, and
  OpenAPI clients for the production invocation endpoint.
- `POST /v1/runs/:runId/replay` replays the original private input and release.

## MCP and artifacts

`POST /v1/mcp/key` rotates the tenant MCP key. The JSON-RPC endpoint is
`POST /mcp`; only workflows with a promoted production release appear in
`tools/list`. Workflow `mcp_tool` nodes negotiate Streamable HTTP
initialization/session state before invoking remote tools.

Tenant artifacts are available at `/v1/artifacts`. Uploads and browser
downloads are capped at 10 MiB, stored under tenant-scoped Storage paths, and
may be listed, downloaded by short-lived signed URL, or deleted. Browser
`upload_file` and `download_file` nodes use these records rather than arbitrary
container paths.

## Deployment checklist

Use standard Cloud Run deployment commands from this directory. Build this API
with the existing browser engine and promote it as a new revision of the
existing `stanley-runner` (or `stanley-engine`) service:

```bash
gcloud run deploy stanley-engine --source . --region us-central1 --allow-unauthenticated --project=bridgeway-db29e
```

The promoted revision needs `STANLEY_PROJECT_ID`, the existing
`RUNNER_INTERNAL_KEY` Secret Manager secret, exact Firebase Hosting origins in
`ALLOWED_ORIGINS`, and the same Firestore and Vertex AI permissions as the
current runner. Set the resulting service URL as `VITE_RUNNER_URL` during the
frontend build.

Also configure `ARTIFACT_BUCKET`. Store `BROWSER_SESSION_ENCRYPTION_KEY` as a
32-byte Secret Manager value rather than in `env.yaml`; encrypted browser
session persistence and takeover snapshots fail closed without it. Model
routing recognizes `VISION_MODEL`, `EXTRACTION_MODEL`, `QUALITY_MODEL`, and an
optional `FALLBACK_MODEL`. Storage artifact records include `expiresAt`; enable
Firestore TTL for that field and a matching Cloud Storage lifecycle policy for
automatic retention cleanup.

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
