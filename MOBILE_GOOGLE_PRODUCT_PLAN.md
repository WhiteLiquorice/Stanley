# Stanley mobile and Google-first product plan

## 1. Revised product direction

Stanley should become a **full-capability automation assistant on every device**. Mobile is not a companion, monitoring screen, or integrations hub. A mobile user must be able to create, configure, run, schedule, inspect, repair, approve, and manage any Stanley automation without opening the desktop website.

The interfaces do not need feature parity at the pixel level. They need **capability parity**:

- The workflow graph remains Stanley's symbolic execution format.
- The model translates user intent into that graph.
- Desktop and mobile expose the graph through conversation, structured summaries, forms, and progressive detail.
- The existing visual canvas becomes an optional expert/debugging view, not the definition of workflow creation.

The long-term product is a neuro-symbolic automation chatbot: conversational on the surface, constrained and deterministic underneath. The current implementation should move toward that architecture without depending on a future model upgrade.

## 2. Product promise

> Tell Stanley what should happen across websites, Google products, APIs, files, and connected services. Stanley builds an inspectable plan, asks only for missing information, executes it safely, and helps repair it when reality changes.

Google Workspace becomes the initial distribution and integration focus, but it does not reduce Stanley to a Google-only tool. Browser automation, generated connectors, native integrations, agents, templates, monitoring, triggers, artifacts, and recovery remain first-class.

## 3. Capability parity contract

Every Stanley capability must have a mobile interaction, even when the mobile interaction differs from desktop.

| Capability | Mobile interaction |
| --- | --- |
| Create workflow from language | Primary chat composer with voice and attachments |
| Create from template | Searchable recipe gallery and guided setup |
| Manual workflow creation | Ordered step list with typed step forms |
| Mission and parameters | Plain-language Goal and Inputs sections |
| Branching and loops | “If this, then…” and repeat-rule forms |
| Browser automation | Describe page actions, select browser policies, inspect live evidence |
| Native integrations | Connected-app action picker and conversational insertion |
| Generated connectors | Generate, inspect summary, test, approve, publish, and version |
| Agent node | Goal, permissions, maximum steps, allowed actions, and approval policy |
| AI prompt/vision/extraction | Purpose-specific forms with model-policy summary |
| Schedules, webhooks, email, monitors | Trigger builder with service-specific forms |
| Run/cancel/resume/retry | Run detail timeline and action bar |
| Browser takeover | Secure full-screen remote session when available |
| Files and artifacts | Mobile file picker, camera, share target, preview, and download |
| Secrets and OAuth | Connections and credential vault with mobile-safe entry |
| Exceptions and approvals | Approval inbox with evidence and exact proposed effect |
| Debugging and traces | Human-readable timeline with expandable technical detail |
| Workflow versions | Version history, compare summary, restore, and promote |
| Skills and learning | Skill list, provenance, test status, proposals, activate/deactivate |
| MCP/workflow publication | Guided publication settings and client setup instructions |
| Operations and health | Mobile operations dashboard and service-specific diagnostics |
| Billing and account | Subscription, usage, export, privacy, and deletion |

If a capability cannot be reasonably manipulated on a phone, mobile must still support it through Stanley's conversational editor plus a structured review and confirmation flow. “Open desktop” may be offered for convenience, never as the only way to complete a supported task.

## 4. The simple interface model

### 4.1 Primary navigation

Use five bottom destinations:

1. **Stanley** — chatbot, recent conversations, quick requests, and drafts.
2. **Automations** — saved workflows, templates, schedules, triggers, and skills.
3. **Activity** — active runs, history, artifacts, browser sessions, and monitoring.
4. **Inbox** — approvals, failures, repair proposals, connection warnings, and questions.
5. **You** — integrations, vault, usage, billing, notifications, privacy, and account.

Operations, connectors, and advanced settings live inside these destinations rather than appearing as separate top-level products.

### 4.2 Stanley chat

The main interface is a persistent conversation with four message types:

- **Request:** what the user wants.
- **Question:** the minimum missing information Stanley needs.
- **Plan:** a structured automation proposal.
- **Result:** execution outcome, evidence, files, and next actions.

