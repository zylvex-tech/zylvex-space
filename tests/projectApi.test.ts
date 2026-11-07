import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, Server } from 'node:http';
import { describe, it } from 'node:test';
import { createApiApp } from '../server/app';

async function startApi(dataFile: string) {
  const { app } = createApiApp({ dataFile });
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

const cookieFrom = (response: Response) => response.headers.get('set-cookie')?.split(';')[0] ?? '';

async function withApi(test: (context: { server: Server; baseUrl: string; directory: string }) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zylvex-api-test-'));
  const { server, baseUrl } = await startApi(path.join(directory, 'store.json'));
  try { await test({ server, baseUrl, directory }); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await rm(directory, { recursive: true, force: true }); }
}

describe('server project API', () => {
  it('registers, creates a project, persists it across server restart, and retains revisions', async () => {
    await withApi(async ({ server, baseUrl, directory }) => {
      const register = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Owner', email: 'owner@example.test', password: 'a-long-test-password' }) });
      assert.equal(register.status, 201);
      const ownerCookie = cookieFrom(register);
      assert.ok(ownerCookie.startsWith('zylvex_session='));
      const workspaceResponse = await fetch(`${baseUrl}/api/workspaces`, { headers: { cookie: ownerCookie } });
      const workspace = (await workspaceResponse.json() as any).workspaces[0];
      const create = await fetch(`${baseUrl}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ownerCookie }, body: JSON.stringify({ name: 'Studio', workspaceId: workspace.id }) });
      assert.equal(create.status, 201);
      const project = (await create.json() as any).project;
      const save = await fetch(`${baseUrl}/api/projects/${project.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: ownerCookie }, body: JSON.stringify({ expectedRevision: 1, document: project.document }) });
      assert.equal(save.status, 200);
      assert.equal((await save.json() as any).project.currentRevision, 2);
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      const restarted = await startApi(path.join(directory, 'store.json'));
      try {
        const reopened = await fetch(`${restarted.baseUrl}/api/projects/${project.id}`, { headers: { cookie: ownerCookie } });
        assert.equal(reopened.status, 200);
        assert.equal((await reopened.json() as any).project.document.project.name, 'Studio');
        const revisions = await fetch(`${restarted.baseUrl}/api/projects/${project.id}/revisions`, { headers: { cookie: ownerCookie } });
        assert.equal((await revisions.json() as any).revisions.length, 2);
      } finally {
        await new Promise<void>((resolve, reject) => restarted.server.close((error) => error ? reject(error) : resolve()));
      }
    });
  });

  it('denies unauthenticated and cross-user project access and rejects stale revisions', async () => {
    await withApi(async ({ baseUrl }) => {
      const registerOwner = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Owner', email: 'owner@example.test', password: 'a-long-test-password' }) });
      const ownerCookie = cookieFrom(registerOwner);
      const workspace = (await (await fetch(`${baseUrl}/api/workspaces`, { headers: { cookie: ownerCookie } })).json() as any).workspaces[0];
      const created = await fetch(`${baseUrl}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ownerCookie }, body: JSON.stringify({ name: 'Private', workspaceId: workspace.id }) });
      const project = (await created.json() as any).project;
      const anonymous = await fetch(`${baseUrl}/api/projects/${project.id}`);
      assert.equal(anonymous.status, 401);
      const registerIntruder = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Intruder', email: 'intruder@example.test', password: 'another-long-password' }) });
      const intruderCookie = cookieFrom(registerIntruder);
      const denied = await fetch(`${baseUrl}/api/projects/${project.id}`, { headers: { cookie: intruderCookie } });
      assert.equal(denied.status, 404);
      const stale = await fetch(`${baseUrl}/api/projects/${project.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: ownerCookie }, body: JSON.stringify({ expectedRevision: 4, document: project.document }) });
      assert.equal(stale.status, 409);
    });
  });

  it('rejects weak passwords and invalid project documents', async () => {
    await withApi(async ({ baseUrl }) => {
      const weak = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Weak', email: 'weak@example.test', password: 'short' }) });
      assert.equal(weak.status, 400);
      const register = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Owner', email: 'owner@example.test', password: 'a-long-test-password' }) });
      const cookie = cookieFrom(register);
      const workspace = (await (await fetch(`${baseUrl}/api/workspaces`, { headers: { cookie } })).json() as any).workspaces[0];
      const created = await fetch(`${baseUrl}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ name: 'Validation', workspaceId: workspace.id }) });
      const project = (await created.json() as any).project;
      const invalid = structuredClone(project.document);
      invalid.floors[0].rooms = [{ id: 'room-1', name: 'Bad', lengthMeters: -3, widthMeters: 2, heightMeters: 2, origin: { x: 0, y: 0 } }];
      const saved = await fetch(`${baseUrl}/api/projects/${project.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ expectedRevision: 1, document: invalid }) });
      assert.equal(saved.status, 400);
    });
  });
});
