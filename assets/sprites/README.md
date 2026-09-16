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
```

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
