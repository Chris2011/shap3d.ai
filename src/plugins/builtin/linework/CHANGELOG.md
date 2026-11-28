# Changelog – Parts from lines

## [Unreleased]

Nothing yet.

## [1.1.0] – 2026-11-28 · Shap3D.ai 0.12.0

### Changed

- New sizes for a part keep the groups put into it – a window, a lamp – instead of dropping them. With the _Windows and doors_ plugin the windows and doors of a wall cut their holes into the wall built again.

## [1.0.0] – 2026-11-27 · Shap3D.ai 0.12.0

### Added

- **Parts from lines** (menu _Plugins_, also in the command palette): select a line, a chain of edges or a face's outline and build a part from it, as its own group. The line goes; it lives on in the part.
- **Wall**: thickness, height and where it lies (left of the line, centred, right). Corners meet in a mitre, very sharp ones are cut off at four times the thickness. A closed chain or a face gives a closed room.
- **Stairs**: a straight flight along the line, with width, height and number of steps; the panel shows rise and going.
- **Spiral stairs**: the line's start is the centre, its length the radius, its end the first step. Height, steps, turn in degrees (negative turns clockwise), spindle radius (0 = none) and step thickness.
- While a part is selected the panel shows its sizes; changing them builds the part again (all copies follow). Building and changing are one undo step each.
- All texts in English, German, French, Spanish and Arabic.
