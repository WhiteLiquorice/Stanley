# Drop-in application files

Copy both files in `src/lib` into Stanley's existing `src/lib` directory.
`stanleyRunner.ts` preserves the dashboard's existing `runHeadless`
signature while changing execution to workflow-ID-based server execution. Sync it
only after the updated Cloud Run revision is serving the `/v1` API.

The second argument is retained for source compatibility but is intentionally
ignored, allowing browser-side secret loading to be removed separately without a
flag-day UI rewrite.

`firebaseAuth.d.ts` exists only so this isolated folder can be type-checked. Do
not copy it; the production project already has `firebaseAuth.ts`.
