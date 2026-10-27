# Importing from SketchUp, Blender, 3ds Max and others

Drag a file onto the window or use **Menu › Importieren**. Every import becomes one component (one undo step) that sits on the ground at the origin.

| Program / use                                  | Formats                                    | How it works                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SketchUp**                                   | `.skp`                                     | Through the **official SketchUp SDK** library – no SketchUp installation needed (see [setup](#reading-skp-files))                                                                        |
|                                                | `.dae`, `.kmz`                             | Directly in the browser – SketchUp: **File › Export › 3D Model › COLLADA**                                                                                                               |
| **Blender**                                    | `.blend`                                   | **Directly in the browser – no Blender needed.** Built-in reader for Blender 2.79 to 5.x, including compressed files                                                                     |
|                                                | `.glb` / `.gltf`, `.fbx`                   | Directly in the browser – Blender: **File › Export**                                                                                                                                     |
| **3ds Max**, Maya, Cinema 4D                   | `.fbx`, `.3ds`, `.obj`                     | Directly in the browser. 3ds Max's own `.max` format can only be read by 3ds Max itself – export to FBX there                                                                            |
| **BIM** (Revit, ArchiCAD, Allplan, SketchUp …) | `.ifc`                                     | Directly in the browser with the plugin package [IFC](plugin-packages.md#the-ifc-plugin) – IFC 2x3, IFC 4 and IFC 4.3, with the spatial structure, IFC classes as tags and property sets |
| 3D printing                                    | `.stl`, `.3mf`, `.amf`                     | Directly in the browser (3MF/AMF in millimetres)                                                                                                                                         |
| Scanners, AR, web                              | `.ply`, `.usdz` / `.usd`, `.wrl` / `.vrml` | Directly in the browser                                                                                                                                                                  |

OBJ, STL, glTF/GLB and SketchUp are read by the app itself. IFC comes from the plugin package [IFC](plugin-packages.md#the-ifc-plugin), all other formats in the table from the [built-in plugin](plugins.md#built-in-plugins) **Importformate**: its readers (about 400 KB) are only loaded the first time such a file is imported, and it can be switched off in the plugin manager.

What the importer takes care of:

- **Units**: read from the file where it says (Collada `<unit>`, FBX `UnitScaleFactor`, 3MF/AMF millimetres). Otherwise anything bigger than 100 units is treated as centimetres (or millimetres beyond 10,000). The import message tells you which unit was used.
- **Orientation**: Y-up formats are turned to the app's Z-up world.
- **Structure and materials**: every named node becomes its own group, and material colours and transparency are kept. Faces exported twice (front and back, as SketchUp does) become one face with a back material.
- **Limits**: image textures are not imported yet (those materials keep a neutral tone), and imports are capped at 200,000 triangles.

## Blender files

`.blend` files are read by a built-in reader (`src/core/blend/`) that understands Blender's self-describing file format directly, so neither Blender nor a server is needed. It handles:

- **Versions:** Blender 2.79 to 5.x, including the new Blender 5 file header and the 5.0 attribute storage.
- **Compression:** files saved with zstd or gzip.
- **Content:** mesh objects with their transforms (including parents), and material colours and transparency.

Modifiers and geometry nodes are not evaluated – the stored base mesh is imported (apply modifiers in Blender if you need the final shape). Meshes linked from other `.blend` files are skipped with a note. It was tested against the official Blender test files of the Blender Asset Tracer project.

## Reading .skp files

`.skp` is a closed format, so it is read with Trimble's official **SketchUp SDK**. The SDK is just a library; SketchUp itself does not have to be installed. Because a browser cannot load native libraries, the dev/preview server includes a small local converter (`tools/convertBridge.ts` + `tools/skp/skp2glb.py`). It runs the SDK on your computer and hands glTF back to the app; nothing is uploaded anywhere.

1. Download the free SketchUp SDK for your system from [developer.sketchup.com](https://developer.sketchup.com). A Trimble ID and accepting Trimble's SDK terms are required.
2. Unpack it to `tools/sketchup-sdk/`, or point `SKETCHUP_SDK` at the folder. Python 3.8+ must be available as `python`, standard library only.
3. Restart `npm run dev` and drop a `.skp` file onto the window.

Groups, components, transforms and material colours are taken over; the SDK's mesh helper triangulates the faces. Without the SDK the app explains what is missing, and the DAE export always works as a fallback. In a purely static deployment (only `dist/` on a web server) the converter is not available. The SDK is licensed by Trimble and must not be committed to this repository (`tools/sketchup-sdk/` is git-ignored).
