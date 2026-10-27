# Room planner for Shap3D.ai

Furnish a room like in a furniture store's planner: draw the room with doors and windows, pick pieces from a catalog, drop them in – they turn their back to the wall and snap to walls and to each other – turn them, measure, and get a list of what is in the room.

![Room planner: a furnished living room with kitchen run, sofa, dining table and wardrobe; the panel with room figures, catalog and shopping list](docs/roomplanner.png)

![Room planner: two rooms side by side – a living room with a slanted and a round wall, an attic room under a gable roof – with a door between them](docs/roomplanner-house.png)

![Room planner: an L-shaped maisonette – upstairs a bed under the sloped ceiling, wardrobes, a desk and a railing round the stairwell of a spiral stair; downstairs kitchen, dining and sofa](docs/roomplanner-maisonette.png)

The plugin is a package of its own with its own `package.json` and is **not** part of the app. It only uses the plugin API: a panel, a tool, the viewport overlay, the script API (`s3d.box`, `s3d.cylinder`, `s3d.component` …) and data on groups and components. Placed pieces are ordinary components of the model – the app's own tools (Move, Rotate, Paint, Tape Measure, Outliner …) work on them too.

## Features

- **Room**: width, depth, height and wall thickness in cm, floor (parquet, tiles, concrete, carpet), **doors and windows** in any wall (position from the wall's start corner, width, height, sill, floor). The room is one group; _Change_ rebuilds it in place.
  - **Floor plan**: a rectangle, an **L** (one corner cut out, its width and depth) or **free** – corners in cm, any angles (slanted walls), and each wall may **bulge into an arc** (round walls, bays). The walls are mitred at every corner.
  - **Sloped ceilings** on the top floor, on one or more sides – presets _Shed_, _Gable_ and _Hip_: per slope the knee wall's height and how far it reaches into the room. Where slopes meet the lower one wins (ridge and hip lines); the walls follow the roof line, gable walls become pentagons.
  - **Roof windows** in the slopes (middle and size in plan): a hole in the sloped ceiling with glass and frame.
  - **Maisonette**: an upper floor (room height, floor slab) with a **stairwell** in the floor – square or **round** (for spiral stairs), set by hand or _Fit to the selected stair_. _Lower floor_ / _Upper floor_ chooses where new pieces go; on the lower floor the upper one (walls, floor and the pieces on it) is hidden. Also as commands.
  - Figures: floor area, **living area** (under 1 m ceiling height not counted, 1–2 m half), perimeter, wall area (without openings), volume.
  - **Several rooms side by side**: _+ Room_ adds one next to the others (walls back to back – a door in each wall makes a passage); the chips choose the room that is worked on, _Delete this room_ removes it. Furniture snaps to the walls of every room and stands on the floors of the room it is in.
  - _Walls_: _See-through towards the camera_ (the default) turns the walls between the camera and the rooms – and the sloped ceilings – see-through (30 %) while you orbit, so you look in without losing them; _Hidden towards the camera_ hides them (a doll's house view); or all walls, or none – also as commands. Each side of the walls has a material of its own (_Wall: Front wall_ …) and the walls are on tags per room, floor and side.
- **Catalog** with front-view thumbnails, every piece parametric (sizes, finishes, covers, fronts):
  - _Living room_: sofa (2–4 seats), corner sofa (chaise left or right), armchair, coffee table, TV bench (doors, drawers, open), TV (43/55/65″, on the wall), floor lamp, side table
  - _Bedroom_: bed (90–180 × 200/220), bedside table, chest of drawers, mirror
  - _Wardrobes_: a **wardrobe system** in the style of a modular configurator – 1–4 sections of 50/75/100 cm, 201/236 cm high, 35/58 cm deep, hinged or sliding doors or none, interior with shelves, clothes rail, drawers or mixed, white, oak, walnut, anthracite, black or mirror doors; clothes rack
  - _Kitchen_: a **whole kitchen run** of 1.8–4.2 m (sink, dishwasher, cooktop with oven and hood, drawers, tall fridge cabinet, wall cabinets), single base cabinets (doors, drawers, sink, cooktop, dishwasher), wall cabinets, tall cabinets (fridge, oven, pantry), kitchen island with overhang, fridge (single or side by side)
  - _Dining_: dining table, round table, chair, bench, bar stool
  - _Office_: desk, office chair, drawer unit
  - _Shelves_: bookcase, cube shelf (1–5 × 1–5 with boxes), sideboard, wall shelf, shoe cabinet
  - _Bathroom_: toilet, washbasin (with cabinet, single or double), shower, bathtub, towel radiator
  - _Kids_: bunk bed, toy chest, play table
  - _Stairs_: **straight stair** (handrail on either or both sides), **quarter-turn stair** with a landing (turning left or right), **spiral stair** (120–200 cm, turning left or right) – their rise is _Floor to floor_ by default, so they reach the upper floor of a maisonette; a **railing** for the stairwell
  - _Extras_: rug, plant, pendant lamp (hangs from the ceiling), picture, coat stand, radiator
- **Placing** (_Place in the room_ or a double-click): the piece follows the pointer in the 3D view, on the floor that is worked on.
  - Near a wall – any wall, also a slanted or round one – it **turns its back to the wall** and stands flush against it; wall pieces (cabinets, TV, pictures, shelves) hang at their height, pendant lamps from the ceiling (under a slope they hang lower).
  - Its sides **snap** to the walls and to the sides of other pieces beside it (10 cm); otherwise it moves in whole centimetres and stays inside the room.
  - **R** turns by 90° (Shift+R back), **Alt** moves without snapping, **Shift+click** places more of the same, **Esc** stops.
  - A red box and "Collides" show when it would take the space of another piece.
- **Moving**: with the planner tool (_Move furniture_) drag a piece – it snaps like a new one. The panel turns, duplicates and removes the selection and changes its parameters (the piece is rebuilt in place).
- **Measuring**: the inner length of every wall and the openings are drawn on the floor; a piece being placed or the selected one shows its **distances** to the walls and neighbours in cm. Switch it off with _Show measures_. The app's Tape Measure and Dimension tools work as always.
- **Shopping list**: equal pieces counted together with size and details; a click selects them; _CSV_ downloads it (also under _Export_).
- **Scripts**: `s3d.room({ id, name, at, width, depth, height, wall, floor, shape, notch, points, slopes, roofWindows, upper, openings })` and `s3d.furniture('sofa', { params: { seats: 3 }, at: [x, y], rotation: 90, level: 0 })` – the same as the panel, for whole flats from code (see `docs/demo.js`, `docs/demo-maisonette.js` and `docs/demo-house.js`).
- **Languages**: English, German, French, Spanish and Arabic; the plugin follows the app's language.

## Limits

- Rooms side by side keep their own walls (back to back); there are no shared walls or openings that cut both at once.
- Doors and windows go in straight walls, not in round ones; slopes run along the sides of the room's box.
- Snapping to the sides of other pieces works along x and y; against a slanted wall a piece only turns and stands flush.
- Snapping works with pieces turned in quarter turns; pieces turned freely with the app's Rotate tool count with their outer box.
- The furniture is simple on purpose (boxes, cylinders, spheres) – it shows sizes and arrangement, not the exact product.

What changed in which version: [CHANGELOG.md](CHANGELOG.md).

## Building and installing

```bash
cd plugins/roomplanner
npm run build
```

`npm run build` is a plain `vite build` (library mode, [`vite.config.ts`](vite.config.ts)); Vite, the Vue compiler and TypeScript come from the repository root, so run `npm ci` there first. The package has no dependencies of its own. `npm run typecheck` checks the TypeScript against the app's plugin types, `npm run lint` and `npm run format` lint and format `src/`, `npm run i18n` checks the texts.

Then in Shap3D.ai: _Plugins › Load plugin folder…_ and pick the folder `plugins/roomplanner/dist`. The panel _Room planner_ opens from the tile in the right-hand bar or the command palette.

**Screenshots**: `npm run screenshots` (Windows) or `npm run screenshots:sh` (Linux, macOS) renders `docs/roomplanner.png` from the demo `docs/demo.js`, `docs/roomplanner-maisonette.png` from `docs/demo-maisonette.js` and `docs/roomplanner-house.png` from `docs/demo-house.js` with the dev server running.

## Structure

```
plugins/roomplanner/
  package.json            a package of its own – no dependencies
  vite.config.ts          builds dist/: plugin.js from src/ (Vue routed to the app's Vue), README and package.json
  src/
    index.ts              the plugin (panel, tool, overlay, s3d.room / s3d.furniture, export)
    catalog.ts            the furniture: parameters, sizes and how each piece is built
    outline.ts            the floor plan as geometry: corners, walls (also round ones), polygons, clipping, ceilings under slopes
    room.ts               rooms in the model: building walls, floors, slopes, roof windows, stairwells; figures; which walls are shown
    furniture.ts          placed pieces: data on their components, placing, moving, turning
    snap.ts               where a piece goes: back to the wall, snapping, clearances
    tool.ts               the planner tool in the 3D view (placing, dragging, R, drawing)
    measures.ts           room measures on the floor
    preview.ts            front-view thumbnails of the catalog
    list.ts               the shopping list and its CSV
    parts.ts, materials.ts  boxes, cylinders and spheres on the script API, the finishes
    S3dRoomPlanner.vue    the panel; S3dRoomPlannerRoom.vue the room form; S3dRoomPlannerParams.vue the choices of a piece
    styles.ts, state.ts, runtime.ts
    i18n/*.json           the texts: en (source), de, fr, es, ar
  docs/                   screenshots and their demos
  dist/                   the installable plugin folder (not checked in)
```

## License

Apache-2.0, like the app.
