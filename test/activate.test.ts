/**
 * 装配根的冒烟测试（计划外的补充，见「Task 15 执行记录」）。
 *
 * 计划里 `extension.ts` 一个测试都没有：所有单测都不加载它，所以
 * 「路由表是不是真接上了真实实现」「侧边栏有没有注册」「状态栏初值对不对」
 * 这些只能靠人工 F5。这里用一个假的 `vscode` 模块把宿主顶掉，
 * 直接调用 `activate()`，再**走一遍真实的消息通道**请求 balance.json ——
 * 这样连 WebviewHost 的 attach / CSP 生成 / 信封编解码都一起过了一遍。
 */
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CHANNEL } from '../src/routes/registry'

const mocks = vi.hoisted(() => ({
  statusItems: [] as { text: string; tooltip: string; command: string; name: string }[],
  views: [] as { id: string; provider: { resolveWebviewView: (view: unknown) => void } }[],
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  received: [] as unknown[],
  webviewHtml: '',
  webviews: [] as unknown[],
  panels: [] as { onDidDispose: (cb: () => void) => { dispose(): void } }[],
}))

vi.mock('vscode', () => {
  class Uri {
    constructor(private readonly value: string) {}
    static joinPath(base: Uri, ...parts: string[]): Uri {
      return new Uri([base.toString(), ...parts].filter(Boolean).join('/'))
    }
    static file(p: string): Uri { return new Uri(p) }
    toString(): string { return this.value }
    get fsPath(): string { return this.value }
  }
  const disposable = { dispose() {} }
  const channel = { appendLine() {}, show() {}, dispose() {} }
  return {
    Uri,
    StatusBarAlignment: { Left: 1, Right: 2 },
    window: {
      createStatusBarItem: () => {
        const item = { text: '', tooltip: '', command: '', name: '', show() {}, dispose() {} }
        mocks.statusItems.push(item)
        return item
      },
      createOutputChannel: () => channel,
      registerWebviewViewProvider: (id: string, provider: unknown) => {
        mocks.views.push({ id, provider: provider as { resolveWebviewView: (view: unknown) => void } })
        return disposable
      },
      showInformationMessage: async () => undefined,
      showInputBox: async () => undefined,
      createWebviewPanel: () => {
        const webview = {
          cspSource: 'vscode-webview://panel',
          asWebviewUri: (uri: unknown) => `webview://${String(uri)}`,
          get html() { return mocks.webviewHtml },
          set html(value: string) { mocks.webviewHtml = value },
          options: {},
          postMessage: async () => true,
          onDidReceiveMessage: () => ({ dispose() {} }),
        }
        mocks.webviews.push(webview)
        const panel = { webview, onDidDispose: () => ({ dispose() {} }), dispose() {} }
        mocks.panels.push(panel)
        return panel
      },
    },
    ViewColumn: { Active: -1 },
    commands: {
      registerCommand: (name: string, cb: (...args: unknown[]) => unknown) => {
        mocks.commands.set(name, cb)
        return disposable
      },
    },
    workspace: {
      getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
      onDidChangeConfiguration: () => disposable,
    },
  }
})

const { activate } = await import('../src/extension')

function fakeContext() {
  return {
    globalStorageUri: { fsPath: mkdtempSync(join(tmpdir(), 'dshw-ext-')) },
    extensionUri: { toString: () => 'file:///ext', fsPath: '/ext' },
    subscriptions: [] as { dispose(): void }[],
    secrets: {
      get: async () => undefined,
      store: async () => {},
      delete: async () => {},
    },
  }
}

/** 挂载侧边栏 webview，返回「发一条请求、拿到响应」的通道 */
function mountWebview(): { request: (envelope: unknown) => Promise<unknown> } {
  const view = mocks.views[mocks.views.length - 1]!
  let onMessage: ((msg: unknown) => void) | undefined
  const webview = {
    cspSource: 'vscode-webview://test',
    asWebviewUri: (uri: unknown) => `webview://${String(uri)}`,
    get html() {
      return mocks.webviewHtml
    },
    set html(value: string) {
      mocks.webviewHtml = value
    },
    options: {},
    postMessage: async (msg: unknown) => { mocks.received.push(msg) },
    onDidReceiveMessage: (cb: (msg: unknown) => void) => { onMessage = cb; return { dispose() {} } },
  }
  view.provider.resolveWebviewView({ webview, onDidDispose: () => ({ dispose() {} }) })
  return {
    request: async (envelope: unknown) => {
      onMessage?.(envelope)
      await new Promise(resolve => setTimeout(resolve, 5))
      return mocks.received[mocks.received.length - 1]
    },
  }
}

describe('activate', () => {
  it('不抛错，注册侧边栏、四条命令，状态栏初值为未配置', async () => {
    activate(fakeContext() as never)
    await new Promise(resolve => setTimeout(resolve, 5))

    expect(mocks.views.map(v => v.id)).toEqual(['whale.widget'])
    expect([...mocks.commands.keys()].sort())
      .toEqual(['whale.clearApiKey', 'whale.refresh', 'whale.setApiKey', 'whale.showLog', 'whale.showSelfCheck'].sort())
    expect(mocks.statusItems[0]?.text).toBe('$(key) 鲸鱼 · 未配置')
  })

  it('未配置密钥时，经消息通道请求 balance.json 返回 NO_KEY（真实路由，非存根）', async () => {
    activate(fakeContext() as never)
    await new Promise(resolve => setTimeout(resolve, 5))
    const bridge = mountWebview()

    expect(mocks.webviewHtml).toContain('nonce-')
    expect(mocks.webviewHtml).toContain('sidebar-ui.js')
    expect(mocks.webviewHtml).toContain('<div id="app"></div>')

    const response = await bridge.request({
      ch: CHANNEL, id: 7, kind: 'request',
      method: 'GET', path: '/dsh-whale/balance.json', query: '',
    }) as { id: number; kind: string; status: number; body: string }

    expect(response.id).toBe(7)
    expect(response.kind).toBe('response')
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({ ok: false, code: 'NO_KEY', mood: 'sleepy' })
  })

  it('自检命令打开独立面板并挂载探针页', async () => {
    activate(fakeContext() as never)
    await new Promise(resolve => setTimeout(resolve, 5))
    const show = mocks.commands.get('whale.showSelfCheck')
    expect(typeof show).toBe('function')
    show?.()
    expect(mocks.webviews.length).toBe(1)
    expect(mocks.webviewHtml).toContain('probe.js')
    expect(mocks.webviewHtml).toContain('<div id="probe">')
  })
})
