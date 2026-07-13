# Current stack audit

Observed against commit `96feb53` before Trust Engine work began.

The commit moved the prior cloud API into `stanley-cloud-run/src`, but also
deleted the execution engine files it still imports:

- `stanley-cloud-run/branchingEngine.js`
- `stanley-cloud-run/foundationAgent.enhanced.js`
- `stanley-cloud-run/secretsResolver.js`
- `stanley-cloud-run/visionResolver.js`
- `stanley-cloud-run/apiResolver.js`
- `stanley-cloud-run/pythonExecutor.js`

`src/contextualRunner.js` and `src/runnerAdapter.js` currently use relative paths
that resolve outside the Stanley repository after consolidation. The Dockerfile
also still copies from the deleted `GPT-Additions/cloud-run-api` directory and
tries to patch the deleted `branchingEngine.js`.

As a result, the current consolidated Cloud Run image cannot build from this
checkout. Repair this migration boundary before promoting either the existing
API or the Trust Engine. No production file was altered as part of this audit.
