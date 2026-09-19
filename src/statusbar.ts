import * as vscode from 'vscode'
import type { RefreshResult } from './core/refresh'
import { renderStatus, type StatusInput } from './statusview'

// 纯渲染在 statusview.ts（可脱离宿主测试）；这里只放状态栏控件外壳。
export class StatusBar {
  private readonly item: vscode.StatusBarItem

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    this.item.name = '鲸鱼记账挂件'
    this.render({ state: 'no-key' })
    this.item.show()
  }

  render(input: StatusInput): void {
    const view = renderStatus(input)
    this.item.text = view.text
    this.item.tooltip = view.tooltip
    this.item.command = view.command
  }

  renderResult(result: RefreshResult): void {
    this.render({
      state: result.state,
      balance: result.balance,
      currency: result.currency,
      todayUsage: result.todayUsage ?? null,
      stale: result.stale,
      observedAt: result.observedAt,
      message: result.message,
    })
  }

  dispose(): void {
    this.item.dispose()
  }
}
