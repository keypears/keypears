+++
status = "closed"
opened = "2026-06-30"
closed = "2026-06-30"
workflow = "issues-and-experiments"
review_mode = "external-claude"
review_routing = "orthogonal-review"
+++

# Issue 41: Epics and Workflow Docs

## Goal

Import the latest issues, experiments, and epics workflow from the current
TermSurf workflow into KeyPears.

## Background

KeyPears already used an issues-and-experiments workflow, but the process lived
almost entirely inside `AGENTS.md` and did not include epics, workflow skills,
review-mode metadata, or per-agent skill links.

TermSurf has a newer version of the workflow where `AGENTS.md` contains
routing-level rules, detailed procedures live in skills, epics track multi-issue
goals, and Codex/Claude expose project skills through individual symlinks.

## Experiments

- [Experiment 1: Import workflow structure](exp-0001-import-workflow-structure.md)
  — **Pass**

## Conclusion

This issue imported the newer workflow documentation and repository structure
from TermSurf into KeyPears.

`AGENTS.md` now gives routing-level rules and points to skills for detailed
workflow procedures. `epics/` exists with an index and template. Root index
generators exist for issues and epics. `.codex/skills/` and `.claude/skills/`
are real directories with individual symlinks, allowing future harness-specific
skill divergence. `CLAUDE.md` now points to `AGENTS.md` instead of duplicating
the full instruction file.
