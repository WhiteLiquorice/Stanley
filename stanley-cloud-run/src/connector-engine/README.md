# Connector Engine

The Connector Engine turns model-generated or OpenAPI-imported operations into
tenant-scoped, immutable connector versions. Models are used only for initial
generation and deliberate grouped-failure repair. Published execution is fully
deterministic.

Lifecycle: Discover → Generate → Inspect → Test → Approve → Publish → Execute → Monitor → Repair.

## Security boundary

Generated Python receives only three capabilities: typed `inputs`, declared
`vault.get("reference")` calls, and guarded
`http.request("METHOD", "https://literal-host/path", ...)` calls. The AST
inspector rejects direct networking, dynamic destinations, undeclared imports,
dunder access, environment/filesystem/process capabilities, undeclared vault
references, and source that does not assign `result`.

The runtime uses a clean environment, non-root container user, CPU/memory/file
limits where supported, exact domain and method policy, DNS address validation
and pinning, private/link-local/metadata blocking, proxy suppression, bounded
redirects, request/response limits, strict deadlines, schema validation,
business assertions, output secret scanning, and redacted errors.

Write connectors additionally require version-fingerprint-bound human approval,
an idempotency key, shadow-mode regressions, immutable versions, and rollback.
Repairs cannot alter protected policy without elevated review and cannot publish
themselves.

## Modules

- `artifact.js`: versioned contract and protected-policy fingerprints
- `python/`: AST inspector and trusted execution harness
- `connectorService.js`: lifecycle, Trust/Learning hooks, monitoring and rollback
- `connectorStore.js`: in-memory tests and tenant-scoped Firestore adapter
- `generation.js` / `repair.js`: secret-free model boundaries
- `regression.js`: required deterministic and shadow test execution
- `universal.js`: OpenAPI import and OAuth connection definitions
- `connectorRoutes.js`: authenticated API surface for the staging overlay

The Cloud Run and website integration remain in isolated staging overlays. No
production file is modified until consolidation is explicitly requested.
