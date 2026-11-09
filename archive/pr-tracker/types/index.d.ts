export type PrState = 'OPEN' | 'DRAFT' | 'MERGED' | 'CLOSED' | 'UNKNOWN'
export type Checks = 'pass' | 'fail' | 'pending' | 'none'

export type Pr = {
  url: string
  repo: string
  number: number
  title: string
  state: PrState
  checks: Checks
  review: string
}

declare module 'claude-code' {
  interface PluginState {
    'pr-tracker': { prs: Pr[]; isHidden: boolean }
  }
}
