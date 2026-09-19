import * as vscode from 'vscode'
import { jsonResponse, RouteTable } from './routes/registry'
import { WebviewHost } from './webview/host'
import { registerSidebar } from './webview/sidebar'
import { log, showLog } from './log'

export function activate(context: vscode.ExtensionContext): void {
  const routeTable = new RouteTable()

  // M1 阶段的存根路由，Task 14 会用真实实现替换
  routeTable.register('/dsh-whale/balance.json', () =>
    jsonResponse({ ok: true, totalBalance: 0, currency: 'CNY', todayUsage: null, stub: true })
  )

  routeTable.register('/dsh-whale/size.json', req => {
    if (req.method === 'PUT') return jsonResponse({ ok: true })
    return jsonResponse({})
  })

  const host = new WebviewHost({
    extensionUri: context.extensionUri,
    routeTable,
    mediaMap: mediaUri => ({
      '/dsh-whale/image.png': mediaUri('placeholder-whale.png'),
    }),
    log,
  })

  registerSidebar(context, host)

  context.subscriptions.push(
    vscode.commands.registerCommand('whale.showLog', showLog),
    vscode.commands.registerCommand('whale.refresh', () => {
      host.broadcast('probe', { at: Date.now() })
    }),
    host
  )

  log('鲸鱼记账挂件已激活（M1 探针）')
}

export function deactivate(): void {}
