import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'
import { CHANNEL, RouteTable, decodeRequest, encodeEvent, encodeResponse } from '../routes/registry'
import { buildHtml } from './html'

export interface HostOptions {
  extensionUri: vscode.Uri
  routeTable: RouteTable
  /**
   * 媒体映射不能是静态对象：资源 URI 依赖具体 webview 会话
   * （不同会话的 host 组件不同），所以由 attach() 在每次挂载时调用本工厂。
   */
  mediaMap: (mediaUri: (fileName: string) => string) => Record<string, string>
  log: (line: string) => void
}

interface Attachable {
  webview: vscode.Webview
  onDidReceiveMessage: (cb: (message: unknown) => void) => vscode.Disposable
}

export class WebviewHost {
  private readonly targets = new Set<vscode.Webview>()
  private readonly disposables: vscode.Disposable[] = []

  constructor(private readonly options: HostOptions) {}

  attach(target: Attachable): void {
    const webview = target.webview
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.options.extensionUri, 'media'),
        vscode.Uri.joinPath(this.options.extensionUri, 'dist'),
      ],
    }

    const nonce = randomBytes(16).toString('base64')
    const asCheckedUri = (parts: string[]): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.options.extensionUri, ...parts)).toString()
    const asMediaUri = (fileName: string): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.options.extensionUri, 'media', fileName)).toString()

    webview.html = buildHtml({
      cspSource: webview.cspSource,
      nonce,
      uris: {
        shim: asCheckedUri(['dist', 'dshw-shim.js']),
        probe: asCheckedUri(['dist', 'probe.js']),
        media: asMediaUri(''),
      },
      mediaMap: this.options.mediaMap(asMediaUri),
    })

    this.targets.add(webview)
    this.disposables.push(target.onDidReceiveMessage(msg => { void this.handle(webview, msg) }))
  }

  detach(webview: vscode.Webview): void {
    this.targets.delete(webview)
  }

  broadcast(name: string, payload: unknown): void {
    const env = encodeEvent(name, payload)
    for (const webview of this.targets) void webview.postMessage(env)
  }

  private async handle(webview: vscode.Webview, raw: unknown): Promise<void> {
    const id = (raw as { id?: number } | null)?.id
    const req = decodeRequest(raw)
    if (!req) return

    const res = await this.options.routeTable.dispatch(req)
    if (res.status >= 400) {
      this.options.log(`route ${req.method} ${req.path} -> ${res.status}`)
    }
    if (typeof id === 'number') {
      void webview.postMessage(encodeResponse(id, res))
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.disposables.length = 0
    this.targets.clear()
  }
}

export { CHANNEL }
