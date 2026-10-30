# Changelog – AI assistant

## [Unreleased]

### Added

- **Responsive model builds**: the code of the assistant runs in a Web Worker instead of the main thread – the finished model arrives as one undo step while the browser stays usable. A blinking _"building model …"_ line with a timer in the chat (and the building note in the status bar) shows while it runs, and _Run again_ on a running turn does nothing instead of starting a second build.
- **Knows every plugin's script calls**: the quick prompt for small models now lists the `s3d.` calls of the active plugins too (before only the full prompt did), and the full prompt adds the plugins' own examples – so the assistant can build terrains, roads, level objects … with whatever plugins are switched on.
- Falls back to the classic synchronous run when a script needs something only the main thread has (a plugin's `s3d.` extension) or no worker is available – and when the script builds inside an open group.

## [1.3.0] – 2026-10-22 · Shap3D.ai 0.7.0

### Added

- Setup wizard: each suggested model can be installed in another quantization (Q3_K_M … Q8_0, F16) with its estimated size; installed models show their quantization.
- Setup wizard: once the assistant is set up, every step can be clicked directly, and _Apply_ saves a change (e.g. just another model) without going through to the end.
- Model search: repos published by the model's maker itself are marked _official_ and listed first.

## [1.2.0] – 2026-10-22 · Shap3D.ai 0.7.0

### Added

- A window with the running model downloads – it stays reachable while you keep working.
- The model's thought process is shown folded, with its length in words.
- A warning when an answer was cut off because the model hit its token limit.
- A hint when there is no download progress from Ollama because a virus scanner or web filter (e.g. Sophos) holds the response back – the download keeps running.
- Model search: an explanation of GGUF and quants, mixture-of-experts models (…-A3B) show their active parameters and count with them in the _small models_ filter, and models that are no language model (e.g. image → 3D) are marked _not for Ollama_.

### Fixed

- Layout details in the chat, the setup wizard and the model search.

## [1.1.0] – 2026-10-20 · Shap3D.ai 0.6.0

### Added

- All texts in English, German, French, Spanish and Arabic.

### Changed

- Faster with long chats: state that does not need deep reactivity uses `shallowRef`.

## [1.0.0] – 2026-10-19 · Shap3D.ai 0.5.0

### Added

- The AI assistant moved from the core into a built-in plugin: the chat panel with its tile, the ✦ button in the top bar, the setup wizard, the model search on Hugging Face, the chat history and the palette switches _Fast mode_ and _Run code automatically_.
- Switched off, an answer that is being written and running model downloads stop; settings and history stay.
