# Epics

Epics are planning documents for goals that are too large for a single issue.
They group related work, explain why the work matters, and track the checklist
of items that should become issues or experiments.

Epics are not implementation records. Implementation still happens through
issues and experiments.

## Index

| #      | Title         | Status   |
| ------ | ------------- | -------- |
| [0000] | Epic Template | Template |

[0000]: 0000-template/README.md

## Schema

Each epic is a folder:

```text
epics/{NNNN}-{slug}/README.md
```

`NNNN` is zero-padded and independent from issue numbers. The slug is lowercase
hyphenated.

Each epic README starts with TOML frontmatter:

```toml
+++
status = "open"
opened = "YYYY-MM-DD"
+++
```

Use `status = "template"` for templates. Closed epics add
`closed = "YYYY-MM-DD"`.

Recommended sections:

1. `# Epic {N}: {Title}`
2. `## Goal`
3. `## Background`
4. `## Success Criteria`
5. `## Checklist`
6. `## Linked Issues`
7. `## Notes`

Checklist items should be concrete enough to become an issue or an experiment.
When a checklist item becomes an issue, link it under `## Linked Issues` and
update the checklist item with the issue number.

## Index Generation

Regenerate this file's index after creating, closing, or renumbering epics:

```bash
scripts/build-epics-index.sh
```

The generator reads `epics/*/README.md`, validates epic frontmatter and titles,
and rewrites only the `## Index` block.

## Relationship to Issues and Experiments

- Epics describe multi-issue goals.
- Issues describe concrete work with a clear problem and proposed direction.
- Experiments are the incremental reviewed steps inside an issue.

An epic may remain open while many issues open and close beneath it. Closing an
issue should update any linked epic checklist item when the epic is still
active.

## Historical Scope

Epics are a future-facing workflow layer. Do not rewrite historical issues to
fit an epic unless the user explicitly requests a specific historical edit.
