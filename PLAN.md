# Cross-Domain Touchless Control Assistant for Hackathon

## Summary
Build a **touchless control assistant** that combines **gesture, vision, and voice** to let a user operate common workflows hands-free. For the hackathon, anchor the live demo in **meeting/presentation control** because it is the fastest, clearest, and most reliable domain to build in 2.5 hours, then position it as a **reusable platform** that also applies to accessibility, shopfloor, kitchen, or sterile-environment workflows.

The winning framing is:
- **Core story**: “We used Codex not just to write code, but to design, iterate, debug, and improve an agentic multimodal control system.”
- **Demo story**: “A user controls a presentation or meeting without keyboard/mouse using gestures and voice.”
- **Scale story**: “The same command-routing engine can be retargeted to multiple domains with new command packs.”

## Implementation Plan
### 1. Product Definition
Prototype a browser-based app with:
- Webcam input for gesture detection
- Microphone input for voice commands
- Simple presence/attention vision signal
- Command router that maps inputs to app actions
- Demo workspace showing slide navigation, mute/unmute, timer, and action log

Primary domain for demo:
- **Meeting/Presentation Controller**

Cross-domain extension shown in pitch, not fully built:
- Accessibility workstation
- Frontline/sterile hands-free workflow
- Smart kitchen or training assistant

Success criteria for the prototype:
- Recognize at least 3 gestures reliably
- Recognize at least 5 voice commands
- Execute actions with visible feedback in under 1 second
- Show a clean event log proving multimodal control worked
- Clearly demonstrate where Codex was used at each stage

### 2. Tech Stack and Build Choices
Choose the fastest possible stack:
- **Frontend**: React + Vite + TypeScript
- **Gesture/Vision**: MediaPipe Tasks Vision or TensorFlow.js hand landmark detection
- **Voice**: Web Speech API for command recognition
- **UI**: Single-page dashboard with live camera preview, current recognized intent, status, and event log
- **Control layer**: In-app simulated controls first; only add system-level controls if extra time remains

Avoid for the 2.5-hour MVP:
- Native desktop wrappers unless already familiar
- Custom ML training
- Backend services
- Authentication, databases, or cloud deployment complexity

Core modules/interfaces:
- `GestureRecognizer`: emits normalized gesture events like `SWIPE_LEFT`, `SWIPE_RIGHT`, `OPEN_PALM`
- `VoiceRecognizer`: emits normalized intents like `NEXT`, `BACK`, `MUTE`, `START`, `STOP`
- `VisionState`: emits lightweight state like `USER_PRESENT`, `USER_AWAY`
- `CommandRouter`: maps normalized events to actions
- `ActionExecutor`: updates app state and demo panel
- `EventLogger`: stores timestamped command/action history for pitch evidence

### 3. 2.5-Hour Delivery Sequence
**0:00-0:20**
- Scaffold React/Vite app with Codex
- Create split layout: camera, mic status, recognized command, control panel, log
- Add mock actions and fake buttons to verify UI flow

**0:20-1:00**
- Integrate webcam
- Add hand detection and implement 3 simple gestures:
  - swipe right -> next slide
  - swipe left -> previous slide
  - open palm -> pause/resume
- Add confidence threshold and cooldown to prevent repeated triggers

**1:00-1:30**
- Add voice recognition with 5 commands:
  - next
  - back
  - mute
  - start
  - stop
- Normalize speech results into the same command schema as gesture events

**1:30-1:50**
- Add simple presence signal:
  - if no face/person/active user for N seconds, set status to away
  - trigger demo behavior like “paused because user left”
- If presence detection is too slow, fall back to inactivity timer using webcam stream state

**1:50-2:10**
- Polish reliability:
  - debounce repeated gesture triggers
  - show confidence badges
  - make action log readable and timestamped
  - add “demo mode” with visible slides/timer/audio state

**2:10-2:30**
- Prepare pitch:
  - one problem slide
  - one architecture slide
  - one Codex workflow slide
  - live demo
  - one scale/reuse slide

## How to Maximize Each Judging Criterion
### Depth of Codex Integration (25%)
Make Codex central to the workflow, not just a coding helper.
- Use Codex to scaffold the app, wire webcam/mic APIs, create the recognizer interfaces, generate router logic, debug event timing, and improve UX copy
- Capture a simple “before/after” story: initial gesture detection was noisy, Codex helped add cooldowns and thresholds
- In the pitch, explicitly say Codex contributed across:
  - code generation
  - refactoring
  - debugging
  - iteration
  - demo preparation
- Show at least 2-3 concrete prompts or commits/screens showing Codex driving development decisions

### Real-World Partner Impact (25%)
Frame the app around a believable enterprise problem.
- Primary partner story: employees in meetings, demos, and hybrid collaboration need touchless control
- Secondary story: same engine helps accessibility and frontline workflows
- State measurable value:
  - less friction in presentations
  - accessibility support
  - reusable control layer across internal tools
- Avoid overclaiming full production readiness; pitch it as a credible prototype with clear next steps

### Reusability and Adoption Potential (25%)
Show the prototype is a platform, not a one-off hack.
- Architect commands as reusable events and action mappings
- Separate input recognizers from domain actions
- Explain that “meeting mode,” “accessibility mode,” and “field mode” are just different action packs on the same engine
- Mention future packaging options:
  - browser extension
  - desktop wrapper
  - internal accelerator SDK
- Use the phrase “multimodal command router” as the reusable asset

### Demo and Pitch Quality (25%)
Keep the live demo crisp and visible.
- Demo flow:
  1. show idle app
  2. use voice command “start”
  3. swipe to navigate slides
  4. say “mute”
  5. step away or simulate away-state
  6. show event log proving the sequence
- Narrate:
  - what was built
  - why it matters
  - how Codex enabled speed and iteration
- Do not overload with too many gestures or domains; one polished domain beats three weak ones

## Test Plan
Run these demo-ready validation scenarios:
- Gesture `SWIPE_RIGHT` advances in-app slide state once per gesture
- Gesture `SWIPE_LEFT` returns to previous slide once per gesture
- Gesture `OPEN_PALM` toggles pause/resume reliably
- Voice command `next` and `back` trigger the same actions as gestures
- Voice command `mute` updates visible audio state
- Unknown phrases do not trigger actions
- Repeated gesture frames do not cause multiple accidental actions
- If user is marked away, the app shows a clear paused/away state
- Event log records source, normalized command, resulting action, and timestamp

## Assumptions and Defaults
- Use a **web app** instead of a native desktop app for speed and reliability
- Prioritize **in-app simulated controls** over OS-level automation for the MVP
- Use **meeting/presentation control** as the live demo domain
- Position the solution as **cross-domain**, with internal productivity first and external productization second
- If vision-based presence detection is unstable, fall back to a simplified user-away signal rather than risking the demo
- If time gets tight, cut presence detection before cutting gesture + voice + command routing

