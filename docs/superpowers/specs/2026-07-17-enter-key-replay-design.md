# Enter Key Capture and Replay

## Goal

Make recorded flows that submit a field with Enter replayable without capturing
printable keys or guessing missing actions.

## Trace contract

`interaction.keypress` becomes a strict version 1 event with one additional
field:

```json
{ "v": 1, "type": "interaction.keypress", "key": "Enter" }
```

`key` is required and accepts only `Enter`. Missing values and every other key
are invalid. Existing traces remain valid because they contain no emitted
keypress events.

## Capture

The content script listens for `keydown` and emits an event only when the key is
Enter and the event target produces a privacy-safe target descriptor. The event
uses the current `stepId`, so the preceding input and its Enter submission stay
in recorded order within one step.

Printable keys, `code`, modifiers, and composition data are not captured. A
password target is dropped by the existing sanitizer. Sensitive targets keep
the existing masked descriptor and empty locator list.

## Replay

Replay planning adds a `press` action after the last input sample that precedes
the Enter event. One Enter is allowed per step. Multiple keypress events in one
step fail plan validation rather than replaying an ambiguous sequence.

Playwright resolves the keypress target through the same ranked locators used by
click and fill actions, then calls `press('Enter')`. Drift and orphan handling
are unchanged. Reports include the action kind but never the configured input
value.

## Verification

- Schema tests accept Enter and reject missing or printable keys.
- Replay-plan tests preserve `fill`, then `press` order and reject multiple
  keypresses.
- Browser replay proves Enter submits a real input through ranked locators.
- Extension capture proves the clean trace contains Enter without printable
  data.
- A one-row TodoMVC recording must replay both planned steps through their
  first-ranked locators.

## Deferred

Other control keys, modifiers, composition, and repeated Enter sequences within
one step are not implemented. Add a safe key only when a real recorded flow
requires it.
