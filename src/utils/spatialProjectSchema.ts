import {
  LegacySpatialProjectDocument,
  SceneObject,
  SpatialProjectDocument,
  SPATIAL_PROJECT_SCHEMA_VERSION
} from '../types/spatialProject';

export class SpatialProjectValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid spatial project: ${issues.join('; ')}`);
    this.name = 'SpatialProjectValidationError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const units = new Set(['m', 'cm', 'mm', 'ft', 'in']);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function checkId(value: unknown, path: string, issues: string[]): value is string {
  if (typeof value !== 'string' || !idPattern.test(value)) {
    issues.push(`${path} must be a non-empty ID (1-128 safe characters)`);
    return false;
  }
  return true;
}

function checkVector(value: unknown, path: string, issues: string[]): value is { x: number; y: number; z: number } {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y) || !finite(value.z)) {
    issues.push(`${path} must contain finite x, y, and z coordinates`);
    return false;
  }
  return true;
}

function checkUniqueIds(items: unknown[], path: string, issues: string[]): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (!isRecord(item) || !checkId(item.id, `${path}[${index}].id`, issues)) return;
    if (seen.has(item.id)) issues.push(`${path} contains duplicate ID "${item.id}"`);
    seen.add(item.id);
  });
}

function checkArray(record: Record<string, unknown>, key: string, path: string, issues: string[]): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push(`${path}.${key} must be an array`);
    return [];
  }
  return value;
}

/** Validate an untrusted JSON document at import, API, and persistence boundaries. */
export function validateSpatialProjectDocument(value: unknown): asserts value is SpatialProjectDocument {
  const issues: string[] = [];
  if (!isRecord(value)) throw new SpatialProjectValidationError(['document must be an object']);
  if (value.schemaVersion !== SPATIAL_PROJECT_SCHEMA_VERSION) issues.push(`schemaVersion must equal ${SPATIAL_PROJECT_SCHEMA_VERSION}`);
  if (!isRecord(value.project)) {
    issues.push('project must be an object');
  } else {
    const project = value.project;
    checkId(project.id, 'project.id', issues);
    if (!nonEmpty(project.name)) issues.push('project.name must not be empty');
    if (typeof project.description !== 'string') issues.push('project.description must be a string');
    if (!['active', 'archived'].includes(String(project.status))) issues.push('project.status is invalid');
    checkId(project.ownerId, 'project.ownerId', issues);
    checkId(project.workspaceId, 'project.workspaceId', issues);
    if (!isTimestamp(project.createdAt) || !isTimestamp(project.updatedAt)) issues.push('project timestamps must be valid dates');
    if (project.archivedAt !== null && !isTimestamp(project.archivedAt)) issues.push('project.archivedAt must be null or a valid date');
    if (!Number.isInteger(project.currentRevision) || Number(project.currentRevision) < 1) issues.push('project.currentRevision must be a positive integer');
  }
  if (typeof value.displayUnit !== 'string' || !units.has(value.displayUnit)) issues.push('displayUnit is unsupported');

  const floors = checkArray(value, 'floors', 'document', issues);
  checkUniqueIds(floors, 'floors', issues);
  const allGeometryIds = new Set<string>();
  floors.forEach((entry, floorIndex) => {
    const path = `floors[${floorIndex}]`;
    if (!isRecord(entry)) { issues.push(`${path} must be an object`); return; }
    if (!nonEmpty(entry.name)) issues.push(`${path}.name must not be empty`);
    if (!finite(entry.elevationMeters)) issues.push(`${path}.elevationMeters must be finite`);
    const rooms = checkArray(entry, 'rooms', path, issues);
    checkUniqueIds(rooms, `${path}.rooms`, issues);
    rooms.forEach((room, roomIndex) => {
      const roomPath = `${path}.rooms[${roomIndex}]`;
      if (!isRecord(room)) { issues.push(`${roomPath} must be an object`); return; }
      if (!nonEmpty(room.name)) issues.push(`${roomPath}.name must not be empty`);
      for (const dimension of ['lengthMeters', 'widthMeters', 'heightMeters']) {
        if (!finite(room[dimension]) || Number(room[dimension]) <= 0) issues.push(`${roomPath}.${dimension} must be a positive finite number`);
      }
      if (!isRecord(room.origin) || !finite(room.origin.x) || !finite(room.origin.y)) issues.push(`${roomPath}.origin must contain finite x and y coordinates`);
      if (typeof room.id === 'string') allGeometryIds.add(room.id);
    });
    const walls = checkArray(entry, 'walls', path, issues);
    checkUniqueIds(walls, `${path}.walls`, issues);
    walls.forEach((wall, wallIndex) => {
      const wallPath = `${path}.walls[${wallIndex}]`;
      if (!isRecord(wall)) { issues.push(`${wallPath} must be an object`); return; }
      checkId(wall.roomId, `${wallPath}.roomId`, issues);
      for (const endpoint of ['start', 'end']) {
        const point = wall[endpoint];
        if (!isRecord(point) || !finite(point.x) || !finite(point.y)) issues.push(`${wallPath}.${endpoint} must contain finite x and y coordinates`);
      }
      if (!finite(wall.thicknessMeters) || Number(wall.thicknessMeters) <= 0) issues.push(`${wallPath}.thicknessMeters must be positive`);
      if (!finite(wall.heightMeters) || Number(wall.heightMeters) <= 0) issues.push(`${wallPath}.heightMeters must be positive`);
      const openings = checkArray(wall, 'openings', wallPath, issues);
      checkUniqueIds(openings, `${wallPath}.openings`, issues);
      const length = isRecord(wall.start) && isRecord(wall.end) && finite(wall.start.x) && finite(wall.start.y) && finite(wall.end.x) && finite(wall.end.y)
        ? Math.hypot(Number(wall.end.x) - Number(wall.start.x), Number(wall.end.y) - Number(wall.start.y)) : NaN;
      openings.forEach((opening, openingIndex) => {
        const openingPath = `${wallPath}.openings[${openingIndex}]`;
        if (!isRecord(opening)) { issues.push(`${openingPath} must be an object`); return; }
        if (!['door', 'window', 'opening'].includes(String(opening.type))) issues.push(`${openingPath}.type is invalid`);
        for (const dimension of ['offsetMeters', 'widthMeters', 'heightMeters', 'sillHeightMeters']) {
          if (!finite(opening[dimension]) || Number(opening[dimension]) < 0) issues.push(`${openingPath}.${dimension} must be finite and non-negative`);
        }
        if (finite(opening.widthMeters) && finite(opening.offsetMeters) && finite(length) && Number(opening.offsetMeters) + Number(opening.widthMeters) > length + 1e-8) {
          issues.push(`${openingPath} extends beyond its wall`);
        }
        if (finite(opening.heightMeters) && finite(opening.sillHeightMeters) && finite(wall.heightMeters) && Number(opening.heightMeters) + Number(opening.sillHeightMeters) > Number(wall.heightMeters) + 1e-8) {
          issues.push(`${openingPath} extends beyond its wall height`);
        }
        if (typeof opening.id === 'string') allGeometryIds.add(opening.id);
      });
      if (typeof wall.id === 'string') allGeometryIds.add(wall.id);
    });
  });

  const objects = checkArray(value, 'objects', 'document', issues);
  checkUniqueIds(objects, 'objects', issues);
  objects.forEach((object, index) => {
    const path = `objects[${index}]`;
    if (!isRecord(object)) { issues.push(`${path} must be an object`); return; }
    if (!nonEmpty(object.name)) issues.push(`${path}.name must not be empty`);
    if (!['furniture', 'fixture', 'equipment', 'architectural', 'other'].includes(String(object.category))) issues.push(`${path}.category is invalid`);
    if (!isRecord(object.transform)) issues.push(`${path}.transform must be an object`);
    else ['position', 'rotation', 'scale'].forEach((key) => checkVector(object.transform && (object.transform as Record<string, unknown>)[key], `${path}.transform.${key}`, issues));
    if (!checkVector(object.dimensionsMeters, `${path}.dimensionsMeters`, issues) || isRecord(object.dimensionsMeters)) {
      if (isRecord(object.dimensionsMeters) && ['x', 'y', 'z'].some((axis) => Number(object.dimensionsMeters && (object.dimensionsMeters as Record<string, unknown>)[axis]) <= 0)) issues.push(`${path}.dimensionsMeters values must be positive`);
    }
    if (!nonEmpty(object.layerId)) issues.push(`${path}.layerId must not be empty`);
    if (typeof object.visible !== 'boolean' || typeof object.locked !== 'boolean') issues.push(`${path} visible and locked must be boolean`);
    if (!['user-created', 'library', 'imported'].includes(String(object.source))) issues.push(`${path}.source is invalid`);
  });

  for (const key of ['materials', 'layers', 'measurements', 'annotations']) {
    const entries = checkArray(value, key, 'document', issues);
    checkUniqueIds(entries, key, issues);
  }
  const layers = Array.isArray(value.layers) ? value.layers : [];
  const layerIds = new Set(layers.filter(isRecord).map((layer) => layer.id));
  objects.forEach((object, index) => {
    if (isRecord(object) && !layerIds.has(object.layerId)) issues.push(`objects[${index}].layerId references a missing layer`);
  });
  const materials = Array.isArray(value.materials) ? value.materials : [];
  const materialIds = new Set(materials.filter(isRecord).map((material) => material.id));
  objects.forEach((object, index) => {
    if (isRecord(object) && object.materialId !== null && !materialIds.has(object.materialId)) issues.push(`objects[${index}].materialId references a missing material`);
  });
  const roomsByFloor = new Map<string, Set<string>>();
  floors.forEach((floor) => {
    if (isRecord(floor) && typeof floor.id === 'string') roomsByFloor.set(floor.id, new Set((Array.isArray(floor.rooms) ? floor.rooms : []).filter(isRecord).map((room) => String(room.id))));
  });
  floors.forEach((floor, floorIndex) => {
    if (!isRecord(floor)) return;
    (Array.isArray(floor.walls) ? floor.walls : []).forEach((wall, wallIndex) => {
      if (isRecord(wall) && !roomsByFloor.get(String(floor.id))?.has(String(wall.roomId))) issues.push(`floors[${floorIndex}].walls[${wallIndex}].roomId references a missing room on its floor`);
    });
  });

  const measurements = Array.isArray(value.measurements) ? value.measurements : [];
  measurements.forEach((measurement, index) => {
    const path = `measurements[${index}]`;
    if (!isRecord(measurement)) { issues.push(`${path} must be an object`); return; }
    if (!finite(measurement.value)) issues.push(`${path}.value must be finite`);
    if (!isRecord(measurement.provenance)) { issues.push(`${path}.provenance must be an object`); return; }
    const provenance = measurement.provenance;
    if (!['manual', 'sensor-derived', 'imported', 'ai-estimated'].includes(String(provenance.source))) issues.push(`${path}.provenance.source is invalid`);
    if (!nonEmpty(provenance.method) || !isTimestamp(provenance.capturedAt)) issues.push(`${path}.provenance method and timestamp are required`);
    checkId(provenance.authorId, `${path}.provenance.authorId`, issues);
    if (provenance.confidence !== null && (!finite(provenance.confidence) || Number(provenance.confidence) < 0 || Number(provenance.confidence) > 1)) issues.push(`${path}.provenance.confidence must be null or between 0 and 1`);
    if (provenance.uncertaintyMeters !== null && (!finite(provenance.uncertaintyMeters) || Number(provenance.uncertaintyMeters) < 0)) issues.push(`${path}.provenance.uncertaintyMeters must be null or non-negative`);
    if (!['unreviewed', 'reviewed', 'verified'].includes(String(provenance.reviewState))) issues.push(`${path}.provenance.reviewState is invalid`);
    if (provenance.sha256 !== null && (typeof provenance.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(provenance.sha256))) issues.push(`${path}.provenance.sha256 must be null or a SHA-256 hex digest`);
    if (Array.isArray(measurement.geometryIds)) measurement.geometryIds.forEach((id) => { if (!allGeometryIds.has(String(id))) issues.push(`${path}.geometryIds references unknown geometry "${String(id)}"`); });
    else issues.push(`${path}.geometryIds must be an array`);
  });

  if (issues.length) throw new SpatialProjectValidationError(issues);
}

function emptyLayer(): { id: string; name: string; visible: boolean; locked: boolean } {
  return { id: 'default', name: 'Default', visible: true, locked: false };
}

function legacyObject(input: Partial<SceneObject> & Pick<SceneObject, 'id' | 'name'>, index: number): SceneObject {
  return {
    id: input.id,
    name: input.name,
    category: input.category ?? 'other',
    transform: input.transform ?? { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    dimensionsMeters: input.dimensionsMeters ?? { x: 1, y: 1, z: 1 },
    materialId: input.materialId ?? null,
    layerId: input.layerId ?? 'default',
    visible: input.visible ?? true,
    locked: input.locked ?? false,
    source: input.source ?? 'user-created',
    assetId: input.assetId ?? null
  };
}

/** Migrate the explicitly supported draft-v0 document into the canonical v1 schema. */
export function migrateLegacyProjectDocument(value: LegacySpatialProjectDocument): SpatialProjectDocument {
  if (!isRecord(value) || value.schemaVersion !== 0) throw new SpatialProjectValidationError(['legacy document schemaVersion must equal 0']);
  const objects = (value.objects ?? []).map(legacyObject);
  const project: SpatialProjectDocument = {
    schemaVersion: SPATIAL_PROJECT_SCHEMA_VERSION,
    project: {
      id: value.id,
      name: value.name,
      description: '',
      status: 'active',
      ownerId: value.ownerId,
      workspaceId: value.workspaceId,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      archivedAt: null,
      currentRevision: 1
    },
    displayUnit: value.unit ?? 'm',
    floors: [],
    objects,
    materials: [],
    layers: objects.length ? [emptyLayer()] : [],
    measurements: [],
    annotations: []
  };
  validateSpatialProjectDocument(project);
  return project;
}

/** Validate current documents, or explicitly migrate the known draft-v0 shape. */
export function parseSpatialProjectDocument(value: unknown): SpatialProjectDocument {
  if (isRecord(value) && value.schemaVersion === 0) return migrateLegacyProjectDocument(value as unknown as LegacySpatialProjectDocument);
  validateSpatialProjectDocument(value);
  return value;
}
