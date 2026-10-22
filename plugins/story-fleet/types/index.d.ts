export type FleetAgent = { name: string; role: string; status: string; title: string }
export type FleetStory = { key: string; workspace: string; agents: FleetAgent[] }
export type Fleet = { name: string | null; herdr: boolean; stories: FleetStory[]; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'story-fleet': { fleet: Fleet; autoOpened: boolean }
  }
}
