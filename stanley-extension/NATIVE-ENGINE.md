# Stanley browser-native engine (daemon-free)

Stanley can now execute workflows entirely inside the Chrome extension — no native
daemon, no Playwright install. This is what makes it installable for the people who
can't run a daemon: teachers, white-collar / corporate devices, school machines.

## How it fits together

```
popup / web Editor      builds a workflow graph { nodes, edges }
        │  chrome.runtime.sendMessage({ action:'run_native_workflow', workflow, secrets })
        ▼
background.js           orchestrator (service worker)
        │  executeGraph(agent, workflow)        ← UNCHANGED branching engine
        ▼
nativeAgent.js          Playwright-shaped agent, but CDP + content-script backed
        ├── content.js        resolves selectors, scrolls, computes coords, React-safe typing, scrape
        └── cdpDriver.js      chrome.debugger → Input.dispatchMouseEvent (real isTrusted clicks)
```

The keystone: `branchingEngine.executeGraph` is **agent-agnostic** — it only calls a
fixed method surface (`navigate`, `click`, `type`, `scrapeContent`, `waitForSelector`,
`clickByNaturalLocator`, `typeByNaturalLocator`, `isPageBlocked`, `elementExists`,
`openTab`/`switchTab`/`closeTab`, `wait`). `nativeAgent.js` implements that exact
surface, so the **same engine** the Editor builds against runs in the browser with zero
changes. `branchingEngine.js` here is a byte copy of `stanley-daemon/branchingEngine.js`,
loaded via a CommonJS shim so there is a single source of truth for the branching logic.

## The four strategies, and where each lives

| Strategy | Where |
|---|---|
| **CDP for `isTrusted` input** (beats bot detection) | `cdpDriver.js` → `clickAt` / `insertText` via `chrome.debugger` |
| **Cross-origin iframe routing** (`Target.getTargets` / `attachToTarget`) | `cdpDriver.js` → `debuggeeForFrame`, matched to the frame URL content.js reports |
| **React-safe value injection** (prototype setter + bubbling events) | `content.js` → `forceInput` |
| **`scrollIntoView` + fresh coords** (no more clicks into empty space) | `content.js` → `locateForClick` (scroll, settle 100ms, recompute rect) |
| **Service-worker keepalive** | message traffic during the run + chunk-pings in `nativeAgent.wait` + a run-scoped `chrome.alarms` backup |

## What's verified vs. what needs a real browser

- **Verified (Node):** the real `executeGraph` runs against `nativeAgent`'s exact
  interface, vault `vault:` values resolve, and conditional branching routes correctly.
  A Proxy guard confirmed the engine never calls a method `nativeAgent` doesn't define.
- **Needs a loaded extension to confirm on real sites:** `isTrusted` clicks landing,
  the debugger banner UX, and OOPIF (cross-origin iframe) input routing — the last is
  Chrome-version-dependent (see below).

## Honest limits

- **reCAPTCHA / hCaptcha** — unsolvable programmatically here, same as with Playwright.
  `isPageBlocked` detects them and the run pauses for the user to solve in the tab.
- **Cross-origin iframe input** — handled best-effort via child-target routing; on Chrome
  builds where `chrome.debugger` can't address the child session it degrades to a
  top-frame click and logs a warning. Same-process and the common single-embed case work.
- **DevTools conflict** — only one debugger can attach per tab. If DevTools is open,
  `initialize()` surfaces a clear "close DevTools and retry" message instead of failing
  silently.
- **The banner** — Chrome shows "Stanley started debugging this browser" for the
  duration of a run (we attach once per workflow, not per action, so it's steady, not
  flickering). This is the intended trade for daemon-free isTrusted input.

## Daemon is now optional

`background.js` no longer auto-connects the native host, so users without a daemon see
no errors. The daemon path remains available via the `connect_daemon` message for
anyone who wants headless / Playwright-only features.

## Remaining integration (next step)

The execution engine + message API are done. Still to wire: a "Run in browser" button in
the popup / web Editor that sends `run_native_workflow` with the current graph and the
vault secrets map. The engine is ready to receive it.
```
