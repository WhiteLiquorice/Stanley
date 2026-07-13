# Stanley Learning Engine

This isolated package is the second advanced-feature overhaul. It lets Stanley
learn from failures and successful runs without allowing a model to rewrite live
automation directly.

## Included

- stable failure fingerprints that group repeated incidents;
- redacted learning cases built from Trust Engine evidence;
- narrow repair proposals with an explicit operation allowlist;
- regression suites covering the failed case and known-good cases;
- mandatory human approval before a repair can be published;
- structured, scoped, expiring organizational memory;
- compilation of verified runs into draft deterministic skills;
- regression and approval gates before skill activation;
- Firestore-compatible storage under each Stanley user.

## Cost behavior

Fingerprinting, validation, regression evaluation, memory matching, and skill
compilation are deterministic. They add storage and test execution but no model
call. A future repair proposer may call the existing model once per grouped
failure; repeated occurrences should reuse the same open learning case.

## Deliberate boundary

This package does not generate arbitrary JavaScript, change workflow topology,
publish its own proposal, or activate its own skill. Initial repair operations
are limited to safe node metadata and assertions. Broader repairs can be added
later as separately tested operation types.
