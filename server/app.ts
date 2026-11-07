import express, { NextFunction, Request, Response } from 'express';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { SpatialProjectDocument } from '../src/types/spatialProject';
import { validateSpatialProjectDocument } from '../src/utils/spatialProjectSchema';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'zylvex_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 12;
const MAX_JSON_BYTES = '1mb';

export type ProjectRole = 'owner' | 'editor' | 'reviewer' | 'viewer';
interface UserRecord { id: string; name: string; email: string; passwordSalt: string; passwordHash: string; createdAt: string; }
interface SessionRecord { id: string; userId: string; tokenHash: string; createdAt: string; expiresAt: string; }
interface WorkspaceRecord { id: string; name: string; ownerId: string; members: Array<{ userId: string; role: ProjectRole }>; }
interface RevisionRecord { id: string; projectId: string; number: number; authorId: string; createdAt: string; summary: string; document: SpatialProjectDocument; }
interface ProjectRecord { id: string; ownerId: string; workspaceId: string; name: string; description: string; status: 'active' | 'archived'; createdAt: string; updatedAt: string; currentRevision: number; members: Array<{ userId: string; role: Exclude<ProjectRole, 'owner'> }>; document: SpatialProjectDocument; }
interface AuditRecord { id: string; actorId: string; projectId: string | null; action: string; createdAt: string; }
interface Store { users: UserRecord[]; sessions: SessionRecord[]; workspaces: WorkspaceRecord[]; projects: ProjectRecord[]; revisions: RevisionRecord[]; audit: AuditRecord[]; }

const emptyStore = (): Store => ({ users: [], sessions: [], workspaces: [], projects: [], revisions: [], audit: [] });
const now = () => new Date().toISOString();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Local durable JSON adapter for development and single-process evaluation only. */
export class JsonFileStore {
  private writeQueue: Promise<void> = Promise.resolve();
  constructor(readonly filePath: string) {}

  async read(): Promise<Store> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Store>;
      return { ...emptyStore(), ...parsed };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
      throw new Error('Persistent application data could not be read');
    }
  }

  async mutate<T>(operation: (store: Store) => T | Promise<T>): Promise<T> {
    let resolveResult!: (result: T) => void;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<T>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const store = await this.read();
        const value = await operation(store);
        await mkdir(path.dirname(this.filePath), { recursive: true });
        const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
        await writeFile(tempPath, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
        await rename(tempPath, this.filePath);
        resolveResult(value);
      } catch (error) {
        rejectResult(error);
      }
    });
    return result;
  }
}

function defaultDocument(project: ProjectRecord): SpatialProjectDocument {
  const createdAt = project.createdAt;
  return {
    schemaVersion: 1,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      ownerId: project.ownerId,
      workspaceId: project.workspaceId,
      createdAt,
      updatedAt: project.updatedAt,
      archivedAt: null,
      currentRevision: 1
    },
    displayUnit: 'm',
    floors: [{ id: randomUUID(), name: 'Ground floor', elevationMeters: 0, rooms: [], walls: [] }],
    objects: [], materials: [], layers: [{ id: randomUUID(), name: 'Default', visible: true, locked: false }],
    measurements: [], annotations: []
  };
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function makeDocument(project: ProjectRecord, document: SpatialProjectDocument, revision: number): SpatialProjectDocument {
  return {
    ...document,
    project: {
      ...document.project,
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      ownerId: project.ownerId,
      workspaceId: project.workspaceId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      archivedAt: project.status === 'archived' ? project.updatedAt : null,
      currentRevision: revision
    }
  };
}

function projectRole(project: ProjectRecord, userId: string): ProjectRole | null {
  if (project.ownerId === userId) return 'owner';
  return project.members.find((member) => member.userId === userId)?.role ?? null;
}

function canRead(role: ProjectRole | null): boolean { return role !== null; }
function canEdit(role: ProjectRole | null): boolean { return role === 'owner' || role === 'editor'; }

