# Stanley advanced-platform implementation status

## Delivery boundary

All new feature code remains under `GPT-Additions`. The production website and
Cloud Run source are composed through deterministic staging patch scripts. No
deployment, traffic change, Firestore deployment, scheduler creation, or live
cloud mutation was performed.

The daemon and browser extension are deprecated per the project architecture;
the product surface is website and cloud only.

## Built and locally integrated

| Capability | Implementation | Local integration |
|---|---|---|
| Trust and evidence | Shadow/live policy, approvals, assertions, receipts, redaction, checkpoints, exceptions, safe retry | Runner hooks and authenticated routes |
| Connector Engine | Tenant artifacts, AST/runtime sandbox, network policy, schemas, approval, immutable versions, repair, rollback | API-first runner hook and workbench |
| Universal integration | OpenAPI, OAuth refresh, signed webhooks, REST, pagination, Retry-After, typed mapping, registered SDK adapters, hybrid plans, health/credential analytics | Connector runtime |
| Compiled skills | Verified-trace compilation, structured selection, zero-model execution, regression/approval gates, drift learning, rollback | Runs before ordinary workflow execution |
| Durable orchestration | Arbitrary event/date/reply/file/external-state waits, correlations, lease/fingerprint locks, effect claims, timeouts, scheduler wake, compensation | Runner hooks, event API, internal scheduler API |
| Live learning | Grouping, one constrained model proposal per cluster, historical replay regression, human approval, shadow/canary, immutable workflow archive, promotion, rollback | Failure and outcome hooks plus workbench |
| Layered memory | Procedural/semantic/episodic, scopes, provenance, confidence, TTL, conflict resolution, approval, quarantine, revision, deletion | Structured pre-run context injection |
| Runtime SLOs | Verified success, p95 latency, cost, model-call, and consecutive-failure budgets | Alerts and automatic workflow pause |
| Business outcomes | Presence, uniqueness, cross-system comparison, numerical tolerance, non-negative, expected-event, SLA, and custom assertion monitors | Read-only connector sources and internal scheduler API |
| Website control plane | Exceptions, connectors, skills, waits, learning, memory, monitoring, evidence and approval actions | Staging route/navigation/editor patches |

## Verification completed

- Connector Engine: 24 tests passed, including the local Python AST/runtime harness.
- Trust Engine: 15 tests passed.
- Learning Engine: 10 tests passed.
- Skill Engine: 6 tests passed.
- Orchestration Engine: 3 tests passed.
- Memory Engine: 2 tests passed.
- Monitoring Engine: 2 tests passed.
- Runner integration: 5 tests passed.
- Existing Cloud Run workflow-contract and run-lifecycle tests passed.
- Full staging patch chain produced syntax-valid runner files.
- Advanced React surfaces passed TypeScript checks.
- Existing root production website build passed.

Docker is not installed in this workspace, so the staging image was not built
locally. Cloud Build and deployed end-to-end validation remain operator-owned.

## Model usage

Normal approved connector and skill execution makes no model call. The model is
limited to initial connector generation and one constrained repair proposal for
a grouped failure. The current code default is `gemini-2.5-flash`; it is not
Gemini 1.5. Pin `CONNECTOR_MODEL` during deployment.
