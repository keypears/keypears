---
name: issues-and-experiments
description:
  "Run the default automated KeyPears issue workflow. Use when creating issues,
  designing experiments, recording results, closing issues, or following the
  same-harness reviewed experiment loop."
---

# Issues and Experiments

This is the default KeyPears workflow for significant work. Issues describe the
problem and constraints. Experiments are the reviewed, incremental steps that
solve the issue.

Use one experiment at a time. The result of the current experiment determines
the next one.

## When This Skill Applies

Use this skill when:

- creating a new issue;
- designing an experiment;
- implementing an experiment under the normal automated workflow;
- recording experiment results;
- closing an issue;
- auditing whether the workflow gates have been satisfied.

## Issue Shape

Each issue is a folder:

```text
issues/{NNNN}-{slug}/README.md
```

`NNNN` is globally sequential and zero-padded. The slug is lowercase hyphenated.

Each issue README starts with TOML frontmatter:

```toml
+++
status = "open"
opened = "YYYY-MM-DD"
workflow = "issues-and-experiments"
review_mode = "external-claude"
review_routing = "orthogonal-review"
+++
```

Closed issues add:

```toml
closed = "YYYY-MM-DD"
```

New issue READMEs should include:

1. `# Issue {N}: {Title}`
2. `## Goal`
3. `## Background`
4. `## Analysis`, `## Architecture`, or `## Proposed Solution`

A new issue has no experiments listed until the first experiment is designed.

Regenerate the issue index after issue frontmatter or issue folders change:

```bash
scripts/build-issues-index.sh
```

## Workflow Metadata

Every new issue must declare its solution workflow and adversarial review mode
in the issue README frontmatter. Do not leave either choice implicit.

Use `workflow` to specify the solution type:

```toml
workflow = "issues-and-experiments"
```

Supported values:

- `issues-and-experiments` for the fully automated issue workflow;
- `manual-issues-and-experiments` for the manual workflow where the user
  participates at each design, review, implementation, and result gate.

Use `review_mode` to specify the reviewer for the issue. New automated issues
default to orthogonal review: choose an external reviewer from a different
harness and add `review_routing = "orthogonal-review"`.

For Codex-authored issues:

```toml
review_mode = "external-claude"
review_routing = "orthogonal-review"
```

For Claude-authored issues:

```toml
review_mode = "external-codex"
review_routing = "orthogonal-review"
```

Supported values:

- `same-agent` for an explicitly requested in-session adversarial reviewer;
- `external-claude` for the Claude CLI reviewer;
- `external-codex` for the Codex CLI reviewer.

The values should name the skill-defined workflow and review taxonomy so the
issue's operating rules are discoverable before an agent starts work.

If only one experiment deviates from the issue's workflow, keep the issue
frontmatter unchanged and record the deviation in that experiment's frontmatter
or body. Do not add workflow metadata to historical issues unless the user
explicitly requests that specific historical edit.

## Future Experiment Shape

For experiments created from now on, use:

```text
exp-NNNN-{descriptive-name}.md
```

`NNNN` is zero-padded in creation order within the issue. The descriptive name
is lowercase hyphenated.

Each experiment file contains:

1. `# Experiment {N}: {Title}`
2. `## Description`
3. `## Changes`
4. `## Verification`
5. `## Design Review`
6. `## Result`
7. `## Conclusion`
8. `## Completion Review`

Add the experiment to the issue README under `## Experiments` as soon as it is
designed:

```markdown
- [Experiment 1: Short title](exp-0001-short-title.md) — **Designed**
```

Use one of these statuses: `Designed`, `In progress`, `Pass`, `Partial`, or
`Fail`.

## Default Automated Workflow

1. **Create or identify the issue.** Significant work needs an issue before
   implementation starts. For new issues, confirm the issue README frontmatter
   declares `workflow` and `review_mode`.
2. **Design one experiment.** Create one `exp-NNNN-{slug}.md` file with
   Description, Changes, and Verification. Do not list future experiments.
3. **Link the experiment from the issue README.** Set status to `Designed`.
4. **Get design review.** Ask a separate AI reviewer to review the design. Use
   the issue README's `review_mode` value. `same-agent` routes through
   `adversarial-review`; `external-claude` routes through `claude-review`;
   `external-codex` routes through `codex-review`. Use `orthogonal-review` as
   the routing helper when the reviewer should be a different harness from the
   implementer.
5. **Fix real review findings.** Record the review mode, reviewer
   harness/command, verdict, required findings, and resolution in
   `## Design Review`.
6. **Commit the reviewed plan.** Do not implement until the approved plan commit
   exists.
7. **Implement the experiment.** Keep the implementation inside the approved
   scope.
8. **Verify.** Run the verification commands listed in the experiment and any
   formatting/build/test checks required by touched files.
9. **Record the result.** Add `## Result` and `## Conclusion` to the experiment
   file. Update the README experiment status to `Pass`, `Partial`, or `Fail`.
10. **Get completion review.** Ask a separate AI reviewer to review the
    completed result and diff.
11. **Fix real completion-review findings.** Record the review mode, reviewer
    harness/command, verdict, required findings, and resolution in
    `## Completion Review`.
12. **Commit the reviewed result.** Do not design the next experiment until the
    result commit exists.
13. **Repeat or close.** Design the next experiment only after the prior result
    commit, or close the issue if the goal is complete.

## Review Rules

Every experiment has two review gates:

- **Design review before implementation.** The reviewer checks scope, technical
  plan, verification, and workflow completeness.
- **Completion review before result commit.** The reviewer checks the diff,
  claimed verification, result language, and issue README status.

The reviewer must be separate from the implementation pass. The issue README
must declare the issue's `review_mode`. New automated issues normally use
orthogonal review: Codex-authored issues use `review_mode = "external-claude"`
and Claude-authored issues use `review_mode = "external-codex"`, with
`review_routing = "orthogonal-review"` in the issue README frontmatter. Use
`same-agent` only when the user explicitly requests an in-session reviewer or
when no external reviewer is available. If the selected reviewer changes for the
whole issue, update the issue README frontmatter before using the new mode. If
only one experiment deviates, record that deviation in that experiment's
frontmatter or review section.

Reviewers are allowed up to 15 minutes. Do not proceed around a required review
unless the user explicitly changes the workflow.

## Commit Rules

Each experiment has two commit points:

- **Plan commit:** after design review is approved and recorded, before
  implementation.
- **Result commit:** after implementation, verification, result recording,
  completion review, and fixes.

Do not combine plan and result commits. Do not start the next experiment before
the previous result commit exists.

## Closing an Issue

Close an issue only when the issue goal is solved or explicitly abandoned.

1. Add `## Conclusion` to the issue README.
2. Update frontmatter:

   ```toml
   status = "closed"
   closed = "YYYY-MM-DD"
   ```

3. Regenerate the issue index:

   ```bash
   scripts/build-issues-index.sh
   ```

4. Commit the closure.

## Historical Immutability

Closed issues are historical records. Do not modify closed issues unless the
user explicitly requests a specific historical edit.

Do not migrate, rename, rewrite, normalize, or retrofit historical issue or
experiment files to the future `exp-NNNN-{descriptive-name}.md` convention.
Older issues keep their original shapes and filenames.
