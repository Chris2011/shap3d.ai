# Changelog – Windows and doors

## [Unreleased]

Nothing yet.

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
