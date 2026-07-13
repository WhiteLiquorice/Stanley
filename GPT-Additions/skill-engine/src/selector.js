const { validateSchema } = require('../../connector-engine');
const { evaluateAssertions } = require('../../trust-engine');

function normalizeTags(tags = []) { return new Set(tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)); }

function evaluatePreconditions(skill, context) {
  if (!skill.preconditions?.length) return { passed: true, results: [] };
  return evaluateAssertions(skill.preconditions, { input: context.input || {}, run: context.run || {}, context });
}

function scoreSkill(skill, context) {
  const reasons = []; let score = 0;
  if (skill.tenantId !== context.tenantId) return { compatible: false, score: -Infinity, reasons: ['tenant mismatch'] };
  if (skill.state !== 'active') return { compatible: false, score: -Infinity, reasons: ['skill is not active'] };
  if (skill.workflowId === context.workflowId) { score += 100; reasons.push('exact workflow match'); }
  else if (skill.match?.allowCrossWorkflow !== true) return { compatible: false, score: -Infinity, reasons: ['workflow mismatch'] };
  if (context.operationName && skill.operationName === context.operationName) { score += 40; reasons.push('operation match'); }
  if (validateSchema(context.input || {}, skill.inputSchema).length) return { compatible: false, score: -Infinity, reasons: ['input schema mismatch'] };
  reasons.push('input schema compatible'); score += 20;
  const requestedTags = normalizeTags(context.tags); const skillTags = normalizeTags(skill.match?.tags);
  const matchedTags = [...requestedTags].filter((tag) => skillTags.has(tag)); score += matchedTags.length * 5;
  if (matchedTags.length) reasons.push(`matched tags: ${matchedTags.join(', ')}`);
  const requiredTags = normalizeTags(skill.match?.requiredTags);
  if ([...requiredTags].some((tag) => !requestedTags.has(tag))) return { compatible: false, score: -Infinity, reasons: ['required tag missing'] };
  if (context.targetDomain && skill.targetDomains?.length && !skill.targetDomains.includes(String(context.targetDomain).toLowerCase())) return { compatible: false, score: -Infinity, reasons: ['target domain mismatch'] };
  const preconditions = evaluatePreconditions(skill, context); if (!preconditions.passed) return { compatible: false, score: -Infinity, reasons: ['preconditions failed'], preconditions };
  if (preconditions.results.length) { score += 15; reasons.push('preconditions passed'); }
  const total = Number(skill.successCount || 0) + Number(skill.failureCount || 0); const successRate = total ? Number(skill.successCount || 0) / total : 0;
  score += successRate * 20 + Number(skill.confidence || 0) * 20 - Number(skill.driftCount || 0) * 10;
  reasons.push(`verified success rate ${Math.round(successRate * 100)}%`); reasons.push(`confidence ${Number(skill.confidence || 0).toFixed(2)}`);
  return { compatible: true, score, reasons, preconditions };
}

function selectSkill(skills, context, options = {}) {
  const ranked = (skills || []).map((skill) => ({ skill, ...scoreSkill(skill, context) })).filter((item) => item.compatible).sort((left, right) => right.score - left.score || String(right.skill.version).localeCompare(String(left.skill.version)) || left.skill.skillId.localeCompare(right.skill.skillId));
  if (!ranked.length) return { selected: null, explanation: { reason: 'No compatible approved skill.', considered: (skills || []).length } };
  const minimumScore = Number(options.minimumScore || 100); if (ranked[0].score < minimumScore) return { selected: null, explanation: { reason: 'Compatible skills were below the confidence threshold.', topScore: ranked[0].score } };
  if (ranked[1] && ranked[0].score === ranked[1].score && ranked[0].skill.skillId !== ranked[1].skill.skillId && options.allowDeterministicTieBreak !== true) return { selected: null, explanation: { reason: 'Skill selection was ambiguous.', candidates: ranked.slice(0, 2).map((item) => item.skill.skillId) } };
  const winner = ranked[0];
  return { selected: winner.skill, explanation: { reason: 'Highest compatible deterministic skill score.', score: winner.score, reasons: winner.reasons, considered: (skills || []).length, selectedSkillId: winner.skill.skillId, selectedVersion: winner.skill.version } };
}

module.exports = { evaluatePreconditions, normalizeTags, scoreSkill, selectSkill };
