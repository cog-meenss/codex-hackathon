# Codex Hackathon: Touchless Control Assistant

A browser-based multimodal control prototype that combines **gesture**, **voice**, and **presence awareness** to let a user control a presentation or meeting hands-free.

The live demo is anchored in **meeting and presentation control**, while the reusable architecture is designed to extend into accessibility, frontline, sterile-environment, and training workflows.

## Problem

Meetings, demos, and accessibility workflows still depend heavily on keyboard and mouse interaction, which adds friction in hands-busy, touchless, or inclusive-use scenarios.

## Solution

This prototype uses webcam input, microphone input, and a reusable **multimodal command router** to translate user intent into actions like:

- start or stop a session
- move to the next or previous slide
- pause or resume playback
- mute or unmute audio
- auto-pause when the user steps away

## Why This Project Matters

- **Real-world impact**: improves meeting flow and supports touchless or accessibility-first interactions
- **Reusability**: the same command router can power multiple domain modes
- **Codex depth**: custom Codex skills and iterative agentic development were used to scaffold, refine, debug, and package the prototype
- **Hackathon-ready demo**: one-screen UI with visible commands, actions, confidence, and event log

## Tech Stack

- `React`
- `Vite`
- `TypeScript`
- `@tensorflow/tfjs`
- `@tensorflow-models/hand-pose-detection`
- browser `getUserMedia()` for camera
- browser `Web Speech API` for voice recognition

## MVP Scope

The current MVP includes:

- live camera feed
- TensorFlow.js hand gesture recognition
- voice command recognition
- motion-based away-state detection
- normalized command routing
- in-app presentation controller
- evidence log with source, command, action, timestamp, and confidence
- manual fallback controls for demo safety

## Supported Demo Environment

For the MVP, the recommended demo environment is:

- **Windows or macOS**
- **Chrome or Edge**

Notes:

- Gesture support is designed to work cross-platform in the browser.
- Voice support depends on browser support for `SpeechRecognition`, so Chrome or Edge should be used for the live demo.
- Native desktop automation is intentionally out of scope for v1.

## Demo Commands

### Voice

Try these commands:

- `start`
- `next`
- `back`
- `mute`
- `unmute`
- `stop`

### Gestures

Try these gestures:

- hold 1 finger -> previous slide
- hold 2 fingers -> next slide
- hold an open palm -> pause or resume
- quick swipe right -> next slide
- quick swipe left -> previous slide

### Presence

- remain still or step away for about 10 seconds -> away-state triggers and the session pauses

## Demo Flow

Recommended pitch flow:

1. Show the app idle with camera and voice status visible.
2. Say `start`.
3. Hold 2 fingers or swipe right to move to the next slide.
4. Hold 1 finger or swipe left to go back.
5. Show an open palm to pause or resume.
6. Say `mute`.
7. Trigger away-state.
8. End on the evidence log and explain the reusable command router.

## Project Structure

```text
src/
  data/
  hooks/
  lib/
  App.tsx
  main.tsx
  styles.css
  types.ts
```

Key modules:

- `src/hooks/useHandGestures.ts`: TensorFlow.js hand detection and gesture interpretation
- `src/hooks/useSpeechCommands.ts`: browser voice recognition
- `src/hooks/usePresenceMonitor.ts`: motion-based away-state detection
- `src/lib/commandRouter.ts`: normalized command mapping and action execution
- `src/App.tsx`: dashboard UI and demo orchestration

## Codex Skills In This Repo

This project includes repo-owned Codex skills for team collaboration:

- `.codex/skills/multimodal-router-builder`
- `.codex/skills/hackathon-pitch-packager`

These skills are not runtime dependencies of the React app. They exist to support Codex-assisted development, refinement, and packaging of the hackathon deliverable.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## How To Test

1. Open the app in Chrome or Edge.
2. Allow camera and microphone permissions.
3. Test the manual buttons first.
4. Test voice commands.
5. Test gestures.
6. Test away-state by stepping out of frame or remaining still.

Expected visible signals:

- live camera feed
- last voice transcript
- last recognized intent
- gesture and motion confidence
- slide changes and audio state updates
- event log entries

## Current Limitations

- Voice recognition depends on browser support and microphone permissions.
- Gesture accuracy is optimized for hackathon demo reliability, not production calibration.
- TensorFlow.js increases bundle size, so future optimization should lazy-load the hand detector.
- OS-level automation is not part of the MVP.

## Codex Contribution Story

Codex was used to:

- define the hackathon use case
- architect the multimodal command router
- scaffold the React app
- integrate TensorFlow.js gesture detection
- wire voice and presence handling
- debug build and type issues
- create project-local custom skills
- package the project for team collaboration and judging

## Next Steps

- add lazy-loading for the hand detector
- improve gesture calibration across lighting conditions
- add domain modes beyond meeting control
- explore desktop packaging after the hackathon
