---
name: epics
description:
  "Create, update, and close KeyPears epics. Use when work spans multiple
  issues, when maintaining epics/README.md, or when linking issue work back to a
  larger project goal."
---

# Epics

Use epics for coherent goals that are larger than one issue. Epics live in
`epics/` and track the checklist of work that should become issues or
experiments.

Epics are planning records. Implementation still happens through issues and
experiments.

## When This Skill Applies

Use this skill when:

- creating a new epic;
- updating an epic checklist or linked issue list;
- closing an epic;
- deciding whether a goal should be an epic or an issue;
- editing `epics/README.md`.

## Epic Shape

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

Closed epics add:

```toml
closed = "YYYY-MM-DD"
```

Template epics may use `status = "template"`.

## Required Sections

Use these sections unless an epic has a documented reason to differ:

1. `# Epic {N}: {Title}`
2. `## Goal`
3. `## Background`
4. `## Success Criteria`
5. `## Checklist`
6. `## Linked Issues`
7. `## Notes`

Checklist items should be concrete enough to become an issue or experiment.

## Process

1. **Decide if the work is epic-sized.** If the goal has one concrete problem
   and a clear solution path, create an issue instead. If it needs multiple
   issues or a multi-step program of work, create an epic.
2. **Choose the next epic number.** Read `epics/README.md` and existing
   `epics/*/README.md` files. Use the next zero-padded number.
3. **Create the folder and README.** Use the schema above. Keep the goal and
   success criteria auditable.
4. **Regenerate `epics/README.md`.** Run:

   ```bash
   scripts/build-epics-index.sh
   ```

   The script updates the epic index from the epic folders.

5. **Link issues as they open.** When a checklist item becomes an issue, add the
   issue under `## Linked Issues` and update the checklist item with the issue
   number.
6. **Update the epic as issues close.** Closing an issue should update any
   linked epic checklist item when the epic remains active.
7. **Close the epic when complete.** Add a conclusion or final notes if useful,
   set `status = "closed"`, add `closed = "YYYY-MM-DD"`, run
   `scripts/build-epics-index.sh`, and format markdown.

## Historical Scope

Epics are future-facing planning records. Do not rewrite historical issues to
fit an epic unless the user explicitly requests a specific historical edit.

Closed epics are historical records. Do not modify them unless the user
explicitly asks for a specific historical edit.
