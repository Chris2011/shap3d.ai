# Credits and legal notice

## Credits

- [fzstd](https://github.com/101arrowz/fzstd) (MIT) – zstd decompression for compressed Blender files
- [web-ifc](https://github.com/ThatOpen/engine_web-ifc) (MPL-2.0) by That Open Company – reads IFC files in the IFC plugin package (not part of the app)
- [three.js](https://threejs.org) (MIT), [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) and [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (MIT), [Vue](https://vuejs.org) (MIT), [Vite](https://vitejs.dev) (MIT), [Tailwind CSS](https://tailwindcss.com) (MIT)
- Reference people built from the [Humaaans](https://www.humaaans.com) illustrations by Pablo Stanley (CC0) – see `src/assets/people/LICENSE.md`
- Helvetiker and Optimer typefaces from the three.js examples, © MAGENTA Ltd. – see `src/plugins/builtin/text3d/fonts/LICENSE`
- Fonts of the 3D-text plugin from [Fontsource](https://fontsource.org) (SIL Open Font License 1.1, licenses in `node_modules/@fontsource/*/LICENSE`): Roboto, Playfair Display, Bebas Neue, Fredoka, Black Ops One, Pacifico, Lobster, Caveat, Orbitron, Press Start 2P, JetBrains Mono; read with [opentype.js](https://github.com/opentypejs/opentype.js) (MIT)
- OpenSCAD logo from the [OpenSCAD repository](https://github.com/openscad/openscad) (GPL-2.0) – kept in the plugin package at `plugins/openscad/docs/`, not in the app
- AI models are **not** bundled. Models you download (e.g. Qwen, Llama, LLaMA-Mesh) come with their own licenses.

## Legal notice

Shap3D.ai is an independent, non-commercial hobby project. It was built from scratch as a learning exercise and is **inspired by the modeling workflow of SketchUp**.

- It is **not affiliated with, endorsed by, sponsored by or otherwise connected to Trimble Inc.** or SketchUp.
- "SketchUp" and "Trimble" are trademarks of Trimble Inc. and are used here only to describe the source of inspiration.
- The project contains **no SketchUp source code, binaries, icons, assets or documentation**. All code, icons, cursors and graphics were created for this project or come from the open-source sources listed under [Credits](#credits).
- It does **not** reverse-engineer any proprietary file format. `.skp` files are opened only through **Trimble's official SketchUp SDK**, which every user downloads themselves under Trimble's terms; it is not bundled with this project. `.blend` files are read by the project's own reader of Blender's openly documented, self-describing file format. All other formats are open and documented.
- Similarities in the general user interface (tool names, push/pull, panel layout) reflect common 3D-modeling conventions and the author's inspiration, not copied material.

If you are a rights holder and see a problem, please open an issue and it will be addressed promptly.
