# Stanley Headless Runner (Cloud Run)

Runs Stanley workflows headless, in the cloud, with no local server or browser
required. The web dashboard calls `POST /run` with the workflow + vault secrets;
this service executes it with Playwright and returns the log lines.

## How it relates to the desktop daemon

These three files are **flat copies** of the desktop engine and must stay in sync
if you change the originals:

| Cloud copy                       | Source of truth                          |
|----------------------------------|------------------------------------------|
| `foundationAgent.js`             | `../foundationAgent.js`                   |
| `foundationAgent.enhanced.js`    | `../stanley-daemon/foundationAgent.enhanced.js` (require path changed to `./`) |
| `branchingEngine.js`             | `../stanley-daemon/branchingEngine.js`    |

The only behavioral difference is the browser launch: `cloudRunner.js` passes
`channel: ''` so Playwright uses its **bundled Chromium** (the base agent now
honors `config.channel`; desktop still defaults to the user's installed Chrome).

## Deploy

Requires the `gcloud` CLI authenticated against the **bridgeway-db29e** project
(where Stanley users + data live).

```bash
cd stanley-cloud-run
gcloud run deploy stanley-runner \
  --source . \
  --project bridgeway-db29e \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 600 \
  --max-instances 5
```

- `--allow-unauthenticated` is safe: the service does its own Firebase ID-token
  + license check on every request. Cloud Run's IAM layer is not the gate.
- `--memory 2Gi` is the practical floor for Chromium. Drop to scale-to-zero by
  leaving `--min-instances` unset (default 0) — you only pay while a run executes.

### Vision / AI (the neuro-symbolic execution layer)

`visionResolver.js` lets the runner fall back to Gemini vision when CSS + semantic
locators miss, and powers `ai_prompt` nodes. It authenticates two ways:

1. **ADC / Vertex AI (default, no keys)** — uses the Cloud Run service account.
   Grant it the Vertex role once:
   ```bash
   PROJNUM=$(gcloud projects describe bridgeway-db29e --format='value(projectNumber)')
   gcloud projects add-iam-policy-binding bridgeway-db29e \
     --member="serviceAccount:${PROJNUM}-compute@developer.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   ```
   (Adjust the member if the service runs as a custom service account.)

2. **API key override** — set `GEMINI_API_KEY` to use the Generative Language
   endpoint instead (handy for local testing). When set, it takes precedence over ADC.

Vision is only called when tier-1 (CSS) and tier-2 (semantic) both miss, so most
steps cost nothing extra.

After deploy, copy the service URL and set it as `VITE_RUNNER_URL` in the web
app's build env (e.g. `.env` / Vercel project settings):

```
VITE_RUNNER_URL=https://stanley-runner-XXXXXXXX-uc.a.run.app
```

## Env vars (optional)

| Var                 | Default                                                                 |
|---------------------|-------------------------------------------------------------------------|
| `STANLEY_PROJECT_ID`| `bridgeway-db29e`                                                       |
| `ALLOWED_ORIGINS`   | `https://bridgeway-db29e.web.app,https://bridgeway-db29e.firebaseapp.com,http://localhost:5173` |
| `PORT`              | `8080` (set by Cloud Run)                                              |
| `VERTEX_LOCATION`   | `us-central1` (Vertex AI region for vision/ai_prompt)                  |
| `VISION_MODEL`      | `gemini-2.5-flash`                                                     |
| `GEMINI_API_KEY`    | _unset_ — if set, uses the Generative Language endpoint instead of ADC |
| `RUNNER_INTERNAL_KEY` | _unset_ — shared secret for `POST /run-internal` (scheduler/webhook server-to-server). Set the SAME value as a Functions secret. |

### Automated runs (`POST /run-internal`)

For scheduler/webhook runs there is no user token. The scheduler dispatcher and
webhook Cloud Functions call `POST /run-internal` with header
`X-Stanley-Internal-Key: $RUNNER_INTERNAL_KEY` and body `{ uid, workflowId, input?, trigger? }`.
The runner then loads the workflow, resolves vault secrets **server-side** (admin
SDK), re-checks the license, runs headless, and saves the run to
`stanley_users/{uid}/runs`. Trigger payloads are available to nodes via
`{{input.field}}` (alias `{{trigger.field}}`).

> **Sync note:** `branchingEngine.js` now contains the 3-tier resolution logic
> (`smartClick`/`smartType`/`maybeVerify`/`interpolate`). It is kept byte-identical
> with `../stanley-daemon/branchingEngine.js`. The extension's ESM copy
> (`../stanley-extension/branchingEngine.js`) carries the same logic by hand.

## Local test

```bash
npm install
# Needs application-default creds with access to bridgeway-db29e:
gcloud auth application-default login --project bridgeway-db29e
npm start
# → POST http://localhost:8080/run with a Bearer token + { workflow, secrets }
```
