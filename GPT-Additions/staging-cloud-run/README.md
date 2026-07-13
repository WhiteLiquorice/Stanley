# Stanley advanced-platform staging build

This build uses the repository root as its build context but copies only the
Cloud Run runner and isolated GPT additions. It does not copy `.env`, vault
exports, browser state, or website assets.

The image applies constrained recovery, orchestration, Trust, and Connector
hooks, followed by context and server overlays for skills, learning, memory,
monitoring, and authenticated scheduler wakeups. It runs as an unprivileged user
and keeps Cloud Run scale-to-zero behavior. Building and deploying are
intentionally left for the operator.

Example build command (not executed by this work):

`gcloud builds submit --config GPT-Additions/staging-cloud-run/cloudbuild.yaml --substitutions _IMAGE=REGION-docker.pkg.dev/PROJECT/REPOSITORY/stanley-connector-staging:TAG .`
