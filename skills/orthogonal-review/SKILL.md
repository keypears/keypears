---
name: orthogonal-review
description:
  "Route KeyPears reviews to a different AI harness. Use when the user requests
  cross-model review, when same-harness review is insufficient, or when a risky
  issue needs an independent reviewer."
---

# Orthogonal Review

Orthogonal review means the implementation agent and review agent use different
harnesses where possible. It is a routing helper over the explicit external
review modes, not a separate fourth review mode. Use it to reduce shared blind
spots in designs, implementations, and release decisions.

## When This Skill Applies

Use this skill when:

- the user asks for Claude to review Codex work, Codex to review Claude work, or
  any cross-model review;
- an experiment is large, risky, or has already failed once;
- the work touches cryptography, authentication, federation, protocol
  boundaries, release automation, persistent state, proof-of-work, public API
  behavior, or security-sensitive behavior;
- same-harness review found nothing but the risk still warrants another
  perspective.

## Reviewer Selection

Prefer a genuinely different harness from the implementer:

- Codex implementation -> `external-claude` via `claude-review`.
- Claude implementation -> `external-codex` via `codex-review`.
- Future harnesses -> use their project skill or CLI wrapper when available.

Do not hardcode the workflow to only Codex and Claude. If a future review
harness exists, use the skill or command documented for that harness.

## Process

1. **Prepare narrow context.** Include the issue README, experiment file,
   relevant diff, verification output, and exact questions.
2. **Choose the review skill.** Use `claude-review`, `codex-review`, or the
   future harness-specific review skill.
3. **Ask for a skeptical review.** The reviewer should return findings first,
   ordered by severity, with file/line evidence where possible.
4. **Respect the timeout.** Reviewers get up to 15 minutes unless the user
   changes the workflow.
5. **Act on real findings.** Fix correctness, scope, verification, or workflow
   issues. Reject false positives explicitly with a short reason.
6. **Record the result.** Put design reviews in `## Design Review` and completed
   result reviews in `## Completion Review`, including the selected review mode,
   helper command or harness, verdict, findings, and resolution.
7. **Re-review non-trivial fixes.** Ask the same reviewer, or another orthogonal
   reviewer if the first is unavailable, to confirm the fix.

## Prompt Contents

For design reviews, include:

- issue README path;
- experiment file path;
- intended scope;
- verification plan;
- specific concerns to check.

For completion reviews, include:

- issue README path;
- experiment file path;
- implementation diff command;
- changed source paths;
- verification commands and observed output;
- remaining risks or known limitations.

## Relationship to Same-Harness Review

Orthogonal review is the default for new automated KeyPears issues. It selects
either `external-claude`, `external-codex`, or a future documented external
review mode so the reviewer uses a different harness from the implementer where
possible.

Same-harness review remains available as `review_mode = "same-agent"` when the
user explicitly requests it or when no external reviewer is available.

Declare issue-level orthogonal review in the issue README frontmatter:

```toml
workflow = "issues-and-experiments"
review_mode = "external-claude" # for Codex-authored work
review_routing = "orthogonal-review"
```

For Claude-authored work, use `review_mode = "external-codex"` with the same
`review_routing = "orthogonal-review"` value. Do not retrofit historical issues
with workflow metadata unless the user explicitly requests that specific
historical edit.
