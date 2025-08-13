// lib/storage/factory.ts
import type { Storage as AppStorage } from './types'

function readMode(): 'hosted' | 'local' {

  const env = (process.env.NEXT_PUBLIC_STORAGE_MODE || '').toLowerCase()
  if (env === 'remote' || env === 'hosted') return 'hosted'

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
