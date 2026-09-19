# OMEGA Hybrid Online/Offline AI Integration Inspection

## Decision

The supplied `Antigravity (1).tar.gz` was inspected before integration. It is **not** integrated as OMEGA's offline AI runtime because the archive is a desktop Linux ARM64 Electron application package, not a proven Android local-inference model/runtime package.

## Inspection facts

- Compressed archive: 171,281,032 bytes (~163.28 MiB).
- Extracted regular-file payload: 528,282,304 bytes (~503.81 MiB).
- 389 archive entries.
- Primary binary: `Antigravity-arm64/antigravity`, ELF 64-bit AArch64, dynamically linked for GNU/Linux with `/lib/ld-linux-aarch64.so.1`.
- Additional native binary: `resources/bin/language_server`, also Linux AArch64.
- Electron/Chromium evidence includes `resources/app.asar`, `chrome-sandbox`, `libEGL.so`, `libGLESv2.so`, `libvulkan.so.1`, `icudtl.dat`, `resources.pak`, and Chromium locale packages.
- No GGUF, GGML, ONNX, TensorFlow, PyTorch, or Llama model/runtime filenames were found in the archive listing.
- No Android APK/AAB components or Android native libraries were found in the archive listing.
- A local inference API was not proven by inspection.
- Streaming local inference and structured/function calling are unknown.
- Fully offline inference is not proven.

## Architecture added

`omega_ai_provider.js` is the single AI provider boundary.

- `GeminiProvider` handles the online path.
- `OfflineProvider` handles the offline path through `omega_offline_ai_bridge.js`.
- Gemini failure falls back to OfflineProvider.
- Offline AI failure returns a non-fatal unavailable envelope so deterministic gameplay remains usable.

`omega_offline_ai_bridge.js` is the only layer that knows the local AI package/runtime contract. It is capability-gated and will refuse the inspected package rather than pretending that the desktop application is an Android local LLM.

`omega_ai_runtime_contract.js` defines request/response envelopes and validates proposed executable commands. AI proposals do not directly mutate game state.

`omega_data_provider.js` introduces DevelopmentDataProvider and AndroidLocalDataProvider so future Android packaging can use local application assets without duplicating game logic.

## Current offline-AI status

The provider architecture is installed, but the supplied 168 MB package is deliberately **not** enabled for local inference. Full offline AI therefore remains blocked until a real Android-compatible local inference runtime/model is supplied and benchmarked.

## Required next compatibility gate

A future package must prove: model format, quantization, Android CPU architecture, minimum API level, native libraries, RAM/storage use, inference API, streaming, structured/tool calling, and zero-network operation. Only after those checks pass should the manifest be changed to enable the OfflineProvider.

## Existing authority preserved

The existing semantic system, country/resource bridges, Deep Core, reasoning dispatcher, and deterministic simulation remain authoritative for repository-backed facts and state. The new AI layer is explanatory/reasoning infrastructure, not a replacement Deep Core or resolver.
