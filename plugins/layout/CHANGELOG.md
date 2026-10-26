# Changelog – LayOut plugin

## [Unreleased]

Nothing yet.

## [1.0.0] – 2026-10-25 · Shap3D.ai (unreleased)

### Added

- A plugin package of its own (`plugins/layout`, built with `vite build`, installed via _Plugins › Load plugin folder…_), with its own lint, format, type and text checks.
- The workspace _Sheets_ next to the 3D model (switch _Model | Sheets_ in the top bar): sheets in A4 to A1, Letter and Tabloid, landscape or portrait, with frame and title block.
- Viewports live linked to scenes, with a drawing scale (1:1 … 1:1000) and hybrid, raster or vector rendering; _Use current 3D view_; a double-click opens the view in the model.
- _From scenes_: a sheet with up to four scenes as viewports, with fitting scales for parallel scenes.
- The tools of a layout program: select, erase, style, viewport, image, text, label, dimension and angle dimension, line, freehand, arc, 2-point arc, pie, rectangle (rounded, lozenge, bulged), circle, ellipse, polygon, offset, fillet, chamfer, trim, extend and split – dimensions on a scaled viewport measure the model.
- A library of floor plan symbols in real size: doors, windows, stairs, furniture, kitchen and bath, people, trees and cars; on a viewport they take its scale.
- Line colour, width and style, fill colour and patterns (hatch, brick, concrete, insulation …).
- Selecting several (Shift, frame), moving, handles, arrows; group and ungroup, join, explode, to front / to back, lock, copy / cut / paste / duplicate, rotate and mirror symbols; every change is an undo step of the app.
- Previous / next sheet, reordering sheets by dragging and a full-screen presentation of the sheets.
- Per viewport: its own section plane (or none), filled cut surfaces (colour and pattern), its own face style and tag visibility, a title with the live scale, _Preserve scale on resize_, handles on every side and corner, a right-click menu with scene and scale.
- Layers for all sheets (active layer, hide, lock, rename, reorder, delete).
- Sheet templates kept in the browser, with a default template for new sheets.
- Document setup: grid, snap to grid, units and precision of dimensions.
- Zoom with the mouse wheel around the pointer, pan with the middle mouse button.
- SVG export of a sheet and printing of all sheets in their paper sizes (to PDF through the print dialog).
- The sheets are saved with the model.
- Texts in English, German, French, Spanish and Arabic.
- Screenshots from two demo models: sheets from scenes and a floor plan at 1:50.