The composer supports text, voice, URLs, images, documents, and shared content from other apps.

Examples:

- “Every weekday, summarize important unread Gmail and tomorrow's calendar.”
- “Use this spreadsheet to update these customer records.”
- “Open this site every morning, collect new listings, and save them to Drive.”
- “When an invoice arrives, save it, extract the fields, add a Sheet row, and draft a reply.”
- “Fix the automation that failed last night, but show me the change before applying it.”

The chat does not directly execute an unconstrained prompt. It creates or edits the symbolic workflow, presents a review, and then runs the approved revision.

### 4.3 Plan card

Every generated or edited automation is summarized in one expandable card:

- **Mission** — intended outcome.
- **Trigger** — manual, schedule, webhook, email, monitor, or another workflow.
- **Inputs** — parameters, accounts, files, URLs, and secrets references.
- **Steps** — ordered plain-language actions.
- **Decisions** — branches, loops, conditions, and stopping rules.
- **AI use** — which steps use Gemini/another model and what context is provided.
- **Effects** — emails, writes, uploads, shares, deletions, or external actions.
- **Limits** — maximum time, pages, records, retries, agent steps, and estimated cost.
- **Approvals** — what requires confirmation and when.
- **Outputs** — data, artifacts, notifications, and downstream workflows.

Users edit a section by tapping it or by asking Stanley to change it. Both operations modify the same workflow contract.

### 4.4 Structured editor

The non-chat editor is an ordered list, not a canvas:

- Tap to insert a step between two actions.
- Drag to reorder steps where graph semantics permit it.
- Nest branches and repeat blocks visually.
- Show attached parameters and Mission context inside each step.
- Validate changes immediately.
- Provide “explain this step,” “test this step,” and “replace with…” actions.
- Switch to a read-only graph map for orientation and debugging.

On desktop, make this simple editor the default over time. Keep the canvas as an optional advanced view until usage proves whether it remains valuable.

## 5. Full mobile feature areas

### 5.1 Creation and editing

- Start from chat, voice, template, shared content, blank automation, or duplicate.
- Generate complete workflows and partial step groups.
- Ask targeted clarification questions instead of filling ambiguous values silently.
- Edit by conversation or structured forms.
- Preview changes as a semantic diff before saving.
- Autosave drafts and retain version history.
- Test one step, a branch, or the whole workflow in a shadow/dry-run mode.
- Expose advanced policies progressively without crowding the default UI.

### 5.2 Execution

- Run now with selected parameters and connection/account choices.
- Show admission warnings and required approvals before starting.
- Stream a compact execution timeline.
- Show screenshots, extracted values, AI responses, API summaries, artifacts, and effects.
- Cancel, pause when supported, retry, resume from checkpoint, or clone as a debug run.
- Support secure browser takeover in a full-screen mobile view.
- Keep execution server-side when the app is backgrounded or closed.

### 5.3 Triggers and monitoring

- Manual, scheduled, recurring, webhook, Gmail/email, page-change, outcome-monitor, and workflow triggers.
- Natural-language schedule input with an explicit timezone preview.
- Calendar-like trigger management.
- Quiet hours, notification routing, deduplication, and rate controls.
- Monitoring baselines, candidate changes, and commit/reject controls.

### 5.4 Integrations and connector creation

- Browse native integrations by app and outcome.
- Connect accounts through OAuth or scoped vault credentials.
- Generate a connector from API documentation, OpenAPI, examples, or a plain-language request.
- Review hostname, authentication method, scopes, operations, inputs, outputs, pagination, and effects.
- Execute a credential-safe test, inspect redacted evidence, approve, and publish.
- Manage versions, health, failures, repair proposals, rollback, and template creation.
- Keep raw secrets out of connector source and model prompts.

### 5.5 Skills and agents

- Browse active, draft, proposed, failed, and deprecated skills.
- Show where a skill came from, what it can do, allowed tools, tests, and confidence.
- Activate, pause, test, reject, or roll back a skill.
- Configure Agent nodes with an explicit role, goal, allowed tools, domains, data, effects, maximum steps, time budget, and approval rules.
- Convert successful Agent traces into deterministic workflow steps when possible.

