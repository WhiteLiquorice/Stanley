# One-window promotion guide

This replaces the existing `stanley-runner` revision. It does not create a
second permanent service. Run commands from the Stanley repository root.

## 1. Preflight

```bash
cd GPT-Additions/cloud-run-api
npm install
npm run check
npm test
STANLEY_PROJECT_ID=bridgeway-db29e npm run audit:workflows
cd ../..
```

Resolve every workflow reported by the audit before enforcing the contract.
Common fixes are adding one mission node, attaching it to the single trigger with
a context edge, and placing approval immediately before outbound side effects.

## 2. Build the replacement image

```bash
gcloud config set project bridgeway-db29e
gcloud artifacts repositories describe cloud-run-source-deploy --location us-central1
gcloud builds submit --config GPT-Additions/cloudbuild.yaml .
```

The `cloud-run-source-deploy` Artifact Registry repository normally already
exists when the service has previously been deployed with `--source`. If the
describe command reports it missing, create that Docker repository once in the
Cloud Console before submitting the build.

## 3. Deploy a new revision of the existing service

```bash
gcloud run deploy stanley-runner \
  --image us-central1-docker.pkg.dev/bridgeway-db29e/cloud-run-source-deploy/stanley-runner:gpt-overhaul \
  --project bridgeway-db29e \
  --region us-central1 \
  --allow-unauthenticated \
  --cpu 1 \
  --memory 2Gi \
  --concurrency 1 \
  --timeout 900 \
  --min-instances 0 \
  --max-instances 5 \
  --update-env-vars STANLEY_PROJECT_ID=bridgeway-db29e,ALLOW_LEGACY_RUN=true,ALLOWED_ORIGINS=https://bridgeway-db29e-stanley.web.app\,https://bridgeway-db29e-stanley.firebaseapp.com \
  --update-secrets RUNNER_INTERNAL_KEY=RUNNER_INTERNAL_KEY:latest
```

`min-instances=0` preserves scale-to-zero. Do not configure Cloud Tasks yet;
the API executes inline and the current frontend remains compatible through
`/run` while the new revision is checked.

## 4. Smoke test and switch the web client

```bash
RUNNER_URL=$(gcloud run services describe stanley-runner --region us-central1 --format='value(status.url)')
curl "$RUNNER_URL/healthz"
```

Copy both files from `GPT-Additions/drop-in/src/lib` into `src/lib`. Then build
and deploy hosting with the discovered URL:

```bash
VITE_RUNNER_URL="$RUNNER_URL" npm run build
firebase deploy --only hosting:stanley
```

Confirm a manual run, run history, an approval/reject flow, and one existing
schedule or webhook before proceeding.

## 5. Optional asynchronous dispatch

Inline execution costs no new service category and should remain the initial
configuration. When durable queued dispatch is desired:

```bash
gcloud tasks queues create stanley-runs --location us-central1
gcloud run services update stanley-runner \
  --region us-central1 \
  --update-env-vars CLOUD_TASKS_QUEUE=stanley-runs,CLOUD_TASKS_LOCATION=us-central1,RUNNER_SERVICE_URL="$RUNNER_URL"
```

After the new frontend is confirmed, disable the compatibility endpoint:

```bash
gcloud run services update stanley-runner \
  --region us-central1 \
  --update-env-vars ALLOW_LEGACY_RUN=false
```

## Rollback

Cloud Run retains prior revisions. In the Cloud Console, route 100% traffic back
to the previous healthy revision. Firebase Hosting releases can likewise be
rolled back from the Hosting release history.
