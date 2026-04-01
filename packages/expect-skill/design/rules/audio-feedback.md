---
name: audio-feedback
description: Adding sound to web interfaces. Use when implementing click sounds, confirmation tones, error feedback, or procedural audio with the Web Audio API.
---

# Audio Feedback

Sound is the forgotten sense in web design. The auditory cortex processes sound in ~25ms — 10x faster than vision. A button with a click sound feels faster even with identical visual feedback.

## when to apply

Reference these rules when:

- adding audio feedback to interactions
- implementing procedural sound with the Web Audio API
- reviewing existing audio for accessibility and appropriateness

## when to use sound

- confirmations for major actions (payments, uploads, submissions)
- errors and warnings that can't be overlooked
- state changes that reinforce transitions
- notifications that interrupt without requiring visual attention

## when NOT to use sound

- typing or keyboard navigation (high-frequency)
- hover states or decorative moments
- any interaction that repeats dozens of times per session

## accessibility rules

- every sound **must** have a visual equivalent — sound complements, never replaces
- provide a toggle to disable sounds entirely
- respect `prefers-reduced-motion` as a proxy for audio sensitivity
- allow independent volume adjustment
- default volume subtle (~0.3), never loud

## implementation rules

- preload audio files to avoid playback delay
- reset `currentTime` to 0 before replaying a sound
- sound weight matches action importance — light click for toggles, heavier tone for confirmations
- sound duration matches action duration
- inform, never punish — no harsh error beeps

## Web Audio API rules

- reuse a single `AudioContext` — never create one per sound
- resume suspended AudioContext before playing (browser autoplay policy)
- disconnect audio nodes after playback
- exponential ramps for natural decay (target 0.001, not 0)
- set initial gain value before ramping
- filtered noise for percussive sounds (clicks, taps) — bandpass filter 3000–6000Hz
- oscillators with pitch sweep for tonal sounds
- click sounds: 5–15ms duration
- gain under 1.0 to prevent clipping
- filter Q: 2–5 for focused but natural sound

## review guidance

- if sound plays without a visual equivalent, flag accessibility violation
- if there's no toggle to disable sounds, flag missing preference control
- if sound plays on hover or typing, flag inappropriate usage
- if AudioContext is created per sound instead of reused, flag performance issue
- if gain exceeds 1.0, flag clipping risk
