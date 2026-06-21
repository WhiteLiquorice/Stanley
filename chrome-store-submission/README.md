# Stanley Browser Butler — Chrome Web Store Submission

Everything needed to publish Stanley to the Chrome Web Store.

---

## Folder Structure

```
chrome-store-submission/
├── extension/                  ← ZIP this folder and upload to CWS
│   ├── manifest.json
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   ├── icon16.png              ← YOU NEED TO ADD THIS (resize icon.png to 16x16)
│   ├── icon48.png              ← YOU NEED TO ADD THIS (resize icon.png to 48x48)
│   └── icon128.png             ← YOU NEED TO ADD THIS (rename/copy icon.png)
└── store-assets/
    ├── store_description.md    ← copy-paste into CWS listing form
    ├── permissions_justification.md  ← copy-paste into CWS review form
    └── privacy_policy.html     ← host this publicly, paste the URL into CWS
```

---

## Before You Upload

### 1. Fix the icons (required)

The manifest references three separate icon sizes. You need to export three PNGs from
`icon.png` (or `Stan da man.png`):

| File        | Size     |
|-------------|----------|
| icon16.png  | 16×16 px |
| icon48.png  | 48×48 px |
| icon128.png | 128×128 px |

Any image editor works. The 128px version is the most visible — it appears on the CWS
listing page and in the Chrome extensions manager.

### 2. Privacy policy (required)

Privacy policy is live at: https://stanley.bridgewayapps.com/privacy.html

Paste this URL into **two places** in the CWS dashboard:
- **Store listing → Privacy policy URL field**
- **Privacy tab → Privacy practices disclosure**

Both fields must be filled or the submission auto-rejects.

### 3. Prepare screenshots (required — minimum 1)

CWS requires at least one screenshot. Accepted sizes: **1280×800** or **640×400** px.

Recommended shots:
1. The popup with a workflow prompt typed in and the plan displayed
2. The popup showing workflow running with live status
3. The popup showing completed workflow with history

---

## Submission Steps

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **New Item**
3. ZIP the `extension/` folder (not the folder itself — zip its *contents*) and upload it
4. Fill in the store listing:
   - **Name:** Stanley Browser Butler
   - **Short description:** copy from `store_description.md`
   - **Detailed description:** copy from `store_description.md`
   - **Category:** Productivity
   - **Language:** English
   - **Privacy policy URL:** your hosted URL for `privacy_policy.html`
5. Upload screenshots
6. Under **Permissions**, paste each justification from `permissions_justification.md`
   into the corresponding field
7. Set distribution to **Unlisted** if you're only sharing with specific clients,
   or **Public** for open listing
8. Submit for review

---

## Review Timeline

Google's review typically takes **1–3 business days** for a new extension. Extensions
using `nativeMessaging` sometimes trigger a manual review, which can take up to
**7 days**. You'll get an email either way.

---

## Notes on `nativeMessaging`

Google pays extra attention to extensions that use `nativeMessaging` because it allows
the extension to communicate with software installed on the user's machine. The
justification in `permissions_justification.md` is written to address exactly what
reviewers look for:
- What the native host name is (`com.project.stanley`)
- That communication is local-only (no remote relay server)
- What specific data passes over the channel

If Google asks for more detail during review, point them to the daemon registration
mechanism and the `com.project.stanley.json` native host manifest.
