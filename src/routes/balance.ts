import { jsonResponse, parseQuery, type RouteRequest, type RouteResponse, type RouteTable } from './registry'
import type { RefreshResult } from '../core/refresh'
import type { Mood } from '../webview/mood'

export interface BalanceRouteDeps {
  refresh: { (force?: boolean): Promise<RefreshResult>; last(): RefreshResult | null }
  /** 表情由宿主计算（webview 读不到配置），每次调用现读阈值 */
  moodOf: (result: RefreshResult) => Mood
  readSize: () => Promise<Record<string, unknown>>
  writeSize: (value: Record<string, unknown>) => Promise<void>
}

const CODE_BY_STATE: Record<string, string> = {
  'no-key': 'NO_KEY',
  'auth-error': 'AUTH',
  'network-error': 'NETWORK',
}

export function registerBalanceRoutes(table: RouteTable, deps: BalanceRouteDeps): void {
  table.register('/dsh-whale/balance.json', async (req: RouteRequest): Promise<RouteResponse> => {
    if (req.method !== 'GET') {
      return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
    }
    const force = parseQuery(req.query).refresh === '1'
    const result = force || !deps.refresh.last() ? await deps.refresh(force) : deps.refresh.last()!
    if (result.state !== 'ok') {
      return jsonResponse({
        ok: false,
        code: CODE_BY_STATE[result.state] ?? 'UNKNOWN',
        error: result.message ?? '',
        mood: deps.moodOf(result),
      })
    }
    return jsonResponse({
      ok: true,
      totalBalance: result.balance,
      currency: result.currency,
      todayUsage: result.todayUsage ?? null,
      stale: result.stale === true,
      observedAt: result.observedAt,
      mood: deps.moodOf(result),
    })
  })

  table.register('/dsh-whale/size.json', async (req: RouteRequest): Promise<RouteResponse> => {
    if (req.method === 'GET') {
      return jsonResponse(await deps.readSize())
    }
    if (req.method === 'PUT') {
      let parsed: unknown
      try {
        parsed = JSON.parse(req.body ?? '')
      } catch {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400)
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return jsonResponse({ ok: false, error: 'expected a json object' }, 400)
      }
      await deps.writeSize(parsed as Record<string, unknown>)
      return jsonResponse({ ok: true })
    }
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
  })

  // 媒体不走路由：前端 img.src 由媒体 shim 改写成 asWebviewUri，这里只作兜底提示
  table.register('/dsh-whale/image.png', (req: RouteRequest): RouteResponse => {
    if (req.method !== 'GET') {
      return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
    }
    return { status: 404, contentType: 'text/plain', body: 'media is served via asWebviewUri' }
  })
}
