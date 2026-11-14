# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`
- **Sub-issue** (a ticket under an epic): `gh api -X POST repos/{owner}/{repo}/issues/<epic>/sub_issues -F sub_issue_id=<id>`; `<id>` is the database id from `gh api repos/{owner}/{repo}/issues/<number> --jq .id`, not the number.
- **Blocking edge** (native): `gh api -X POST repos/{owner}/{repo}/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker id>`; read with `gh api repos/{owner}/{repo}/issues/<number>/dependencies/blocked_by`.

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## Branch / PR policy

**PR-per-ticket.** One branch, one PR per ticket. Never commit a ticket directly to `main`.
Branch name, commit format, merge: [CONTRIBUTING.md](../../CONTRIBUTING.md).

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
