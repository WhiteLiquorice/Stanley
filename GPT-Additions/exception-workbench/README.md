# Exception workbench

This isolated React view exposes the Trust Engine's exception, proof receipt,
checkpoint, resolve, and retry APIs in operator-friendly language.

## Consolidation

1. Copy `ExceptionWorkbench.tsx` into `src/views`.
2. Copy `trust-engine/web-client/trustClient.ts` into `src/lib`.
3. Change the component's client import to `../lib/trustClient`.
4. Add a protected `/dashboard/exceptions` route in `App.tsx`.
5. Add an `Exception Workbench` navigation item to `Layout.tsx` using the
   `ShieldAlert` icon.

No current production UI file is modified by this addition.
