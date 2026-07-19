# Stanley reliability profile

New container revisions enable the complete reliability profile by default. Existing deployed revisions are unchanged until a new image is deployed, and `STANLEY_RELIABILITY_V2=false` remains the immediate compatibility rollback.

## Staged activation

1. Before deployment, run the full local certification suite and verify all non-credentialed gates.
2. Enable read-only safeguards first: `SCOPED_SECRET_LOADING`, `SAFE_EGRESS`, `PROVIDER_RESILIENCE`, `TRACE_BATCHING`, and `FAIR_QUEUEING`.
3. Enable durable execution next: `TRANSACTIONAL_RUN_LEASES`, `DETERMINISTIC_TASK_DISPATCH`, `DISTRIBUTED_BROWSER_LEASES`, and `TWO_PHASE_MONITORS`.
4. Enable behavioral changes last: `EFFECT_LEDGER`, `NODE_SCOPED_APPROVALS`, and `WORKFLOW_REVISIONS`.
5. The Docker image sets `STANLEY_RELIABILITY_V2=true`; override it to `false` only for rollback or staged production diagnosis.

Every individual flag uses the `STANLEY_` prefix. For example, `TRANSACTIONAL_RUN_LEASES` is configured as `STANLEY_TRANSACTIONAL_RUN_LEASES=true`.

## Behavioral guarantees

- A transactional lease gives one worker ownership of a run. Expired leases can be recovered without allowing active duplicate workers.
- Cloud Tasks use deterministic names per logical delivery, so duplicate enqueue attempts collapse safely.
- Write-capable nodes claim a durable effect key before external work. An ambiguous repeated effect stops for verification rather than executing twice.
- Approval nodes pause at their authored location and resume from durable completed-node outputs.
- Monitor baselines commit only after the complete downstream workflow succeeds.
- The main runner loads only declared vault references. Generic HTTP, Slack webhook, and email endpoints reject local, metadata, private, and reserved network targets.
- Native providers retry transient read failures with bounded backoff. Writes are never blindly retried.
- Browser capacity is tenant-scoped across runner instances. API-only workflows bypass browser startup entirely.
- Self-healed selectors become reviewable proposals; applying one creates a new draft revision instead of silently rewriting the workflow.
- Queue bursts are smoothed per tenant, and graph executions have explicit step and wall-clock limits.

## Verification before rollout

Run `npm.cmd run check` and `npm.cmd test` in `stanley-cloud-run`, then run `npm.cmd run build` at the repository root. Deployment is intentionally separate from these checks.

## Deployment-only operations

These are intentionally not performed by the code rollout:

- Enable Firestore TTL on the `expiresAt` field for the `browserTrace`, `browserSessions`, `browserControl`, `monitor_candidates`, `selectorProposals`, and `effects` collection groups.
- Export Firestore and the artifact bucket before enabling the behavioral flags, record the export location, and perform a restore drill in a non-production project.
- Enable flags in the staged order above and retain the prior Cloud Run revision for immediate traffic rollback.
- Run dependency and container-image scanning in CI. The container now uses `npm ci` and the committed lockfile so Node installation is reproducible.
