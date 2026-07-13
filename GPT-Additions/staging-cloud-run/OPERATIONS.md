# Staging operations handoff

## Build and deploy (operator-owned)

1. Choose an Artifact Registry image name and immutable tag.
2. Run Cloud Build with `cloudbuild.yaml` from the repository root.
3. Deploy a new Cloud Run staging service or a no-traffic revision.
4. Keep minimum instances at zero and concurrency at the existing runner value.
5. Set `STANLEY_PROJECT_ID`, `VERTEX_LOCATION`, `CONNECTOR_MODEL`,
   `RUNNER_INTERNAL_KEY`, and `ALLOWED_ORIGINS`. Do not set secrets as connector
   source or model prompt variables.
6. Grant the service account only Vertex invocation, Firestore tenant data,
   logging, and the existing task-dispatch permissions. It should not have IAM,
   Secret Manager administration, Storage administration, or project-owner roles.
7. Merge the Firestore rule and index snippets after reviewing the repository's
   production rules source. Enable TTL on Trust evidence `expiresAt` fields.
8. Configure Cloud Scheduler to call `POST /internal/orchestrations/process-due`
   at least once per minute with `X-Stanley-Internal-Key`. This wakes date waits,
   applies timeout/escalation policy, and dispatches resumptions through the same
   exactly-once lease path as correlated webhook/reply/file events.
   Configure the same schedule for `POST /internal/outcome-monitors/process-due`
   to run approved business reconciliations through read-only connectors.
9. The current staging model default is `gemini-2.5-flash`, not Gemini 1.5. Pin
   `CONNECTOR_MODEL` explicitly so a platform default cannot silently change it.

## Required deployed validation

- Health and authenticated connector-list calls
- Tenant A cannot read or execute Tenant B artifacts
- Generation prompt contains vault reference names but no values
- AST rejection for direct imports, dynamic URLs, private IPs, metadata IPs,
  dunder access, filesystem access, environment access, and subprocess access
- Redirect to an undeclared or private destination is blocked
- DNS rebinding resolves only to the pinned, prevalidated address set
- Proxy environment variables do not affect connector traffic
- Missing vault references fail without printing values
- stdout, stderr, receipts, exceptions, and learning cases redact secrets
- Write connectors require fingerprint-bound approval and idempotency keys
- Shadow writes create receipts without sending network mutations
- Input/output schemas and business assertions fail closed
- Repeated failures group before model repair; a model cannot apply its proposal
- Repairs pass inspection and all regressions before human approval/publication
- Prior versions remain executable and rollback changes only the active pointer
- A repaired version crossing its health threshold automatically rolls back
- Safe retry resumes only matching workflow fingerprints and skips completed effects
- Browser fallback occurs only for unavailable/unauthorized/invalid connectors,
  never after an ambiguous write failure
- Schedule and webhook runs resolve vault references server-side
- Signed webhook events reject invalid signatures and replay-window violations
- Date waits wake through the authenticated scheduler endpoint; duplicate wake
  or correlated events do not duplicate a side effect
- Compiled skills execute with model calls disabled and fall back only before an
  ambiguous write can have started
- Learning repairs require replay regressions, human approval, and healthy canary
  outcomes; unhealthy candidates automatically roll back
- Procedural and organization memory requires approval; expired, conflicting, or
  quarantined memory is excluded deterministically
- Critical verified-success or consecutive-failure SLO breaches pause workflows
- Generation costs and deterministic execution metrics remain separate

## Rollback

Set Cloud Run traffic back to the previous revision. Data rollback is pointer-
based: activate prior immutable connector and skill versions, mark learning
rollouts rolled back, and unpause workflows only after reviewing the alert.
Do not delete failed versions; retain them for evidence and audit.

## Not performed by this workspace change

No image build, Cloud Build submission, Firestore configuration, Cloud Run
revision, traffic change, or production smoke test has been performed.
