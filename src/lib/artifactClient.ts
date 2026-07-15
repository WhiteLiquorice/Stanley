import { getFreshIdToken } from './firebaseAuth';

const base = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '');
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  }
  return btoa(chunks.join(''));
}

export interface UploadedArtifact {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export async function uploadArtifact(file: File): Promise<UploadedArtifact> {
  if (!base) throw new Error('Cloud runner is not configured.');
  if (!file.size) throw new Error('Choose a non-empty file.');
  if (file.size > MAX_ARTIFACT_BYTES) throw new Error('Artifacts are limited to 10 MiB.');
  const token = await getFreshIdToken();
  if (!token) throw new Error('Sign in required.');
  const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  const response = await fetch(`${base}/v1/artifacts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, mimeType: file.type || 'application/octet-stream', base64 }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Artifact upload failed (${response.status}).`);
  return payload.artifact;
}

