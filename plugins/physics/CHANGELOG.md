# Changelog – Physics plugin

## [1.0.0] – Shap3D.ai (unreleased)

### Added

- The Physics and guide tiles only show in the physics mode, so they stay out of the way while modelling. The commands that open them switch to the mode.
- Going back on the timeline and on from there simulates up to that moment in slices: the app stays usable and the panel shows it is working. The timeline stops recording at 256 MB (a lot of liquid); the simulation goes on.
- The practice scene asks before it replaces a model with something in it.
- Starting with nothing that can move says so and what to do, instead of running with nothing to see.
- A plugin package of its own (`plugins/physics`, built with `vite build`, installed via _Plugins › Load plugin folder…_), with its own lint, format, type and text checks; Rapier (`@dimforge/rapier3d-compat` 0.21.0, Apache-2.0) ships as `rapier.js` and is loaded when a simulation starts for the first time.
- Bodies from groups and components – dynamic, static, moving (kinematic: on and on or back and forth) or ignored – with a material (wood, steel, stone, rubber, ice, plastic, foam or own density, friction and bounce), a mass, a shape (convex hulls per part, one hull, box, sphere, cylinder, exact faces for static and moving bodies), a start speed and turn; the still world of loose faces and plain groups and a ground at height 0.
- Forces: a constant force in model axes, thrust in the body's own axes, lift of a wing, air drag (its own or from its size) and wind.
- Joints to another body, the group a body lies in or the world: hinges and sliders with limits and motors (to a position or at a speed, with a strength) and programs over time, ball joints, fixed joints, ropes and springs; the joint tool sets one up with two clicks; while it runs the panel shows each hinge's angle or slider's way with a slider to drive it.
- Regions: water (buoyancy by density in 27 cells, so bodies right themselves; a current), a liquid of drops without friction with a viscosity, and a wind tunnel (stable fluids on a staggered grid around the model's faces and the bodies where they are) with smoke lines coloured by speed that pushes bodies with their drag.
- The simulation: start, pause, step, reset and keep (the places into the model as one undo step); gravity, wind, air drag and speed change while it runs; a change of the model resets it; the model is not changed while it runs (`display.place`).
- The pull tool: drag a body on a spring while the simulation runs.
- The Physics panel: the simulation and its settings, the selected group's kind, material, shape, mass, speeds, forces, joints (with motors, programs and live control) and regions, and the list of all bodies and regions; the 3D view shows joints, forces, trails, drops and the flow; commands and context menu entries.
- Scripts: `s3d.physicsBody()`, `s3d.physicsJoint()`, `s3d.physicsSettings()`, `s3d.physicsStart()`, `s3d.physicsBodies()`, `s3d.physicsRemove()`; eight demos (playground, robot arm, machines, ropes and springs, flight, water, dam break, wind tunnel) as examples in the script editor and for the README screenshots; the data format `physics.body`.
- A **simple view** of the Physics panel (the default; _Simple | Advanced_ at its top, remembered): Start/Pause, Reset, Keep, slow motion and the pull tool; for the selection three choices (falls, stays put, ignore), the material as tiles with a word on what it does (bounces, slides, heavy …), and what holds it – hinge, rope, spring or glue, set up with two clicks and explained while the tool is on, a hinge motor as one tick box; loose faces get a _Make a group_ button. The advanced view has every value as before.
- A **timeline**: what has been simulated is kept (30 frames a second, up to two minutes) – drag it back to see any moment again, with the trails up to it; _Go on_ or _Step_ from an earlier moment simulates again from there; _Keep_ takes the moment shown.
- **Record video**: the 3D view with the drops, smoke and joints as MP4 (or WebM where the browser cannot do MP4), saved when it stops; it starts the simulation if it is not running.
- **Push at the start** in the simple view: up, away, left or right as seen from the camera, or spin – gently or strongly.
- The joint tool **snaps** its anchor to a face's corner or middle (a dot shows it); in the simple view a **door hinge** stands upright at the object's edge nearest the click, whatever face is hit. After a joint is set it goes back to selecting with the body selected.
- Fixed: the arrows of forces and start speeds start at the middle of the object, not at its group's origin.
- A **physics mode** (_Model | Physics_ in the top bar): the toolbar shows Pull and Joint next to select, move and the view tools, the right-hand bar only the guide, the Physics panel, Entity Info and the outliner.
- The **physics guide** (in the mode, from the Physics panel's link or the command _Physics guide_): eight steps that tick themselves off – a practice scene, bodies, start, pause/step/reset, pulling, a hinge, a motor, keeping the places – and the demos in the script editor.
- Feedback: _Step_ pauses and goes 0.1 s further, Reset/Step/Keep explain themselves as tooltips, the pull tool says when there is no dynamic body under the pointer, the joint tool says what it set.
- Texts in English, German, French, Spanish and Arabic.
