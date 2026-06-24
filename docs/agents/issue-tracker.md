# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on **kartikkabadi/foundry**. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue on `kartikkabadi/foundry`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Full acceptance criteria

Published issues #1–#8 with full AC live in `docs/planning/GITHUB_ISSUE_BREAKDOWN.md` (GitHub issue bodies may be truncated).

## Live queue (2026-06-24, post–V5 close-out)

Confirm on GitHub before starting. Full issue→code rows: [VERIFIED_STATE.md](../planning/VERIFIED_STATE.md).

| Track | Issues | Agent rule |
|-------|--------|------------|
| **Open for new work** | _None_ — V1–V5 (#1–#50) all implemented and closed | Pick new work via a fresh PRD |
| **Closed (do not re-implement)** | [#31](https://github.com/kartikkabadi/foundry/issues/31)–[#50](https://github.com/kartikkabadi/foundry/issues/50) | Code landed on `main` |
| **Duplicates** | #51–#90 | Closed — ignore |

Historical index: `docs/planning/V2-V5_GITHUB_ISSUES.md`. V1–V3 (#1–#30) are done on `main`.
