import { expect, test } from 'claude-code/testing'

const FLEET = {
  name: 'Ads Plan',
  herdr: true,
  stories: [
    {
      key: 'TECH-1',
      workspace: 'w1',
      agents: [
        { name: 'tech-1', role: 'dev', status: 'working', title: 'TECH-1 build' },
        { name: 'deploy-5-api', role: 'deploy', status: 'blocked', title: '' },
        { name: 'babysit-5-api', role: 'babysit', status: 'idle', title: '', waiting: 'human review on api#5' },
      ],
    },
  ],
}

const PANE = {
  plugin: 'story-fleet',
  component: 'Pane',
  requestId: 'story-fleet',
  props: {
    title: 'Stories',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the pane lists the plan session stories and focuses an agent on press', async ($, on) => {
  const runs: string[][] = []
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'stories' } }))
  on('env.get', (_, e) => ({ value: e.name === 'HERDR_ENV' ? '1' : undefined }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('clock.every', () => ({ deny: 'no polling in this test' }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: JSON.stringify(FLEET), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const presses: string[] = []
  on('ui.press', (_, e) => {
    presses.push(`${e.requestId}/${e.element}`)
    return { element: e.element }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  let story
  let ui
  for (let attempt = 0; attempt < 20 && !story; attempt++) {
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    story = await ui.find({ type: 'Text', text: /TECH-1$/ })
    if (!story) await ui.unmount()
  }
  expect(story?.text).toBe('TECH-1')
  expect(runs[0]?.[0]).toBe('python3')
  expect(runs[0]?.[1]).toMatch(/\/story-fleet\/scripts\/herdr-plan-fleet\.py$/)
  expect(runs[0]?.[2]).toBe('sid-1')
  expect(opened).toEqual(['story-fleet'])
  expect(await ui!.find({ type: 'Text', text: /TECH-1 build/ })).toBeDefined()
  expect((await ui!.find({ type: 'Text', text: /▲/ }))?.text).toBe('▲')
  expect((await ui!.find({ type: 'Text', text: /waiting on/ }))?.text).toBe('  waiting on: human review on api#5')
  expect(await ui!.findAll({ type: 'Text', text: /waiting on/ })).toHaveLength(1)

  await ui!.press({ key: 'deploy-5-api' })
  expect({ presses, runs: runs.slice(1) }).toEqual({
    presses: ['story-fleet/deploy-5-api'],
    runs: [['herdr', 'agent', 'focus', 'deploy-5-api']],
  })
  await ui!.unmount()
})

test('a focus that cannot launch shows its error in the pane', async ($, on) => {
  on('command.register', () => ({ value: { command: 'stories' } }))
  on('env.get', (_, e) => ({ value: e.name === 'HERDR_ENV' ? '1' : undefined }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('clock.every', () => ({ deny: 'no polling in this test' }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) =>
    e.argv[0] === 'herdr'
      ? { deny: 'herdr not found' }
      : { value: { exitCode: 0, stdout: JSON.stringify(FLEET), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } },
  )
  on('ui.press', (_, e) => ({ element: e.element }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (let attempt = 0; attempt < 20 && !(await ui.find({ type: 'Text', text: /TECH-1$/ })); attempt++) {
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  }
  await ui.press({ key: 'tech-1' })
  expect((await ui.find({ type: 'Text', text: /^focus tech-1:/ }))?.text).toMatch(/herdr not found/)
  await ui.unmount()
})

test('outside Herdr nothing polls and nothing opens', async ($, on) => {
  const runs: string[][] = []
  on('command.register', () => ({ value: { command: 'stories' } }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '{}', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(runs).toEqual([])
})
