export type JsonSchema = {
  type?: string;
  title?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
};

export function schemaDefaults(schema?: JsonSchema): Record<string, unknown> {
  return Object.fromEntries(Object.entries(schema?.properties || {}).map(([name, property]) => {
    if (property.default !== undefined) return [name, property.default];
    if (property.type === 'boolean') return [name, false];
    return [name, ''];
  }));
}

export function validateSchemaInput(schema: JsonSchema | undefined, values: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const required = new Set(schema?.required || []);
  for (const [name, property] of Object.entries(schema?.properties || {})) {
    const value = values[name];
    if (required.has(name) && (value === '' || value === null || value === undefined)) {
      errors[name] = 'Required';
      continue;
    }
    if (value === '' || value === null || value === undefined) continue;
    if (property.type === 'integer' && !Number.isInteger(Number(value))) errors[name] = 'Enter a whole number';
    if (property.minimum !== undefined && Number(value) < property.minimum) errors[name] = `Minimum ${property.minimum}`;
    if (property.maximum !== undefined && Number(value) > property.maximum) errors[name] = `Maximum ${property.maximum}`;
    if (property.format === 'email' && !/^\S+@\S+\.\S+$/.test(String(value))) errors[name] = 'Enter a valid email';
    if (property.format === 'uri') {
      try { new URL(String(value)); } catch { errors[name] = 'Enter a full URL'; }
    }
  }
  return errors;
}

export function normalizeSchemaInput(schema: JsonSchema | undefined, values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '').map(([name, value]) => {
    const property = schema?.properties?.[name];
    if (property?.type === 'integer') return [name, Number(value)];
    if (property?.type === 'boolean') return [name, Boolean(value)];
    return [name, value];
  }));
}

export function SchemaInputForm({ schema, value, errors = {}, onChange }: {
  schema?: JsonSchema;
  value: Record<string, unknown>;
  errors?: Record<string, string>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  return <>
    {Object.entries(schema?.properties || {}).map(([name, property]) => {
      const label = property.title || property.description || name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
      const required = schema?.required?.includes(name);
      const common = { id: `run-input-${name}`, className: 'form-input', required, value: String(value[name] ?? ''), onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [name]: property.type === 'boolean' ? (event.target as HTMLInputElement).checked : event.target.value }) };
      return <div className="form-group" key={name}>
        <label htmlFor={common.id}>{label}{required ? ' *' : ''}</label>
        {property.enum?.length ? (
          <select {...common}><option value="">Select…</option>{property.enum.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select>
        ) : property.type === 'boolean' ? (
          <input id={common.id} type="checkbox" checked={Boolean(value[name])} onChange={common.onChange} />
        ) : (
          <input {...common} type={property.type === 'integer' ? 'number' : property.format === 'email' ? 'email' : property.format === 'uri' ? 'url' : 'text'} min={property.minimum} max={property.maximum} placeholder={property.description || name} />
        )}
        {errors[name] && <small style={{ color: 'var(--error)' }}>{errors[name]}</small>}
      </div>;
    })}
  </>;
}
import type { ChangeEvent } from 'react';
