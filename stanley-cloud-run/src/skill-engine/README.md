# Skill Engine

The Skill Engine compiles verified behavior into an immutable deterministic
artifact that runs before an AI agent. A skill may contain graph operations,
approved connectors, assertions, and a static trace crystallized from a
verified agent run. It may not contain an agent or arbitrary model call.

Normal execution does not call a model. Selection uses tenant scope, workflow,
operation, tags, schemas, preconditions, confidence, and verified health. Every
selection returns an explanation. Failed or drifting repaired versions can be
rolled back to their previous immutable version automatically.
