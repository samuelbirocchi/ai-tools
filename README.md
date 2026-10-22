# AI Tools

Skills, commands, agents and mods I use every day with coding agents. Small, composable, easy to fork.

## Install

### Claude Code

```
/plugin marketplace add samuelbirocchi/ai-tools
/plugin install pr-tracker@samuelbirocchi
```

### Other agents (Codex, opencode, …)

Skills under `skills/` are plain `SKILL.md` folders:

```bash
npx skills@latest add samuelbirocchi/ai-tools
```

### From disk, for hacking

```bash
git clone https://github.com/samuelbirocchi/ai-tools
claude --plugin-dir ai-tools/plugins/pr-tracker
```

Or load it in every session via `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/path/to/ai-tools/plugins/pr-tracker" } }
```

## Layout

```
.claude-plugin/marketplace.json   Claude Code marketplace listing every plugin
plugins/<name>/                   one installable plugin each (mods, hooks, bundled commands/agents)
skills/<category>/<name>/         agent-agnostic skills (SKILL.md)
commands/                         slash commands
agents/                           subagent definitions
```

## Plugins

| Plugin | What it does |
| --- | --- |
| [`pr-tracker`](plugins/pr-tracker) | Band above the prompt listing every GitHub PR referenced in the session (URLs, `owner/repo#N`, GitHub MCP calls), with state, CI checks and review status via `gh`. `/prs` toggles it, `/prs list` lists all, `/prs refresh` re-fetches. Needs `gh` authenticated and `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. |
| [`story-fleet`](plugins/story-fleet) | Pane beside a [Herdr](https://herdr.dev) plan session listing the story agents it started (dev, babysit and deploy helpers) with live status and current task. Pressing a row focuses that agent; `/stories` opens it. Needs Herdr, Python 3 and `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. |

## Develop

```bash
claude plugin validate plugins/pr-tracker
claude plugin test plugins/pr-tracker
claude plugin validate plugins/story-fleet
claude plugin test plugins/story-fleet
```

## License

MIT
