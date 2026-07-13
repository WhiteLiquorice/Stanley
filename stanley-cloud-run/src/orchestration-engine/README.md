# Durable orchestration engine

Persisted waits replace a resident worker. A run may wait for approval, webhook,
date, reply, file, or external state; accept one or several correlated events;
resume from its exact workflow-fingerprint checkpoint; enforce idempotent side
effects; time out or escalate; and execute compensation actions in reverse order.

Wakeups are invoked by existing schedules, webhooks, or Cloud Tasks. The package
does not create an always-running service.
