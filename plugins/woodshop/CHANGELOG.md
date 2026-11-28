# Changelog – Woodshop

## [Unreleased]

Nothing yet.

## [1.1.0] – 2026-11-27 · Shap3D.ai 0.12.0

### Added

- **Nesting** below the cut list: the boards of each material and thickness laid out on sheets, in strips across the sheet so every cut goes straight through (as on a panel saw). Each sheet is drawn with its pieces (name in the piece, sizes on hover); per material the number of sheets and how much of them becomes boards.
- Sheet length and width, saw cut and edge trim in mm, and whether the grain stays along the sheet (off: pieces may turn when that fits better). Saved with the model, one undo step per change. Default: 2800 × 2070 mm, 4 mm cut, 10 mm trim, grain kept.
- Boards too big for the sheet are named instead of laid out.

## [1.0.0] – 2026-11-27 · Shap3D.ai 0.12.0

### Added

- **Woodshop** (menu _Plugins_, also in the command palette): select groups or components and mark them as boards. All copies of a component are boards then.
- **Board settings**: which way the grain runs (along the longest side or across it) and how many edges get edge banding along and across the grain (0–2 each). Marking, changing and unmarking are one undo step each.
- **Cut list**: all boards in the model, also inside groups, with length (along the grain), width and thickness in their own axes – a turned board keeps its sizes. Equal boards (name, material, sizes, banding) are counted in one line. Material: the group's, else the one most of its faces have. Hidden groups are left out.
- The cut list goes out as CSV (semicolons, sizes in mm, total edge banding per line): _Save CSV_ in the panel or _File › Export as cut list (CSV)_.
- `s3d.board(group, { grain, bandLong, bandShort })` marks a group as a board from a script.
- A plugin package of its own (`plugins/woodshop`) with a demo and a screenshot.
- All texts in English, German, French, Spanish and Arabic.
