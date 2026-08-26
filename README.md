# SOPHIE GOLF — Playable 16-Bit Golf Game Vertical Slice

**SOPHIE GOLF** is a web-based retro 16-bit-inspired golf game built with **TypeScript**, **Vite**, and **Three.js**.

The default game is now a two-hole **Sophie Hills** fictional preview: the par-4
**Sunset Run** followed by the par-3 **Creekside Carry**. It includes a title
screen, authored playing surfaces, penalties, hole progression, cumulative
course scoring, replay, and main-menu flow. Warragul Country Club remains
available as an explicitly labelled research mode until its real hole geometry
has been verified; fictional Sophie Hills data must never be presented as
Warragul course data.

The playable game features **Sophie** across the nine-hole, par-35 Sophie Hills course, a higher-detail pixel-art rendering pipeline, a classic three-click swing meter, real 3D ball physics (aerodynamic drag, gravity, terrain-normal bouncing and rolling), putting, club selection, and a dedicated research mode for external course data.

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
