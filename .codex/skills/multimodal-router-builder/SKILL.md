---
name: multimodal-router-builder
description: Build browser-based multimodal control apps that combine webcam gesture input, microphone voice input, lightweight vision or presence signals, a normalized command schema, and a reusable command router. Use when Codex needs to scaffold, extend, debug, or harden touchless-control prototypes, meeting controllers, accessibility interfaces, or similar apps where multiple input modalities should trigger shared actions.
---

# Multimodal Router Builder

Use this skill to keep multimodal prototypes modular, demo-safe, and reusable.

## Workflow

1. Define the demo outcome before choosing libraries.
2. Normalize all inputs into one command schema.
3. Keep recognizers separate from action execution.
4. Favor browser-safe fallbacks over fragile native integrations.
5. Expose visible state and logging for demos.

## Preferred Architecture

Organize the app into these layers:

- `GestureRecognizer`
- `VoiceRecognizer`
- `VisionState`
- `CommandRouter`
- `ActionExecutor`
- `EventLogger`

Read [references/command-patterns.md](references/command-patterns.md) when defining commands, actions, and demo-safe fallbacks.

## Build Rules

- Prefer browser-first implementations for MVP speed and cross-platform support.
- Normalize gesture and voice into shared commands such as `NEXT`, `BACK`, `START`, `STOP`, `MUTE`, `USER_AWAY`.
- Keep system-level automation out of v1 unless the user explicitly prioritizes it.
- Add cooldowns, thresholds, and visible confidence indicators for any live recognizer.
- Always include manual fallback controls so the demo still works if a model or permission flow is noisy.
- Show a timestamped log of source, command, action, and confidence.

## Gesture Guidance

- Prefer open-source browser libraries such as TensorFlow.js hand pose detection for hand tracking.
- Keep the gesture vocabulary small for v1: left swipe, right swipe, open palm.
- Use wrist or palm centroid motion over a short frame window for swipe detection.
- Use fingertip spread and finger extension heuristics for open-palm detection.
- Debounce repeated detections with a cooldown.

## Voice Guidance

- Prefer the browser Web Speech API for MVP speed.
- Map multiple phrases to the same normalized command.
- Ignore low-signal phrases rather than guessing.

## Presence Guidance

- Treat presence as a lightweight demo signal, not biometric identity.
- Prefer motion or inactivity-based away-state logic if full face detection is not needed.
- Auto-pause on away-state only if the demo benefit is obvious.

## Demo Readiness

- Keep the UI single-screen when possible.
- Surface live status for camera, voice, playback, and presence.
- Make the command router visible in the UI language so the architecture is easy to explain.

