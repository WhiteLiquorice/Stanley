# GPT Additions

This directory is the isolation boundary for new Stanley work. Nothing here is
loaded by the current production application until it is deliberately synced.

## Current advanced-feature additions

`trust-engine` adds the low-cost primitives Stanley needs to make adaptive
automation safe and operable:

- deterministic trust policies and shadow mode;
- proof receipts with automatic evidence redaction;
- durable per-node checkpoints;
- precondition and outcome assertions;
- an exception queue and review API;
- integration hooks for the existing Cloud Run graph runner.

The package intentionally has no runtime dependency on a model, vector database,
always-on worker, or additional hosted service.

`runner-integration` connects those primitives to the consolidated graph engine
through deterministic, auditable hooks.

`exception-workbench` provides the operator interface for evidence, safe retry,
resolution, checkpoints, and proof history.

`learning-engine` adds grouped failure cases, narrow repair proposals,
regression-gated approval, structured organizational memory, and compilation of
verified runs into reusable draft skills. It cannot publish its own repair or
activate its own skill.

`connector-engine` adds the tenant-scoped Connector Engine: capability-limited
Python, AST inspection, runtime network enforcement, secret-reference-only
generation, schemas, assertions, regressions, approval, immutable publication,
monitoring, repair, OpenAPI import, OAuth definitions, and rollback.

`skill-engine` crystallizes verified traces into immutable deterministic skills,
selects them with structured constraints, requires regression and human approval
gates, disables model calls during execution, and auto-rolls back drift.

`orchestration-engine` provides durable event/date/reply/file/approval waits,
correlation tokens, exactly-once leases and effect claims, workflow fingerprint
locks, timeout escalation, scheduler wakeups, and reverse compensation.

`memory-engine` provides tenant-isolated procedural, semantic, and episodic
memory with provenance, confidence, expiry, approvals, conflict resolution,
quarantine, revision, and deletion.

`monitoring-engine` evaluates verified-success, latency, cost, model-call, and
consecutive-failure SLOs and creates alerts with automatic workflow pause.

`connector-workbench`, `operations-workbench`, `website-overlay`, and
`staging-cloud-run` provide the
isolated operator surface and a self-contained staging build. They are locally
integrated through deterministic patch scripts but have not been built or
deployed to external infrastructure.

## Important workspace finding

`CURRENT_STACK_AUDIT.md` records a blocking issue found before this addition was
started: the latest consolidation commit removed several files still referenced
by the production Cloud Run source and Dockerfile. The Trust Engine remains
isolated and does not modify that stack.
