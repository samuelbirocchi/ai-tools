import { expect, mock, test } from 'claude-code/testing'

const MESSAGES = [
  { role: 'user', text: 'look at https://github.com/acme/api/pull/12 and acme/web#7', toolUses: [] },
  {
    role: 'assistant',
    text: '',
    toolUses: [
      {
        tool_use_id: 't1',
        tool: 'mcp__claude_ai_Github__pull_request_read',
        input: { owner: 'acme', repo: 'infra', pullNumber: 3 },
        text: '{}',
      },
      { tool_use_id: 't2', tool: 'Bash', input: { command: 'ls' }, text: 'see foo/bar#99' },
    ],
  },
]

const GH: Record<string, object | null> = {
  'https://github.com/acme/api/pull/12': {
    title: 'Fix login',
    state: 'OPEN',
    isDraft: false,
    reviewDecision: 'APPROVED',
    statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
  },
  'https://github.com/acme/web/pull/7': {
    title: 'Old thing',
    state: 'MERGED',
    isDraft: false,
    reviewDecision: '',
    statusCheckRollup: [],
  },
  'https://github.com/acme/infra/pull/3': {
    title: 'Bump node',
    state: 'OPEN',
    isDraft: true,
    reviewDecision: '',
    statusCheckRollup: [{ status: 'IN_PROGRESS', conclusion: '' }],
  },
  'https://github.com/foo/bar/pull/99': null,
}

test('lists referenced PRs with gh state, drops ones gh cannot resolve', async ($, on) => {
  on('session.messages', () => ({ value: MESSAGES }) as never)
  const opened: string[][] = []
  on('process.run', (_$, e) => {
    if (e.argv[0] === 'open') {
      opened.push([...e.argv])
      return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
    }
    const url = e.argv[3] ?? ''
    const pr = GH[url]
    return {
      value: pr
        ? { exitCode: 0, stdout: JSON.stringify(pr), stderr: '' }
        : { exitCode: 1, stdout: '', stderr: 'GraphQL: Could not resolve to a PullRequest' },
    } as never
  })
  on('command.run', () => ({ text: 'unhandled' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other mod band</Text>
  })
  mock.clock(on)

  const out = await $.command.run({ command: 'prs', args: 'refresh' } as never)
  const text = (out as { text: string }).text
  expect(text).toContain('open fail https://github.com/acme/api/pull/12 Fix login')
  expect(text).toContain('draft pending https://github.com/acme/infra/pull/3 Bump node')
  expect(text).toContain('merged none https://github.com/acme/web/pull/7')
  expect(text).not.toContain('foo/bar')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'pr-tracker',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 },
    } as never)
    expect(await ui.find({ type: 'Button', text: 'api#12' })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: 'infra#3' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Fix login \[approved\]/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'other mod band' })).toBeDefined()
    await ui.press({ key: 'open:https://github.com/acme/api/pull/12' })
    await ui.unmount()
  }
  expect(opened).toEqual([
    ['open', 'https://github.com/acme/api/pull/12'],
    ['open', 'https://github.com/acme/api/pull/12'],
  ])

  await $.command.run({ command: 'prs', args: '' } as never)
  const hidden = await $.ui.mount({
    plugin: 'pr-tracker',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 },
  } as never)
  expect(await hidden.find({ type: 'Button' })).toBeUndefined()
})
