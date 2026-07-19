# Stanley launch certification

This document defines what “done” means before Stanley is marketed as reliable. A feature is not production-certified merely because its code exists.

## Certification states

- **Locally verified:** implementation evidence exists and its automated tests pass.
- **Implementation-only:** the code exists, but the promise does not yet have sufficient automated proof.
- **Deployment-required:** local proof cannot establish production routing, credentials, IAM, Firestore indexes, queues, browser availability, or third-party behavior.

The machine-readable claim inventory and deployment gates live in `certification/claims.json`. Run `npm run certify` to prevent unsupported public claims and missing evidence from returning.

## Launch gate

Before creator outreach, all of the following must be true:

1. Root build, backend checks/tests, template audit, and claim certification pass from a clean checkout.
2. A fresh user can sign up, create or install a workflow, save it, reload it, run it, inspect the result, and delete it.
3. One browser template, one native integration, one generated connector, and one bounded Agent workflow succeed with production credentials.
4. A forced browser failure creates useful evidence; cancel and resume work; no secret appears in logs, prompts, connector source, or artifacts.
5. Every Operations screen reaches its JSON API without 404, HTML-as-JSON, CORS, or “failed to fetch” errors.
6. A fresh account receives exactly ten successful free runs, failed runs do not consume quota, and the next successful run is correctly gated.
7. Production Firestore indexes, IAM, encryption keys, feature flags, service URLs, and rollback revision are verified.

## Marketing boundary

Safe current description: Stanley is a hybrid neuro-symbolic automation system that combines constrained AI planning with inspectable workflows and deterministic browser/API execution.

Do not claim local execution, a desktop daemon, a Chrome extension runtime, residential-IP behavior, bot-detection or CAPTCHA bypass, perfect reliability, absolute privacy, or unlimited integrations. Generated connectors make the catalog extensible; they do not make every third-party API automatically compatible or reliable.
