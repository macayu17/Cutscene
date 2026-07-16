# Phase 6 team collaboration plan

## Scope

Finish the two unchecked Phase 6 implementation areas without adding accounts,
a database, billing, or a general permissions framework.

### Invitations

- Keep the recording review document as the current workspace boundary.
- The creator remains the single owner.
- Owners create one-use editor, commenter, or viewer invitations.
- An invitation is explicitly either a team membership or project-only access.
- Store only token hashes. Expose invitation metadata, never credentials.
- Owners can revoke an unused invitation. Used and revoked invitations cannot be
  exchanged.
- Existing commenter links remain valid as project invitations.

### Shared brand kit

- Store a validated list of the existing `BrandPreset` shape in the review
  document, so every member sees one team kit for the shared project.
- Any authenticated member may read it. Owners and editors may replace it.
- The editor loads the kit when it connects to a shared recording and provides
  an explicit save action. Local presets remain local until that action.

## Verification

1. Unit-test invitation creation, revocation, role/scope exchange, credential
   redaction, and brand-kit validation.
2. API-test all four roles and the project-only path.
3. Browser-test an owner creating an editor team invitation, the editor joining,
   approving, and loading a shared brand kit.
4. Run all unit tests, typechecks, builds, and Chromium E2Es.

Phase 6 remains gated until a second actual person completes the team review and
the timestamp-moving comment flow is confirmed.
