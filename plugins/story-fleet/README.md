# story-fleet

A Claude Code mod for [Herdr](https://herdr.dev) multi-agent work. It draws a **Stories** pane beside a plan session. The pane lists every story agent that the session started, and their live status.

```
Stories
plan session: Ads Plan

TECH-12
● tech-12  TECH-12 implementation
○ babysit-66-api  babysit
  waiting on: human review on api#66, next wake: pr-wait-event exit
✓ deploy-66-api  deploy
```

- One block per story, with its dev agent first, then its babysit and deploy helpers.
- Status marks: `●` working, `▲` blocked, `○` idle, `✓` done.
- A dev row shows the agent's terminal title, which Claude Code sets to its current task.
- An idle or done agent also shows the last `Waiting on:` line of its transcript (for example `human review on api#5`), so an agent that waits on a person or a deploy doesn't look finished.
- Pressing a row runs `herdr agent focus <name>` and jumps to that agent's pane.
- The pane opens by itself, once per session, when the first story appears. `/stories` opens it by hand.
- It refreshes every 5 s, and only in sessions running inside Herdr (`HERDR_ENV=1`).

## Where the stories come from

The mod reads one JSON file per story pane from `~/.claude/state/herdr-story/<pane id, ":" replaced by "_">.json`:

```json
{ "pane": "w6P:p1", "workspace": "w6P", "agent": "tech-12", "key": "TECH-12", "report_to": "Ads Plan" }
```

`report_to` is the plan session's name, as Claude Code's `ListAgents` shows it. The mod shows a story when `report_to` matches the name of the session it runs in. It then lists every Herdr agent in that story's workspace. Whatever starts your story agents must write these files: in my setup, a `ht <repo> <KEY> <plan-url> --report-to '<session>'` launcher writes them.

The data comes from `scripts/herdr-plan-fleet.py <session id>` (or `--name <session name>`), which prints JSON. You can run it by hand to debug.

## Requirements

- Herdr 0.9.5 or newer, with its CLI on `PATH`.
- Python 3.
- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.

## Install

```
/plugin marketplace add samuelbirocchi/ai-tools
/plugin install story-fleet@samuelbirocchi
```

## Develop

```bash
claude plugin validate plugins/story-fleet
claude plugin test plugins/story-fleet
python3 plugins/story-fleet/scripts/test_herdr_plan_fleet.py
```
