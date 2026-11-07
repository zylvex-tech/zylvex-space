export const SPATIAL_PROJECT_SCHEMA_VERSION = 1 as const;

export type DisplayUnit = 'm' | 'cm' | 'mm' | 'ft' | 'in';
export type MeasurementSource = 'manual' | 'sensor-derived' | 'imported' | 'ai-estimated';
export type MeasurementReviewState = 'unreviewed' | 'reviewed' | 'verified';
export type ProjectStatus = 'active' | 'archived';
export type OpeningType = 'door' | 'window' | 'opening';

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Transform3D {
  /** Position in canonical metres, in the project-local coordinate frame. */
  position: Vector3;
  /** Euler angles in radians. */
  rotation: Vector3;
  /** Dimensionless scale factors. */
  scale: Vector3;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  ownerId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  currentRevision: number;
}

export interface Room {
  id: string;
  name: string;
  /** Dimensions are stored in canonical metres regardless of displayUnit. */
  lengthMeters: number;
  widthMeters: number;
  heightMeters: number;
  origin: Vector2;
}

export interface WallOpening {
  id: string;
  type: OpeningType;
  /** Distance from the wall's start point, in metres. */
  offsetMeters: number;
  widthMeters: number;
  heightMeters: number;
  /** Vertical offset above the floor, in metres. */
  sillHeightMeters: number;
}

export interface Wall {
  id: string;
  roomId: string;
  start: Vector2;
  end: Vector2;
  thicknessMeters: number;
  heightMeters: number;
  openings: WallOpening[];
}

export interface Material {
  id: string;
  name: string;
  color: string;
  textureAssetId: string | null;
}

export interface SceneObject {
  id: string;
  name: string;
  category: 'furniture' | 'fixture' | 'equipment' | 'architectural' | 'other';
  transform: Transform3D;
  dimensionsMeters: Vector3;
  materialId: string | null;
  layerId: string;
  visible: boolean;
  locked: boolean;
  source: 'user-created' | 'library' | 'imported';
  assetId: string | null;
}

export interface MeasurementProvenance {
  source: MeasurementSource;
  method: string;
  capturedAt: string;
  authorId: string;
  deviceId: string | null;
  confidence: number | null;
  uncertaintyMeters: number | null;
  reviewState: MeasurementReviewState;
  /** Optional digest binds this record to bytes, but does not establish physical accuracy. */
  sha256: string | null;
}

export interface Measurement {
  id: string;
  kind: 'length' | 'area' | 'volume' | 'angle' | 'distance';
  value: number;
  /** Units are explicit and must match the measurement kind. */
  unit: DisplayUnit | 'm2' | 'ft2' | 'm3' | 'ft3' | 'rad' | 'deg';
  label: string;
  provenance: MeasurementProvenance;
  geometryIds: string[];
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface Annotation {
  id: string;
  text: string;
  position: Vector3;
  authorId: string;
  createdAt: string;
  geometryId: string | null;
}

export interface SpatialProjectDocument {
  schemaVersion: typeof SPATIAL_PROJECT_SCHEMA_VERSION;
  project: ProjectMetadata;
  displayUnit: DisplayUnit;
  floors: Array<{ id: string; name: string; elevationMeters: number; rooms: Room[]; walls: Wall[] }>;
  objects: SceneObject[];
  materials: Material[];
  layers: Layer[];
  measurements: Measurement[];
  annotations: Annotation[];
}

/** Supported import shape for the first, pre-versioned project draft format. */
export interface LegacySpatialProjectDocument {
  schemaVersion: 0;
  id: string;
  name: string;
  ownerId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  unit?: DisplayUnit;
  objects?: Array<Partial<SceneObject> & Pick<SceneObject, 'id' | 'name'>>;
}
