function typeMatches(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function deepEqual(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function validateSchema(value, schema = {}, path = '$') {
  if (!schema || typeof schema !== 'object') return [`${path}: invalid schema`];
  const errors = [];
  const allowedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (allowedTypes.length && !allowedTypes.some((type) => typeMatches(value, type))) return [`${path}: expected ${allowedTypes.join(' or ')}`];
  if ('const' in schema && !deepEqual(value, schema.const)) errors.push(`${path}: must equal the declared constant`);
  if (schema.enum && !schema.enum.some((item) => deepEqual(value, item))) errors.push(`${path}: must be one of the declared values`);
  if (schema.allOf) for (const child of schema.allOf) errors.push(...validateSchema(value, child, path));
  if (schema.anyOf && !schema.anyOf.some((child) => validateSchema(value, child, path).length === 0)) errors.push(`${path}: must match at least one schema`);
  if (schema.oneOf && schema.oneOf.filter((child) => validateSchema(value, child, path).length === 0).length !== 1) errors.push(`${path}: must match exactly one schema`);
  if (schema.not && validateSchema(value, schema.not, path).length === 0) errors.push(`${path}: matches a forbidden schema`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength`);
    if (schema.pattern) { try { if (!new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match pattern`); } catch { errors.push(`${path}: invalid schema pattern`); } }
    if (schema.format === 'date-time' && !Number.isFinite(Date.parse(value))) errors.push(`${path}: invalid date-time`);
    if (schema.format === 'uri') { try { new URL(value); } catch { errors.push(`${path}: invalid URI`); } }
    if (schema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`${path}: invalid email`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${path}: below exclusiveMinimum`);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) errors.push(`${path}: above exclusiveMaximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.uniqueItems && new Set(value.map(JSON.stringify)).size !== value.length) errors.push(`${path}: items must be unique`);
    if (schema.items) value.forEach((item, index) => errors.push(...validateSchema(item, schema.items, `${path}[${index}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}.${key}: required`);
    for (const [key, child] of Object.entries(schema.properties || {})) if (key in value) errors.push(...validateSchema(value[key], child, `${path}.${key}`));
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in (schema.properties || {}))) errors.push(`${path}.${key}: additional property not allowed`);
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) errors.push(`${path}: too few properties`);
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) errors.push(`${path}: too many properties`);
  }
  return errors.slice(0, 100);
}

function assertSchema(value, schema, label = 'value') {
  const errors = validateSchema(value, schema);
  if (errors.length) throw new Error(`${label} rejected: ${errors.join('; ')}`);
  return value;
}

module.exports = { assertSchema, typeMatches, validateSchema };
