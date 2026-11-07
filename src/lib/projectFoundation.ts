export interface AppUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMembership {
  userId: string;
  role: 'owner' | 'editor' | 'reviewer' | 'viewer';
}

export interface ProjectShareEntry {
  userId: string;
  role: 'owner' | 'editor' | 'reviewer' | 'viewer';
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  ownerId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  currentRevision: number;
  sharedWith: ProjectShareEntry[];
  doc: any;
}

export interface AuditEvent {
  id: string;
  projectId: string | null;
  userId: string;
  action: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface AppState {
  users: AppUser[];
  workspaces: Array<{ id: string; name: string; ownerId: string; members: WorkspaceMembership[] }>;
  projects: ProjectRecord[];
  auditLog: AuditEvent[];
}

export interface AuthSession {
  userId: string;
  token: string;
  createdAt: string;
}

const STORAGE_KEY = 'zylvex-space-foundation-v1';
const SESSION_KEY = 'zylvex-space-session-v1';

const stableHash = (input: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); }
  };
};

export const readStorage = (): AppState => {
  const storage = globalThis.localStorage ?? createMemoryStorage();
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial: AppState = { users: [], workspaces: [], projects: [], auditLog: [] };
    storage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    const parsed = JSON.parse(raw) as AppState;
    return {
      users: parsed.users ?? [],
      workspaces: parsed.workspaces ?? [],
      projects: parsed.projects ?? [],
      auditLog: parsed.auditLog ?? []
    };
  } catch {
    const fallback: AppState = { users: [], workspaces: [], projects: [], auditLog: [] };
    storage.setItem(STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
};

export const writeStorage = (state: AppState): AppState => {
  const storage = globalThis.localStorage ?? createMemoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
};

export const readSession = (): AuthSession | null => {
  const storage = globalThis.localStorage ?? createMemoryStorage();
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
};

export const writeSession = (session: AuthSession | null): AuthSession | null => {
  const storage = globalThis.localStorage ?? createMemoryStorage();
  if (!session) {
    storage.removeItem(SESSION_KEY);
    return null;
  }
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
};

export const generateUserId = () => `user-${Math.random().toString(36).slice(2, 10)}`;
export const generateProjectId = () => `project-${Math.random().toString(36).slice(2, 10)}`;

export const registerUser = (input: { name: string; email: string; password: string }): AppUser => {
  const state = readStorage();
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!input.name.trim()) throw new Error('Name is required');
  if (!normalizedEmail) throw new Error('Email is required');
  if (!input.password || input.password.length < 6) throw new Error('Password must be at least 6 characters');
  if (state.users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    throw new Error('A user already exists with this email');
  }

  const user: AppUser = {
    id: generateUserId(),
    name: input.name.trim(),
    email: normalizedEmail,
    passwordHash: stableHash(input.password),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.users.push(user);
  const workspaceId = `workspace-${user.id}`;
  state.workspaces.push({
    id: workspaceId,
    name: `${user.name}'s Workspace`,
    ownerId: user.id,
    members: [{ userId: user.id, role: 'owner' }]
  });
  writeStorage(state);
  return user;
};

export const loginUser = (input: { email: string; password: string }): AppUser => {
  const state = readStorage();
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = state.users.find((candidate) => candidate.email.toLowerCase() === normalizedEmail);
  if (!user) throw new Error('Invalid email or password');
  if (user.passwordHash !== stableHash(input.password)) throw new Error('Invalid email or password');

  const session: AuthSession = {
    userId: user.id,
    token: stableHash(`${user.id}:${user.email}:${Date.now()}`),
    createdAt: new Date().toISOString()
  };
  writeSession(session);
  return user;
};

export const logoutUser = () => {
  writeSession(null);
};

export const getCurrentUser = (): AppUser | null => {
  const session = readSession();
  if (!session) return null;
  const state = readStorage();
  return state.users.find((user) => user.id === session.userId) ?? null;
};

export const ensureProjectAccess = (userId: string, projectId: string) => {
  const state = readStorage();
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) throw new Error('Project not found');
  const isOwner = project.ownerId === userId;
  const isShared = project.sharedWith.some((member) => member.userId === userId);
  if (!(isOwner || isShared)) {
    throw new Error('Unauthorized project access');
  }
  return project;
};

