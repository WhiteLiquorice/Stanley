const assertions = require('./assertions');
const evidence = require('./evidence');
const trustPolicy = require('./trustPolicy');
const { TrustRuntime, TrustConfigurationError } = require('./trustRuntime');
const { TrustStore } = require('./trustStore');
const { createTrustRouter } = require('./trustRoutes');
const resume = require('./resume');

module.exports = {
  ...assertions,
  ...evidence,
  ...trustPolicy,
  ...resume,
  TrustConfigurationError,
  TrustRuntime,
  TrustStore,
  createTrustRouter,
};
