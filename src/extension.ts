import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('whale.showLog', () => {
      void vscode.window.showInformationMessage('鲸鱼记账挂件已激活')
    })
  )
}

export function deactivate(): void {}
