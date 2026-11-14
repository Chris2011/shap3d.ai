# Changelog – Brick designer plugin

## [1.0.0] – 2026-11-06 · Shap3D.ai (unreleased)

### Added

- A plugin package of its own (`plugins/bricks`, built with `vite build`, installed via _Plugins › Load plugin folder…_), with its own lint, format, type and text checks, and tests for the geometry and the LDraw reader.
- A mode _Bricks_ with the building tool and the designer panel. It shows bricks without lines along their edges, so their colours stay visible; the lines come back on the switch to the model.
- A catalog of bricks the plugin makes itself, without a network, in the measures of the 8 mm grid: bricks, plates, tiles, slopes, round parts, corner bricks, arches, window and door frames, panels and baseplates, with pictures drawn from their real shape.
- Placing on the stud grid: a chosen brick follows the pointer and comes to rest on what is below, R turns, Page Up and Page Down raise and lower, placed bricks can be dragged, turned, copied, painted and deleted.
- More parts from the current LDraw library (a copy of October 2026, with a second address in case the first fails): common parts by name, any part by its number, loaded in a worker and kept in the browser for offline use, with author and licence in the parts list.
- Searching all parts by name through Rebrickable with the user's own key, marked in the panel as not tested.
- Finished models: six of the plugin's own (house, car, tree, lighthouse, bridge, rocket) that work without a network, 38 whole sets from LDraw's model collection with every part in its place and colour, and opening your own `.ldr` or `.mpd` file. A model is placed, moved, turned and deleted as one piece and counted brick by brick in the parts list.
- A parts list with counts per part and colour, CSV download and export.
- Scripts: `s3d.brick(part, { at, rotation, level, color })` for bricks, finished models and library parts (loaded before the run), `s3d.brickWall({ from, length, rows, along, color, openings })` for walls with shifted joints and door or window frames, completion for parts and colours, and three examples in the script editor (a brick house, the finished models, parts and sets online).
- Texts in English, German, French, Spanish and Arabic.