### 5.6 Trust and exceptions

- Unified Inbox for unsafe ambiguity, missing credentials, browser blocks, selector repairs, unknown write outcomes, approvals, and failed runs.
- Show the relevant evidence before asking for a decision.
- Offer specific actions: approve once, approve rule, deny, edit, retry, resume, roll back, or abandon.
- Require fresh state before applying any decision.
- Use expiring, single-use approval tokens.

### 5.7 Files and multimodal input

- Upload from Files, Photos, camera, document scanner, or another app's share sheet.
- Use files as workflow inputs, Drive uploads, extraction sources, or prompt context.
- Show size, type, tenant ownership, retention, and destination.
- Preview safe file types; quarantine unsupported or suspicious inputs.
- Download or share generated artifacts through native controls.

### 5.8 Administration

- Connection status and scope management.
- Vault entries and scoped credential references.
- Usage, subscription, invoices, and limits.
- Notification and approval defaults.
- Device/session management.
- Data export, Google revocation, and complete account deletion.
- Service status and mobile-friendly diagnostics.

## 6. Google-first product layer

Google integrations should be the most polished path through the full Stanley system, not a separate subsystem.

### 6.1 Launch services

Harden the existing Gmail, Calendar, Drive, and Sheets operations first.

**Gmail**

- Search/list messages and threads.
- Read selected messages and attachments.
- Create drafts, send, label, archive, and trash.
- Trigger from Gmail changes with subscription renewal and reconciliation.
- Default to drafts or approval before sending.

**Calendar**

- List calendars, events, and availability.
- Create, update, delete, quick-add, invite, and manage reminders/recurrence.
- Handle timezone and daylight-saving boundaries explicitly.
- Require approval for invitations, cancellations, and bulk changes.

**Drive**

- Search, select, upload, download, create folders, copy, move, and share.
- Prefer user-selected files/folders or an app-specific folder over broad access.
- Preview permission changes and require approval for external/public sharing.

**Sheets**

- Read, append, update, clear, create, copy, and manage tabs.
- Add typed headers, batch operations, formulas, previews, and row-level idempotency.
- Prevent duplicate rows after retries or unknown outcomes.

### 6.2 Expansion services

Add after the launch four are production-proven:

- Docs: create, read, edit, format, tables, and export.
- Tasks: create, update, complete, organize, and trigger workflows.
- People/Contacts: search, create, update, and deduplicate with approval.
- Forms: create forms, manage questions, and process responses.
- Chat: issue commands, receive results, and approve runs.
- Maps/Places: authorized location research and structured place workflows.
- YouTube: creator workflows for metadata, comments, assets, schedules, and analytics.
- BigQuery and Cloud Storage for advanced data workflows.

### 6.3 First-class Google connection

- Authorization Code with PKCE.
- Backend token exchange, refresh, rotation, and revocation.
- Incremental scopes requested only when a feature needs them.
- Machine-readable scope registry mapping every operation and template to minimum scopes.
- Per-account connection health and Google account switching.
- Workspace domain/admin grant metadata.
- No refresh tokens in browser storage, mobile storage, logs, notifications, connector code, or prompts.

### 6.4 Launch recipes

1. Morning Gmail and Calendar briefing.
2. Starred email to Google Tasks.
3. Approval-first reply drafting.
4. Invoice attachment to Drive and Sheets.
5. Email or Form submission to a tracking Sheet.
6. Email request to Calendar event with approval.
7. Drive folder summary to a Google Doc.
8. Weekly Sheets report as a Gmail draft.
9. Meeting preparation from Calendar, Gmail, Drive, and Contacts.
10. Creator pipeline across Drive, Sheets, Calendar, Gmail, and eventually YouTube.

Recipes are acquisition and onboarding tools. Once installed, each is an ordinary Stanley workflow that can be edited through chat or structured controls.

## 7. Shared architecture

### 7.1 One product core

Extract the current frontend into reusable layers:

