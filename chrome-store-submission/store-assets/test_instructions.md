# Test Instructions — Stanley Browser Butler

Paste this into the "Test instructions" field in the Chrome Web Store dashboard.

---

## For the Reviewer

Stanley Browser Butler is a companion extension that communicates with a locally
installed application (the Stanley daemon) via Chrome's Native Messaging API. The
daemon handles the actual browser automation using Playwright.

**The extension cannot be fully tested without the companion daemon installed.** The
following instructions cover what can be verified from the extension alone, and what
requires the full setup.

---

## What You Can Verify Without the Daemon

1. Install the extension from the uploaded package
2. Click the Stanley icon in the Chrome toolbar
3. The popup will open and display a **"Daemon not connected"** status message
4. You can verify:
   - The popup UI loads correctly
   - The extension requests no permissions beyond those declared in the manifest
   - No network requests are made at startup
   - No background activity occurs while the daemon is not connected

---

## Full Testing (Requires Daemon Setup)

To test the complete automation flow:

**Prerequisites:**
- Windows 10/11 or macOS 12+
- Node.js 18+ installed
- Chrome 116+

**Steps:**

1. Download and install the Stanley daemon from https://stanley.bridgewayapps.com
2. Register the native messaging host:
   - **Windows:** Run `register.bat` as Administrator
   - **Mac:** Run `install.sh`
3. Load the extension in Chrome (Developer Mode > Load Unpacked, or install from CWS)
4. Click the Stanley icon — status should show **"Connected"**
5. Sign in with a Stanley account (or use the provided test credentials below)
6. Enter a simple workflow prompt, for example:
   ```
   Go to wikipedia.org and get the text from the main article
   ```
7. Click **"Plan"** — Stanley will display the automation steps for review
8. Click **"Run"** — Stanley executes the workflow and displays results
9. A desktop notification fires when the workflow completes

---

## Test Credentials

```
Email:    reviewer@projectstanley.com
Password: [provide a real test account here before submitting]
```

---

## Permissions Used During Testing

| Permission       | When It Activates                                         |
|------------------|-----------------------------------------------------------|
| `activeTab`      | When the popup is open and a workflow is running          |
| `storage`        | On sign-in (saves auth token) and on workflow completion  |
| `nativeMessaging`| When the popup connects to the local daemon               |
| `notifications`  | When a workflow finishes (success or failure)             |
