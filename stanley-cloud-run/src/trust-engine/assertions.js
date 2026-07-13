const ASSERTION_OPERATORS = new Set([
  'exists', 'absent', 'equals', 'not_equals', 'contains', 'not_contains',
  'matches', 'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal',
  'one_of', 'type',
]);

function tokenizePath(path) {
  if (typeof path !== 'string') return [];
  return path
    .replace(/^\$\.?/, '')
    .replace(/\[(?:"([^"]+)"|'([^']+)'|(\d+))\]/g, (_match, double, single, index) => `.${double || single || index}`)
    .split('.')
    .filter(Boolean);
}

function getPath(source, path) {
  if (!path || path === '$') return source;
  return tokenizePath(path).reduce((value, part) => (value == null ? undefined : value[part]), source);
}

function comparable(value) {
  if (typeof value === 'string') return value.trim();
  return value;
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every((key) => deepEqual(left[key], right[key]));
}

function compare(operator, actual, expected, assertion = {}) {
  switch (operator) {
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'absent': return actual === undefined || actual === null || actual === '';
    case 'equals': return deepEqual(comparable(actual), comparable(expected));
    case 'not_equals': return !deepEqual(comparable(actual), comparable(expected));
    case 'contains': return Array.isArray(actual)
      ? actual.some((item) => deepEqual(item, expected))
      : String(actual ?? '').includes(String(expected ?? ''));
    case 'not_contains': return !compare('contains', actual, expected, assertion);
    case 'matches': {
      const pattern = String(expected ?? '');
      const target = String(actual ?? '');
      if (pattern.length > 256 || target.length > 5000 || /\\[1-9]|\([^)]*[+*][^)]*\)[+*]/.test(pattern)) return false;
      try { return new RegExp(pattern, assertion.flags || '').test(target); }
      catch { return false; }
    }
    case 'greater_than': return Number(actual) > Number(expected);
    case 'greater_or_equal': return Number(actual) >= Number(expected);
    case 'less_than': return Number(actual) < Number(expected);
    case 'less_or_equal': return Number(actual) <= Number(expected);
    case 'one_of': return Array.isArray(expected) && expected.some((item) => deepEqual(actual, item));
    case 'type': {
      if (expected === 'array') return Array.isArray(actual);
      if (expected === 'null') return actual === null;
      if (expected === 'integer') return Number.isInteger(actual);
      return typeof actual === expected;
    }
    default: return false;
  }
}

function normalizeAssertion(assertion, index) {
  return {
    id: assertion.id || `assertion-${index + 1}`,
    label: assertion.label || assertion.message || `Assertion ${index + 1}`,
    source: assertion.source || 'scraped',
    path: assertion.path || '$',
    operator: assertion.operator || 'exists',
    expected: assertion.expected,
    severity: assertion.severity === 'warning' ? 'warning' : 'error',
    message: assertion.message || '',
    flags: assertion.flags || '',
  };
}

function evaluateAssertion(assertion, context = {}, index = 0) {
  const normalized = normalizeAssertion(assertion, index);
  const source = getPath(context, normalized.source);
  const actual = getPath(source, normalized.path);
  const passed = compare(normalized.operator, actual, normalized.expected, normalized);
  return {
    ...normalized,
    passed,
    actual,
    evaluatedAt: new Date().toISOString(),
  };
}

function evaluateAssertions(assertions = [], context = {}) {
  const results = assertions.map((assertion, index) => evaluateAssertion(assertion, context, index));
  const failures = results.filter((result) => !result.passed);
  return {
    passed: failures.every((failure) => failure.severity !== 'error'),
    results,
    failures,
  };
}

module.exports = { ASSERTION_OPERATORS, compare, deepEqual, evaluateAssertion, evaluateAssertions, getPath, normalizeAssertion, tokenizePath };
