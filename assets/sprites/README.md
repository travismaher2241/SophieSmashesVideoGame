# Swing sprite sheets

Source artwork for the golfer. Each sheet is a 3x2 grid of poses with one cell
spare; the game loads individual frames, so these are sliced into
`public/assets/sprites/<style>/` by the tool below.

Keep the sheets here rather than in `public/`: they are 4MB each and only the
sliced frames are ever served.

## Regenerating the frames

```bash
node tools/sprites/slice-swing-sheet.mjs assets/sprites/driver-swing-sheet.png \
  public/assets/sprites/driver --map=5,4,3,2,1 --max-height=760

node tools/sprites/slice-swing-sheet.mjs assets/sprites/iron-swing-sheet.png \
  public/assets/sprites/iron --map=1,2,3,4,5 --max-height=760

node tools/sprites/slice-swing-sheet.mjs assets/sprites/putter-swing-sheet.png \
  public/assets/sprites/putter --map=1,2,3,4,5 --max-height=760
```

After re-slicing a sheet, check its output size against the `aspect` recorded
for that set in `SophieGolfer.ts`. The sets are drawn on differently shaped
canvases and the plane is scaled to match, so a new sheet with different
proportions needs that number updated or the golfer comes out stretched.

The artwork must not include a ball. The game draws its own, and a painted one
sits on the tee through the follow-through while the real ball is in the air.

`--map` lists which grid cell feeds each frame, in the order the game wants
them: address 1, address 2, backswing top, downswing impact, follow through.
Cells are numbered left to right, top to bottom. **The two sheets are laid out
differently**, which is why the maps differ — check a sheet's layout before
assuming it matches another.

`--max-height` caps the output. The golfer stands about 400px tall on screen, so
the full 1400px artwork would cost megabytes of download for detail no one sees.

Every frame in a set is cropped to the same box, so the poses stay in register:
they are swapped on one fixed plane, and trimming each to its own outline would
make her jump about and stretch between frames.

## Rows, and feet

The slicer finds the rows from the clear gutter between them rather than by
dividing the sheet in half, and crops each row against its own baseline — the
lowest ink in that row, which is the ground the poses stand on.

That is not fussiness. The putter sheet's rows are 580px and 553px, so halving it
cut nine pixels off the bottom of the address pose, and the golfer stood on the
green with a foot missing. `tests/golfer-frames.test.ts` checks the shipped
frames for ink running into the crop edge, which is what that looks like.

The slicer prints a warning if a row's artwork runs off the bottom of the sheet
itself. The putter sheet's bottom row does: the downswing and follow-through
poses have their shoes cut off in the export, so she stands a few centimetres
short during the stroke. Re-exporting that sheet with the feet inside the canvas
is the fix; re-cutting it afterwards is just the command above.