export function createApiApp(options: { dataFile: string; secureCookies?: boolean }) {
  const store = new JsonFileStore(options.dataFile);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: MAX_JSON_BYTES, strict: true }));
  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'same-origin');
    if (request.method !== 'GET' && request.headers.origin) {
      const expectedOrigin = `${request.protocol}://${request.get('host')}`;
      if (request.headers.origin !== expectedOrigin) return response.status(403).json({ error: 'Cross-origin request rejected' });
    }
    next();
  });

  const requireUser = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const rawToken = cookieValue(request, SESSION_COOKIE);
      if (!rawToken) return response.status(401).json({ error: 'Authentication required' });
      const tokenHash = sha256(rawToken);
      const state = await store.read();
      const session = state.sessions.find((entry) => safeEqual(entry.tokenHash, tokenHash) && Date.parse(entry.expiresAt) > Date.now());
      const user = session && state.users.find((entry) => entry.id === session.userId);
      if (!session || !user) return response.status(401).json({ error: 'Session is invalid or expired' });
      response.locals.user = { id: user.id, name: user.name, email: user.email };
      response.locals.sessionId = session.id;
      next();
    } catch {
      response.status(500).json({ error: 'Unable to authenticate request' });
    }
  };

  const requireProject = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const state = await store.read();
      const project = state.projects.find((entry) => entry.id === request.params.projectId);
      const role = project ? projectRole(project, response.locals.user.id as string) : null;
      if (!project || !canRead(role)) return response.status(404).json({ error: 'Project not found' });
      response.locals.project = project;
      response.locals.projectRole = role;
      next();
    } catch {
      response.status(500).json({ error: 'Unable to load project' });
    }
  };

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

  app.post('/api/auth/register', async (request, response) => {
    const { name, email, password } = request.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) return response.status(400).json({ error: 'Name must be between 1 and 100 characters' });
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) return response.status(400).json({ error: 'A valid email is required' });
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > 128) return response.status(400).json({ error: `Password must be ${PASSWORD_MIN_LENGTH} to 128 characters` });
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const salt = randomBytes(16).toString('hex');
      const passwordHash = (await scrypt(password, salt, 64)) as Buffer;
      const token = randomBytes(32).toString('base64url');
      const user = { id: randomUUID(), name: name.trim(), email: normalizedEmail, passwordSalt: salt, passwordHash: passwordHash.toString('hex'), createdAt: now() };
      const workspace = { id: randomUUID(), name: `${user.name}'s Workspace`, ownerId: user.id, members: [{ userId: user.id, role: 'owner' as const }] };
      const session = { id: randomUUID(), userId: user.id, tokenHash: sha256(token), createdAt: now(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };
      await store.mutate((state) => {
        if (state.users.some((entry) => entry.email === normalizedEmail)) throw new Error('EMAIL_EXISTS');
        state.users.push(user);
        state.workspaces.push(workspace);
        state.sessions.push(session);
      });
      response.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: options.secureCookies ?? false, path: '/', maxAge: SESSION_TTL_MS });
      response.status(201).json({ user: { id: user.id, name: user.name, email: user.email }, workspace: { id: workspace.id, name: workspace.name } });
    } catch (error) {
      if (error instanceof Error && error.message === 'EMAIL_EXISTS') return response.status(409).json({ error: 'An account already exists for that email' });
      response.status(500).json({ error: 'Account could not be created' });
    }
  });

  app.post('/api/auth/login', async (request, response) => {
    const { email, password } = request.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') return response.status(400).json({ error: 'Email and password are required' });
    try {
      const state = await store.read();
      const user = state.users.find((entry) => entry.email === email.trim().toLowerCase());
      if (!user || password.length > 128) return response.status(401).json({ error: 'Invalid email or password' });
      const derived = (await scrypt(password, user.passwordSalt, 64)) as Buffer;
      if (!safeEqual(derived.toString('hex'), user.passwordHash)) return response.status(401).json({ error: 'Invalid email or password' });
      const token = randomBytes(32).toString('base64url');
      const session = { id: randomUUID(), userId: user.id, tokenHash: sha256(token), createdAt: now(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };
      await store.mutate((current) => { current.sessions = current.sessions.filter((entry) => entry.userId !== user.id || Date.parse(entry.expiresAt) > Date.now()); current.sessions.push(session); });
      response.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: options.secureCookies ?? false, path: '/', maxAge: SESSION_TTL_MS });
      response.json({ user: { id: user.id, name: user.name, email: user.email } });
    } catch {
      response.status(500).json({ error: 'Unable to sign in' });
    }
  });

  app.post('/api/auth/logout', requireUser, async (_request, response) => {
    await store.mutate((state) => { state.sessions = state.sessions.filter((entry) => entry.id !== response.locals.sessionId); });
    response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: options.secureCookies ?? false, path: '/' });
    response.status(204).end();
  });

  app.get('/api/auth/me', requireUser, (request, response) => response.json({ user: response.locals.user }));

  app.get('/api/workspaces', requireUser, async (_request, response) => {
    const state = await store.read();
    const memberships = state.workspaces.filter((workspace) => workspace.members.some((member) => member.userId === response.locals.user.id));
    response.json({ workspaces: memberships.map(({ id, name, ownerId, members }) => ({ id, name, ownerId, role: members.find((member) => member.userId === response.locals.user.id)?.role })) });
  });

  app.get('/api/projects', requireUser, async (request, response) => {
    const state = await store.read();
    const workspaceId = typeof request.query.workspaceId === 'string' ? request.query.workspaceId : null;
    const search = typeof request.query.search === 'string' ? request.query.search.trim().toLowerCase() : '';
    const projects = state.projects.filter((project) => projectRole(project, response.locals.user.id) !== null && (!workspaceId || project.workspaceId === workspaceId) && (!search || project.name.toLowerCase().includes(search)));
    response.json({ projects: projects.map(({ document: _document, ...project }) => project) });
  });

  app.post('/api/projects', requireUser, async (request, response) => {
    const { name, description = '', workspaceId } = request.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 160) return response.status(400).json({ error: 'Project name must be between 1 and 160 characters' });
    if (typeof description !== 'string' || description.length > 4000) return response.status(400).json({ error: 'Description must be at most 4000 characters' });
    if (typeof workspaceId !== 'string') return response.status(400).json({ error: 'workspaceId is required' });
    try {
      const project = await store.mutate((state) => {
        const workspace = state.workspaces.find((entry) => entry.id === workspaceId && entry.members.some((member) => member.userId === response.locals.user.id));
        if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');
        const createdAt = now();
        const next: ProjectRecord = {
          id: randomUUID(), ownerId: response.locals.user.id, workspaceId, name: name.trim(), description,
          status: 'active', createdAt, updatedAt: createdAt, currentRevision: 1, members: [], document: null as unknown as SpatialProjectDocument
        };
        next.document = defaultDocument(next);
        state.projects.push(next);
        state.revisions.push({ id: randomUUID(), projectId: next.id, number: 1, authorId: next.ownerId, createdAt, summary: 'Project created', document: next.document });
        state.audit.push({ id: randomUUID(), actorId: next.ownerId, projectId: next.id, action: 'project.created', createdAt });
        return next;
      });
      response.status(201).json({ project });
    } catch (error) {
      if (error instanceof Error && error.message === 'WORKSPACE_NOT_FOUND') return response.status(404).json({ error: 'Workspace not found' });
      response.status(500).json({ error: 'Project could not be created' });
    }
  });

  app.get('/api/projects/:projectId', requireUser, requireProject, (_request, response) => response.json({ project: response.locals.project }));

  app.put('/api/projects/:projectId', requireUser, requireProject, async (request, response) => {
    if (!canEdit(response.locals.projectRole)) return response.status(403).json({ error: 'Project is read-only for this role' });
    const { document, expectedRevision } = request.body ?? {};
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) return response.status(400).json({ error: 'expectedRevision must be a positive integer' });
    try {
      validateSpatialProjectDocument(document);
    } catch (error) {
      return response.status(400).json({ error: 'Invalid project document', details: error instanceof Error ? error.message : 'Validation failed' });
    }
    try {
      const updated = await store.mutate((state) => {
        const project = state.projects.find((entry) => entry.id === request.params.projectId);
        if (!project || !canEdit(projectRole(project, response.locals.user.id))) throw new Error('ACCESS_DENIED');
        if (project.currentRevision !== expectedRevision) throw new Error('REVISION_CONFLICT');
        const timestamp = now();
        project.currentRevision += 1;
        project.updatedAt = timestamp;
        project.document = makeDocument(project, document as SpatialProjectDocument, project.currentRevision);
        state.revisions.push({ id: randomUUID(), projectId: project.id, number: project.currentRevision, authorId: response.locals.user.id, createdAt: timestamp, summary: 'Project document updated', document: project.document });
        state.audit.push({ id: randomUUID(), actorId: response.locals.user.id, projectId: project.id, action: 'project.updated', createdAt: timestamp });
        return project;
      });
      response.json({ project: updated });
    } catch (error) {
      if (error instanceof Error && error.message === 'REVISION_CONFLICT') return response.status(409).json({ error: 'Project has changed since it was opened', code: 'REVISION_CONFLICT' });
      if (error instanceof Error && error.message === 'ACCESS_DENIED') return response.status(404).json({ error: 'Project not found' });
      response.status(500).json({ error: 'Project could not be saved' });
    }
  });

  app.get('/api/projects/:projectId/revisions', requireUser, requireProject, async (request, response) => {
    const state = await store.read();
    const revisions = state.revisions.filter((revision) => revision.projectId === request.params.projectId).map(({ document: _document, ...revision }) => revision);
    response.json({ revisions });
  });

  app.get('/api/projects/:projectId/revisions/:revisionNumber', requireUser, requireProject, async (request, response) => {
    const revisionNumber = Number(request.params.revisionNumber);
    const state = await store.read();
    const revision = state.revisions.find((entry) => entry.projectId === request.params.projectId && entry.number === revisionNumber);
    if (!revision) return response.status(404).json({ error: 'Revision not found' });
    response.json({ revision });
  });

  app.post('/api/projects/:projectId/members', requireUser, requireProject, async (request, response) => {
    if (response.locals.projectRole !== 'owner') return response.status(403).json({ error: 'Only the project owner can manage members' });
    const { email, role } = request.body ?? {};
    if (typeof email !== 'string' || !['editor', 'reviewer', 'viewer'].includes(role)) return response.status(400).json({ error: 'A valid email and role are required' });
    try {
      const project = await store.mutate((state) => {
        const target = state.users.find((user) => user.email === email.trim().toLowerCase());
        if (!target) throw new Error('USER_NOT_FOUND');
        const current = state.projects.find((entry) => entry.id === request.params.projectId)!;
        const memberRole = role as Exclude<ProjectRole, 'owner'>;
        const existing = current.members.find((member) => member.userId === target.id);
        if (existing) existing.role = memberRole;
        else current.members.push({ userId: target.id, role: memberRole });
        state.audit.push({ id: randomUUID(), actorId: response.locals.user.id, projectId: current.id, action: 'project.member_changed', createdAt: now() });
        return current;
      });
      response.status(200).json({ projectId: project.id, members: project.members });
    } catch (error) {
      if (error instanceof Error && error.message === 'USER_NOT_FOUND') return response.status(404).json({ error: 'User not found' });
      response.status(500).json({ error: 'Project member could not be added' });
    }
  });

  app.delete('/api/projects/:projectId', requireUser, requireProject, async (request, response) => {
    if (response.locals.projectRole !== 'owner') return response.status(403).json({ error: 'Only the project owner can archive this project' });
    await store.mutate((state) => {
      const project = state.projects.find((entry) => entry.id === request.params.projectId)!;
      project.status = 'archived';
      project.updatedAt = now();
      project.document = makeDocument(project, project.document, project.currentRevision);
      state.audit.push({ id: randomUUID(), actorId: response.locals.user.id, projectId: project.id, action: 'project.archived', createdAt: now() });
    });
    response.status(204).end();
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError) return response.status(400).json({ error: 'Malformed JSON request' });
    response.status(500).json({ error: 'Unexpected server error' });
  });

  return { app, store };
}
