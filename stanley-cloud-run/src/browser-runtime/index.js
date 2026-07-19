const { SessionCipher } = require('./encryption');
const { BrowserRuntimeStore } = require('./store');
const { sharedLifecycle } = require('./lifecycle');
const { TakeoverBroker } = require('./takeover');
const { BrowserRunRuntime } = require('./runtime');
const { createBrowserRuntimeRouter } = require('./routes');
const { DistributedBrowserLifecycleManager } = require('./distributedLifecycle');

const servicesByDb = new WeakMap();
function getBrowserRuntimeServices(db) {
  if (servicesByDb.has(db)) return servicesByDb.get(db);
  const cipher = new SessionCipher(process.env.BROWSER_SESSION_ENCRYPTION_KEY || '');
  const store = new BrowserRuntimeStore(db, { cipher });
  const services = { cipher, store, lifecycle: sharedLifecycle, distributedLifecycle: new DistributedBrowserLifecycleManager(db) };
  services.takeover = new TakeoverBroker(store, { cipher });
  servicesByDb.set(db, services);
  return services;
}

module.exports = { BrowserRunRuntime, createBrowserRuntimeRouter, getBrowserRuntimeServices };
