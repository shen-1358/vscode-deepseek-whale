import * as vscode from 'vscode'
import type { WebviewHost } from './host'

export const SIDEBAR_VIEW_ID = 'whale.widget'

export function registerSidebar(context: vscode.ExtensionContext, host: WebviewHost): void {
  const provider: vscode.WebviewViewProvider = {
    resolveWebviewView(view) {
      host.attach({
        webview: view.webview,
        onDidReceiveMessage: cb => view.webview.onDidReceiveMessage(cb),
      })
      view.onDidDispose(() => host.detach(view.webview))
    },
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  )
}
