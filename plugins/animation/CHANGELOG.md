# Changelog – Animation plugin

## [1.0.0] – Shap3D.ai 0.10.0 (unreleased)

### Added

- A plugin package of its own (`plugins/animation`, built with `vite build`, installed via _Plugins › Load plugin folder…_), with its own lint, format, type and text checks; no library.
- Keyframes on groups and components: position (of their pivot), rotation, scale, visibility, a colour of their own and opacity; on material colours and opacity, on cameras (position, target, lens), on lights (position, target, brightness, colour) and on the sun (hour, daylight). The I key keys the selected groups – or the camera when nothing is selected; auto-keying keys every move, turn or scale with the app's tools in the same undo step.
- Curves between keys: constant, linear, Bézier with auto-clamped or free handles, ease in, ease out, ease in and out, back, bounce and elastic; channels that repeat (cycle).
- A timeline under the 3D view: play, pause, frame by frame, key to key, start and end, frame rate, loop, scrubbing on the ruler with the shots marked, zoom and scroll in time; a dope sheet (keys picked, moved, deleted, their curve and handles changed by a right-click) and a graph editor (keys and handles dragged, normalised view).
- Paths (a group or a camera follows the line of another group's edges, turned along it), look-at (a group's front or a camera towards another group), parents through the group hierarchy with a pivot per group.
- Cameras made from the view, shots that cut between them, looking through the shot's camera.
- Rendering at a fixed frame rate, frame by frame through the shot's camera at HD, Full HD, square, upright or the view's size: a video (MP4 where the browser can, else WebM, recorded from the drawn frames with `MediaRecorder`) or PNG images in a ZIP; with or without what is drawn over the view.
- The view shows the animation without changing the model, through the app's display API: places with `display.place` (parents included), colours, opacity and visibility with `display.look`, material colours with `display.material`, the sun with `lighting.sun`, lamps with `lighting.set`; keys from the app's tools at the end of the undo step with `events.onUndoStep`. Needs Shap3D.ai 0.10.0 or newer (`shap3d.minAppVersion`).
- The Animation panel with a **simple view** (ready-made movements: spin, bounce, swing, pulse, fade in and out, appear, disappear, follow a path; camera here, fly around, fly closer; the film) and an **advanced view** (every value with a key diamond, pivot, path, look-at, cameras, shots, sun, lights, material colours).
- An **animation mode** (_Model | Animation_ in the top bar) with the timeline, the tools that move things and the panels it needs, and the **animation guide**: eight steps from a practice scene to the first film that tick themselves off.
- Motion paths of the selected animated groups with a dot at each key, the lines things follow, the cameras and lights drawn in the 3D view.
- Scripts: `s3d.animate()`, `s3d.animateKeys()`, `s3d.animatePath()`, `s3d.animateLookAt()`, `s3d.animateCamera()`, `s3d.animateShot()`, `s3d.animateSun()`, `s3d.animateLight()`, `s3d.animateMaterial()`, `s3d.animateScene()`, `s3d.animatePlay()`, `s3d.animateRender()`, `s3d.animateClear()`; four demos (a little film, a robot arm, a camera flight, colours and fades) as examples in the script editor and for the README screenshots; the data formats `animation.object` and `animation.scene`.
- Texts in English, German, French, Spanish and Arabic.
