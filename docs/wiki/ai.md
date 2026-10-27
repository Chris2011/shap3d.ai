# Local AI copilot

![AI assistant and night scene](../screenshots/night.png)

Describe what you want ("a small house with a gable roof, windows and a wooden door") and the assistant builds it in your model as one undoable step.

- **Code models** (Qwen2.5-Coder, Qwen3, Llama 3.1 …) write `s3d` scripts. The system prompt contains the full API reference, typical real-world dimensions and worked examples, and a failed script is sent back to the model automatically so it can fix itself.
- **Mesh models** (LLaMA-Mesh) return raw OBJ geometry, which is imported as a component.
- **Fast mode** uses a compact prompt and short answers for computers without a graphics card. qwen2.5-coder:3b answers in about 25 s on a laptop CPU.
- **Setup wizard and model search**: connect a local server, then browse Hugging Face for GGUF models with size and speed hints and download them through Ollama with live progress, speed and time remaining.
- **Searchable chat history** with timestamps, a live "thinking" timer, syntax-highlighted code with a copy button, and models are unloaded from memory when you switch.

## Connecting a local AI model

The AI features are optional and never contact a cloud service. The easiest route is [Ollama](https://ollama.com):

```bash
ollama pull qwen2.5-coder:3b     # fast, works without a GPU
ollama pull qwen2.5-coder:7b     # better results
```

Then click the sparkle icon in the top bar and follow the setup wizard. LM Studio, LiteLLM and any OpenAI-compatible server work too. In development, a small Vite proxy takes care of CORS.