export const createProject = (input: { name: string; ownerId: string; workspaceId: string; description?: string }): ProjectRecord => {
  const state = readStorage();
  const owner = state.users.find((user) => user.id === input.ownerId);
  if (!owner) throw new Error('Unknown project owner');
  const name = input.name.trim();
  if (!name) throw new Error('Project name is required');

  const project: ProjectRecord = {
    id: generateProjectId(),
    name,
    description: input.description ?? '',
    status: 'active',
    ownerId: input.ownerId,
    workspaceId: input.workspaceId || `workspace-${owner.id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentRevision: 1,
    sharedWith: [],
    doc: {
      schemaVersion: 1,
      project: {
        id: '',
        name,
        description: input.description ?? '',
        status: 'active',
        ownerId: input.ownerId,
        workspaceId: input.workspaceId || `workspace-${owner.id}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archivedAt: null,
        currentRevision: 1
      },
      displayUnit: 'm',
      floors: [{
        id: 'floor-1',
        name: 'Ground floor',
        elevationMeters: 0,
        rooms: [],
        walls: []
      }],
      objects: [],
      materials: [],
      layers: [{ id: 'layer-1', name: 'Default', visible: true, locked: false }],
      measurements: [],
      annotations: []
    }
  };
  project.doc.project.id = project.id;
  state.projects.push(project);
  state.auditLog.push({
    id: `audit-${Date.now()}`,
    projectId: project.id,
    userId: owner.id,
    action: 'project.created',
    createdAt: new Date().toISOString(),
    details: { name }
  });

  writeStorage(state);
  return project;
};

export const listProjectsForUser = (userId: string): ProjectRecord[] => {
  const state = readStorage();
  return state.projects.filter((project) => {
    const isOwner = project.ownerId === userId;
    const isShared = project.sharedWith.some((entry) => entry.userId === userId);
    return isOwner || isShared;
  });
};

export const saveProject = (projectId: string, userId: string, nextDoc: any): ProjectRecord => {
  const state = readStorage();
  const project = ensureProjectAccess(userId, projectId);
  const projectIndex = state.projects.findIndex((entry) => entry.id === projectId);
  if (projectIndex === -1) throw new Error('Project not found');

  const nextProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    currentRevision: project.currentRevision + 1,
    doc: nextDoc
  };
  state.projects[projectIndex] = nextProject;
  state.auditLog.push({
    id: `audit-${Date.now()}`,
    projectId,
    userId,
    action: 'project.updated',
    createdAt: new Date().toISOString(),
    details: { revision: nextProject.currentRevision }
  });
  writeStorage(state);
  return nextProject;
};

export const getProjectById = (projectId: string, userId: string): ProjectRecord => {
  return ensureProjectAccess(userId, projectId);
};

export const inviteProjectMember = (projectId: string, inviterId: string, targetEmail: string, role: WorkspaceMembership['role'] = 'editor') => {
  const state = readStorage();
  const project = ensureProjectAccess(inviterId, projectId);
  const targetUser = state.users.find((user) => user.email.toLowerCase() === targetEmail.trim().toLowerCase());
  if (!targetUser) throw new Error('User not found');
  if (targetUser.id === project.ownerId) return project;
  if (!project.sharedWith.some((entry) => entry.userId === targetUser.id)) {
    project.sharedWith.push({ userId: targetUser.id, role });
  } else {
    project.sharedWith = project.sharedWith.map((entry) => entry.userId === targetUser.id ? { ...entry, role } : entry);
  }
  state.auditLog.push({
    id: `audit-${Date.now()}`,
    projectId,
    userId: inviterId,
    action: 'project.shared',
    createdAt: new Date().toISOString(),
    details: { targetUserId: targetUser.id, role }
  });
  const index = state.projects.findIndex((entry) => entry.id === projectId);
  state.projects[index] = project;
  writeStorage(state);
  return project;
};

export const isProjectAuthorizedForUser = (userId: string, projectId: string): boolean => {
  try {
    ensureProjectAccess(userId, projectId);
    return true;
  } catch {
    return false;
  }
};

