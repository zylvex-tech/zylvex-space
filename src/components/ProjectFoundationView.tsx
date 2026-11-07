import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, ApiProject, ApiProjectSummary, ApiRevision, ApiUser, ApiWorkspace, projectApi } from '../lib/projectApi';
import { Measurement, SpatialProjectDocument, Wall } from '../types/spatialProject';

const id = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const panel: React.CSSProperties = { background: '#020817', border: '1px solid #1e293b', borderRadius: 16, padding: 18 };
const inputStyle: React.CSSProperties = { width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 9, padding: 11, color: '#e2e8f0', boxSizing: 'border-box' };
const buttonStyle: React.CSSProperties = { background: '#0ea5e9', color: '#fff', border: 0, borderRadius: 9, padding: '10px 14px', fontWeight: 700, cursor: 'pointer' };

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') return 'This project changed elsewhere. Reload the latest revision before saving your edits.';
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

function roomWalls(roomId: string, x: number, y: number, length: number, width: number, height: number): Wall[] {
  const points = [
    { x, y }, { x: x + length, y }, { x: x + length, y: y + width }, { x, y: y + width }
  ];
  return points.map((start, index) => ({
    id: id('wall'), roomId, start, end: points[(index + 1) % points.length], thicknessMeters: 0.12, heightMeters: height, openings: []
  }));
}

function manualLengthMeasurement(roomId: string, length: number, authorId: string): Measurement {
  return {
    id: id('measurement'), kind: 'length', value: length, unit: 'm', label: 'Room length', geometryIds: [roomId],
    provenance: {
      source: 'manual', method: 'Entered by the user', capturedAt: new Date().toISOString(), authorId,
      deviceId: null, confidence: null, uncertaintyMeters: null, reviewState: 'unreviewed', sha256: null
    }
  };
}

