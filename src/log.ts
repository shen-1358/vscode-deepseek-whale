import * as vscode from 'vscode'

let channel: vscode.OutputChannel | null = null

function ensure(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel('鲸鱼记账挂件')
  return channel
}

export function log(line: string): void {
  const stamp = new Date().toISOString().slice(11, 19)
  ensure().appendLine(`[${stamp}] ${line}`)
}

export function showLog(): void {
  ensure().show(true)
}

export function disposeLog(): void {
  channel?.dispose()
  channel = null
}
