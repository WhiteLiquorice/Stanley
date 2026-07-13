# Trust Engine runner integration

This overlay connects `GPT-Additions/trust-engine` to the consolidated Cloud Run
runner without modifying production until the next deliberate consolidation.

## Behavior

- A run is prepared in live or shadow mode before browser execution.
- Every graph node writes before/after checkpoints through narrow engine hooks.
- Completed nodes become zero-time waits after a fingerprint-matched resume.
- Node and run failures open one actionable exception.
- Assertions verify the business outcome separately from transport success.
- The returned run result includes `trustState`, `trustMode`, and `trustReport`.

## Consolidation order

1. Copy `trust-engine` into the Cloud Run build context.
2. Add `src/trustedExecution.js` and call `executeTrustedWorkflow` from the run
   lifecycle instead of calling `runWorkflowWithContext` directly.
3. Mount the routes documented in `../trust-engine/INTEGRATION.md`.
4. In the Dockerfile, run the existing recovery patch first and the Trust hook
   patch second:

```dockerfile
RUN node scripts/patchEngine.js
RUN node scripts/patchTrustHooks.js
```

`npm run check:current` verifies the hook anchors against the current consolidated
engine without writing to it.
