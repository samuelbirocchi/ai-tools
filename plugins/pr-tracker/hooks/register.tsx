import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Checks, Pr, PrState } from '../types'

const prs = atom({ plugin: 'pr-tracker', key: 'prs' } as const, [])
const isHidden = atom({ plugin: 'pr-tracker', key: 'isHidden' } as const, false)

const URL_RE = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/g
const SHORT_RE = /(?<![\w./-])([A-Za-z0-9][\w.-]*)\/([\w.-]+)#(\d+)\b/g
const MAX_ROWS = 5
const POLL_MS = 90_000
const FAIL = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])

const prUrl = (owner?: string, repo?: string, n?: string | number) =>
  `https://github.com/${owner}/${repo}/pull/${n}`

function collect(text: string, seen: Map<string, number>, order: number) {
  for (const re of [URL_RE, SHORT_RE]) {
    for (const [, owner, repo, n] of text.matchAll(re)) seen.set(prUrl(owner, repo, n), order)
  }
}

async function scan($: Engine): Promise<Map<string, number>> {
  const seen = new Map<string, number>()
  const messages = await $.session.messages()
  messages.forEach((msg, i) => {
    collect(msg.text, seen, i)
    for (const use of msg.toolUses) {
      const { owner, repo, pullNumber, pull_number } = use.input as Record<string, unknown>
      const n = pullNumber ?? pull_number
      if (typeof owner === 'string' && typeof repo === 'string' && n !== undefined) {
        seen.set(prUrl(owner, repo, String(n)), i)
      }
      collect(JSON.stringify(use.input), seen, i)
      if (use.text) collect(use.text, seen, i)
    }
  })
  return seen
}

function checksOf(rollup: Array<Record<string, string | null>>): Checks {
  if (!rollup?.length) return 'none'
  let isPending = false
  for (const c of rollup) {
    if (FAIL.has(c.conclusion ?? '') || FAIL.has(c.state ?? '')) return 'fail'
    if (c.status && c.status !== 'COMPLETED') isPending = true
    if (c.state === 'PENDING' || c.state === 'EXPECTED') isPending = true
  }
  return isPending ? 'pending' : 'pass'
}

const invalid = new Set<string>()

async function fetchPr($: Engine, pr: Pr): Promise<Pr | null> {
  const ran = await $.process
    .run(['gh', 'pr', 'view', pr.url, '--json', 'title,state,isDraft,reviewDecision,statusCheckRollup'], {
      timeoutMs: 20_000,
    })
    .catch(() => null)
  if (!ran) return pr
  if (ran.exitCode !== 0) {
    if (/Could not resolve|not found/i.test(ran.stderr)) invalid.add(pr.url)
    return /Could not resolve|not found/i.test(ran.stderr) ? null : pr
  }
  const j = JSON.parse(ran.stdout)
  const state: PrState = j.state === 'OPEN' && j.isDraft ? 'DRAFT' : j.state
  return { ...pr, title: j.title, state, checks: checksOf(j.statusCheckRollup), review: j.reviewDecision ?? '' }
}

let isRefreshing = false

async function refresh($: Engine, onlyLive: boolean) {
  if (isRefreshing) return
  isRefreshing = true
  try {
    const list = await read($, prs)
    const targets = list.filter(p => !onlyLive || p.state === 'OPEN' || p.state === 'DRAFT' || p.state === 'UNKNOWN')
    const fresh = await Promise.all(targets.map(p => fetchPr($, p)))
    const byUrl = new Map(targets.map((p, i) => [p.url, fresh[i]]))
    await update($, prs, cur =>
      cur.flatMap(p => {
        if (!byUrl.has(p.url)) return [p]
        const f = byUrl.get(p.url)
        return f ? [f] : []
      }),
    )
  } finally {
    isRefreshing = false
  }
}

async function sync($: Engine) {
  const seen = await scan($)
  const current = await read($, prs)
  const known = new Map(current.map(p => [p.url, p]))
  const next: Pr[] = [...seen.entries()]
    .filter(([url]) => !invalid.has(url))
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => {
      const old = known.get(url)
      if (old) return old
      const [, , , owner, repo, , n] = url.split('/')
      return { url, repo: `${owner}/${repo}`, number: Number(n), title: '', state: 'UNKNOWN', checks: 'none', review: '' }
    })
  await update($, prs, () => next)
  if (next.some(p => p.state === 'UNKNOWN')) $.clock.after(0, () => void refresh($, true))
}

const STATE_GLYPH: Record<PrState, [string, string]> = {
  OPEN: ['●', 'green'],
  DRAFT: ['○', 'gray'],
  MERGED: ['✔', 'magenta'],
  CLOSED: ['✕', 'red'],
  UNKNOWN: ['·', 'gray'],
}
const CHECK_GLYPH: Record<Checks, [string, string]> = {
  pass: ['✓', 'green'],
  fail: ['✗', 'red'],
  pending: ['⋯', 'yellow'],
  none: [' ', 'gray'],
}
const REVIEW: Record<string, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes',
  REVIEW_REQUIRED: 'review',
}

async function openUrl($: Engine, url: string) {
  const opened = await $.process.run(['open', url]).catch(() => null)
  if (opened?.exitCode === 0) return
  const fallback = await $.process.run(['xdg-open', url]).catch(() => null)
  if (fallback?.exitCode !== 0) $.ui.toast(`Could not open ${url}`)
}

const rank = (p: Pr) => (p.state === 'MERGED' || p.state === 'CLOSED' ? 1 : 0)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'prs', description: 'Toggle the PR tracker band (/prs refresh to re-fetch)' })
    $.clock.every(POLL_MS, () => void refresh($, true))
    await sync($)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) await sync($)
    return done
  })

  on('command.run', { command: 'prs' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'refresh') {
      await sync($)
      await refresh($, false)
    } else if (arg !== 'list') {
      const hidden = await update($, isHidden, h => !h)
      return { text: hidden ? 'PR band hidden.' : 'PR band shown.' }
    }
    const list = await read($, prs)
    if (list.length === 0) return { text: 'No PRs referenced in this session yet.' }
    return {
      text: list
        .map(p => `${p.state.toLowerCase()} ${p.checks} ${p.url} ${p.title}`)
        .join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, prs)
    if (e.props.hasSurvey || list.length === 0 || (await read($, isHidden))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const width = e.props.bodyColumns ?? e.viewport?.columns ?? 100
    const sorted = [...list].sort((a, b) => rank(a) - rank(b))
    const shown = sorted.slice(0, MAX_ROWS)
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {shown.map((p, i) => {
          const [sg, sc] = STATE_GLYPH[p.state]
          const [cg, cc] = CHECK_GLYPH[p.checks]
          const isDone = rank(p) === 1
          const label = `${p.repo.split('/')[1]}#${p.number}`
          return (
            <Box key={p.url} flexDirection="row" width={width}>
              <Text color={sc}>{sg} </Text>
              <Text color={cc}>{cg} </Text>
              <Button
                key={`open:${p.url}`}
                label={label}
                plain
                hotkey={String(i + 1)}
                hover={{ underline: true }}
                onPress={() => void openUrl($, p.url)}
              />
              <Text dimColor={isDone} wrap="truncate-end">
                {' '}
                {p.title || '…'}
                {REVIEW[p.review] && !isDone ? ` [${REVIEW[p.review]}]` : ''}
              </Text>
            </Box>
          )
        })}
        {sorted.length > MAX_ROWS && <Text dimColor>+{sorted.length - MAX_ROWS} more · /prs</Text>}
        {below}
      </Box>
    )
  })
}
