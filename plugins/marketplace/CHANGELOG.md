# Changelog – Model marketplace plugin

## [1.0.0] – 2026-11-06 · Shap3D.ai (unreleased)

### Added

- A plugin package of its own (`plugins/marketplace`), with a tile in the right-hand bar and a panel: search, categories, previews, source, author and licence.
- Sources without a key: Poly Haven, Wikimedia Commons, OpenStreetMap buildings.
- Sources with your own key, marked as not tested in the panel: Sketchfab (search needs no key), Thingiverse, MyMiniFactory (search only, a model opens on its page).
- Loading in a worker with progress, _Cancel_ and a limit of 256 MB; a glTF with its parts or a zip becomes one `.glb`, addresses inside a file are not followed.
- The list is never empty: _All sources_ shows 20 models when the panel opens, _Show more_ the next ones. A search or filter clears the list at once and shows a spinner where the models go; when nothing is found the default set comes back with a note.
- _Load into the model_ puts the model on the mouse pointer: a notice in the panel says so until a click places it or Esc drops it. Closing the panel no longer stops a download.
- Author, licence and source stay on the imported group; _In this model_ lists them and copies them as text.
- A picture for the plugin page (`npm run screenshots -- marketplace` in the repository root).
- Texts in English, German, French, Spanish and Arabic.
