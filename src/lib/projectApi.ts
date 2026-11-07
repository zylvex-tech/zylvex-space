import { SpatialProjectDocument } from '../types/spatialProject';

export interface ApiUser { id: string; name: string; email: string; }
export interface ApiWorkspace { id: string; name: string; ownerId: string; role: string; }
export interface ApiProjectSummary {
  id: string;
  ownerId: string;
  workspaceId: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  currentRevision: number;
  members: Array<{ userId: string; role: 'editor' | 'reviewer' | 'viewer' }>;
}
export interface ApiProject extends ApiProjectSummary { document: SpatialProjectDocument; }
export interface ApiRevision { id: string; projectId: string; number: number; authorId: string; createdAt: string; summary: string; }

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({})) as { error?: string; code?: string; details?: string };
  if (!response.ok) throw new ApiError(payload.details ? `${payload.error}: ${payload.details}` : payload.error ?? `Request failed (${response.status})`, response.status, payload.code);
  return payload as T;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const projectApi = {
  me: () => request<{ user: ApiUser }>('/api/auth/me'),
  register: (input: { name: string; email: string; password: string }) => request<{ user: ApiUser }>('/api/auth/register', json('POST', input)),
  login: (input: { email: string; password: string }) => request<{ user: ApiUser }>('/api/auth/login', json('POST', input)),
  logout: () => request<void>('/api/auth/logout', json('POST')),
  workspaces: () => request<{ workspaces: ApiWorkspace[] }>('/api/workspaces'),
  projects: (workspaceId?: string) => {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return request<{ projects: ApiProjectSummary[] }>(`/api/projects${query}`);
  },
  project: (projectId: string) => request<{ project: ApiProject }>(`/api/projects/${encodeURIComponent(projectId)}`),
  createProject: (name: string, workspaceId: string) => request<{ project: ApiProject }>('/api/projects', json('POST', { name, workspaceId })),
  saveProject: (projectId: string, expectedRevision: number, document: SpatialProjectDocument) =>
    request<{ project: ApiProject }>(`/api/projects/${encodeURIComponent(projectId)}`, json('PUT', { expectedRevision, document })),
  archiveProject: (projectId: string) => request<void>(`/api/projects/${encodeURIComponent(projectId)}`, json('DELETE')),
  revisions: (projectId: string) => request<{ revisions: ApiRevision[] }>(`/api/projects/${encodeURIComponent(projectId)}/revisions`)
};
