# ACCESSIBILITY.md

## Goal
EchoLocate aims to provide readable, low-friction live captions for Deaf and hard-of-hearing users in real time, while keeping data local to the browser.

## Standards Intent
The project is designed to align with WCAG 2.2 AA principles where feasible in a pure client-side web app context.

## Implemented Accessibility Features

### Semantics And Structure
- Landmarks are present: banner, main, contentinfo
- Control area is exposed as a toolbar with explicit labels
- Live transcript lanes use role=log with additions announced
- Interim speech strip uses role=status and polite announcements
- HTTPS warning uses role=alert for critical setup feedback

### Operability
- Core actions are native button elements (keyboard accessible by default)
- Focus-visible ring is defined globally for keyboard users
- Reduced motion preference is respected via prefers-reduced-motion
- Responsive layout supports mobile and narrow screens

### Perception And Readability
- Transcript cards use large base text sizing for readability
- Color themes support dark and light usage contexts
- Theme is initialized early to avoid flash of incorrect contrast mode
- Card metadata includes speaker label and timestamp context
- Lower ASR confidence text gets additional visual marking

### Privacy And User Understanding
- A persistent privacy notice explains local-only processing
- Notice explicitly states that audio/transcript data is not sent to GitHub or third-party servers

## Current Known Limitations
- Speech recognition depends on browser support for Web Speech API
- Speaker grouping is heuristic and can mis-assign utterances in edge cases
- Confidence indicators are model/engine dependent and not calibrated per environment
- Fully automated contrast audits are not yet part of CI

## Manual Accessibility Test Checklist
Run these checks on major updates:
1. Keyboard-only flow: Start, Stop, Export VTT, Clear, Theme toggle, Debug, Stereo
2. Screen reader smoke test: status updates, lane additions, interim speech announcements
3. Theme parity: verify all text and control states are readable in dark and light modes
4. Zoom and reflow: test at 200% zoom and narrow viewport
5. Motion: ensure reduced-motion mode removes non-essential animations
6. Privacy copy: verify notice remains clear and accurate

## Browser Notes
Recommended: current Chrome or Edge for full speech feature support.
