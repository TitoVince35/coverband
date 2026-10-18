---
name: task-workflow
description: CoverBand's GitHub Projects workflow. Use when starting, committing, pushing or opening a PR for a task (issue #NN), or when moving an issue on the board or setting its sprint.
---

# Task workflow (GitHub Projects)

Board: https://github.com/users/TitoVince35/projects/1. Columns: Backlog → Todo → In progress → In review → Done. Sprints are 2-week iterations (`Sprint` field). New issues created in the repo are added to the Backlog automatically.

For each task (issue `#NN`):
1. Move it to **In progress** and create a branch `NN-short-title` from `main`.
2. Commit with `bun run check` passing.
   CI (`.github/workflows/ci.yml`) runs a dependency audit (`bun audit`, fails on high and critical), lint, typecheck, migrations, tests (with a Postgres service, so DB tests run) and the web build on every PR and on `main`. Keep it green: a PR is ready for review only when CI passes.
3. Push and open a PR whose body contains `Closes #NN`. The board automation moves it to **In review**.
4. Vince reviews and merges. Automation moves the task to **Done** and closes the issue.
5. If the issue is listed in the `## Issues` section of a brief (`briefs/vince/`) and all issues there are now closed, add the `Issues completed on ...` timestamp line to that brief (see the Briefs rules in the root `CLAUDE.md`). Check this after a merge you learn about, and when starting the next task.

## Epics

A brief's issues are grouped under an Epic issue (its sub-issues).
1. Once every sub-issue is merged (closed), move the Epic to **In review**. Don't close it: Vince moves it to **Done**.
2. Once the Epic is **Done**, delete the feature branches that have been merged, local and remote (check each one's work is on `main`; a branch checked out in another worktree needs Vince's go-ahead, since removing the worktree deletes its folder).

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
