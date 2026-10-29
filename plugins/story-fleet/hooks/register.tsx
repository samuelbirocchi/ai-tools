import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Fleet, FleetAgent } from '../types'

const PANE = 'story-fleet'
const TITLE = 'Stories'
const POLL_MS = 5000
const EMPTY: Fleet = { name: null, hc: true, stories: [] }
const fleet = atom({ plugin: 'story-fleet', key: 'fleet' } as const, EMPTY)
const autoOpened = atom({ plugin: 'story-fleet', key: 'autoOpened' } as const, false)

const STATUS: Record<string, { mark: string; color?: string }> = {
  working: { mark: '●', color: 'blue' },
  blocked: { mark: '▲', color: 'red' },
  idle: { mark: '○' },
  done: { mark: '✓', color: 'green' },
  error: { mark: '✗', color: 'red' },
  gone: { mark: '·' },
}

const statusOf = (agent: FleetAgent) => STATUS[agent.status] ?? { mark: '?' }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'stories',
      description: 'Show the story agents this session started, in a pane',
    })
    if (!(await $.env.get('HC_TERMINAL_ID'))) return next(e)

    const sessionId = await $.session.id()
    const script = `${$.plugin.root}/scripts/herdr-plan-fleet.py`

    let isRefreshing = false
    const refresh = async () => {
      if (isRefreshing) return
      isRefreshing = true
      try {
        await refreshOnce()
      } finally {
        isRefreshing = false
      }
    }

    const refreshOnce = async () => {
      let latest: Fleet
      try {
        const { exitCode, stdout, stderr } = await $.process.run(['python3', script, sessionId], { timeoutMs: 15000 })
        latest = exitCode === 0 ? JSON.parse(stdout) : { ...EMPTY, error: stderr.trim().slice(0, 200) }
      } catch (error) {
        latest = { ...EMPTY, error: String(error).slice(0, 200) }
      }
      await update($, fleet, () => latest)
      if (latest.stories.length > 0 && !(await read($, autoOpened))) {
        await update($, autoOpened, () => true)
        const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
        if (!isUp) void $.ui.open({ id: PANE, title: TITLE })
      }
    }

    void refresh()
    $.clock.every(POLL_MS, () => void refresh())

    return next(e)
  })

  on('command.run', { command: 'stories' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return { text: opened.isPlaced ? 'Stories pane opened.' : `Stories pane waits: ${opened.reason}` }
  })

  on('ui.press', { requestId: PANE }, async ($, e, next) => {
    const showError = (detail: string) =>
      update($, fleet, current => ({ ...current, error: `focus ${e.element}: ${detail.slice(0, 160)}` }))
    try {
      const { exitCode, stderr } = await $.process.run(['herdr-app', 'do', 'agent.focus', '--terminal', e.element])
      if (exitCode !== 0) await showError(stderr.trim())
    } catch (error) {
      await showError(String(error))
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await read($, fleet)

    return (
      <Box flexDirection="column">
        <Text dimColor>{current.name ? `plan session: ${current.name}` : 'not a named plan session'}</Text>
        {current.error && <Text color="red">{current.error}</Text>}
        {!current.hc && <Text color="red">hc ls failed</Text>}
        {current.stories.length === 0 && <Text dimColor>No stories started from this session.</Text>}
        {current.stories.map(story => (
          <Box key={story.space} flexDirection="column" marginTop={1}>
            <Text bold>{story.key}</Text>
            {story.agents.length === 0 && <Text dimColor>  space gone</Text>}
            {story.agents.map(agent => {
              const status = statusOf(agent)
              return (
                <Box key={agent.terminal} flexDirection="column">
                  <Button key={agent.terminal} plain onPress={() => {}}>
                    <Text color={status.color}>{status.mark}</Text> {agent.name}{' '}
                    <Text dimColor>{agent.role === 'dev' ? agent.title : agent.role}</Text>
                  </Button>
                  {agent.waiting && <Text color="yellow">  waiting on: {agent.waiting}</Text>}
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    )
  })
}
