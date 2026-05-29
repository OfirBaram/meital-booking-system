---
name: claude-md-maintenance
description: >-
  Keep CLAUDE.md (and other long-lived instruction/spec docs) lean and correct.
  Use when CLAUDE.md needs a size check, has bloated past its character budget,
  or must be carefully condensed/optimized below a target size WITHOUT losing
  project-specific behavior, coding standards, security, or config rules.
  Bundles a size-budget checker (check_size.mjs) and a cautious
  archive-then-condense workflow with a mandatory confirm-before-write gate.
---

# CLAUDE.md Maintenance

CLAUDE.md is loaded into every session's context, so its size is a real cost and
stale/contradictory rules actively mislead. This skill prevents silent bloat (it
once reached ~48k chars) and performs **careful, reversible** optimization.

## When to use
- "Is CLAUDE.md too big?" / "check CLAUDE.md size" / a pre-commit size gate.
- "Trim / optimize / shrink / clean up CLAUDE.md (below N characters)."
- Any long-lived instruction doc that mixes active rules with historical logs.

## The checker (do this first — it's fast and non-destructive)

```bash
# Note: this repo tracks the file lowercase as claude.md (matters on Linux/CI).
node .claude/skills/claude-md-maintenance/check_size.mjs claude.md
```

- Default budget **40,000 chars**, warn at 90%. Override: `--budget=30000 --warn-ratio=0.8`.
- `--json` for machine output; `--strict` makes a `warn` also exit non-zero.
- Exit codes: `0` ok/warn, `1` over budget (or warn w/ --strict), `2` unreadable.
- On warn/fail it prints the **largest sections** so you know where to cut.

Counting note: it counts Unicode **code points** (Hebrew = 1 char each), which
matches a "below N characters" goal — not raw UTF-8 byte size.

## Optimization workflow (only when over budget or explicitly asked)

Prioritize CAUTION. Never delete a rule that governs project-specific behavior,
coding standards, or system configuration without confirming with the user first.

1. **Content review** — Read the whole file. Classify every section as:
   - *Active* (must keep): coding style, preferred tech, architecture, security,
     behavioral rules, environment/path quirks, build/deploy model, casing rules.
   - *Outdated / historical / redundant*: solved-issue logs, finished phases,
     verbose changelog detail already in git history, duplicated statements.
2. **Archiving strategy** — For valuable-but-not-active content (past decisions,
   solved-issue logs, full changelog prose), DO NOT silently delete. Extract it
   into a separate code block (or `docs/CLAUDE_ARCHIVE.md`) so the user can save
   it to a local archive before it leaves CLAUDE.md.
3. **Optimize & summarize** — Condense surviving active rules into concise,
   high-impact bullets under clear functional headings. Lose no critical setup,
   security, or behavioral rule. Prefer tables and one-line rules.
4. **Execution gate (mandatory)** — Before writing, present a brief summary of
   exactly what you will DELETE and what you will CONSOLIDATE. **Wait for the
   user's confirmation.** Only after they confirm, update the file directly
   (perform the actual Write — do not stop at a theoretical proposal).
5. **Verify** — Re-run the checker to confirm the new size is within budget, and
   re-read the result to confirm no active rule was dropped.

## Hard rules
- Caution over brevity: when unsure whether a rule is still active, KEEP it and ask.
- Archive before removing anything with future value.
- Confirm the delete/consolidate plan with the user before writing — then actually write.
- This repo's path quirk (U+200F in the project path) breaks the built-in
  Write/Edit tools; edit CLAUDE.md via the Python patch tooling or a Bash
  heredoc with a git-resolved path (see CLAUDE.md §11–§12).

## Tests
- Unit: `npm run test:unit` → `tests/unit/claude-md-size.test.js`
- E2E (CLI end-to-end): `npx playwright test tests/e2e/claude-md-size.e2e.spec.js`
