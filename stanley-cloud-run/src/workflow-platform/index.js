const { WorkflowPlatformStore } = require('./store');
const { WorkflowPlatformService } = require('./service');
const { createWorkflowPlatformRouter } = require('./routes');
const contract = require('./contract'); const debug = require('./debug'); const clients = require('./clients');
module.exports = { WorkflowPlatformService, WorkflowPlatformStore, createWorkflowPlatformRouter, ...contract, ...debug, ...clients };
