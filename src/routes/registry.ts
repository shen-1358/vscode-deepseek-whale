export const CHANNEL = 'dshw'

export interface RouteRequest {
  method: string
  path: string
  query: string
  body?: string
  contentType?: string
}

export interface RouteResponse {
  status: number
  contentType: string
  body: string
}

export type RouteHandler = (req: RouteRequest) => Promise<RouteResponse> | RouteResponse

export interface Envelope {
  ch: string
  id?: number
  kind: 'request' | 'response' | 'event'
  method?: string
  path?: string
  query?: string
  status?: number
  contentType?: string
  body?: string
  name?: string
  payload?: unknown
}

export function jsonResponse(value: unknown, status = 200): RouteResponse {
  return { status, contentType: 'application/json', body: JSON.stringify(value) }
}

export function decodeRequest(raw: unknown): RouteRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const env = raw as Envelope
  if (env.ch !== CHANNEL || env.kind !== 'request') return null
  if (typeof env.path !== 'string' || env.path.length === 0) return null
  return {
    method: (typeof env.method === 'string' ? env.method : 'GET').toUpperCase(),
    path: env.path,
    query: typeof env.query === 'string' ? env.query : '',
    body: typeof env.body === 'string' ? env.body : undefined,
    contentType: typeof env.contentType === 'string' ? env.contentType : undefined,
  }
}

export function encodeResponse(id: number, res: RouteResponse): Envelope {
  return { ch: CHANNEL, id, kind: 'response', ...res }
}

export function encodeEvent(name: string, payload: unknown): Envelope {
  return { ch: CHANNEL, kind: 'event', name, payload }
}

export function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(query)) out[k] = v
  return out
}

export class RouteTable {
  private readonly routes = new Map<string, RouteHandler>()

  register(path: string, handler: RouteHandler): void {
    this.routes.set(path, handler)
  }

  has(path: string): boolean {
    return this.routes.has(path)
  }

  paths(): string[] {
    return [...this.routes.keys()].sort()
  }

  async dispatch(req: RouteRequest): Promise<RouteResponse> {
    const handler = this.routes.get(req.path)
    if (!handler) {
      return jsonResponse({ ok: false, error: `route not registered: ${req.path}` }, 404)
    }
    try {
      return await handler(req)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return jsonResponse({ ok: false, error: message }, 500)
    }
  }
}
