/**
 * 侧边栏前端的 **DOM 胶水层**：取数 → 交给纯视图模型 → 写 DOM。
 * 所有文案与按钮决策都在 sidebar-view.ts（Node 里可测），这里只做三件事：
 * 首次 fetch、监听"该刷新了"的广播、把结果写进 DOM。
 *
 * 一律用 textContent 而不是 innerHTML：payload 里有来自远端响应的字符串，
 * 不能让它有机会被当成 HTML 解析。
 */
import { installShims } from './shim'
import { buildPanelView, type PanelPayload, type PanelView } from './sidebar-view'

const ROOT_ID = 'app'
const BALANCE_URL = '/dsh-whale/balance.json'
const COMMAND_URL = '/dsh-whale/command.json'

const root = document.getElementById(ROOT_ID)

async function fetchPayload(): Promise<PanelPayload> {
  try {
    const res = await fetch(BALANCE_URL, { cache: 'no-store' })
    return (await res.json()) as PanelPayload
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

async function runCommand(command: string): Promise<void> {
  try {
    await fetch(COMMAND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    })
  } catch {
    // 按钮失败不弹错：下一次广播或手动刷新会把状态纠正回来
  }
}

function row(label: string, value: string, className = ''): HTMLDivElement {
  const div = document.createElement('div')
  div.className = className === '' ? 'whale-row' : `whale-row ${className}`
  const name = document.createElement('span')
  name.textContent = label
  const val = document.createElement('span')
  val.textContent = value
  div.append(name, val)
  return div
}

function render(view: PanelView): void {
  if (!root) return
  root.textContent = ''

  const img = document.createElement('img')
  img.id = 'whale'
  img.alt = view.imageAlt
  img.src = view.imageKey // 媒体 shim 会改写成 asWebviewUri
  root.append(img)

  root.append(row('余额', view.balanceText, 'whale-balance'))
  root.append(row('今日', view.todayText))

  if (view.stampText !== '') {
    const stamp = document.createElement('div')
    stamp.className = 'whale-muted'
    stamp.textContent = view.stampText
    root.append(stamp)
  }
  if (view.note !== '') {
    const note = document.createElement('div')
    note.className = `whale-note ${view.noteTone}`
    note.textContent = view.note
    root.append(note)
  }
  if (view.showSetKey) {
    const button = document.createElement('button')
    button.textContent = '设置 API Key'
    button.addEventListener('click', () => { void runCommand('whale.setApiKey') })
    root.append(button)
  }
  const refresh = document.createElement('button')
  refresh.className = 'secondary'
  refresh.textContent = '立即刷新'
  refresh.addEventListener('click', () => { void runCommand('whale.refresh') })
  root.append(refresh)
}

async function load(): Promise<void> {
  render(buildPanelView(await fetchPayload()))
}

window.addEventListener('dshw:event', ((event: CustomEvent) => {
  const detail = event.detail as { name?: string } | undefined
  if (detail?.name === 'balance') void load()
}) as EventListener)

installShims()
void load()
