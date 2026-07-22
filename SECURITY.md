# Security

## Reporting

Report a vulnerability through GitHub's private advisory form:
<https://github.com/macayu17/Cutscene/security/advisories/new>. Do not open a
public issue.

Expect an acknowledgement within a week. This is a small project with one
maintainer, and that is stated so you can plan around it rather than guess.

## What is in scope

- The extension: anything that captures more than the tab being recorded, that
  records while no recording is active, or that writes an unmasked input value
  into `trace.jsonl`.
- The editor: anything that sends a recording anywhere the user did not ask it
  to go.
- The share server: path traversal into the bundle store, bypassing the review
  token checks, or reaching another recording's data.
- The runner: anything that executes content from a recording as code.

## What is not

- The share server serving public, unguessable links to anyone holding the URL.
  That is the documented design; it has no accounts and no private links.
- Recordings being readable by anyone with access to the machine that made them.
  They are stored locally by design.
- Any behaviour that requires an attacker to already control the extension's own
  origin or the user's browser profile.

## Handling recordings

A `trace.jsonl` masks input values at capture, before it is written. It does not
mask URLs, routes, or accessible names, which can carry a customer name or an
account id. Treat a recording of a real system as sensitive when you attach one
to a report.
