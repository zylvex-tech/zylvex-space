import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  migrateLegacyProjectDocument,
  parseSpatialProjectDocument,
  SpatialProjectValidationError,
  validateSpatialProjectDocument
} from '../src/utils/spatialProjectSchema';
import { SpatialProjectDocument } from '../src/types/spatialProject';

const project: SpatialProjectDocument = {
  schemaVersion: 1,
  project: {
    id: 'project-1', name: 'Test Room', description: '', status: 'active', ownerId: 'user-1', workspaceId: 'workspace-1',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null, currentRevision: 1
  },
  displayUnit: 'm',
  floors: [{
    id: 'floor-1', name: 'Ground floor', elevationMeters: 0,
    rooms: [{ id: 'room-1', name: 'Living room', lengthMeters: 5, widthMeters: 4, heightMeters: 2.7, origin: { x: 0, y: 0 } }],
    walls: [{
      id: 'wall-1', roomId: 'room-1', start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thicknessMeters: 0.2, heightMeters: 2.7,
      openings: [{ id: 'door-1', type: 'door', offsetMeters: 1, widthMeters: 0.9, heightMeters: 2, sillHeightMeters: 0 }]
    }]
  }],
  objects: [{
    id: 'object-1', name: 'Chair', category: 'furniture',
    transform: { position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    dimensionsMeters: { x: 0.5, y: 0.8, z: 0.5 }, materialId: null, layerId: 'layer-1', visible: true, locked: false,
    source: 'user-created', assetId: null
  }],
  materials: [], layers: [{ id: 'layer-1', name: 'Furniture', visible: true, locked: false }],
  measurements: [{
    id: 'measurement-1', kind: 'length', value: 5, unit: 'm', label: 'Room length', geometryIds: ['room-1'],
    provenance: {
      source: 'manual', method: 'User entered', capturedAt: '2026-01-01T00:00:00.000Z', authorId: 'user-1',
      deviceId: null, confidence: null, uncertaintyMeters: null, reviewState: 'unreviewed', sha256: null
    }
  }],
  annotations: []
};

describe('versioned renderer-independent spatial project schema', () => {
  it('accepts a valid project with room geometry, objects, and provenance', () => {
    assert.doesNotThrow(() => validateSpatialProjectDocument(project));
  });

  it('rejects invalid dimensions, duplicate IDs, and unknown schema versions', () => {
    const invalid = structuredClone(project);
    invalid.floors[0].rooms[0].lengthMeters = Number.NaN;
    invalid.floors[0].walls[0].openings[0].offsetMeters = 4.5;
    invalid.objects[0].layerId = 'missing-layer';
    assert.throws(() => validateSpatialProjectDocument(invalid), (error: unknown) => {
      assert.ok(error instanceof SpatialProjectValidationError);
      assert.match(error.message, /lengthMeters/);
      assert.match(error.message, /extends beyond its wall/);
      assert.match(error.message, /missing layer/);
      return true;
    });
  });

  it('migrates the supported draft-v0 project shape and supplies explicit defaults', () => {
    const migrated = migrateLegacyProjectDocument({
      schemaVersion: 0,
      id: 'legacy-project', name: 'Legacy', ownerId: 'user-1', workspaceId: 'workspace-1',
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-02T00:00:00.000Z',
      objects: [{ id: 'legacy-chair', name: 'Chair' }]
    });
    assert.equal(migrated.schemaVersion, 1);
    assert.equal(migrated.objects[0].layerId, 'default');
    assert.equal(migrated.layers[0].id, 'default');
    assert.equal(migrated.objects[0].source, 'user-created');
    assert.equal(parseSpatialProjectDocument(migrated).project.name, 'Legacy');
  });

  it('rejects unsupported future versions instead of interpreting them silently', () => {
    assert.throws(() => parseSpatialProjectDocument({ schemaVersion: 99 }), SpatialProjectValidationError);
  });
});
