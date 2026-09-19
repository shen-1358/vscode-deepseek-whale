export const CHANNEL = 'dshw'
export const ROUTE_PREFIX = '/dsh-whale/'
export const MEDIA_MAP_ELEMENT_ID = 'dshw-media'
export const MEDIA_EVENT_NAME = 'media'

export interface PathQuery {
  path: string
  query: string
}

export function splitPathQuery(url: string): PathQuery {
  const at = url.indexOf('?')
  if (at === -1) return { path: url, query: '' }
  return { path: url.slice(0, at), query: url.slice(at + 1) }
}

export function isWhalePath(url: string): boolean {
  return url.startsWith(ROUTE_PREFIX)
}

export function normalizeMediaKey(url: string): string {
  const { path, query } = splitPathQuery(url)
  if (query === '') return path
  const params = new URLSearchParams(query)
  const seen = new Set<string>()
  const pairs: string[] = []
  for (const key of [...params.keys()].sort()) {
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(params.get(key) ?? '')}`)
  }
  return pairs.length === 0 ? path : `${path}?${pairs.join('&')}`
}

export function parseMediaMap(json: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!json) return out
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return out
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 0) {
      out.set(normalizeMediaKey(key), value)
    }
  }
  return out
}
