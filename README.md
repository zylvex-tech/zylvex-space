# ZYLVEX SPACE

A TypeScript + React + Three.js prototype for a spatial intelligence platform focused on CAD/BIM-style geometry, measurement provenance, and engineering-grade demos.

## About ZYLVEX SPACE

ZYLVEX SPACE is a product concept from Zylvex Technologies Ltd: a cross-platform environment for capturing, measuring, designing, understanding, managing, and sharing physical spaces and digital spatial assets. Its long-term goal is to connect workflows that are often spread across separate floor-planning, 3D design, reality-capture, collaboration, asset-management, and commerce tools.

The intended product serves homeowners and renters, designers and architects, construction and property professionals, manufacturers and creators, educators, businesses, and—through a separately governed edition—authorised public institutions. A user should be able to create or import a representation of a space, work with its dimensions and objects, compare designs, collaborate, and preserve or share project records.

The current repository is an engineering prototype, not the complete product. It contains a browser-based operations console and spatial-engine demonstrations, including a Three.js viewport, selected local geometry parsers, spatial math, analytics, and cryptographic integrity utilities. It does not yet provide production project accounts and persistence, server-enforced collaboration, billing, marketplace operations, or the full capture and mobile workflows described by the product vision. Product concepts and proposed capabilities below must not be treated as implemented features.

This repository currently implements a browser-based operations console and spatial engine with:

- a 3D engineering viewport using Three.js
- local CAD/point-cloud import for PCD, STL, and OBJ files
- cryptographic measurement provenance using SHA-256
- spatial math utilities for unit conversion and coordinate transforms
- analytics for clearance checks, coplanarity, and outlier detection
- an operational dashboard shell for product/engineering/governance views

This is a forked project and represents a working technical foundation rather than a complete end-user production system for the full product vision described in the master product specification.

## Current status

The project is in an engineering prototype / foundation stage. It demonstrates important technical capabilities, but it does not yet include the full product surface described in the broader ZYLVEX SPACE product specification, including:

- authenticated user accounts
- persistent multi-project storage
- server-side authorization and audit trails
- marketplace operations and payouts
- billing and entitlements
- AI backend orchestration and credits
- institutional deployment boundaries

## Product context

The project is intended as a spatial platform for:

- room and building measurement
- floor planning and 3D scene editing
- CAD/BIM-compatible geometry workflows
- digital-twin style inspection and documentation
- design planning and visualisation
- future marketplace and creator ecosystem work

## Tech stack

- React 19
- Vite 8
- TypeScript
- Three.js
- Tailwind CSS 4
- Lucide React
- Motion
- Node.js test runner via `tsx`

## Repository structure

```text
.
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── ExecutiveOverview.tsx
│   │   ├── EngineeringOperationsView.tsx
│   │   ├── SpatialEngine3D.tsx
│   │   └── ...
│   ├── data/
│   ├── types/
│   └── utils/
│       ├── cryptoProvenance.ts
│       ├── spatialAnalytics.ts
│       ├── spatialMath.ts
│       └── spatialParsers.ts
├── tests/
│   ├── cryptoProvenance.test.ts
│   ├── spatialAnalytics.test.ts
│   ├── spatialMath.test.ts
│   ├── spatialParsers.test.ts
│   └── threeLifecycle.test.ts
├── docs/
│   └── autonomous-engineering/
├── public/
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── bun.lock
└── README.md
```

## Features implemented

### Spatial engine and math

- CAD Z-up to WebGL Y-up transform utilities
- vector and bounding-box operations
- unit conversion between metric and imperial systems
- measurement precision checks aligned to engineering-style tolerances

### Spatial data import

- ASCII PCD parsing
- ASCII STL parsing
- OBJ parsing
- client-side processing with no server upload requirement
- basic geometry metadata inspection, centroid and bounding-box reporting

### Measurement provenance and integrity

- SHA-256-based canonical measurement hashing
- tamper-detection logic and verification status reporting
- cryptographic integrity checks for measurement records

### 3D viewport

- procedural industrial facility scene
- point cloud and imported model display
- camera presets and live telemetry HUD
- import drawer for local CAD/PCD assets
- resource cleanup for Three.js objects and textures

### Operational dashboard shell

- executive overview
- business intelligence views
- sales pipeline views
- engineering ops and governance panels
- founder decision / blocker tracking surfaces

## Getting started

### Prerequisites

- Node.js 18+ or newer
- Bun (recommended) or npm

### Install

```bash
bun install
```

or

```bash
npm install
```

### Run the app

```bash
bun run dev
```

This starts the Vite app on port 3000.

### Build

```bash
bun run build
```

### Type check

```bash
bun run lint
```

### Test

```bash
bun test
```

or

```bash
npm test
```

## Environment variables

Copy `.env.example` to a real environment file if needed for local dev or app runtime configuration:

```bash
cp .env.example .env
```

Example variables:

- `GEMINI_API_KEY`
- `APP_URL`

The repository currently expects an AI Studio-style runtime environment in some setups, but core local development is driven by the frontend tooling and the TypeScript tests.

## Security and architecture notes

This project explicitly documents a strict read-only posture and includes UI and engineering notes about read-only enforcement and provenance. That is useful for a frontier product but should not be mistaken for a complete production security boundary.

Important caution:

- browser-based hashing and client-side parsing do not replace a secure backend permission model
- a digest proves integrity of data as stored or transmitted; it does not prove physical correctness or server-side trust
- real-world measurements must be validated against calibrated sensors and review processes

## Recommended next milestones

The next credible product milestones are:

1. project creation and persistence
2. room editor and object manipulation
3. project authorization and collaboration
4. capture and measurement provenance enforcement
5. multi-device sync and revisions
6. marketplace and commerce flows
7. AI-backed design assistance with credit accounting
8. institutional deployment separation

## Documentation

The engineering and roadmap documentation lives under:

```text
docs/autonomous-engineering/
```

Key files include:

- `MASTER_ROADMAP.md`
- `ENGINEERING_STATUS.md`
- `DECISION_LOG.md`
- `TEST_RESULTS.md`
- `KNOWN_LIMITATIONS.md`
- `DAILY_HANDOVER.md`

## License

No explicit license file is present in the repository root at the time of writing. If this project is intended for external distribution or commercial use, add an explicit license file such as MIT or Apache-2.0 before public release.

## Summary

This repo is a strong engineering and prototype foundation for a spatial intelligence product, especially around 3D geometry and measurement integrity. It is not yet the completed ZYLVEX SPACE product described in the master specification, but it gives a practical base to build from.

If you want, the next step can be to add:

- a proper backend architecture document
- a roadmap mapped to your master product specification
- a feature-by-feature gap analysis between the existing repo and the full product vision
- or a production-ready README for public GitHub release
