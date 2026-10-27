# Changelog – Room planner plugin

## [1.0.0] – 2026-10-26 · Shap3D.ai (unreleased)

### Added

- A plugin package of its own (`plugins/roomplanner`, built with `vite build`, installed via _Plugins › Load plugin folder…_), with its own lint, format, type and text checks.
- A room with floor and walls, doors and windows in any wall, figures (area, perimeter, wall area, volume) and walls that open towards the camera.
- A catalog of parametric furniture with front-view thumbnails: living room, bedroom, a modular wardrobe system (sections, heights, depths, hinged or sliding doors, interior), kitchen (a whole kitchen run, base, wall and tall cabinets, island, fridge), dining, office, shelves, bathroom, kids and extras.
- Placing and moving with snapping: back to the nearest wall, flush against it, sides snapping to walls and neighbours, whole centimetres, inside the room; R turns, Alt moves freely, collisions shown.
- Measures in the viewport: room size, openings, distances of a piece to walls and neighbours.
- A shopping list (counted, with sizes and details) with CSV download and export.
- L-shaped rooms, a sloped ceiling on the top floor (knee wall, side walls following the roof line) and maisonettes: an upper floor with a stairwell, a switch between the floors (also as commands), the living area by ceiling height.
- Stairs: straight, quarter-turn with landing and spiral – rising from floor to floor – and a railing for the stairwell.
- Free floor plans with slanted and round walls (mitred corners), sloped ceilings on several sides (shed, gable, hip) with roof windows, round stairwells.
- Several rooms side by side: add, choose and delete rooms; furniture snaps to the walls of all rooms.
- Walls towards the camera turn see-through (30 %) instead of disappearing – or hidden, all or none; commands for the floors and for which walls are shown.
- Script functions `s3d.room(…)` and `s3d.furniture(…)`.
- Texts in English, German, French, Spanish and Arabic.
