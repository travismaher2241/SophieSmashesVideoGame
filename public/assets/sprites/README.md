# Player Sprites Directory

Sophie's swing sprite sheet, built from the source art in `spritesheet.png`.

- `sophie_swing.png` — packed horizontal strip, 5 frames, real alpha transparency.
- `sophie_swing.json` — manifest (frame size, count, pose order, source crop boxes).
- `frames/` — each pose also saved individually at native crop resolution, for
  reference or if more in-between frames get added later.

## Current format

- Frame size: 553 x 989 px each (horizontal strip, so the file is 2765 x 989).
- 5 frames, bottom-center anchored (feet sit on the same baseline in every frame
  so the animation doesn't jitter vertically):
  - Frame 0: `address-1`
  - Frame 1: `address-2-wiggle`
  - Frame 2: `backswing-top`
  - Frame 3: `downswing-impact`
  - Frame 4: `follow-through`

Only 5 poses exist in the source art, not the 8 originally sketched out below —
there's no `backswing-low`, `backswing-mid`, or a dedicated impact-snap frame
distinct from `downswing-impact`. If more in-between frames get generated later,
match the pose, camera angle, and framing of the existing 5 and re-run the
packer so anchoring stays consistent.

Nothing in the engine reads this file yet — `SophieGolfer.ts` still renders a
procedural 3D low-poly model. Wiring this sprite sheet in (e.g. as a billboard
replacing that model, or for a 2D menu/title-screen use) is a separate task.
