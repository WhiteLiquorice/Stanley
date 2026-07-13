/**
 * Temporary engine boundary.
 *
 * The established Cloud Run engine remains the behavior reference while this
 * isolated API is evaluated. When this directory is promoted, move/copy that
 * engine alongside this adapter and replace this relative import with './engine'.
 */
const { resolveSecrets } = require('../secretsResolver.js');
const { runWorkflowWithContext, WorkflowPausedForApproval } = require('./contextualRunner');

module.exports = { runWorkflowWithContext, WorkflowPausedForApproval, resolveSecrets };
