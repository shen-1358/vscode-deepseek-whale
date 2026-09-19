import * as vscode from 'vscode'
import { Credentials } from './credentials'
import { createRefresher } from './core/refresh'
import { FileStore } from './core/store'
import { fetchBalance } from './provider/deepseek'
import { RouteTable } from './routes/registry'
import { registerBalanceRoutes } from './routes/balance'
import { StatusBar } from './statusbar'
import { WebviewHost } from './webview/host'
import { registerSidebar } from './webview/sidebar'
import { disposeLog, log, showLog } from './log'

export function activate(context: vscode.ExtensionContext): void {
  const store = new FileStore(context.globalStorageUri.fsPath)
  const credentials = new Credentials(context)
  const statusBar = new StatusBar()

  const refresh = createRefresher({
    resolveKey: () => credentials.resolve(),
    fetchBalance: key => fetchBalance({ key }),
    store,
    now: () => Date.now(),
    log,
  })

  const routeTable = new RouteTable()
  registerBalanceRoutes(routeTable, {
    refresh,
    readSize: async () => (await store.readJson<Record<string, unknown>>('size.json')) ?? {},
    writeSize: value => store.writeJson('size.json', value),
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

  const runRefresh = async (force: boolean): Promise<void> => {
    const result = await refresh(force)
    statusBar.renderResult(result)
    host.broadcast('balance', result)
  }

  const intervalSeconds = (): number =>
    Math.max(15, vscode.workspace.getConfiguration('whaleWidget').get<number>('refreshIntervalSeconds', 60))

  let timer: NodeJS.Timeout | undefined
  const restartTimer = (): void => {
    if (timer) clearInterval(timer)
    timer = setInterval(() => { void runRefresh(false) }, intervalSeconds() * 1000)
  }
  restartTimer()

  context.subscriptions.push(
    vscode.commands.registerCommand('whale.refresh', () => runRefresh(true)),
    vscode.commands.registerCommand('whale.setApiKey', async () => {
      const ok = await credentials.promptAndStore()
      if (ok) await runRefresh(true)
    }),
    vscode.commands.registerCommand('whale.clearApiKey', async () => {
      await credentials.clear()
      log('已清除保存的 API Key')
      statusBar.render({ state: 'no-key' })
      void vscode.window.showInformationMessage('已清除保存的 DeepSeek API Key')
    }),
    vscode.commands.registerCommand('whale.showLog', showLog),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('whaleWidget.refreshIntervalSeconds')) restartTimer()
    }),
    { dispose: () => { if (timer) clearInterval(timer) } },
    { dispose: () => statusBar.dispose() },
    { dispose: disposeLog }
  )

  log('鲸鱼记账挂件已激活')
  void runRefresh(false)
}

export function deactivate(): void {}
