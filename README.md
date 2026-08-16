# SOPHIE GOLF — Initial Build & 3D Terrain Viewer

**SOPHIE GOLF** is a web-based retro 16-bit-inspired golf game project.

The initial milestone establishes a robust technical foundation and proves that real-world LiDAR elevation data can be rendered as a lightweight 3D golf environment.

---

## 1. Technical Stack

* **TypeScript** (Strict mode)
* **Vite** (Development server & bundler)
* **Three.js** (3D terrain renderer)

---

## 2. Core Architectural Principles

### 1 Three.js Unit = 1 Real Metre
The game world strictly adheres to $1\text{ Three.js unit} = 1\text{ real metre}$.
* 248 m golf hole $\approx$ 248 world units.
* 15 m tree $\approx$ 15 world units.

### Decoupled Engine & Course Data
The engine logic (`src/game`, `src/rendering`, `src/course`, `src/camera`) contains zero hardcoded course or hole logic.
Course data (`public/courses/warragul/hole-06/`) is loaded dynamically from:
```text
terrain.bin
terrain_meta.json
hole.json
```

---

## 3. Real Warragul DEM Elevation Data

The prototype loads real Victorian Government 1 m LiDAR-derived DEM elevation data for **Warragul Country Club — Hole 6**:
* **Source CRS**: `EPSG:7855` (GDA2020 / MGA Zone 55)
* **Dimensions**: 390 columns × 160 rows (62,400 Float32 samples, 249,600 bytes)
* **Grid Spacing**: 2.0 metres
* **Physical Vertex Extent**: $778\text{ m} \times 318\text{ m}$ (Sample centres)
* **Raster Cell Coverage**: $780\text{ m} \times 320\text{ m}$
* **Base Elevation**: 114.88 m above sea level
* **Max Crop Elevation**: 152.16 m above sea level

The loader strictly validates that `byteLength === widthSamples * heightSamples * 4` before constructing 3D terrain geometry.

---

## 4. Terrain Query System

The reusable query engine (`src/course/TerrainQuery.ts`) provides continuous 3D coordinate lookups:
* `getTerrainHeight(x, z)`: Returns bilinear interpolated local world Y (metres above the DEM base elevation), matching the rendered mesh at 1Ã—.
* `getTerrainNormal(x, z)`: Calculates exact surface normal vectors $(N_x, N_y, N_z)$ using partial derivatives for future slope and ball roll physics.

Absolute DEM elevation is `baseElevationMetres + getTerrainHeight(x, z)`.

---

## 5. Camera & Debug Inspection Tools

The application features 3 inspection modes:
1. **FREE**: Orbit, pan, and zoom camera for 3D terrain inspection.
2. **GOLF**: Low perspective camera placed at ground level looking along the course.
3. **OVERHEAD**: Top-down view for course mapping.

### Developer Debug Overlay
* Real-time metadata readout (Grid dimensions, CRS, base elevation).
* Cursor raycasting: move the mouse over the terrain to inspect continuous $(X, Y, Z)$ coordinates and surface normals.
* **Vertical Scale Selector**: Toggle between $1\times$ (Real 1:1 scale), $1.5\times$, and $2\times$ visual exaggeration. *Note: Vertical scaling is visual rendering displacement only and does not alter terrain physics or raw elevation values.*

---

## 6. What Is Intentionally NOT Implemented Yet

To preserve scope discipline, the following systems are planned for future phases:
* Golfer mechanics and Sophie sprite animations
* Golf clubs, swing meter, and three-click shot mechanics
* Ball flight, bounce, and rolling physics
* Fairway, bunker, and green polygon vector overlays
* Tree assets and crowd/ambient audio
* Final low-resolution pixel-art renderer ($426 \times 240$ upscaled pipeline)

---

## 7. Running the Application

### Installation & Development Server

```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Open `http://localhost:4177` in your browser.

### Type Check & Production Build

```bash
# Run strict TypeScript compiler check
npm run type-check

# Build production bundle
npm run build
```