- `domain`: workflows, revisions, runs, effects, approvals, skills, connectors, templates, accounts.
- `services`: authenticated API clients and normalized errors.
- `features`: chat, automations, activity, inbox, connections, account.
- `ui`: responsive primitives, cards, forms, sheets, timelines, and accessibility behavior.
- `platform`: storage, connectivity, push, deep links, sharing, files, camera, voice, and biometrics.

Move workflow normalization and business rules out of large page components. Web and mobile must use the same mutation commands and validation contract.

### 7.2 Conversation orchestration layer

Add a backend conversation service that:

1. Classifies the request as create, edit, run, inspect, repair, explain, or manage.
2. Retrieves only relevant workflow/account context.
3. Uses a task-specific skill and constrained output schema.
4. Produces workflow commands rather than arbitrary database mutations.
5. Validates commands against the symbolic contract.
6. Returns clarification questions, semantic diffs, or an executable plan.
7. Requires approval according to effect policy.
8. Records provenance, model version, prompt profile, and validation result.

This reduces model reasoning burden now and creates a clean path to better models later.

### 7.3 Command API

Define typed commands shared by chat, forms, web, and mobile:

- create workflow/draft;
- set Mission/input/trigger/policy;
- add/update/move/delete step;
- add branch/repeat/connection;
- validate/test/publish revision;
- run/cancel/resume/retry;
- approve/deny effect;
- connect/disconnect service;
- create/test/publish/rollback connector;
- activate/pause/rollback skill.

Commands use revision preconditions and idempotency keys. No client directly rewrites the full workflow document without conflict detection.

### 7.4 Mobile technology

Start with Capacitor around the responsive React/Vite application:

- Reuse the existing TypeScript UI and service layer.
- Add native adapters for push, deep links, secure session storage, biometrics, share targets, camera/files, and voice.
- Keep Google refresh tokens and execution on the backend.
- Keep platform interfaces replaceable if future requirements justify React Native or native clients.

## 8. Mobile web plan

### Phase MW1 — design foundation

- Mobile tokens, safe areas, 44px touch targets, keyboard-safe forms, dynamic type, and reduced motion.
- Responsive shell with bottom navigation and full-screen sheets.
- Standard loading, empty, offline, stale, partial, and error states.
- Eliminate fixed tri-pane assumptions and horizontal overflow.

Exit criteria:

- No overflow at 320, 360, 390, 412, and 430 CSS pixels.
- Core functions do not depend on hover or desktop shortcuts.
- Critical screens pass keyboard and screen-reader checks.

### Phase MW2 — full simple interface

- Stanley chat and plan cards.
- Automations list, recipe setup, structured editor, schedules, triggers, and skills.
- Activity timeline, run controls, artifacts, evidence, and browser session controls.
- Unified Inbox for approvals, failures, and repairs.
- Integrations, connector lifecycle, vault, billing, operations, and account controls.

Exit criteria:

- Every capability in the parity contract can be completed from a phone browser.

### Phase MW3 — PWA

- Manifest, icons, service worker, install/update flow, and safe application-shell caching.
- Read-only offline cache and draft-edit outbox.
- Never queue runs, writes, or approvals as if they occurred offline.
- Browser share-target support where available.

## 9. Native app plan

### Phase APP1 — application shell

- Android and iOS projects, environment-specific identities, signing, and release channels.
- Universal/app links and OAuth callbacks.
- Secure Stanley session storage, logout, device revocation, and minimum-version control.
- Native navigation polish while reusing shared feature screens.

### Phase APP2 — native functionality

- Push notifications for approvals, failures, questions, connection expiry, and important completion.
- Deep links to exact current entities.
- Android share target and iOS share extension.
- Camera, photo, document scanner, file picker, and artifact sharing.
- Voice request capture.
- Optional biometric re-authentication for sensitive approvals.
- Background status refresh; all real execution remains server-side.
- Sensitive-screen protection from screenshots/app-switcher previews where appropriate.

### Phase APP3 — parity hardening

- Test every parity-contract capability on Android and iOS.
- Ensure connector, skill, trust, operations, and debugging screens remain usable—not silently omitted.
- Add compact and expanded modes so experts can reach detail without burdening ordinary users.

