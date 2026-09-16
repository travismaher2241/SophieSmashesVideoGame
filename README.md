# SOPHIE GOLF — Playable 16-Bit Golf Game Vertical Slice

**SOPHIE GOLF** is a web-based retro 16-bit-inspired golf game built with **TypeScript**, **Vite**, and **Three.js**.

The default game is the nine-hole **Sophie Hills** fictional course — par 35 over
3017 metres — opening with the par-4 **Clubhouse Climb** and the par-3
**Creekside Carry**. It includes a
title screen, authored playing surfaces, penalties, hole progression, cumulative
course scoring, replay, and main-menu flow. Warragul Country Club remains
available as an explicitly labelled research mode until its real hole geometry
has been verified; fictional Sophie Hills data must never be presented as
Warragul course data.

The playable game features **Sophie** across the nine-hole, par-35 Sophie Hills course, a higher-detail pixel-art rendering pipeline, a classic three-click swing meter, real 3D ball physics (aerodynamic drag, gravity, terrain-normal bouncing and rolling), putting, club selection, and a dedicated research mode for external course data.

---

## ⛳ Course Authoring

Holes live in `public/courses/<course>/<hole>/` as a `hole.json` layout plus an
optional `terrain.bin` / `terrain_meta.json` heightfield.

* **Surfaces** are polygons in local metres (`TEE`, `FAIRWAY`, `FIRST_CUT`,
  `ROUGH`, `GREEN`, `BUNKER`, `WATER`, `PATH`, `OUT_OF_BOUNDS`, …). Lie detection,
  penalties and roll physics all derive from them.
* **Trees** may be authored explicitly in `hole.json` as `{ x, z, type, scale }`.
  A hole that lists trees gets exactly those; a hole that omits them falls back to
  procedural corridor scatter. On a tree-lined hole the trees are the
  architecture, so they are worth placing by hand.
* **Per-hole terrain**: each hole declares its own `terrainPath` and owns its
  coordinate space. They used to share one 778x318m field, which capped every
  hole at whatever length fitted beside its neighbours — and left every par 4 on
  the course drivable from the tee.
* **Driving line**: a hole that doglegs names the point to aim the tee shot at,
  so the opening aim plays to the corner rather than across it.

Holes are generated rather than hand-typed. Hole 1 comes from a documented trace
of a reference overhead; holes 2-9 come from a spec table of length, par, dogleg,
hazards and climb:

```bash
node tools/course-builder/build-sophie-hills-hole-01.mjs   # hole 1
node tools/course-builder/build-sophie-hills-holes.mjs     # holes 2-9
```

Both refuse to write a hole that is unplayable — a tree in the fairway, a tree
across the approach, a mown surface outside the rough, or water where the tee
shot lands.

### The card

| # | Hole | Par | Length |
| :-- | :-- | :-- | :-- |
| 1 | Clubhouse Climb | 4 | 337m |
| 2 | Creekside Carry | 3 | 165m |
| 3 | Wattle Bend | 4 | 355m |
| 4 | Long Paddock | 4 | 380m |
| 5 | Gumtree Rise | 3 | 185m |
| 6 | Billabong | 4 | 365m |
| 7 | Ridge Runner | 4 | 400m |
| 8 | Sandbelt Turn | 4 | 330m |
| 9 | Homeward Bound | 5 | 500m |
| | **Out** | **35** | **3017m** |

Sophie Hills is **fictional**. Layouts drawn with real-world imagery as reference
must never be presented as that real course's data.

---

## 🎮 Gameplay Features

* **Playable Golfer (Sophie)**: 2D billboarded sprite rendered in the 3D world with procedural backswing and downswing animation.
* **Playtest Layout Manager**: Overhead setup allowing interactive placement of Playtest Tee and Playtest Cup with real metre distance readouts saved in `localStorage`.
* **Classic 3-Click Swing Meter**:
  * Click 1: Start power needle (0% to 100%).
  * Click 2: Lock power.
  * Click 3: Lock accuracy sweet spot (perfect = straight, early = hook/left, late = slice/right).
* **3D Ball Flight & Terrain Physics**:
  * Real 1m:1unit scale trajectory calculations.
  * Aerodynamic drag ($F_d = \frac{1}{2} \rho C_d A v^2$).
  * Terrain bouncing and slope friction roll using continuous `getTerrainHeight(x, z)` and `getTerrainNormal(x, z)` queries.
* **Shot Shaping**: choose a **draw** or a **fade** before the swing. A draw starts
  right of the aim line and turns back onto it; a fade mirrors it. The aiming
  guide curves to match, so the choice is visible before you swing, and the ball
  flight follows it. The shape adds to your timing rather than replacing it — a
  draw hit early is a hook.
* **Club Selection**:
  * `1W` (Driver — 230m max)
  * `5I` (5 Iron — 170m max)
  * `9I` (9 Iron — 120m max)
  * `PW` (Pitching Wedge — 70m max)
  * `PT` (Putter — 25m max)
* **Camera System**:
  * Behind-golfer perspective camera.
  * Smooth ball-follow flight camera.
  * Overhead course map preview.
* **16-Bit Retro Renderer (`RetroRenderer`)**: 2-pass upscaler rendering the scene at an aspect-correct 480p internal resolution on desktop, with nearest-neighbour scaling for a cleaner pixel-art finish.
* **Dev Alignment Tool**: Accessible via `F2` for course-authoring work without exposing developer controls in the player HUD.

---

## 🕹️ Controls Summary

| Key / Control | Action |
| :--- | :--- |
| **`Space`** or **Swing Button** | 3-Click Swing Meter (Start / Lock Power / Lock Accuracy) |
| **`A` / `D`** or **`Left` / `Right` Arrows** | Aim Left / Aim Right |
| **`W` / `S`** or **`Up` / `Down` Arrows** | Select Prev / Next Club |
| **`Q`** / **`E`** or **Shape Buttons** | Work the ball: Draw / Straight / Fade |
| **`M`** or **View Button** | Toggle Behind-Player / Overhead Map View |
| **`F2`** | Toggle Developer Alignment Mode |

---

## 🚀 Running the Game

```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Open `http://localhost:3000` (or local port) in your browser.

### Type Check & Build

```bash
# TypeScript strict check
npm run type-check

# Production build
npm run build
```
