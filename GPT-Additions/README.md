# GPT Additions

This directory contains isolated, cloud-first additions for Project Stanley.

Nothing in this directory is imported by the current production application. It is
intended to be reviewed and synced into the main stack selectively.

## Direction

- Firebase Hosting serves the web application.
- Firebase Auth and Firestore hold user identity and application data.
- Cloud Run is the sole workflow execution runtime.
- Trusted server-side services resolve vault secrets and invoke runs by workflow ID.
- The deprecated daemon and browser extension are not dependencies of this work.