### Phase APP4 — store readiness

- In-app and web account deletion.
- Privacy policy, data inventory, Google revocation, export, retention, and support paths.
- Google Play Data safety and Apple privacy declarations.
- OAuth verification and any required restricted-scope security assessment.
- Internal testing, closed beta, TestFlight, staged rollout, crash monitoring, and rollback.

## 10. Reliability and safety

### API and workflow behavior

- Typed inputs/outputs for every operation.
- Bounded retries for safe reads.
- Never blindly retry writes after an unknown outcome.
- Idempotency/effect records for writes.
- Quota, pagination, `Retry-After`, partial failure, and sync-token handling.
- Tenant isolation and credential redaction.
- Workflow/version preconditions for every mutation.

### Default approval policy

Require approval for:

- Sending rather than drafting email.
- Deleting/trashing messages, files, events, or records.
- Inviting attendees or cancelling meetings.
- External/public Drive sharing.
- Bulk mutations.
- Connector publication or permission expansion.
- Agent-selected writes not explicitly bounded in the saved workflow.

### Mobile security

- Store only Stanley session material in OS-secure storage.
- Keep Google refresh tokens server-side.
- Exclude secrets and sensitive content from telemetry, crash reports, URLs, push payloads, source, and prompts.
- Bind OAuth state, PKCE, tenant, redirect URI, and device session.
- Use expiring and single-use approval decisions.
- Provide device/session revocation.

## 11. Test plan

### Contract and command tests

- Chat and form edits generate identical normalized workflow commands.
- Mobile, web, and backend agree on every node and policy type.
- Revision conflicts fail clearly instead of overwriting changes.
- Every integration operation maps to exactly one tested backend contract.
- Every template/skill includes Mission, limits, scope, effect, and provenance metadata.

### Conversation tests

- Golden requests for create, edit, explain, run, repair, and manage intents.
- Ambiguous requests produce questions, not invented values.
- Unsupported requests fail honestly.
- Semantic diffs match the actual workflow mutation.
- Model output cannot bypass command validation or approval policy.

### Mobile tests

- Responsive snapshots at target widths.
- Android/iOS navigation and component tests.
- Push, deep link, share, camera/file, voice, biometric, background, and interrupted-auth tests.
- Offline, clock-skew, token-expiry, app-upgrade, and conflict tests.
- Screen reader, font scaling, contrast, keyboard, and touch-target coverage.
- Physical-device matrix including small phones and tablet sanity checks.

### Credentialed production canaries

- Browser workflow.
- Gmail read and approval-gated write.
- Calendar read and approval-gated write.
- Drive read and approval-gated write.
- Sheets read and idempotent write.
- Generated connector.
- Bounded Agent workflow.
- Failure, cancel, resume, repair, and rollback.

## 12. Delivery sequence

### Milestone 0 — contracts and product design

- Freeze the capability parity list.
- Design chat, plan card, structured editor, Activity, and Inbox.
- Define typed command API and semantic diff.
- Define Google scope registry and data inventory.
- Prepare OAuth, privacy, deletion, and store-review work early.

Exit: every current capability has an approved mobile interaction and backend command.

### Milestone 1 — shared core refactor

- Extract domain, services, features, UI, and platform layers.
- Move workflow mutations behind typed commands.
- Add revision conflict handling and mobile bootstrap/sync endpoints.
- Preserve the existing canvas and all desktop behavior during migration.

Exit: existing web behavior and certification remain green using the new shared layer.

### Milestone 2 — conversation-first Stanley

- Build request classification, skill routing, constrained command generation, validation, clarification, semantic diff, and approval.
- Add persistent conversations and plan/result cards.
- Make structured editing available from each plan section.

Exit: core workflows can be created, edited, run, explained, and repaired without the canvas.

### Milestone 3 — complete mobile web

- Responsive shell and five destinations.
- Implement the full parity contract through chat, forms, timelines, and progressive detail.
- Complete accessibility and phone-browser testing.

Exit: no supported Stanley task requires desktop mode.

### Milestone 4 — Google core product