export const createDefaultRoomProject = (name: string, ownerId: string): ProjectRecord => {
  const project = createProject({ name, ownerId, workspaceId: `workspace-${ownerId}` });
  const room = {
    id: 'room-1',
    name: 'Main room',
    lengthMeters: 6,
    widthMeters: 4,
    heightMeters: 2.8,
    origin: { x: 0, y: 0 }
  };
  const wall = {
    id: 'wall-1',
    roomId: 'room-1',
    start: { x: 0, y: 0 },
    end: { x: 6, y: 0 },
    thicknessMeters: 0.2,
    heightMeters: 2.8,
    openings: []
  };
  const object = {
    id: 'object-1',
    name: 'Sample chair',
    category: 'furniture',
    transform: {
      position: { x: 1.5, y: 0, z: 1.2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    dimensionsMeters: { x: 0.6, y: 0.8, z: 0.6 },
    materialId: null,
    layerId: 'layer-1',
    visible: true,
    locked: false,
    source: 'user-created',
    assetId: null
  };
  const measurement = {
    id: 'measurement-1',
    kind: 'length',
    value: 6,
    unit: 'm',
    label: 'Room length',
    geometryIds: ['room-1'],
    provenance: {
      source: 'manual',
      method: 'Manually entered by user',
      capturedAt: new Date().toISOString(),
      authorId: ownerId,
      deviceId: null,
      confidence: 1,
      uncertaintyMeters: 0.01,
      reviewState: 'reviewed',
      sha256: null
    }
  };
  const doc = {
    ...project.doc,
    floors: [{
      id: 'floor-1',
      name: 'Ground floor',
      elevationMeters: 0,
      rooms: [room],
      walls: [wall]
    }],
    objects: [object],
    measurements: [measurement],
    annotations: []
  };
  return saveProject(project.id, ownerId, doc);
};

export const getProjectSnapshot = (userId: string, projectId: string) => {
  const project = ensureProjectAccess(userId, projectId);
  return project.doc;
};

export const archiveProject = (userId: string, projectId: string): ProjectRecord => {
  const state = readStorage();
  const index = state.projects.findIndex((project) => project.id === projectId);
  if (index === -1) throw new Error('Project not found');
  const project = ensureProjectAccess(userId, projectId);
  const updated = { ...project, status: 'archived' as const, updatedAt: new Date().toISOString() };
  state.projects[index] = updated;
  state.auditLog.push({
    id: `audit-${Date.now()}`,
    projectId,
    userId,
    action: 'project.archived',
    createdAt: new Date().toISOString(),
    details: {}
  });
  writeStorage(state);
  return updated;
};

export const restoreProject = (userId: string, projectId: string): ProjectRecord => {
  const state = readStorage();
  const index = state.projects.findIndex((project) => project.id === projectId);
  if (index === -1) throw new Error('Project not found');
  const project = ensureProjectAccess(userId, projectId);
  const updated = { ...project, status: 'active' as const, updatedAt: new Date().toISOString() };
  state.projects[index] = updated;
  writeStorage(state);
  return updated;
};

export const listAuditEventsForProject = (userId: string, projectId: string): AuditEvent[] => {
  ensureProjectAccess(userId, projectId);
  const state = readStorage();
  return state.auditLog.filter((event) => event.projectId === projectId).slice(-20);
};

export const getWorkspaceByUserId = (userId: string) => {
  const state = readStorage();
  return state.workspaces.find((workspace) => workspace.ownerId === userId) ?? null;
};

export const ensureStorageReady = () => {
  const state = readStorage();
  return state;
};

export const createProjectDemoData = (ownerId: string): ProjectRecord[] => {
  const state = readStorage();
  const existing = state.projects.filter((project) => project.ownerId === ownerId);
  if (existing.length > 0) return existing;
  const first = createDefaultRoomProject('Starter room', ownerId);
  return [first];
};

export const createAuthDemoUser = () => {
  const state = readStorage();
  if (state.users.some((user) => user.email === 'demo@zylvex.local')) return state.users.find((user) => user.email === 'demo@zylvex.local');
  return registerUser({ name: 'Demo User', email: 'demo@zylvex.local', password: 'Password123' });
};

export const getAppState = () => readStorage();
