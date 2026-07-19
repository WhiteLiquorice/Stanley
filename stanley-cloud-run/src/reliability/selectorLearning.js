const crypto = require('node:crypto');

function proposalId(nodeId, selector) {
  return `selector-${crypto.createHash('sha256').update(`${nodeId}:${selector}`).digest('hex').slice(0, 20)}`;
}

function workflowRef(db, uid, workflowId) {
  return db.collection('stanley_users').doc(uid).collection('workflows').doc(workflowId);
}

async function recordSelectorProposal(db, uid, workflowId, nodeId, selector, runId) {
  if (!selector || !workflowId || !nodeId) return null;
  const ref = workflowRef(db, uid, workflowId).collection('selectorProposals').doc(proposalId(nodeId, selector));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() : {};
    const observedRunIds = [...new Set([...(current.observedRunIds || []), runId].filter(Boolean))].slice(-20);
    const proposal = {
      schemaVersion: 1, id: ref.id, workflowId, nodeId, selector,
      state: current.state || 'candidate', observedRunIds,
      observations: observedRunIds.length,
      createdAt: current.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: current.expiresAt || new Date(Date.now() + 90 * 86400000),
    };
    transaction.set(ref, proposal, { merge: true });
    return proposal;
  });
}

async function applySelectorProposal(db, uid, workflowId, id, approvedBy) {
  const workflow = workflowRef(db, uid, workflowId);
  const proposalRef = workflow.collection('selectorProposals').doc(id);
  return db.runTransaction(async (transaction) => {
    const [workflowSnapshot, proposalSnapshot] = await Promise.all([transaction.get(workflow), transaction.get(proposalRef)]);
    if (!workflowSnapshot.exists || !proposalSnapshot.exists) throw Object.assign(new Error('Selector proposal not found.'), { status: 404 });
    const proposal = proposalSnapshot.data();
    if (proposal.state === 'applied') return proposal;
    const data = workflowSnapshot.data();
    const nodes = [...(data.nodes || [])];
    const index = nodes.findIndex((node) => node.id === proposal.nodeId);
    if (index < 0) throw Object.assign(new Error('Selector proposal targets a node that no longer exists.'), { status: 409 });
    nodes[index] = { ...nodes[index], data: { ...(nodes[index].data || {}), selector: proposal.selector } };
    const now = new Date().toISOString();
    transaction.update(workflow, { nodes, revision: Number(data.revision || 0) + 1, updatedAt: now });
    transaction.update(proposalRef, { state: 'applied', appliedAt: now, approvedBy, updatedAt: now });
    return { ...proposal, state: 'applied', appliedAt: now, approvedBy };
  });
}

async function listSelectorProposals(db, uid, workflowId) {
  const snapshot = await workflowRef(db, uid, workflowId).collection('selectorProposals').limit(100).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => Number(b.observations || 0) - Number(a.observations || 0));
}

module.exports = { applySelectorProposal, listSelectorProposals, proposalId, recordSelectorProposal };
