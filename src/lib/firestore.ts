/**
 * firestore.ts — Firestore REST API client for the Stanley web dashboard.
 *
 * Uses raw fetch + the Firebase ID token from firebaseAuth.ts — no SDK dependency.
 * All data is scoped to the authenticated user: stanley_users/{uid}/{subcollection}.
 *
 * Firestore security rules required (add in Firebase Console → Firestore → Rules):
 *
 *   match /stanley_users/{uid}/{document=**} {
 *     allow read, write: if request.auth != null && request.auth.uid == uid;
 *   }
 */

import { getFreshIdToken } from './firebaseAuth';

const PROJECT_ID = 'bridgeway-db29e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function getUid(): string {
  return localStorage.getItem('stanley_uid') || '';
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getFreshIdToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ── Firestore field serialization ──────────────────────────────────────────────

function toFV(v: unknown): unknown {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFV) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
  return { stringValue: String(v) };
}

function toFields(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, toFV(v)])
  );
}

function fromFV(v: unknown): unknown {
  if (!v || typeof v !== 'object') return null;
  const fv = v as Record<string, unknown>;
  if ('nullValue' in fv) return null;
  if ('booleanValue' in fv) return fv.booleanValue;
  if ('integerValue' in fv) return parseInt(fv.integerValue as string, 10);
  if ('doubleValue' in fv) return fv.doubleValue;
  if ('stringValue' in fv) return fv.stringValue;
  if ('arrayValue' in fv) {
    const arr = fv.arrayValue as { values?: unknown[] };
    return (arr.values || []).map(fromFV);
  }
  if ('mapValue' in fv) {
    const map = fv.mapValue as { fields?: Record<string, unknown> };
    return fromFields(map.fields || {});
  }
  return null;
}

function fromFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromFV(v)]));
}

function docToObj(doc: Record<string, unknown>): Record<string, unknown> {
  const nameParts = (doc.name as string).split('/');
  const id = nameParts[nameParts.length - 1];
  return { id, ...fromFields((doc.fields as Record<string, unknown>) || {}) };
}

// ── Path helpers ───────────────────────────────────────────────────────────────

function isLocalMock(): boolean {
  const token = localStorage.getItem('stanley_id_token') || '';
  return token.startsWith('local-mock-') || token.startsWith('mock-');
}

function getLocalCollection(sub: string): Record<string, unknown>[] {
  const key = `stanley_local_db_${sub}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function setLocalCollection(sub: string, docs: Record<string, unknown>[]): void {
  const key = `stanley_local_db_${sub}`;
  localStorage.setItem(key, JSON.stringify(docs));
}

function collPath(sub: string): string {
  return `${BASE}/stanley_users/${getUid()}/${sub}`;
}

function docPath(sub: string, id: string): string {
  return `${collPath(sub)}/${id}`;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

/** List all documents in a user subcollection. */
export async function listDocs(sub: string): Promise<Record<string, unknown>[]> {
  if (isLocalMock()) {
    return getLocalCollection(sub);
  }
  const headers = await authHeaders();
  const res = await fetch(collPath(sub), { headers });
  if (!res.ok) throw new Error(`Firestore list ${sub} failed: ${res.status}`);
  const data = await res.json() as { documents?: unknown[] };
  return (data.documents || []).map(d => docToObj(d as Record<string, unknown>));
}

/**
 * Write a document with a specific ID (creates or fully replaces).
 * The `id` field is used as the Firestore document ID and is NOT stored in the fields.
 */
export async function setDoc(
  sub: string,
  id: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (isLocalMock()) {
    const docs = getLocalCollection(sub);
    const doc = { id, ...data };
    const index = docs.findIndex(d => d.id === id);
    if (index >= 0) {
      docs[index] = doc;
    } else {
      docs.push(doc);
    }
    setLocalCollection(sub, docs);
    return doc;
  }
  const { id: _omit, ...fields } = data;
  const headers = await authHeaders();
  const res = await fetch(docPath(sub, id), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: toFields(fields) }),
  });
  if (!res.ok) throw new Error(`Firestore set ${sub}/${id} failed: ${res.status}`);
  return docToObj(await res.json() as Record<string, unknown>);
}

/** Delete a document. */
export async function deleteDoc(sub: string, id: string): Promise<void> {
  if (isLocalMock()) {
    const docs = getLocalCollection(sub);
    const filtered = docs.filter(d => d.id !== id);
    setLocalCollection(sub, filtered);
    return;
  }
  const headers = await authHeaders();
  const res = await fetch(docPath(sub, id), { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Firestore delete ${sub}/${id} failed: ${res.status}`);
}
