const FREE_SUCCESSFUL_RUN_LIMIT = 10;

function isPaidAccount(account = {}) {
  return account.paid === true || account.status === 'active';
}

function usageSnapshot(account = {}) {
  const paid = isPaidAccount(account);
  const runsUsed = Math.max(0, Number(account.runs_used || 0));
  const runsReserved = Math.max(0, Number(account.runs_reserved || 0));
  return {
    paid,
    runsUsed,
    runsReserved,
    remaining: paid ? null : Math.max(0, FREE_SUCCESSFUL_RUN_LIMIT - runsUsed - runsReserved),
  };
}

class RunEntitlementService {
  constructor(db, runs) {
    this.db = db;
    this.runs = runs;
  }

  userRef(uid) {
    return this.db.collection('stanley_users').doc(uid);
  }

  async create(uid, run) {
    const userRef = this.userRef(uid);
    const runRef = this.runs.ref(uid, run.id);
    return this.db.runTransaction(async (transaction) => {
      const [userSnapshot, runSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(runRef),
      ]);
      if (runSnapshot.exists) return { id: runSnapshot.id, ...runSnapshot.data(), duplicate: true };

      const account = userSnapshot.exists ? userSnapshot.data() : { status: 'free', paid: false };
      const usage = usageSnapshot(account);
      if (!usage.paid && usage.remaining <= 0) {
        throw Object.assign(new Error('Your 10 free successful runs are currently used or reserved. Upgrade to continue.'), {
          status: 402,
          code: 'FREE_RUN_LIMIT_REACHED',
        });
      }

      const now = new Date().toISOString();
      const stored = {
        ...run,
        status: this.runs.legacyStatusForState(run.state),
        quotaReservation: usage.paid ? null : { tier: 'free', reservedAt: now },
      };
      transaction.create(runRef, stored);
      if (!usage.paid) {
        const accountPatch = { runs_reserved: usage.runsReserved + 1, updatedAt: now };
        if (userSnapshot.exists) transaction.update(userRef, accountPatch);
        else transaction.create(userRef, { status: 'free', paid: false, runs_used: 0, ...accountPatch, createdAt: now });
      }
      return { ...stored, usage: usageSnapshot({ ...account, runs_reserved: usage.runsReserved + (usage.paid ? 0 : 1) }) };
    });
  }

  async settle(uid, runId, succeeded) {
    const userRef = this.userRef(uid);
    const runRef = this.runs.ref(uid, runId);
    return this.db.runTransaction(async (transaction) => {
      const [userSnapshot, runSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(runRef),
      ]);
      if (!runSnapshot.exists) return null;
      const run = { id: runSnapshot.id, ...runSnapshot.data() };
      if (!run.quotaReservation || run.quotaSettledAt) return run;

      const account = userSnapshot.exists ? userSnapshot.data() : { status: 'free', paid: false };
      const usage = usageSnapshot(account);
      const now = new Date().toISOString();
      const accountPatch = {
        runs_reserved: Math.max(0, usage.runsReserved - 1),
        runs_used: usage.runsUsed + (succeeded ? 1 : 0),
        updatedAt: now,
      };
      if (userSnapshot.exists) transaction.update(userRef, accountPatch);
      else transaction.create(userRef, { status: 'free', paid: false, ...accountPatch, createdAt: now });
      transaction.update(runRef, { quotaSettledAt: now, quotaCounted: Boolean(succeeded), updatedAt: now });
      return { ...run, quotaSettledAt: now, quotaCounted: Boolean(succeeded) };
    });
  }
}

module.exports = { FREE_SUCCESSFUL_RUN_LIMIT, RunEntitlementService, isPaidAccount, usageSnapshot };
