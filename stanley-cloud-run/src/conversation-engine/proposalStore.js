class FirestoreConversationProposalStore {
  constructor(db, { clock = () => new Date().toISOString() } = {}) {
    if (!db) throw new Error('Conversation proposal store requires a database.');
    this.db = db;
    this.clock = clock;
  }

  proposalRef(uid, proposalId) {
    // This collection intentionally sits outside stanley_users/{uid}; the web
    // client's broad legacy rules cannot create or alter review records here.
    return this.db.collection('stanley_conversation_proposals').doc(uid).collection('proposals').doc(proposalId);
  }

  workflowRef(uid, workflowId) {
    return this.db.collection('stanley_users').doc(uid).collection('workflows').doc(workflowId);
  }

  async saveProposal(uid, proposal) {
    const ref = this.proposalRef(uid, proposal.id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const existing = snapshot.data();
        if (existing.fingerprint !== proposal.fingerprint) throw Object.assign(new Error('Conversation proposal ID collision.'), { status: 409 });
        return { id: snapshot.id, ...existing };
      }
      transaction.create(ref, proposal);
      return proposal;
    });
  }

  async applyProposal(uid, proposalId, fingerprint, approvedBy, mutate) {
    const proposalRef = this.proposalRef(uid, proposalId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(proposalRef);
      if (!snapshot.exists) throw Object.assign(new Error('Conversation proposal not found.'), { status: 404 });
      const proposal = { id: snapshot.id, ...snapshot.data() };
      if (proposal.fingerprint !== fingerprint) throw Object.assign(new Error('The approved proposal does not match the reviewed changes.'), { status: 409 });
      if (proposal.state === 'applied') return { ...proposal.result, replayed: true };
      if (proposal.state !== 'proposed') throw Object.assign(new Error(`Conversation proposal is ${proposal.state}.`), { status: 409 });
      if (proposal.expiresAt && Date.parse(proposal.expiresAt) <= Date.parse(this.clock())) {
        throw Object.assign(new Error('Conversation proposal expired. Ask Stanley to prepare a fresh plan.'), { status: 410 });
      }

      const repository = {
        getWorkflow: async (workflowId) => {
          const workflowSnapshot = await transaction.get(this.workflowRef(uid, workflowId));
          return workflowSnapshot.exists ? { id: workflowSnapshot.id, ...workflowSnapshot.data() } : null;
        },
        createWorkflow: (workflow) => {
          const { id, ...data } = workflow;
          transaction.create(this.workflowRef(uid, id), data);
        },
        updateWorkflow: (workflow, prior, archiveId) => {
          const { id, ...data } = workflow;
          const ref = this.workflowRef(uid, id);
          transaction.create(ref.collection('versions').doc(archiveId), {
            ...prior, workflowId: id, archivedAt: this.clock(), source: 'conversation_approval', proposalId,
          });
          transaction.set(ref, data);
        },
      };
      const result = await mutate(repository, proposal);
      transaction.update(proposalRef, {
        state: 'applied', approvedBy, approvedAt: this.clock(), updatedAt: this.clock(), result,
      });
      return { ...result, replayed: false };
    });
  }
}

module.exports = { FirestoreConversationProposalStore };
