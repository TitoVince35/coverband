# API architecture

> 🕒 Brief posted on Monday 2026/10/19 11:05

## Code audit

I'm not quite satisfied with the actual code structure of the API.
I would like an audit and a refactor proposal to match certain quality criteria:

- modularity
- clean architecture

Claude's audit and proposal: [013_api-architecture](../claude/013_api-architecture.md).

## Git rules for the refactor

Since we're about to refactor, I need to settle this: "File moves and renames: use git mv, in move-only commits separate from content changes."

Settled with Claude's corrections, in the `task-workflow` skill:

- `git mv` itself changes nothing (it is `mv` + `git add`): git detects renames by content similarity, so what keeps a file's history is a commit where it barely changes.
- A move commit holds the moves plus the import path updates they need, nothing else, so `bun run check` still passes on it. Content changes go in the next commits.
- A PR with a move commit is merged with a merge commit, never squashed, or the move gets folded into the content changes on `main`.
