# Deployment handoff (not executed)

## 1. Review and configure data policy

Merge `staging-cloud-run/firestore.rules.connector-snippet.rules` into the
production rules deliberately. Merge `staging-cloud-run/firestore.indexes.connector.json`
into the canonical index file. Enable Firestore TTL for Trust evidence and any
memory documents using `expiresAt`.

## 2. Build the no-traffic Cloud Run revision

Use an immutable image tag:

```powershell
gcloud builds submit --config GPT-Additions/staging-cloud-run/cloudbuild.yaml --substitutions _IMAGE=REGION-docker.pkg.dev/PROJECT/REPOSITORY/stanley-staging:TAG .
```

Deploy it as a staging service or no-traffic revision. Configure
`STANLEY_PROJECT_ID`, `VERTEX_LOCATION`, `CONNECTOR_MODEL`,
`RUNNER_INTERNAL_KEY`, and `ALLOWED_ORIGINS`.

## 3. Configure scale-to-zero scheduler wakeups

Create authenticated minute schedules for:

- `POST /internal/orchestrations/process-due`
- `POST /internal/outcome-monitors/process-due`

Send `X-Stanley-Internal-Key`; do not place that value in source control.

## 4. Compose the staging website

On a deployment branch or copied staging tree, run:

```powershell
node GPT-Additions/website-overlay/patchWebsite.js src/App.tsx src/components/Layout.tsx
node GPT-Additions/website-overlay/patchEditorAbilities.js src/views/Editor.tsx
npm.cmd run build
```

The patchers are idempotent and fail closed if their source anchors change.

## 5. Validate before traffic

Follow `staging-cloud-run/OPERATIONS.md`. At minimum test tenant isolation,
secret redaction, write approvals/idempotency, arbitrary waits across instance
termination, scheduler wakeups, skill zero-model execution, learning
shadow/canary rollback, memory isolation/deletion, signed webhook replay
protection, business reconciliation, SLO pause, and revision rollback.

Do not call the system production-ready until the image build and deployed smoke,
security, IAM, Firestore, schedule, webhook, vault, and rollback tests pass.
