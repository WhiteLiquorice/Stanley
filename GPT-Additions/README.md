# GPT Additions

This directory is the isolation boundary for new Stanley work. Nothing here is
loaded by the current production application until it is deliberately synced.

## Current addition: Trust Engine

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

## Important workspace finding

`CURRENT_STACK_AUDIT.md` records a blocking issue found before this addition was
started: the latest consolidation commit removed several files still referenced
by the production Cloud Run source and Dockerfile. The Trust Engine remains
isolated and does not modify that stack.
