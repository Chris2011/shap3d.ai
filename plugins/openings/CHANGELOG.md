# Changelog – Windows and doors

## [Unreleased]

Nothing yet.

## [1.5.0] – 2026-11-28 · Shap3D.ai 0.12.0

### Added

- **Walls built again keep their windows**: when a wall is built again – a wall of _Parts from lines_ made thicker, thinner or moved to the other side of its line – its windows and doors are pulled onto the new wall face (up to 50 cm in front of or behind them) and cut their holes with the new thickness, in the same undo step. One that no longer fits (a lower wall) says so and gets no hole.
- The same goes for a window moved a little off its wall face.

## [1.4.0] – 2026-11-28 · Shap3D.ai 0.12.0

### Added

- **How a window opens**: tilt and turn (new default), casement, sliding – the sashes overlap and run one behind the other – or fixed glazing with panes straight in the frame and mullions between them. Windows with sashes get a handle inside on each sash.
- **Glazed doors**: the leaf as a frame round a glass pane (_Glass in the leaf_).
- The schedule and its CSV name the type of opening (a column of its own); equal sizes of different types are counted apart.
- `s3d.opening` takes `operation` and `glazed`.

### Changed

- Windows set before have no type: they count as casement windows.

## [1.3.0] – 2026-11-28 · Shap3D.ai 0.12.0

### Added

- **The hole moves along**: a window or door moved with the app’s own tools (Move, arrow keys) closes its old hole and cuts a new one where it is now – in the same undo step. Moved onto another wall face, it takes over that wall’s thickness and its new sill height.
- **Copies get a hole**: a window or door copied (Move with Ctrl) or pasted onto a wall face cuts its own hole.
- A window or door that no longer lies fully on a wall face (moved off the wall, turned or scaled) gets no hole there, and the app says so.

## [1.2.0] – 2026-11-28 · Shap3D.ai 0.12.0

### Added

- **Close the hole when deleting** (switch in the panel, saved with the model, on by default): however a window or door is deleted – Delete key, eraser, cut – its hole in the wall is closed and healed into the wall faces in the same undo step. Deleting the whole wall leaves nothing to close.
- **Remove and close the hole** (button for a selected window or door): closes the hole whatever the switch says.

### Fixed

- Closing a hole (a new size) left the four edges through the wall behind as stray lines.

## [1.1.0] – 2026-11-28 · Shap3D.ai 0.12.0

### Added

- **A placed window or door changes its size**: width, height and sill height of the selected one can be typed like its other settings. The old hole is closed – its sides go, its front and back are filled with the wall’s material and healed into the wall faces – and the new one is cut, centred where the old one was. One undo step; when the new size does not fit on the wall, nothing changes and the app says why.

## [1.0.0] – 2026-11-28 · Shap3D.ai 0.12.0

### Added

- **Windows and doors** (menu _Plugins_, also in the command palette): parametric windows (frame, one to three sashes with glass, glazing bars across and upright, sills inside and out) and doors (three-sided frame, leaf, handle on both faces, hinges left or right).
- **Set into wall**: a tool whose outline follows the pointer on vertical wall faces – green where it fits, red where it would leave the face or overlap another opening. A click cuts the hole through the wall (thickness found by itself, a single face just gets the hole) and sets the window or door into the middle of the wall – one undo step.
- A selected window or door: sashes, glazing bars and hinges can be changed; its pieces are built again.
- **Schedule** of all windows and doors, equal ones counted together, as CSV (_Save CSV_ or _File › Export as window and door schedule (CSV)_).
- `s3d.opening(wall, { at, kind, width, height, sill, sashes, barsAcross, barsUpright, hinge })` for scripts.
- All texts in English, German, French, Spanish and Arabic.
