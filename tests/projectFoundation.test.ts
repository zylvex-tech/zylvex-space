import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AppState,
  createAuthDemoUser,
  createDefaultRoomProject,
  createMemoryStorage,
  createProject,
  getAppState,
  getCurrentUser,
  isProjectAuthorizedForUser,
  loginUser,
  readStorage,
  registerUser,
  saveProject,
  writeStorage
} from '../src/lib/projectFoundation';

describe('project foundation local lifecycle', () => {
  it('registers and logs a user in with independent local data', () => {
    const storage = createMemoryStorage();
    const original = globalThis.localStorage;
    globalThis.localStorage = storage as Storage;
    try {
      const user = registerUser({ name: 'Ava', email: 'ava@example.com', password: 'Password123' });
      assert.equal(user.email, 'ava@example.com');
      const sessionUser = loginUser({ email: 'ava@example.com', password: 'Password123' });
      assert.equal(sessionUser.id, user.id);
      assert.ok(getCurrentUser());
    } finally {
      globalThis.localStorage = original;
    }
  });

  it('creates a project and saves room/object state so it can be reopened', () => {
    const storage = createMemoryStorage();
    const original = globalThis.localStorage;
    globalThis.localStorage = storage as Storage;
    try {
      const owner = registerUser({ name: 'Mila', email: 'mila@example.com', password: 'Password123' });
      const project = createDefaultRoomProject('Demo room', owner.id);
      const reopen = getAppState().projects.find((entry) => entry.id === project.id)!;
      assert.equal(reopen.doc.project.name, 'Demo room');
      assert.equal(reopen.doc.floors[0].rooms[0].name, 'Main room');
      assert.equal(reopen.doc.objects[0].name, 'Sample chair');
    } finally {
      globalThis.localStorage = original;
    }
  });

  it('blocks unauthorized access to another user project', () => {
    const storage = createMemoryStorage();
    const original = globalThis.localStorage;
    globalThis.localStorage = storage as Storage;
    try {
      const owner = registerUser({ name: 'Owner', email: 'owner@example.com', password: 'Password123' });
      const intruder = registerUser({ name: 'Intruder', email: 'intruder@example.com', password: 'Password123' });
      const project = createProject({ name: 'Private room', ownerId: owner.id, workspaceId: `workspace-${owner.id}` });
      assert.equal(isProjectAuthorizedForUser(owner.id, project.id), true);
      assert.equal(isProjectAuthorizedForUser(intruder.id, project.id), false);
    } finally {
      globalThis.localStorage = original;
    }
  });

  it('preserves measurement provenance while saving a project revision', () => {
    const storage = createMemoryStorage();
    const original = globalThis.localStorage;
    globalThis.localStorage = storage as Storage;
    try {
      const owner = registerUser({ name: 'Sam', email: 'sam@example.com', password: 'Password123' });
      const project = createDefaultRoomProject('Test project', owner.id);
      const revisedDoc = {
        ...project.doc,
        measurements: [{
          id: 'measurement-2',
          kind: 'length',
          value: 8,
          unit: 'm',
          label: 'Updated room length',
          geometryIds: ['room-1'],
          provenance: {
            source: 'manual',
            method: 'Manually entered by user',
            capturedAt: new Date().toISOString(),
            authorId: owner.id,
            deviceId: null,
            confidence: 1,
            uncertaintyMeters: 0.01,
            reviewState: 'reviewed',
            sha256: null
          }
        }]
      };
      const saved = saveProject(project.id, owner.id, revisedDoc);
      assert.equal(saved.currentRevision, project.currentRevision + 1);
      assert.equal(saved.doc.measurements[0].label, 'Updated room length');
    } finally {
      globalThis.localStorage = original;
    }
  });
});
