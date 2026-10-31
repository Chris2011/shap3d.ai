# Third-party software in this plugin package

## Rapier

- Package: `@dimforge/rapier3d-compat` (npm), file `dist/rapier.mjs` shipped as `rapier.js`, unmodified (the WebAssembly is embedded in it)
- Project: Rapier by Dimforge – https://rapier.rs, https://github.com/dimforge/rapier.js
- License: Apache License, version 2.0 (Apache-2.0) – https://www.apache.org/licenses/LICENSE-2.0

The version is listed under `bundled` in the package's `package.json`. The plugin's own code (`plugin.js`) is licensed under Apache-2.0 as well and only loads Rapier at run time, when a simulation starts for the first time.
