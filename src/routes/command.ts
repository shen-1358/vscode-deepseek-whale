import { jsonResponse, type RouteRequest, type RouteResponse, type RouteTable } from './registry'

/**
 * 写死白名单，而不是放行任意命令：webview 里的内容并非全部受我们控制
 * （例如错误信息可能来自远端响应），只有显式列出的命令才允许触发宿主行为。
 */
export const ALLOWED_COMMANDS = [
  'whale.setApiKey',
  'whale.clearApiKey',
  'whale.refresh',
  'whale.showLog',
] as const

export interface CommandRouteDeps {
  execute: (command: string) => Promise<void>
}

export function registerCommandRoute(table: RouteTable, deps: CommandRouteDeps): void {
  table.register('/dsh-whale/command.json', async (req: RouteRequest): Promise<RouteResponse> => {
    if (req.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(req.body ?? '')
    } catch {
      return jsonResponse({ ok: false, error: 'invalid json' }, 400)
    }
    const command = (parsed as { command?: unknown } | null)?.command
    if (typeof command !== 'string' || command.length === 0) {
      return jsonResponse({ ok: false, error: 'missing command' }, 400)
    }
    if (!(ALLOWED_COMMANDS as readonly string[]).includes(command)) {
      return jsonResponse({ ok: false, error: `command not allowed: ${command}` }, 403)
    }
    await deps.execute(command)
    return jsonResponse({ ok: true })
  })
}