- First-class Google OAuth connections.
- Harden Gmail, Calendar, Drive, and Sheets.
- Publish ten complete recipes.
- Add incremental scopes, revocation, health, reconciliation, and effect safety.

Exit: each launch service passes credentialed reads, approved writes, and failure drills.

### Milestone 5 — PWA and native shell

- PWA installation and safe offline behavior.
- Capacitor Android/iOS applications with identity, links, secure sessions, and lifecycle handling.

Exit: internal mobile builds offer full web capability parity.

### Milestone 6 — native value

- Push, sharing, camera/files, voice, biometrics, background refresh, and sensitive-screen protection.

Exit: the app is faster and more convenient than the browser without becoming a separate product.

### Milestone 7 — beta and launch

- Account deletion/export, privacy declarations, OAuth verification, store materials, support, monitoring, and incident response.
- Closed beta, TestFlight, staged rollout, canaries, and rollback tests.

Exit: reliability and compliance gates hold during staged production use.

### Milestone 8 — Google expansion and simplification

- Docs, Tasks, People, Forms, Chat, Maps, YouTube, and advanced Google Cloud services based on demand.
- Measure canvas usage and gradually move desktop users to the simple editor/chat where it improves outcomes.
- Improve models later without changing the command, workflow, trust, or execution contracts.

## 13. Dependency rules that prevent breakage

1. Do not build separate mobile workflow semantics.
2. Do not remove or rewrite the canvas until chat and structured editing pass parity tests.
3. Freeze typed commands before building multiple clients.
4. Preserve backward compatibility for saved workflows and older app versions.
5. Put every new Google operation behind scope, effect, idempotency, and test metadata.
6. Keep model output outside direct persistence and execution paths.
7. Require production proof before marketing a recipe or integration as reliable.
8. Use feature flags for conversation mutations, mobile approvals, connector publication, and destructive effects.
9. Maintain remote kill switches and rollback-compatible backend revisions.
10. Run the existing Stanley certification suite at every milestone.

## 14. Success metrics

- First useful workflow created without opening the canvas.
- First successful run from mobile.
- Percentage of Stanley capabilities completed without desktop handoff.
- Clarification rate versus incorrect assumption rate.
- Workflow command validation failure rate.
- Successful run rate by recipe and operation.
- Duplicate side-effect rate; target zero confirmed duplicates.
- Approval completion time and repair success.
- Google connection/refresh health.
- 7-day and 30-day workflow retention.
- Mobile crash-free sessions and deep-link/push correctness.

The key metric is not mobile screen count or raw integration count. It is the percentage of real automation outcomes users can describe, understand, trust, and complete from a phone.

## 15. Non-goals

- Running Playwright directly on the phone.
- Reproducing the free-form canvas on a small screen.
- Creating a reduced mobile-only workflow format.
- Offline execution of external actions.
- Storing Google refresh tokens on-device.
- Allowing chat or Agent nodes to bypass symbolic validation.
- Unattended destructive actions by default.
- Depending on a future model upgrade for correctness.
- Implying Google endorsement or using Google trademarks improperly.

## 16. Definition of done

The revised mobile/Google product is done when:

1. Any supported Stanley workflow can be created, configured, tested, run, scheduled, monitored, repaired, versioned, and managed from mobile without using the visual canvas.
2. Chat, structured editing, and desktop tools all mutate the same typed workflow contract through validated commands.
3. Browser automation, integrations, generated connectors, agents, skills, triggers, monitoring, artifacts, approvals, trust controls, and operations all have complete mobile interactions.
4. Gmail, Calendar, Drive, and Sheets have polished OAuth, reliable operations, useful recipes, approval-gated effects, and credentialed production proof.
5. Android and iOS add push, deep links, sharing, files/camera, voice, and optional biometrics while execution remains safely server-side.
6. Account deletion/export, token revocation, privacy disclosures, OAuth verification, store declarations, support, monitoring, canaries, and rollback are complete.
7. Existing workflows, desktop capabilities, and non-Google integrations remain compatible and continue passing Stanley's certification suite.
8. A better future model can improve planning and conversation quality without requiring a new execution or safety architecture.
