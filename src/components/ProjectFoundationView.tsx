import React, { useEffect, useMemo, useState } from 'react';
import {
  AppUser,
  archiveProject,
  createAuthDemoUser,
  createDefaultRoomProject,
  createProject,
  ensureStorageReady,
  getAppState,
  getCurrentUser,
  getProjectById,
  inviteProjectMember,
  listProjectsForUser,
  loginUser,
  logoutUser,
  readSession,
  registerUser,
  restoreProject,
  saveProject,
  isProjectAuthorizedForUser,
  createProjectDemoData
} from '../lib/projectFoundation';

const keyFromProject = (projectId: string) => `zylvex-space-project-${projectId}`;

export const ProjectFoundationView: React.FC = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: 'demo@zylvex.local', password: 'Password123' });
  const [projectName, setProjectName] = useState('My room project');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [message, setMessage] = useState<string>('');
  const [inviteEmail, setInviteEmail] = useState('');

  const refreshProjects = () => {
    if (!user) {
      setProjects([]);
      return;
    }
    setProjects(listProjectsForUser(user.id));
  };

  useEffect(() => {
    ensureStorageReady();
    const active = getCurrentUser();
    if (active) {
      setUser(active);
      const nextProjects = createProjectDemoData(active.id);
      setProjects(nextProjects);
      if (!selectedProjectId && nextProjects[0]) setSelectedProjectId(nextProjects[0].id);
    }
  }, []);

  useEffect(() => {
    if (user) {
      refreshProjects();
    }
  }, [user]);

  useEffect(() => {
    if (!user || !selectedProjectId) return;
    try {
      const project = getProjectById(selectedProjectId, user.id);
      setSelectedDoc(project.doc);
    } catch {
      setSelectedDoc(null);
    }
  }, [selectedProjectId, user, projects]);

  const addRoom = () => {
    if (!user || !selectedProjectId) return;
    const project = getProjectById(selectedProjectId, user.id);
    const nextDoc = { ...project.doc };
    nextDoc.floors = nextDoc.floors.length ? nextDoc.floors : [{ id: 'floor-1', name: 'Ground floor', elevationMeters: 0, rooms: [], walls: [] }];
    nextDoc.floors[0].rooms = nextDoc.floors[0].rooms.concat({
      id: `room-${Date.now()}`,
      name: 'New room',
      lengthMeters: 5,
      widthMeters: 4,
      heightMeters: 2.8,
      origin: { x: 0, y: 0 }
    });
    const updated = saveProject(selectedProjectId, user.id, nextDoc);
    setProjects(listProjectsForUser(user.id));
    setSelectedDoc(updated.doc);
    setMessage('Room added and saved.');
  };

  const addObject = () => {
    if (!user || !selectedProjectId) return;
    const project = getProjectById(selectedProjectId, user.id);
    const nextDoc = { ...project.doc };
    nextDoc.objects = nextDoc.objects.concat({
      id: `object-${Date.now()}`,
      name: 'New object',
      category: 'furniture',
      transform: { position: { x: 1.5, y: 0, z: 1.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      dimensionsMeters: { x: 0.6, y: 0.8, z: 0.6 },
      materialId: null,
      layerId: 'layer-1',
      visible: true,
      locked: false,
      source: 'user-created',
      assetId: null
    });
    const updated = saveProject(selectedProjectId, user.id, nextDoc);
    setProjects(listProjectsForUser(user.id));
    setSelectedDoc(updated.doc);
    setMessage('Object placed into the active room.');
  };

  const saveCurrentProject = () => {
    if (!user || !selectedProjectId || !selectedDoc) return;
    const updated = saveProject(selectedProjectId, user.id, selectedDoc);
    setProjects(listProjectsForUser(user.id));
    setSelectedDoc(updated.doc);
    setMessage('Project saved.');
  };

  const logIn = () => {
    try {
      const nextUser = loginUser({ email: form.email, password: form.password });
      setUser(nextUser);
      setMessage(`Signed in as ${nextUser.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed');
    }
  };

  const register = () => {
    try {
      const nextUser = registerUser({ name: form.name, email: form.email, password: form.password });
      setUser(nextUser);
      setMessage(`Registered ${nextUser.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Registration failed');
    }
  };

  const createProjectAndOpen = () => {
    if (!user) return;
    const created = createProject({ name: projectName.trim() || 'Untitled project', ownerId: user.id, workspaceId: `workspace-${user.id}` });
    setSelectedProjectId(created.id);
    setProjects(listProjectsForUser(user.id));
    setSelectedDoc(created.doc);
    setMessage('Project created.');
  };

  const archiveSelected = () => {
    if (!user || !selectedProjectId) return;
    const updated = archiveProject(user.id, selectedProjectId);
    setProjects(listProjectsForUser(user.id));
    setSelectedDoc(updated.doc);
    setMessage('Project archived.');
  };

  const restoreSelected = () => {
    if (!user || !selectedProjectId) return;
    const updated = restoreProject(user.id, selectedProjectId);
    setProjects(listProjectsForUser(user.id));
    setSelectedDoc(updated.doc);
    setMessage('Project restored.');
  };

  const shareProject = () => {
    if (!user || !selectedProjectId || !inviteEmail.trim()) return;
    const updated = inviteProjectMember(selectedProjectId, user.id, inviteEmail.trim(), 'editor');
    setProjects(listProjectsForUser(user.id));
    setSelectedDoc(updated.doc);
    setMessage(`Shared project with ${inviteEmail.trim()}.`);
    setInviteEmail('');
  };

  const activeProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) ?? null, [projects, selectedProjectId]);

  if (!user) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: 20 }}>
        <div style={{ border: '1px solid #1e293b', borderRadius: 18, background: '#020817', padding: 28 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>ZYLVEX SPACE Foundation</h2>
          <p style={{ color: '#94a3b8', marginTop: 8 }}>Create an account or sign in to manage projects, room geometry, and saved project state.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={() => setAuthMode('login')} style={{ background: authMode === 'login' ? '#0ea5e9' : '#0f172a', color: '#e2e8f0', padding: '8px 12px', borderRadius: 10, border: '1px solid #334155' }}>Login</button>
            <button onClick={() => setAuthMode('register')} style={{ background: authMode === 'register' ? '#0ea5e9' : '#0f172a', color: '#e2e8f0', padding: '8px 12px', borderRadius: 10, border: '1px solid #334155' }}>Register</button>
          </div>
          {authMode === 'register' && (
            <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Full name" style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 12, color: '#e2e8f0' }} />
            </div>
          )}
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email" style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 12, color: '#e2e8f0' }} />
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Password" style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 12, color: '#e2e8f0' }} />
          </div>
          <button onClick={authMode === 'register' ? register : logIn} style={{ marginTop: 22, width: '100%', background: '#0ea5e9', color: 'white', borderRadius: 10, border: 'none', padding: '12px 20px', fontWeight: 700 }}>
            {authMode === 'register' ? 'Create account' : 'Continue to workspace'}
          </button>
          {message && <p style={{ color: '#e2e8f0', marginTop: 14 }}>{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, minHeight: 760 }}>
      <aside style={{ background: '#020817', border: '1px solid #1e293b', borderRadius: 18, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#cbd5e1', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Signed in</div>
            <div style={{ fontWeight: 700 }}>{user.name}</div>
          </div>
          <button onClick={() => { logoutUser(); setUser(null); setSelectedProjectId(null); setSelectedDoc(null); setMessage('Signed out.'); }} style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 8, padding: '8px 10px' }}>Logout</button>
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ color: '#cbd5e1', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>New project</div>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" style={{ width: '100%', marginTop: 8, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 12, color: '#e2e8f0', boxSizing: 'border-box' }} />
          <button onClick={createProjectAndOpen} style={{ width: '100%', marginTop: 12, background: '#0ea5e9', color: 'white', borderRadius: 10, border: 'none', padding: '10px 16px', fontWeight: 700 }}>Create project</button>
        </div>

        <div style={{ marginTop: 28 }}>
          <div style={{ color: '#cbd5e1', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Projects</div>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {projects.map((project) => (
              <button key={project.id} onClick={() => setSelectedProjectId(project.id)} style={{ textAlign: 'left', background: project.id === selectedProjectId ? '#0f172a' : '#020817', border: project.id === selectedProjectId ? '1px solid #22d3ee' : '1px solid #1e293b', color: '#e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontWeight: 700 }}>{project.name}</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>{project.status} · rev {project.currentRevision}</div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div style={{ background: '#020817', border: '1px solid #1e293b', borderRadius: 18, padding: 20 }}>
        {!selectedProjectId || !selectedDoc ? (
          <div style={{ color: '#94a3b8' }}>No live project selected.</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid #1e293b', paddingBottom: 16 }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>Active project</div>
                <h3 style={{ margin: '6px 0 0', fontSize: 28 }}>{activeProject?.name}</h3>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveCurrentProject} style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 10, padding: '10px 14px', fontWeight: 700 }}>Save project</button>
                {activeProject?.status === 'archived' ? (
                  <button onClick={restoreSelected} style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 10, padding: '10px 14px' }}>Restore</button>
                ) : (
                  <button onClick={archiveSelected} style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 10, padding: '10px 14px' }}>Archive</button>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 20 }}>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: 16 }}>
                <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Project</div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{selectedDoc.project.name}</div>
                <div style={{ color: '#cbd5e1', marginTop: 4 }}>{selectedDoc.project.description || 'No description yet.'}</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: 16 }}>
                <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Rooms</div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{selectedDoc.floors.reduce((count: number, floor: any) => count + floor.rooms.length, 0)}</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: 16 }}>
                <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Objects</div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{selectedDoc.objects.length}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, marginTop: 22 }}>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Floor plan</div>
                {selectedDoc.floors.map((floor: any) => (
                  <div key={floor.id} style={{ display: 'grid', gap: 8 }}>
                    {floor.rooms.length === 0 ? <div style={{ color: '#94a3b8' }}>No rooms yet.</div> : floor.rooms.map((room: any) => (
                      <div key={room.id} style={{ background: '#020817', border: '1px solid #334155', borderRadius: 10, padding: 12 }}>
                        <div style={{ fontWeight: 700 }}>{room.name}</div>
                        <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 4 }}>L {room.lengthMeters}m · W {room.widthMeters}m · H {room.heightMeters}m</div>
                      </div>
                    ))}
                  </div>
                ))}
                <button onClick={addRoom} style={{ marginTop: 14, background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 10, padding: '10px 14px', fontWeight: 700 }}>Add room</button>
              </div>

              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>3D scene</div>
                {selectedDoc.objects.length === 0 ? <div style={{ color: '#94a3b8' }}>No objects placed yet.</div> : selectedDoc.objects.map((object: any) => (
                  <div key={object.id} style={{ background: '#020817', border: '1px solid #334155', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                    <div style={{ fontWeight: 700 }}>{object.name}</div>
                    <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 4 }}>{object.category} · size {object.dimensionsMeters.x}m × {object.dimensionsMeters.y}m × {object.dimensionsMeters.z}m</div>
                  </div>
                ))}
                <button onClick={addObject} style={{ marginTop: 8, background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 10, padding: '10px 14px', fontWeight: 700 }}>Place object</button>
              </div>
            </div>

            <div style={{ marginTop: 22, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Measurement provenance</div>
              {selectedDoc.measurements.length === 0 ? <div style={{ color: '#94a3b8' }}>No measurements recorded.</div> : selectedDoc.measurements.map((measurement: any) => (
                <div key={measurement.id} style={{ background: '#020817', border: '1px solid #334155', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{measurement.label}</div>
                  <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 4 }}>{measurement.value} {measurement.unit} · source: {measurement.provenance.source} · method: {measurement.provenance.method}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 22, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Project sharing</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Invite collaborator email" style={{ flex: 1, background: '#020817', border: '1px solid #334155', borderRadius: 10, padding: 12, color: '#e2e8f0' }} />
                <button onClick={shareProject} style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 10, padding: '10px 16px' }}>Share</button>
              </div>
              <div style={{ marginTop: 10, color: '#94a3b8' }}>{activeProject?.sharedWith.length ? `Shared with ${activeProject.sharedWith.length} collaborator(s).` : 'Not shared yet.'}</div>
            </div>

            {message && <div style={{ marginTop: 18, color: '#e2e8f0' }}>{message}</div>}
          </>
        )}
      </div>
    </div>
  );
};
