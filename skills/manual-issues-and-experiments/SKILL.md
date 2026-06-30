---
name: manual-issues-and-experiments
description:
  "Run the manual KeyPears issue workflow. Use when the user wants to design,
  review, implement, and conclude experiments interactively instead of using the
  fully automated loop."
---

# Manual Issues and Experiments

Use this variant when the user wants to walk through the issue/experiment
workflow interactively. The records and gates stay rigorous, but the user
explicitly participates in design, review, implementation, and result decisions.

## When This Skill Applies

Use this skill when:

- the user asks for a manual issue workflow;
- the user wants to co-design an experiment before implementation;
- the user wants explicit approval points before plan or result commits;
- the work is ambiguous enough that automated experiment design would be
  premature.

## Relationship to the Default Workflow

The manual workflow still uses:

- issue folders under `issues/{NNNN}-{slug}/`;
- issue README frontmatter with `workflow = "manual-issues-and-experiments"` and
  a required `review_mode`;
- future experiment files named `exp-NNNN-{descriptive-name}.md`;
- one experiment at a time;
- design and completion review records;
- separate plan and result commits;
- immutable historical issues.

The difference is that the user participates at each gate instead of delegating
the whole loop to the agent.

## Process

1. **Clarify the issue goal with the user.** Create or update the issue README
   only after the goal is concrete enough.
2. **Declare the manual workflow and reviewer.** Add
   `workflow = "manual-issues-and-experiments"` and the selected `review_mode`
   to the issue README frontmatter for new manual issues. Do not retrofit
   historical issues unless the user explicitly requests that specific edit.
3. **Draft one experiment design.** Use the standard experiment sections:
   Description, Changes, and Verification.
4. **Review the design with the user.** Discuss scope, risks, and verification.
   Revise until the user agrees the design is ready.
5. **Run AI design review if required.** If the issue still follows the normal
   review gate, ask a separate reviewer and record the result.
6. **Commit the plan only after agreement.** Do not treat silence as approval.
7. **Implement the experiment.** Keep changes inside the agreed scope.
8. **Verify and record the result.** Add Result and Conclusion, then update the
   issue README experiment status.
9. **Review the implementation with the user.** Walk through the diff,
   verification output, and remaining risks.
10. **Run AI completion review if required.** Record the result and fix real
    findings.
11. **Commit the result only after agreement.**
12. **Repeat or close.** Decide together whether to design another experiment or
    close the issue.

## Guardrails

- Do not skip records because the workflow is manual.
- Do not list future experiments upfront.
- Do not migrate historical experiment filenames.
- Do not modify closed issues unless the user explicitly requests a specific
  historical edit.
- Keep manual approval points explicit in the experiment file when they affect
  scope or commit timing.
