# Maintainer-first README design

## Goal

Explain Cutscene to an open-source maintainer quickly and honestly. Show the
element-locked zoom result before asking the reader to understand the system.

## Structure

1. Project name and one plain sentence.
2. Side-by-side comparison at the top, stored as a tracked repository asset.
3. Current limitations before the feature list.
4. Verified Phase 1 capabilities only.
5. Local extension and editor setup using existing pnpm scripts.
6. Record, load, inspect, and export workflow.
7. Measured Phase 1 evidence and current phase status.
8. Development commands and the three-package repository layout.

## Tone

Technical, direct, and specific. No slogans, badges, testimonials, emoji,
roadmap promises, or claims unsupported by measured evidence.

## Assets

Convert the existing side-by-side MP4 to one GitHub-renderable GIF with a
global palette. Do not add screenshots or branding assets that do not explain
the element-locked zoom difference.

## Verification

- Every command shown must exist in `package.json` or be a real Chrome step.
- Every feature claim must match the current Phase 1 implementation.
- Limitations must appear before features.
- The comparison asset must be tracked and referenced by a relative path.
