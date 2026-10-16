# Splitting CLAUDE.md

CLAUDE.md is growing too big, and I don't understand what exactly it's supposed to be.

## What it is (Claude's answer)

It's Claude's standing briefing for the project, not documentation for humans. Claude Code loads it automatically at the start of every session and treats it as instructions that override its defaults. So:

- every line costs context in every session, even when the task has nothing to do with it;
- lines that only describe the code go stale and contradict it.

Test for each line: *would Claude get this wrong without it?* If not, it doesn't belong.

## Ways to load context only when relevant

| Mechanism | When it loads | Fits |
|---|---|---|
| `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md` | When Claude reads or edits files in that folder | Per-app conventions |
| `.claude/rules/*.md` with `paths:` frontmatter | When Claude touches files matching those paths | Narrow topics |
| `.claude/skills/<name>/SKILL.md` | When the task matches, or on `/<name>` | Step-by-step procedures |

Caveat: a subfolder file only loads once Claude works in that folder, so anything needed *before* choosing where to work (multi-tenancy, vocabulary, the API error contract shared by both apps) stays at the root.

-> decided:
- root `CLAUDE.md`: cross-cutting rules only (stack, commands, conventions, error contract, i18n principle, vocabulary, accounts, multi-tenancy, stateless server, briefs);
- `apps/api/CLAUDE.md` and `apps/web/CLAUDE.md` for each app's conventions;
- the GitHub Projects procedure becomes the `task-workflow` skill;
- details the code already documents are dropped, only the rules are kept.

Done in #31 (PR #33): 95 lines down to 57 at the root.