export const ProjectFoundationView: React.FC = () => {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [projects, setProjects] = useState<ApiProjectSummary[]>([]);
  const [project, setProject] = useState<ApiProject | null>(null);
  const [revisions, setRevisions] = useState<ApiRevision[]>([]);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [projectName, setProjectName] = useState('My room project');
  const [roomForm, setRoomForm] = useState({ name: 'Living room', length: '5', width: '4', height: '2.8' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const reportError = (error: unknown) => setMessage(errorText(error));
  const loadWorkspaceData = useCallback(async (nextWorkspaceId?: string) => {
    const [workspaceResult] = await Promise.all([projectApi.workspaces()]);
    setWorkspaces(workspaceResult.workspaces);
    const selected = nextWorkspaceId ?? workspaceId ?? workspaceResult.workspaces[0]?.id ?? '';
    setWorkspaceId(selected);
    const projectResult = await projectApi.projects(selected || undefined);
    setProjects(projectResult.projects);
    if (project?.id && projectResult.projects.some((item) => item.id === project.id)) {
      const refreshed = await projectApi.project(project.id);
      setProject(refreshed.project);
      const history = await projectApi.revisions(project.id);
      setRevisions(history.revisions);
    } else {
      setProject(null);
      setRevisions([]);
    }
  }, [workspaceId, project?.id]);

  useEffect(() => {
    let mounted = true;
    projectApi.me().then(async ({ user: current }) => {
      if (!mounted) return;
      setUser(current);
      const result = await projectApi.workspaces();
      if (!mounted) return;
      setWorkspaces(result.workspaces);
      const firstWorkspace = result.workspaces[0];
      setWorkspaceId(firstWorkspace?.id ?? '');
      const listed = await projectApi.projects(firstWorkspace?.id);
      if (!mounted) return;
      setProjects(listed.projects);
    }).catch((error: unknown) => {
      if (mounted && (!(error instanceof ApiError) || error.status !== 401)) reportError(error);
    });
    return () => { mounted = false; };
  }, []);

  const roomCount = useMemo(() => project?.document.floors.reduce((sum, floor) => sum + floor.rooms.length, 0) ?? 0, [project]);

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = authMode === 'register'
        ? await projectApi.register(form)
        : await projectApi.login({ email: form.email, password: form.password });
      setUser(result.user);
      setForm({ name: '', email: '', password: '' });
      const resultWorkspaces = await projectApi.workspaces();
      setWorkspaces(resultWorkspaces.workspaces);
      const first = resultWorkspaces.workspaces[0];
      setWorkspaceId(first?.id ?? '');
      const listed = await projectApi.projects(first?.id);
      setProjects(listed.projects);
      setProject(null);
      setMessage(authMode === 'register' ? 'Account created.' : 'Signed in.');
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try { await projectApi.logout(); }
    catch (error) { reportError(error); }
    finally {
      setUser(null); setWorkspaces([]); setProjects([]); setProject(null); setRevisions([]); setBusy(false);
      setMessage('Signed out.');
    }
  };

  const openProject = async (projectId: string) => {
    setBusy(true);
    try {
      const [{ project: opened }, { revisions: history }] = await Promise.all([projectApi.project(projectId), projectApi.revisions(projectId)]);
      setProject(opened); setRevisions(history); setMessage(`Opened revision ${opened.currentRevision}.`);
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  };

  const createProject = async () => {
    if (!workspaceId) { setMessage('Your account has no available workspace.'); return; }
    setBusy(true);
    try {
      const { project: created } = await projectApi.createProject(projectName.trim(), workspaceId);
      setProjects((current) => [created, ...current]);
      setProject(created);
      setRevisions([{ id: `revision-${created.currentRevision}`, projectId: created.id, number: created.currentRevision, authorId: created.ownerId, createdAt: created.createdAt, summary: 'Project created' }]);
      setMessage('Project created and saved by the API.');
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  };

  const save = async (document: SpatialProjectDocument) => {
    if (!project) return;
    setBusy(true);
    try {
      const { project: saved } = await projectApi.saveProject(project.id, project.currentRevision, document);
      setProject(saved);
      await loadWorkspaceData(workspaceId);
      const history = await projectApi.revisions(saved.id);
      setRevisions(history.revisions);
      setMessage(`Saved as revision ${saved.currentRevision}.`);
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  };

  const addRoom = async () => {
    if (!project || !user) return;
    const length = Number(roomForm.length); const width = Number(roomForm.width); const height = Number(roomForm.height);
    if (![length, width, height].every(Number.isFinite) || length <= 0 || width <= 0 || height <= 0) {
      setMessage('Room length, width, and height must be positive finite values in metres.'); return;
    }
    const roomId = id('room');
    const floor = project.document.floors[0];
    if (!floor) { setMessage('The project has no floor to add a room to.'); return; }
    const x = floor.rooms.reduce((max, room) => Math.max(max, room.origin.x + room.lengthMeters + 1), 0);
    const next: SpatialProjectDocument = {
      ...project.document,
      floors: project.document.floors.map((item, index) => index !== 0 ? item : {
        ...item,
        rooms: [...item.rooms, { id: roomId, name: roomForm.name.trim() || 'Room', lengthMeters: length, widthMeters: width, heightMeters: height, origin: { x, y: 0 } }],
        walls: [...item.walls, ...roomWalls(roomId, x, 0, length, width, height)]
      }),
      measurements: [...project.document.measurements, manualLengthMeasurement(roomId, length, user.id)]
    };
    await save(next);
  };

  const addObject = async () => {
    if (!project) return;
    const layer = project.document.layers.find((item) => item.visible && !item.locked);
    if (!layer) { setMessage('Create or unlock a visible layer before placing objects.'); return; }
    const next: SpatialProjectDocument = {
      ...project.document,
      objects: [...project.document.objects, {
        id: id('object'), name: 'Furniture item', category: 'furniture',
        transform: { position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        dimensionsMeters: { x: 0.6, y: 0.8, z: 0.6 }, materialId: null, layerId: layer.id,
        visible: true, locked: false, source: 'user-created', assetId: null
      }]
    };
    await save(next);
  };

  const archive = async () => {
    if (!project) return;
    setBusy(true);
    try {
      await projectApi.archiveProject(project.id);
      setProject(null);
      await loadWorkspaceData(workspaceId);
      setMessage('Project archived.');
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  };

  if (!user) return (
    <main style={{ maxWidth: 520, margin: '48px auto', padding: 20, color: '#e2e8f0' }}>
      <section style={panel}>
        <p style={{ color: '#22d3ee', textTransform: 'uppercase', letterSpacing: 1 }}>ZYLVEX SPACE · Project foundation</p>
        <h1>{authMode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        <p style={{ color: '#94a3b8' }}>Authentication and project access are handled by the API. Projects are private unless shared.</p>
        <form onSubmit={authenticate} style={{ display: 'grid', gap: 12 }}>
          {authMode === 'register' && <label>Name<input required autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} style={inputStyle} /></label>}
          <label>Email<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} style={inputStyle} /></label>
          <label>Password<input required type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} style={inputStyle} /></label>
          <button disabled={busy} style={buttonStyle}>{busy ? 'Please wait…' : authMode === 'register' ? 'Create account' : 'Sign in'}</button>
        </form>
        <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setMessage(''); }} style={{ ...buttonStyle, background: '#0f172a', marginTop: 12 }}>
          {authMode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
        </button>
        {message && <p role="status">{message}</p>}
      </section>
    </main>
  );

  return (
    <main style={{ color: '#e2e8f0', display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)', gap: 18, padding: 20, minHeight: 700 }}>
      <aside style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
          <div><small style={{ color: '#94a3b8' }}>Signed in</small><div>{user.name}</div></div>
          <button onClick={logout} disabled={busy} style={{ ...buttonStyle, background: '#334155' }}>Log out</button>
        </div>
        {workspaces.length > 1 && <label style={{ display: 'block', marginTop: 20 }}>Workspace<select value={workspaceId} onChange={async (event) => { setWorkspaceId(event.target.value); setProject(null); try { const result = await projectApi.projects(event.target.value); setProjects(result.projects); } catch (error) { reportError(error); } }} style={inputStyle}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>}
        <h2 style={{ marginTop: 24 }}>Projects</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {projects.map((item) => <button key={item.id} onClick={() => openProject(item.id)} disabled={busy} style={{ ...buttonStyle, textAlign: 'left', background: project?.id === item.id ? '#164e63' : '#0f172a', border: '1px solid #334155' }}>
            {item.name}<small style={{ display: 'block', color: '#94a3b8' }}>{item.status} · revision {item.currentRevision}</small>
          </button>)}
          {!projects.length && <p style={{ color: '#94a3b8' }}>No projects in this workspace yet.</p>}
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="New project name" style={inputStyle} />
          <button onClick={createProject} disabled={busy || !workspaceId} style={buttonStyle}>Create project</button>
        </div>
      </aside>

      <section style={panel}>
        {!project ? <div><h1>Project workspace</h1><p style={{ color: '#94a3b8' }}>Create or open a project. Project data is loaded from the authenticated API.</p></div> : <>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', borderBottom: '1px solid #1e293b', paddingBottom: 16 }}>
            <div><small style={{ color: '#94a3b8' }}>Project · {project.status} · revision {project.currentRevision}</small><h1 style={{ margin: '6px 0' }}>{project.name}</h1><span>{project.description}</span></div>
            {project.status === 'active' && project.ownerId === user.id && <button onClick={archive} disabled={busy} style={{ ...buttonStyle, background: '#7f1d1d' }}>Archive</button>}
          </header>
          {project.status === 'active' && <section style={{ ...panel, marginTop: 18 }}>
            <h2>Add a room (metres)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8 }}>
              <input aria-label="Room name" value={roomForm.name} onChange={(event) => setRoomForm({ ...roomForm, name: event.target.value })} style={inputStyle} />
              <input aria-label="Room length metres" type="number" min="0.01" step="0.01" value={roomForm.length} onChange={(event) => setRoomForm({ ...roomForm, length: event.target.value })} style={inputStyle} />
              <input aria-label="Room width metres" type="number" min="0.01" step="0.01" value={roomForm.width} onChange={(event) => setRoomForm({ ...roomForm, width: event.target.value })} style={inputStyle} />
              <input aria-label="Room height metres" type="number" min="0.01" step="0.01" value={roomForm.height} onChange={(event) => setRoomForm({ ...roomForm, height: event.target.value })} style={inputStyle} />
              <button onClick={addRoom} disabled={busy} style={buttonStyle}>Add room</button>
            </div>
          </section>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 18 }}>
            <section style={panel}><h2>Floor plan data · {roomCount} room(s)</h2>
              {project.document.floors.map((floor) => <div key={floor.id}><h3>{floor.name}</h3>{floor.rooms.map((room) => <article key={room.id} style={{ borderTop: '1px solid #334155', padding: 10 }}><strong>{room.name}</strong><div>{room.lengthMeters} × {room.widthMeters} × {room.heightMeters} m</div><small>{(room.lengthMeters * room.widthMeters).toFixed(2)} m² · perimeter {(2 * (room.lengthMeters + room.widthMeters)).toFixed(2)} m</small><div>{floor.walls.filter((wall) => wall.roomId === room.id).length} walls</div></article>)}</div>)}
            </section>
            <section style={panel}><h2>Scene objects · {project.document.objects.length}</h2>
              {project.document.objects.map((object) => <article key={object.id} style={{ borderTop: '1px solid #334155', padding: 10 }}><strong>{object.name}</strong><div>{object.dimensionsMeters.x} × {object.dimensionsMeters.y} × {object.dimensionsMeters.z} m</div><small>Position: {object.transform.position.x}, {object.transform.position.y}, {object.transform.position.z}</small></article>)}
              {project.status === 'active' && <button onClick={addObject} disabled={busy || !['owner', 'editor'].includes((project as ApiProject & { role?: string }).role ?? 'owner')} style={{ ...buttonStyle, marginTop: 10 }}>Place object</button>}
            </section>
          </div>
          <section style={{ ...panel, marginTop: 18 }}><h2>Measurement provenance</h2>
            {project.document.measurements.length ? project.document.measurements.map((measurement) => <article key={measurement.id} style={{ padding: 10, borderTop: '1px solid #334155' }}><strong>{measurement.label}</strong><div>{measurement.value} {measurement.unit} · {measurement.provenance.source} · {measurement.provenance.method} · {measurement.provenance.reviewState}</div></article>) : <p style={{ color: '#94a3b8' }}>No measurement records yet.</p>}
          </section>
          <section style={{ ...panel, marginTop: 18 }}><h2>Revision history</h2>
            {revisions.map((revision) => <article key={revision.id} style={{ padding: 8, borderTop: '1px solid #334155' }}>Revision {revision.number} · {revision.summary} · {new Date(revision.createdAt).toLocaleString()}</article>)}
          </section>
        </>}
        {message && <p role="status" style={{ color: '#67e8f9', marginTop: 18 }}>{message}</p>}
      </section>
    </main>
  );
};
