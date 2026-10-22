# Changelog – AI assistant

## [Unreleased]

Nothing yet.

## [1.2.0] – 2026-10-22 · Shap3D.ai 0.7.0

### Added

- A window with the running model downloads – it stays reachable while you keep working.
- The model's thought process is shown folded, with its length in words.
- A warning when an answer was cut off because the model hit its token limit.
- A hint when there is no download progress from Ollama because a virus scanner or web filter (e.g. Sophos) holds the response back – the download keeps running.
- Model search: an explanation of GGUF and quants, mixture-of-experts models (…-A3B) show their active parameters and count with them in the *small models* filter, and models that are no language model (e.g. image → 3D) are marked *not for Ollama*.

### Fixed

- Layout details in the chat, the setup wizard and the model search.

## [1.1.0] – 2026-10-20 · Shap3D.ai 0.6.0

### Added

- All texts in English, German, French, Spanish and Arabic.

### Changed

- Faster with long chats: state that does not need deep reactivity uses `shallowRef`.

## [1.0.0] – 2026-10-19 · Shap3D.ai 0.5.0

### Added

- The AI assistant moved from the core into a built-in plugin: the chat panel with its tile, the ✦ button in the top bar, the setup wizard, the model search on Hugging Face, the chat history and the palette switches *Fast mode* and *Run code automatically*.
- Switched off, an answer that is being written and running model downloads stop; settings and history stay.
