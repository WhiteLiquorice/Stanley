# Stanley Browser Butler — Permission Justifications

This document is for the Chrome Web Store review form.
Copy each section into the corresponding field when asked why a permission is needed.

Privacy policy: https://stanley.bridgewayapps.com/privacy.html

---

## `activeTab`

**Justification:**
Stanley uses `activeTab` to read the URL and title of the user's currently active tab
so the extension popup can display live status about the running workflow — for example,
confirming which page the automation is currently operating on. No content is injected
into the active tab and no tab data is transmitted off-device.

---

## `storage`

**Justification:**
Stanley uses `chrome.storage.local` to persist the following data entirely on the user's
device:

- Firebase authentication tokens (email, uid, idToken) so users stay signed in between
  sessions without re-entering credentials.
- A workflow history log (capped at 20 entries) showing recent prompts and their
  pass/fail outcomes.
- Saved workflow prompt templates created by the user.
- User preferences (e.g., Active Mode on/off).

No data is written to `chrome.storage.sync`. Nothing is shared with third parties
through storage.

---

## `nativeMessaging`

**Justification:**
Stanley's automation engine runs as a local native application (a Node.js/Playwright
daemon installed on the user's machine). The Chrome extension uses `nativeMessaging` to
communicate with this local daemon over a secure stdio channel registered under the host
name `com.project.stanley`.

This is the core mechanism that allows the extension popup to send user workflow
instructions to the local browser automation engine and receive live status updates back.
No remote server is involved in this message channel — all communication is between the
extension and a process running on the same machine.

**Native host name:** `com.project.stanley`
**Native host manifest path (Windows):** registered via `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.project.stanley`

---

## `notifications`

**Justification:**

Stanley uses desktop notifications to alert users when automated workflows complete.
This permission is necessary because:

**Workflow Duration:** Automation workflows often take minutes to complete (logging in,
navigating multi-page forms, extracting data). Users need to be able to leave their
browser, switch tabs, or minimize Stanley's popup without missing completion status.
Desktop notifications allow users to continue working while Stanley runs in the
background.

**User-Initiated Only:** Notifications are fired only in response to explicit user
actions:
- User submits a workflow prompt and clicks "Run"
- Stanley completes the workflow (success or failure)
- Desktop notification fires with the outcome

No notifications are sent speculatively, on a schedule, or without user action.
The notification displays only the workflow status and a short summary (e.g.,
"Workflow 'Extract client data' completed successfully."). No sensitive data, URLs,
or credentials are included in the notification text.

**Privacy:** Notifications are dismissed after a few seconds and are not logged or
persisted. They are only visible to the user on their own device.

---

## Remote Code & Cloud Service Calls

**Summary:**

Stanley uses remote cloud services (Firebase Cloud Functions) for computationally infeasible tasks: converting natural-language workflow prompts into automation steps using language models, and analyzing screenshots for visual element resolution using vision models. All cloud calls are authenticated via Firebase ID tokens and return only data payloads (JSON objects, element coordinates, action arrays) — never executable code. The extension's manifest does not grant code-loading permissions; all code is statically bundled at build time. Future cloud features will follow the same principle: opt-in, authenticated, data-only returns, and minimally necessary.
