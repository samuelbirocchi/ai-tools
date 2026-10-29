# story-fleet

A Claude Code mod for [Herdr](https://herdr.dev) multi-agent work, on herdr-core (`hc`) and the Herdr app (`herdr-app`). It draws a **Stories** pane beside a plan session. The pane lists every story agent that the session started, and their live status.

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
- Status marks: `●` working, `▲` blocked, `○` idle, `✓` done, `✗` error, `·` terminal gone. The status is the one the agent reported to `hc` (OSC 7501).
- A dev row shows the terminal title from `hc get`, which Claude Code sets to its current task.
- An idle or done agent also shows the last `Waiting on:` line of its transcript (for example `human review on api#5`), so an agent that waits on a person or a deploy doesn't look finished.
- Pressing a row runs `herdr-app do agent.focus --terminal <address>` and jumps to that agent.
- The pane opens by itself, once per session, when the first story appears. `/stories` opens it by hand.
- It refreshes every 5 s, and only in sessions running under `hc` (`HC_TERMINAL_ID` set).

## Where the stories come from

The mod reads one JSON file per story terminal from `~/.claude/state/herdr-story/<terminal address>.json`:

```json
{ "terminal": "t14", "space": "sp8920...", "agent": "tech-12", "key": "TECH-12", "report_to": "Ads Plan", "role": "dev" }
```

`report_to` is the plan session's name, as Claude Code's `ListAgents` shows it. The mod shows a story when `report_to` matches the name of the session it runs in. It then lists every state file with the same `space` (the dev session and its babysit and deploy helpers) and looks each terminal up with `hc ls --json` and `hc get`. A terminal that `hc` no longer lists shows as gone. Whatever starts your story agents must write these files: in my setup, a `ht <repo> <KEY> <plan-url> --report-to '<session>'` launcher writes them.

The data comes from `scripts/herdr-plan-fleet.py <session id>` (or `--name <session name>`), which prints JSON. You can run it by hand to debug.

## Requirements

- `hc` (herdr-core) and `herdr-app` on `PATH`.
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
