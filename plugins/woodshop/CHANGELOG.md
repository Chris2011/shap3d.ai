# Changelog – Woodshop

## [Unreleased]

Nothing yet.

## [1.0.0] – 2026-11-27 · Shap3D.ai 0.12.0

### Added

- **Woodshop** (menu _Plugins_, also in the command palette): select groups or components and mark them as boards. All copies of a component are boards then.
- **Board settings**: which way the grain runs (along the longest side or across it) and how many edges get edge banding along and across the grain (0–2 each). Marking, changing and unmarking are one undo step each.
- **Cut list**: all boards in the model, also inside groups, with length (along the grain), width and thickness in their own axes – a turned board keeps its sizes. Equal boards (name, material, sizes, banding) are counted in one line. Material: the group's, else the one most of its faces have. Hidden groups are left out.
- The cut list goes out as CSV (semicolons, sizes in mm, total edge banding per line): _Save CSV_ in the panel or _File › Export as cut list (CSV)_.
- `s3d.board(group, { grain, bandLong, bandShort })` marks a group as a board from a script.
- A plugin package of its own (`plugins/woodshop`) with a demo and a screenshot.
- All texts in English, German, French, Spanish and Arabic.
