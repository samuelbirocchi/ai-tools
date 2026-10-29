export type FleetAgent = { name: string; terminal: string; role: string; status: string; title: string; waiting?: string }
export type FleetStory = { key: string; space: string; agents: FleetAgent[] }
export type Fleet = { name: string | null; hc: boolean; stories: FleetStory[]; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'story-fleet': { fleet: Fleet; autoOpened: boolean }
  }
}
