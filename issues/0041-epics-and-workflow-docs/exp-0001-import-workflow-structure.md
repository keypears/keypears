# Experiment 1: Import workflow structure

## Description

Bring KeyPears up to the newer workflow shape without rewriting historical
issues.

## Changes

- Add `epics/` with an index and template.
- Add root issue and epic index generator scripts.
- Add workflow skills for epics, automated issues and experiments, manual issues
  and experiments, adversarial review, orthogonal review, Claude review, and
  Codex review.
- Replace whole-directory `.codex/skills` and `.claude/skills` symlinks with
  per-skill symlinks.
- Add a Claude adversarial reviewer agent file.
- Replace `CLAUDE.md` duplication with a pointer to `AGENTS.md`.
- Update `AGENTS.md` to route significant work through epics, issues,
  experiments, and workflow skills.

## Verification

- Run `scripts/build-issues-index.sh`.
- Run `scripts/build-epics-index.sh`.
- Check for stale source-project naming in imported workflow files.
- Check for broken skill symlinks.

## Design Review

Not run. This experiment bootstraps the imported workflow rules in the same
change. Future KeyPears issues using this workflow must follow the design review
gate before implementation.

## Result

Pass.

Observed verification:

- `scripts/build-issues-index.sh` reported 3 open and 38 closed issues.
- `scripts/build-epics-index.sh` reported 0 open, 0 closed, and 1 template epic.
- Skill symlink check found no broken `.codex/skills` or `.claude/skills` links.
- Imported workflow files have no stale source-project references outside this
  issue's historical source notes.
- `python3 -m py_compile` passed for the Claude and Codex review helper scripts.

## Conclusion

KeyPears now has the latest workflow structure: epics for multi-issue planning,
issues for concrete work, experiments for incremental implementation records,
workflow skills for detailed procedures, and per-agent skill links for Codex and
Claude.

Historical issues were not renamed, normalized, or retrofitted. The new
experiment filename and metadata conventions apply to future issues and
experiments.

## Completion Review

Not run. This experiment bootstraps the imported workflow rules in the same
change. Future KeyPears issues using this workflow must follow the completion
review gate before the result commit.
