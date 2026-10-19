---
name: task-workflow
description: CoverBand's GitHub Projects workflow. Use when starting, committing, pushing or opening a PR for a task (issue #NN), or when moving an issue on the board or setting its sprint.
---

# Task workflow (GitHub Projects)

Board: https://github.com/users/TitoVince35/projects/1. Columns: Backlog → Todo → In progress → In review → Done. Sprints are 2-week iterations (`Sprint` field). New issues created in the repo are added to the Backlog automatically.

## Branches

- **`dev`** is the default branch: feature PRs target it, and quick changes (no issue) are committed straight to it.
- **`main`** is production: every push to it is deployed to Scaleway (`.github/workflows/deploy.yml`). A ruleset protects it: changes only through a PR whose CI jobs pass (the three of `ci.yml`, by job name: renaming a job means updating the ruleset), merged with a merge commit (no squash, so `main` and `dev` keep the same history), no force push, no deletion, nobody bypasses it.
- **Release:** a PR from `dev` to `main` (title `Release YYYY/MM/DD`, the body lists the merged PRs), opened when Vince asks. Merging it deploys.
- **Urgent fix on production:** a branch from `main`, a PR to `main`, then merge `main` back into `dev`.

For each task (issue `#NN`):
1. Move it to **In progress** and create a branch `NN-short-title` from `dev`.
2. Commit with `bun run check` passing.
   CI (`.github/workflows/ci.yml`) runs a dependency audit (`bun audit`, fails on high and critical), lint, typecheck, migrations, tests (with a Postgres service, so DB tests run) and the web build on every PR and on pushes to `dev` and `main`. Keep it green: a PR is ready for review only when CI passes.
   Moving or renaming files gets its own commit: the moves plus the import path updates they need, nothing else (`bun run check` passes). Content changes go in the next commits. Git detects renames by similarity, so a file that also changes a lot in the move commit loses its history (`git log --follow`, blame, the PR's rename view).
3. Push and open a PR to `dev` whose body contains `Closes #NN` (it closes the issue because `dev` is the default branch). The board automation moves it to **In review**. A PR with a move commit says in its body to merge it with a merge commit, never squash: squashing would fold the move into the content changes on `dev`.
4. Vince reviews and merges. Automation moves the task to **Done** and closes the issue.
5. If the issue is listed in the `## Issues` section of a brief (`briefs/vince/`) and all issues there are now closed, add the `Issues completed on ...` timestamp line to that brief (see the Briefs rules in the root `CLAUDE.md`). Check this after a merge you learn about, and when starting the next task.

## Epics

A brief's issues are grouped under an Epic issue (its sub-issues).
1. Once every sub-issue is merged (closed), move the Epic to **In review**. Don't close it: Vince moves it to **Done**.
2. Once the Epic is **Done**, delete the feature branches that have been merged, local and remote (check each one's work is on `dev`; a branch checked out in another worktree needs Vince's go-ahead, since removing the worktree deletes its folder).

## Moving a task with `gh`

The only manual moves are to In progress, and an Epic to In review.

```sh
# find the item id of issue NN (the newest 100 items: older ones need first:100)
gh api graphql -f query='{ node(id:"PVT_kwHOADAgOs4BnNj-"){ ... on ProjectV2 { items(last:100){ nodes{ id content{ ... on Issue{ number } } } } } } }' \
  --jq '.data.node.items.nodes[] | select(.content.number==NN) | .id'
# set its status
gh project item-edit --project-id PVT_kwHOADAgOs4BnNj- --id <item-id> \
  --field-id PVTSSF_lAHOADAgOs4BnNj-zhlzNcM --single-select-option-id <option-id>
```

Status option ids: Backlog `68d1018a`, Todo `4690f79a`, In progress `0c86fcb5`, In review `cc8e2739`, Done `19ed2183`.
Sprint field `PVTIF_lAHOADAgOs4BnNj-zhlzNx8`: Sprint 1 `3c4d0bab`, Sprint 2 `36e02d73`, Sprint 3 `964b06f5`.

Newly added board items can take minutes to show up in the board API and views (GitHub indexing lag); `gh issue view NN --json projectItems` is reliable immediately.
