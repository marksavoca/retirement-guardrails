// lib/storage/factory.ts
import type { Storage as AppStorage } from './types'

// Decide storage mode. Default = 'local'.
// Switch to hosted ONLY if mode is explicitly 'remote' (or legacy 'hosted').
function readMode(): 'hosted' | 'local' {
  // 1) URL query overrides everything
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('mode')
    if (q === 'remote' || q === 'hosted') return 'hosted'
    if (q === 'local') return 'local'
  }

  // 2) Persisted user choice
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('storageMode')
    if (saved === 'remote' || saved === 'hosted') return 'hosted'
    if (saved === 'local') return 'local'
  }

  // 3) Env (works in SSR and browser)
  const env = (process.env.NEXT_PUBLIC_STORAGE_MODE || '').toLowerCase()
  if (env === 'remote' || env === 'hosted') return 'hosted'
  if (env === 'local') return 'local'

  // 4) Default
  return 'local'
}

let instance: AppStorage | undefined

export async function getStorage(): Promise<AppStorage> {
  if (instance) return instance

  const mode = readMode()
  let created: AppStorage

  if (mode === 'hosted') {
    const { HostedStorage } = await import('./hosted')
    created = new HostedStorage()
  } else {
    const { LocalIndexedDbStorage } = await import('./local-indexeddb')
    created = await LocalIndexedDbStorage.create()
  }

  instance = created
  return created
}
