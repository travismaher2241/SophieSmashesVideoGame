# Course Builder & GIS Preparation Tools

This directory is reserved for offline course authoring tools:
- Converting raw Victorian Government 1 m DEM GeoTIFFs (EPSG:7855) into lightweight `terrain.bin` (Float32 row-major) and `terrain_meta.json`.
- Drawing and editing fairway, green, bunker, water, and path polygon shapes for `hole.json`.
- Positioning verified tee and pin coordinates.

## In-game candidate polygon workflow

The F2 alignment tool can trace provisional fairway, bunker, and cart-path
boundaries directly on the terrain:

1. Open developer alignment mode with F2 and choose a candidate surface type.
2. Click at least three boundary points. The draft remains open so more points
   can be added; `Undo Point` removes the latest point.
3. Choose `Finish Polygon` to close it. `Cancel Draft` removes only the active
   unfinished polygon.
4. Download or copy the candidate JSON. Closed boundaries appear in
   `candidateSurfaces` using the same local `{x, z}` point shape as
   `hole.json.surfaces`. Unfinished boundaries are kept separately in
   `incompleteFeatures` and are never promoted into `candidateSurfaces`.

Every exported candidate surface is marked `provisional: true`. A candidate
must be checked against authoritative imagery or survey data, assigned verified
provenance, and reviewed before it is copied into `hole.json`.
