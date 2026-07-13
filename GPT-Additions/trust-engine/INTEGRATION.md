# Trust Engine integration

This package is ready to integrate after the Cloud Run consolidation issue in
`../CURRENT_STACK_AUDIT.md` is repaired.

## 1. Mount the Trust API

Create one `TrustStore` with the Cloud Run process's existing Firestore Admin
client, then mount the router after the existing authentication helper is
defined:

```js
const { TrustStore, createTrustRouter } = require('./trust-engine');

const trustStore = new TrustStore(db);
app.use(createTrustRouter({
  express,
  authenticateUser,
  store: trustStore,
  onRetry: retryFromLatestCheckpoint,
  handleError: errorResponse,
}));
```

The router adds:

- `GET /v1/exceptions`
- `POST /v1/exceptions/:exceptionId/resolve`
- `POST /v1/exceptions/:exceptionId/retry`
- `GET /v1/runs/:runId/receipts`
- `GET /v1/runs/:runId/checkpoint`

Every path remains under `stanley_users/{uid}`.

## 2. Prepare each run

Before invoking the graph engine, construct a runtime and pass its prepared
workflow to the runner:

```js
const trust = new TrustRuntime({
  store: trustStore,
  uid,
  runId,
  workflow,
  overrides: { mode: run.trustMode || 'live' },
  resumeCheckpoint,
});

const prepared = await trust.begin(run.input);
const result = await runWorkflowWithContext(prepared.workflow, secrets, run.input, {
  db, uid, runId, policy,
  trust,
});
const trustReport = await trust.finish({ input: run.input, scraped: result.scraped, run });
```

Persist `trustReport` on the run. A run is business-verified only when
`trustReport.verified` is true. Transport success and business verification are
deliberately separate states.

## 3. Add graph hooks

The graph engine needs four narrowly scoped hooks:

```js
if (opts.trust?.shouldSkip(effectiveNode)) {
  onLog(`${label} Restored from durable checkpoint.`);
} else {
  await opts.trust?.beforeNode(effectiveNode, ctx);
  try {
    await runGraphNode(agent, effectiveNode, nodeOptions);
    await opts.trust?.afterNode(effectiveNode, scraped[effectiveNode.id], ctx);
  } catch (error) {
    await opts.trust?.nodeFailed(effectiveNode, error, ctx);
    throw error;
  }
}
```

The skip hook prevents completed side effects from replaying. Resume is rejected
when the workflow fingerprint differs from the checkpoint, so a changed graph
cannot accidentally continue an old execution.

## 4. Workflow shape

Trust settings are optional and default to conservative live execution:

```json
{
  "trustPolicy": {
    "mode": "shadow",
    "checkpointEveryNode": true,
    "requireProofReceipts": true,
    "openExceptionOnFailure": true,
    "openExceptionOnAssertionFailure": true,
    "evidenceRetentionDays": 14
  },
  "assertions": [
    {
      "id": "order-created",
      "source": "scraped",
      "path": "order.id",
      "operator": "exists",
      "message": "The destination must return an order ID."
    }
  ]
}
```

Shadow mode replaces side-effect nodes with deterministic zero-time waits and
records their intended actions. A browser action may declare
`data.shadowSafe=true` only when it is known to be read-only.

## 5. Frontend

Copy `web-client/trustClient.ts` beside the existing `firebaseAuth.ts`. The file
provides the exception-workbench and receipt/checkpoint API calls without adding
a frontend dependency. The included `firebaseAuth.d.ts` exists only for isolated
type checking and should not be copied.

## Cost profile

The Trust Engine adds Firestore documents for checkpoints, receipts, and
exceptions. It adds no model call and no always-on process. Checkpoints and
receipts include an `expiresAt` timestamp; enabling Firestore TTL for that field
will delete old evidence after `evidenceRetentionDays`. The run's compact outcome
summary can be kept indefinitely.
