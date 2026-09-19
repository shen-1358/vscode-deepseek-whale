/**
 * 状态栏渲染的**纯函数**部分：不 import `vscode`，所以能在 vitest 里直接断言字符串。
 *
 * 与 Task 6 的 `webview/html.ts`、Task 11 的 `keyresolve.ts` 同一手法：
 * `vscode` 是宿主注入的运行时模块，静态 import 它的文件在 Node 下加载不了。
 * `StatusBar`（真·状态栏控制器）在 `statusbar.ts`，它 import 本模块。
 */
export interface StatusInput {
  state: 'ok' | 'no-key' | 'auth-error' | 'network-error'
  balance?: number
  currency?: string
  todayUsage?: number | null
  stale?: boolean
  observedAt?: number
  message?: string
}

export interface StatusView {
  text: string
  tooltip: string
  command: string
}

// 只列无歧义的符号。JPY 的符号也是 ¥，与 CNY 视觉上完全一样，
// 在只盯余额的状态栏里会被读成人民币——所以 JPY 走代码形式（见测试
// 「其他币种用代码加空格」）。计划里 `JPY: '¥'` 与自己的测试互相矛盾。
const SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', GBP: '£' }

export function formatMoney(value: number, currency: string): string {
  const symbol = SYMBOLS[currency]
  const amount = value.toFixed(2)
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`
}

export function beijingStamp(ms: number): string {
  const d = new Date(ms + 8 * 3600_000)
  const date = d.toISOString().slice(0, 10)
  const time = d.toISOString().slice(11, 16)
  return `${date} ${time}（北京时间）`
}

export function renderStatus(input: StatusInput): StatusView {
  if (input.state === 'no-key') {
    return {
      text: '$(key) 鲸鱼 · 未配置',
      tooltip: '点击设置 DeepSeek API Key\n密钥只写入系统凭据管理器',
      command: 'whale.setApiKey',
    }
  }

  if (input.state === 'auth-error') {
    return {
      text: '$(alert) 鲸鱼 · Key 无效',
      tooltip: `${input.message ?? 'API Key 无效或无权限'}\n点击重新设置`,
      command: 'whale.setApiKey',
    }
  }

  if (input.state === 'network-error') {
    return {
      text: '$(cloud-offline) 鲸鱼 · 网络异常',
      tooltip: `${input.message ?? '无法连接 api.deepseek.com'}\n点击重试`,
      command: 'whale.refresh',
    }
  }

  const currency = input.currency ?? 'CNY'
  const balance = formatMoney(input.balance ?? 0, currency)
  const today = input.todayUsage === null || input.todayUsage === undefined
    ? '--'
    : formatMoney(input.todayUsage, currency)
  const prefix = input.stale ? '~ ' : ''
  const lines = [
    `余额 ${balance}`,
    `今日已用 ${today}`,
    input.observedAt ? `上次成功获取：${beijingStamp(input.observedAt)}` : '尚未成功获取',
    input.stale ? '网络异常，正在显示上次的余额' : '点击立即刷新',
  ]
  return {
    text: `${prefix}🐋 ${balance} · 今日 ${today}`,
    tooltip: lines.join('\n'),
    command: 'whale.refresh',
  }
}
