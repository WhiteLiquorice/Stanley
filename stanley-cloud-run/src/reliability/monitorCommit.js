function baselineMatches(currentHash, expectedHash) {
  return (currentHash ?? null) === (expectedHash ?? null);
}

async function commitMonitorCandidates(db, uid, runId) {
  if (!db || !uid || !runId) return [];
  const user = db.collection('stanley_users').doc(uid);
  const snapshot = await user.collection('monitor_candidates').where('runId', '==', runId).get();
  const results = [];
  for (const candidateDoc of snapshot.docs) {
    const result = await db.runTransaction(async (transaction) => {
      const freshCandidate = await transaction.get(candidateDoc.ref);
      if (!freshCandidate.exists) return { id: candidateDoc.id, status: 'missing' };
      const candidate = freshCandidate.data();
      const baselineRef = user.collection('monitor_state').doc(candidate.baselineId);
      const baselineDoc = await transaction.get(baselineRef);
      const currentHash = baselineDoc.exists ? baselineDoc.data().hash : null;
      if (!baselineMatches(currentHash, candidate.previousHash)) {
        transaction.update(candidateDoc.ref, { state: 'superseded', supersededAt: new Date().toISOString() });
        return { id: candidateDoc.id, status: 'superseded' };
      }
      transaction.set(baselineRef, {
        hash: candidate.hash,
        workflowId: candidate.workflowId,
        nodeId: candidate.nodeId,
        committedRunId: runId,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      transaction.delete(candidateDoc.ref);
      return { id: candidateDoc.id, status: 'committed' };
    });
    results.push(result);
  }
  return results;
}

module.exports = { baselineMatches, commitMonitorCandidates };
