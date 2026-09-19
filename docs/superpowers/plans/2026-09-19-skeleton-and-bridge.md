# vscode_whale_widget #0 骨架与通信层 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭出可在 VSCode 中运行的扩展骨架与通信层，让状态栏实时显示 DeepSeek 余额，并验证两个 shim（fetch 合成 `Response`、媒体 `asWebviewUri` 改写）在真实 webview 中成立。

**Architecture:** 分治桥。webview 内注入两个 shim：数据类请求被拦截、包成信封经 `postMessage` 交由宿主的**路由表**处理并合成真 `Response`；媒体类请求被改写为 `asWebviewUri`，走 VSCode 原生文件服务，不过消息通道。状态栏是唯一驱动源（持有 60 秒定时器），webview 仅作订阅者。

**Tech Stack:** TypeScript（strict）· esbuild（三入口）· vitest · `@vscode/vsce` · 运行时零依赖 · `engines.vscode: ^1.85.0`

**Spec:** `docs/superpowers/specs/2026-09-19-skeleton-and-bridge-design.md`

---

## 文件结构

本计划相对 spec §5.1 有 **两处细化新增**（都在 §5.2 的边界规则之内，不改变任何决策）：

| 新增 | 理由 |
|---|---|
| `src/core/store.ts` | 通用文件读写 + 原子写。`ledger.ts` 与 `size.json` 路由都要落盘，抽出来避免重复实现 |
| `src/core/refresh.ts` | 刷新编排（凭据 → 拉取 → 记账 → 落盘）。spec 把驱动权给了状态栏，但把编排塞进 `statusbar.ts` 会让它既管 UI 又管业务、无法单独测试 |

| 文件 | 职责 |
|---|---|
| `package.json` | 扩展清单：命令、视图容器、配置项、脚本 |
| `tsconfig.json` | `strict: true`，`allowJs: true`（要收录 `.mjs` 内核） |
| `esbuild.mjs` | 三入口构建：extension / shim / probe |
| `.gitattributes` ✅已完成 | 强制 LF，保护内核逐字节一致性 |
| `.vscode/launch.json` | F5 启动扩展宿主 |
| `.vscode/tasks.json` | F5 前自动构建 |
| `media/activity-icon.svg` | Activity Bar 图标（临时美术，#1 重做） |
| `media/placeholder-whale.png` | 占位鲸鱼图（由脚本生成，纯几何，本项目自有版权） |
| `tools/make-placeholder.mjs` | 生成占位图的脚本（零依赖 PNG 编码器） |
| `src/routes/registry.ts` | 信封编解码 + 路由表 + 分发 |
| `src/webview/shim.ts` | 注入 webview 的 fetch shim 与媒体 shim |
| `src/webview/host.ts` | `WebviewHost` 抽象 + 内联 HTML/CSP 生成 |
| `src/webview/probe.ts` | M1 探针前端（M2 后保留为自检页） |
| `src/webview/sidebar.ts` | 侧边栏 `WebviewView` 注册 |
| `src/provider/deepseek.ts` | DeepSeek 余额查询（不 import `vscode`） |
| `src/provider/types.ts` | `BalanceSnapshot` 等共享类型 |
| `src/credentials.ts` | 密钥解析链（SecretStorage → env）+ 纯逻辑 `resolveKey` |
| `src/core/accounting.mjs` | 上游内核，逐字节原样搬运 |
| `src/core/accounting.d.mts` | 手写类型声明 |
| `src/core/store.ts` | 文件读写 + 原子写 |
| `src/core/ledger.ts` | 账本形状与读写 |
| `src/core/refresh.ts` | 刷新编排（纯逻辑，依赖注入） |
| `src/routes/balance.ts` | `balance.json` / `size.json` / `image.png` 三条路由 |
| `src/statusbar.ts` | 状态栏渲染纯函数 + 薄控制器 |
| `src/log.ts` | OutputChannel 包装 |
| `src/extension.ts` | 装配根 |
| `LICENSE` / `NOTICE.md` / `README.md` | 许可与归属 |
| `test/*.test.ts` | vitest |

---

# 阶段 A · M1 探针（先验证风险假设）

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.mjs`, `.gitignore`, `.vscodeignore`, `.vscode/launch.json`, `.vscode/tasks.json`, `media/activity-icon.svg`, `src/webview/shim.ts`（占位）, `src/webview/probe.ts`（占位）

> ⚠️ `esbuild.mjs` 是**三入口**，所以 `src/webview/shim.ts` 与 `probe.ts` 必须此刻就存在——
> 入口文件缺失会让 esbuild 直接报 `Could not resolve` 而构建失败。这两个文件在 Task 1 里只是占位，Task 4/5/7 会填上真实内容。

- [x] **Step 1: 写 `.gitignore` 与 `.vscodeignore`**

`.gitignore`：

```
node_modules/
dist/
*.vsix
.DS_Store
```

`.vscodeignore`（阻止源码与文档被塞进 `.vsix`，只留运行必需物）：

```
.vscode/**
src/**
test/**
tools/**
docs/**
node_modules/**
*.vsix
**/*.ts
**/*.mjs
**/*.d.mts
tsconfig.json
esbuild.mjs
.gitignore
.gitattributes
```

- [x] **Step 2: 写 `package.json`**

```json
{
  "name": "vscode-whale-widget",
  "displayName": "鲸鱼记账挂件",
  "description": "在 VSCode 里实时查看 DeepSeek API 余额、今日已用与峰谷定价",
  "version": "0.0.1",
  "publisher": "shen-1358",
  "license": "MIT",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "commands": [
      { "command": "whale.setApiKey", "title": "鲸鱼: 设置 DeepSeek API Key" },
      { "command": "whale.clearApiKey", "title": "鲸鱼: 清除已保存的 API Key" },
      { "command": "whale.refresh", "title": "鲸鱼: 立即刷新余额" },
      { "command": "whale.showLog", "title": "鲸鱼: 显示日志" }
    ],
    "viewsContainers": {
      "activitybar": [
        { "id": "whaleWidget", "title": "鲸鱼记账挂件", "icon": "media/activity-icon.svg" }
      ]
    },
    "views": {
      "whaleWidget": [
        { "id": "whale.widget", "name": "小鲸鱼", "type": "webview" }
      ]
    },
    "configuration": {
      "title": "鲸鱼记账挂件",
      "properties": {
        "whaleWidget.refreshIntervalSeconds": {
          "type": "number",
          "default": 60,
          "minimum": 15,
          "description": "自动刷新间隔（秒）"
        },
        "whaleWidget.envVarName": {
          "type": "string",
          "default": "DEEPSEEK_API_KEY",
          "description": "未保存密钥时回退读取的环境变量名"
        }
      }
    }
  },
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "package": "npx @vscode/vsce package"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^4.0.0",
    "esbuild": "^0.28.2",
    "typescript": "^5.7.2",
    "vitest": "^5.0.1"
  }
}
```

- [x] **Step 3: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true
  },
  "include": ["src/**/*.ts", "src/**/*.mts", "src/**/*.mjs", "test/**/*.ts"]
}
```

- [x] **Step 4: 写 `esbuild.mjs`**

```js
import { build, context } from 'esbuild'
import { mkdirSync } from 'node:fs'

const watch = process.argv.includes('--watch')
mkdirSync('dist', { recursive: true })

const common = { bundle: true, sourcemap: true, logLevel: 'info' }

const targets = [
  {
    ...common,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['vscode'],
  },
  {
    ...common,
    entryPoints: ['src/webview/shim.ts'],
    outfile: 'dist/dshw-shim.js',
    platform: 'browser',
    format: 'iife',
    target: 'chrome110',
  },
  {
    ...common,
    entryPoints: ['src/webview/probe.ts'],
    outfile: 'dist/probe.js',
    platform: 'browser',
    format: 'iife',
    target: 'chrome110',
  },
]

if (watch) {
  for (const t of targets) (await context(t)).watch()
  console.log('esbuild: watching')
} else {
  for (const t of targets) await build(t)
}
```

- [x] **Step 5: 写 `.vscode/launch.json`**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "运行扩展",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "npm: build"
    }
  ]
}
```

- [x] **Step 6: 写 `.vscode/tasks.json`**

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "build",
      "problemMatcher": ["$esbuild"],
      "label": "npm: build",
      "group": "build"
    }
  ]
}
```

- [x] **Step 7: 写 `media/activity-icon.svg`（临时美术，#1 随鲸鱼形象重做）**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path fill="currentColor" fill-rule="evenodd" d="M2 12c0-3.3 3.4-6 7.6-6 3 0 5.6 1.3 6.9 3.2l3.2-2.6c.6-.4 1.4 0 1.4.7l.3 3.6c0 .4-.2.7-.4.9l-3.4 2.4C16.3 16.5 13.6 18 10.6 18c-.7 0-1.4-.1-2-.2l-1.7 2.7c-.3.5-.9.6-1.3.3-.3-.2-.4-.5-.4-.8l.2-2.9C3.1 16.2 2 14.3 2 12zm5.1-2.4a1.3 1.3 0 100 2.6 1.3 1.3 0 000-2.6z"/>
</svg>
```

- [x] **Step 8: 建三个占位源文件，让构建能过**

`src/extension.ts`：

```ts
import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('whale.showLog', () => {
      void vscode.window.showInformationMessage('鲸鱼记账挂件已激活')
    })
  )
}

export function deactivate(): void {}
```

`src/webview/shim.ts`（占位，Task 4/5 填真实内容）：

```ts
export {}
```

`src/webview/probe.ts`（占位，Task 7 填真实内容）：

```ts
export {}
```

- [x] **Step 9: 安装依赖并构建**

Run:
```bash
npm install
npm run build
```

Expected: 无错误；`dist/extension.js`、`dist/dshw-shim.js`、`dist/probe.js` 三个文件存在（后两个此步为空 bundle，属正常）。

- [x] **Step 10: 类型检查**

Run: `npm run typecheck`
Expected: 无输出（0 错误）。

- [x] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: 扩展脚手架（三入口构建 / tsconfig / F5 调试配置）"
```

---

## Task 2: 信封与路由表

**Files:**
- Create: `src/routes/registry.ts`, `test/registry.test.ts`

- [x] **Step 1: 写失败测试 `test/registry.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  CHANNEL, RouteTable, decodeRequest, encodeEvent, encodeResponse,
  jsonResponse, parseQuery,
} from '../src/routes/registry'

describe('decodeRequest', () => {
  it('接受合法请求', () => {
    const req = decodeRequest({
      ch: CHANNEL, id: 7, kind: 'request', method: 'get',
      path: '/dsh-whale/balance.json', query: 'refresh=1',
    })
    expect(req).toEqual({
      method: 'GET', path: '/dsh-whale/balance.json', query: 'refresh=1',
      body: undefined, contentType: undefined,
    })
  })

  it('缺少 method 时默认 GET', () => {
    const req = decodeRequest({ ch: CHANNEL, kind: 'request', path: '/dsh-whale/a.json' })
    expect(req?.method).toBe('GET')
  })

  it('拒绝其他频道', () => {
    expect(decodeRequest({ ch: 'other', kind: 'request', path: '/x' })).toBeNull()
  })

  it('拒绝非 request 形状', () => {
    expect(decodeRequest({ ch: CHANNEL, kind: 'event', name: 'x' })).toBeNull()
  })

  it('拒绝没有 path 的请求', () => {
    expect(decodeRequest({ ch: CHANNEL, kind: 'request' })).toBeNull()
    expect(decodeRequest({ ch: CHANNEL, kind: 'request', path: '' })).toBeNull()
  })

  it('拒绝非对象', () => {
    expect(decodeRequest(null)).toBeNull()
    expect(decodeRequest('nope')).toBeNull()
  })
})

describe('encodeResponse / encodeEvent', () => {
  it('响应带 id 与频道', () => {
    expect(encodeResponse(3, jsonResponse({ ok: true }))).toEqual({
      ch: CHANNEL, id: 3, kind: 'response', status: 200,
      contentType: 'application/json', body: '{"ok":true}',
    })
  })

  it('事件不带 id', () => {
    const env = encodeEvent('balance', { totalBalance: 1 })
    expect(env.ch).toBe(CHANNEL)
    expect(env.kind).toBe('event')
    expect(env.name).toBe('balance')
    expect(env.id).toBeUndefined()
  })
})

describe('parseQuery', () => {
  it('解析查询串', () => {
    expect(parseQuery('a=1&b=x%20y')).toEqual({ a: '1', b: 'x y' })
  })

  it('空串得到空对象', () => {
    expect(parseQuery('')).toEqual({})
  })
})

describe('RouteTable', () => {
  it('命中已注册路由', async () => {
    const table = new RouteTable()
    table.register('/dsh-whale/a.json', () => jsonResponse({ hit: true }))
    const res = await table.dispatch({ method: 'GET', path: '/dsh-whale/a.json', query: '' })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ hit: true })
  })

  it('未注册路径返回 404 且不抛异常', async () => {
    const table = new RouteTable()
    const res = await table.dispatch({ method: 'GET', path: '/dsh-whale/nope.json', query: '' })
    expect(res.status).toBe(404)
    expect(JSON.parse(res.body).ok).toBe(false)
  })

  it('处理器抛错时返回 500 而不是冒泡', async () => {
    const table = new RouteTable()
    table.register('/dsh-whale/boom.json', () => { throw new Error('炸了') })
    const res = await table.dispatch({ method: 'GET', path: '/dsh-whale/boom.json', query: '' })
    expect(res.status).toBe(500)
    expect(JSON.parse(res.body).error).toBe('炸了')
  })

  it('异步处理器被 await', async () => {
    const table = new RouteTable()
    table.register('/dsh-whale/slow.json', async () => {
      await new Promise(r => setTimeout(r, 1))
      return jsonResponse({ done: true })
    })
    const res = await table.dispatch({ method: 'GET', path: '/dsh-whale/slow.json', query: '' })
    expect(JSON.parse(res.body).done).toBe(true)
  })

  it('has() 反映注册状态', () => {
    const table = new RouteTable()
    expect(table.has('/dsh-whale/a.json')).toBe(false)
    table.register('/dsh-whale/a.json', () => jsonResponse({}))
    expect(table.has('/dsh-whale/a.json')).toBe(true)
  })
})
```

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/registry.test.ts`
Expected: FAIL — `Failed to resolve import "../src/routes/registry"`。

- [x] **Step 3: 实现 `src/routes/registry.ts`**

```ts
export const CHANNEL = 'dshw'

export interface RouteRequest {
  method: string
  path: string
  query: string
  body?: string
  contentType?: string
}

export interface RouteResponse {
  status: number
  contentType: string
  body: string
}

export type RouteHandler = (req: RouteRequest) => Promise<RouteResponse> | RouteResponse

export interface Envelope {
  ch: string
  id?: number
  kind: 'request' | 'response' | 'event'
  method?: string
  path?: string
  query?: string
  status?: number
  contentType?: string
  body?: string
  name?: string
  payload?: unknown
}

export function jsonResponse(value: unknown, status = 200): RouteResponse {
  return { status, contentType: 'application/json', body: JSON.stringify(value) }
}

export function decodeRequest(raw: unknown): RouteRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const env = raw as Envelope
  if (env.ch !== CHANNEL || env.kind !== 'request') return null
  if (typeof env.path !== 'string' || env.path.length === 0) return null
  return {
    method: (typeof env.method === 'string' ? env.method : 'GET').toUpperCase(),
    path: env.path,
    query: typeof env.query === 'string' ? env.query : '',
    body: typeof env.body === 'string' ? env.body : undefined,
    contentType: typeof env.contentType === 'string' ? env.contentType : undefined,
  }
}

export function encodeResponse(id: number, res: RouteResponse): Envelope {
  return { ch: CHANNEL, id, kind: 'response', ...res }
}

export function encodeEvent(name: string, payload: unknown): Envelope {
  return { ch: CHANNEL, kind: 'event', name, payload }
}

export function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(query)) out[k] = v
  return out
}

export class RouteTable {
  private readonly routes = new Map<string, RouteHandler>()

  register(path: string, handler: RouteHandler): void {
    this.routes.set(path, handler)
  }

  has(path: string): boolean {
    return this.routes.has(path)
  }

  paths(): string[] {
    return [...this.routes.keys()].sort()
  }

  async dispatch(req: RouteRequest): Promise<RouteResponse> {
    const handler = this.routes.get(req.path)
    if (!handler) {
      return jsonResponse({ ok: false, error: `route not registered: ${req.path}` }, 404)
    }
    try {
      return await handler(req)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return jsonResponse({ ok: false, error: message }, 500)
    }
  }
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/registry.test.ts`
Expected: PASS，15 个测试全绿。

- [x] **Step 5: Commit**

```bash
git add src/routes/registry.ts test/registry.test.ts
git commit -m "feat(routes): 信封编解码与路由表"
```

---

## Task 3: 生成占位鲸鱼图（自有版权）

**Files:**
- Create: `tools/make-placeholder.mjs`, `test/placeholder-image.test.ts`
- Output: `media/placeholder-whale.png`

- [x] **Step 1: 写 `tools/make-placeholder.mjs`**

零依赖 PNG 编码器。**这是本项目自有的纯几何图形，不含任何第三方素材**（spec §13）。

```js
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const W = 256
const H = 256

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

const BODY = [58, 140, 214, 255]
const BELLY = [214, 236, 250, 255]
const DARK = [28, 48, 72, 255]
const WHITE = [255, 255, 255, 255]
const CLEAR = [0, 0, 0, 0]

function inCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function inTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by)
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy)
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function pixel(x, y) {
  // 尾鳍（右侧两个三角）
  if (inTriangle(x, y, 168, 132, 224, 90, 224, 132)) return DARK
  if (inTriangle(x, y, 168, 140, 224, 168, 224, 206)) return DARK
  // 身体
  if (inCircle(x, y, 116, 148, 74)) {
    // 腹部亮色
    if (inCircle(x, y, 104, 176, 48)) return BELLY
    return BODY
  }
  // 眼睛
  if (inCircle(x, y, 92, 128, 13)) return WHITE
  if (inCircle(x, y, 92, 128, 6)) return DARK
  // 喷水
  if (inCircle(x, y, 74, 44, 8)) return BODY
  if (inCircle(x, y, 96, 30, 6)) return BODY
  if (inCircle(x, y, 56, 30, 5)) return BODY
  return CLEAR
}

const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) {
  const rowStart = y * (W * 4 + 1)
  raw[rowStart] = 0 // filter: None
  for (let x = 0; x < W; x++) {
    const [r, g, b, a] = pixel(x, y)
    const p = rowStart + 1 + x * 4
    raw[p] = r
    raw[p + 1] = g
    raw[p + 2] = b
    raw[p + 3] = a
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type: RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

mkdirSync('media', { recursive: true })
writeFileSync('media/placeholder-whale.png', png)
console.log(`wrote media/placeholder-whale.png (${png.length} bytes)`)
```

- [x] **Step 2: 生成并校验是合法 PNG**

Run:
```bash
node tools/make-placeholder.mjs
python -c "from PIL import Image; im=Image.open('media/placeholder-whale.png'); print(im.format, im.size, im.mode)" 2>/dev/null || node -e "const b=require('fs').readFileSync('media/placeholder-whale.png'); console.log('sig ok:', b.subarray(0,8).toString('hex')==='89504e470d0a1a0a', 'IHDR w/h:', b.readUInt32BE(16), b.readUInt32BE(20), 'bitDepth:', b[24], 'colorType:', b[25])"
```

Expected: `wrote media/placeholder-whale.png (... bytes)` 且校验输出 `sig ok: true IHDR w/h: 256 256 bitDepth: 8 colorType: 6`。

- [x] **Step 3: 跑特征像素测试**

`test/placeholder-image.test.ts` 用零依赖的 PNG 解码器采样关键位置的颜色（瞳孔/眼白/鲸身/腹部/嘴/尾鳍/水柱/背景），
用于拦住「`if` 判定顺序写错导致某分支永远不可达」这类肉眼难辨的错误。

Run: `npx vitest run test/placeholder-image.test.ts`
Expected: PASS，4 个测试。

- [x] **Step 4: 肉眼确认图形可辨认**

打开 `media/placeholder-whale.png`，确认是一只可辨认的蓝色鲸鱼。
若形状不可辨认，调整 `pixel()` 里的圆心与半径后重跑 Step 2 与 Step 3。

- [x] **Step 5: Commit**

```bash
git add tools/make-placeholder.mjs media/placeholder-whale.png
git commit -m "feat(media): 零依赖脚本生成占位鲸鱼图（自有几何图形）"
```

---

## Task 4: 媒体 URL 归一化与映射（shim 的纯逻辑部分）

**Files:**
- Modify: `src/webview/shim.ts`（替换 Task 1 的占位内容）, `test/shim.test.ts`

先写 shim 里**可纯函数测试**的部分（URL 判断、键归一化、映射解析），DOM 劫持部分在 Task 5 接上。

- [ ] **Step 1: 写失败测试 `test/shim.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { MEDIA_MAP_ELEMENT_ID, normalizeMediaKey, parseMediaMap, splitPathQuery } from '../src/webview/shim'

describe('splitPathQuery', () => {
  it('拆分路径与查询串', () => {
    expect(splitPathQuery('/dsh-whale/a.png?id=1')).toEqual({ path: '/dsh-whale/a.png', query: 'id=1' })
  })

  it('无查询串时 query 为空', () => {
    expect(splitPathQuery('/dsh-whale/a.png')).toEqual({ path: '/dsh-whale/a.png', query: '' })
  })

  it('问号后为空时 query 为空', () => {
    expect(splitPathQuery('/dsh-whale/a.png?')).toEqual({ path: '/dsh-whale/a.png', query: '' })
  })
})

describe('normalizeMediaKey', () => {
  it('查询串按键名排序，保证同一资源只有一个键', () => {
    expect(normalizeMediaKey('/dsh-whale/b.png?b=2&a=1')).toBe('/dsh-whale/b.png?a=1&b=2')
  })

  it('无查询串时键就是路径', () => {
    expect(normalizeMediaKey('/dsh-whale/b.png')).toBe('/dsh-whale/b.png')
  })

  it('丢掉空查询串', () => {
    expect(normalizeMediaKey('/dsh-whale/b.png?')).toBe('/dsh-whale/b.png')
  })

  it('保留重复键的第一个值', () => {
    expect(normalizeMediaKey('/dsh-whale/b.png?a=1&a=2')).toBe('/dsh-whale/b.png?a=1')
  })
})

describe('parseMediaMap', () => {
  it('解析注入的 JSON 映射', () => {
    const map = parseMediaMap('{"\\/dsh-whale\\/image.png":"vscode-webview-resource://x/image.png"}')
    expect(map.get('/dsh-whale/image.png')).toBe('vscode-webview-resource://x/image.png')
  })

  it('键会被归一化', () => {
    const map = parseMediaMap('{"/dsh-whale/b.png?z=1&a=2":"u"}')
    expect(map.get('/dsh-whale/b.png?a=2&z=1')).toBe('u')
  })

  it('空串或非法 JSON 得到空映射而不抛错', () => {
    expect(parseMediaMap('').size).toBe(0)
    expect(parseMediaMap('not json').size).toBe(0)
    expect(parseMediaMap('null').size).toBe(0)
    expect(parseMediaMap('[1,2]').size).toBe(0)
  })

  it('忽略非字符串值', () => {
    expect(parseMediaMap('{"/a":1,"/b":"u"}').size).toBe(1)
  })

  it('导出的元素 id 与宿主约定一致', () => {
    expect(MEDIA_MAP_ELEMENT_ID).toBe('dshw-media')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/shim.test.ts`
Expected: FAIL — 无法解析 `../src/webview/shim`。

- [ ] **Step 3: 写 `src/webview/shim.ts` 的纯逻辑部分**

```ts
export const CHANNEL = 'dshw'
export const ROUTE_PREFIX = '/dsh-whale/'
export const MEDIA_MAP_ELEMENT_ID = 'dshw-media'
export const MEDIA_EVENT_NAME = 'media'

export interface PathQuery {
  path: string
  query: string
}

export function splitPathQuery(url: string): PathQuery {
  const at = url.indexOf('?')
  if (at === -1) return { path: url, query: '' }
  return { path: url.slice(0, at), query: url.slice(at + 1) }
}

export function isWhalePath(url: string): boolean {
  return url.startsWith(ROUTE_PREFIX)
}

export function normalizeMediaKey(url: string): string {
  const { path, query } = splitPathQuery(url)
  if (query === '') return path
  const params = new URLSearchParams(query)
  const seen = new Set<string>()
  const pairs: string[] = []
  for (const key of [...params.keys()].sort()) {
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(params.get(key) ?? '')}`)
  }
  return pairs.length === 0 ? path : `${path}?${pairs.join('&')}`
}

export function parseMediaMap(json: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!json) return out
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return out
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 0) {
      out.set(normalizeMediaKey(key), value)
    }
  }
  return out
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/shim.test.ts`
Expected: PASS，12 个测试全绿。

- [ ] **Step 5: Commit**

```bash
git add src/webview/shim.ts test/shim.test.ts
git commit -m "feat(webview): shim 的 URL 归一化与媒体映射纯逻辑"
```

---

## Task 5: shim 的 DOM 拦截实现（fetch 合成 Response + 媒体改写）

**Files:**
- Modify: `src/webview/shim.ts`（追加实现，不改 Task 4 已有函数）

- [ ] **Step 1: 追加拦截实现到 `src/webview/shim.ts`**

```ts
interface ShimResponse {
  status: number
  contentType: string
  body: string
}

interface VsCodeApi {
  postMessage(message: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

interface Pending {
  resolve: (value: ShimResponse) => void
}

export interface WhaleBridge {
  post(message: unknown): void
  request(method: string, url: string, body?: string): Promise<ShimResponse>
}

let bridge: WhaleBridge | null = null

function createBridge(): WhaleBridge {
  const vscode = acquireVsCodeApi()
  const pending = new Map<number, Pending>()
  let seq = 0

  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as { ch?: string; kind?: string; id?: number; status?: number; contentType?: string; body?: string; name?: string; payload?: unknown }
    if (!msg || msg.ch !== CHANNEL) return
    if (msg.kind === 'response' && typeof msg.id === 'number') {
      const waiter = pending.get(msg.id)
      if (!waiter) return
      pending.delete(msg.id)
      waiter.resolve({
        status: typeof msg.status === 'number' ? msg.status : 500,
        contentType: typeof msg.contentType === 'string' ? msg.contentType : 'application/json',
        body: typeof msg.body === 'string' ? msg.body : '',
      })
      return
    }
    if (msg.kind === 'event') {
      window.dispatchEvent(new CustomEvent('dshw:event', { detail: { name: msg.name, payload: msg.payload } }))
    }
  })

  return {
    post(message) {
      vscode.postMessage(message)
    },
    request(method, url, body) {
      const id = ++seq
      const { path, query } = splitPathQuery(url)
      return new Promise<ShimResponse>((resolve) => {
        pending.set(id, { resolve })
        vscode.postMessage({ ch: CHANNEL, id, kind: 'request', method, path, query, body })
      })
    },
  }
}

export function getBridge(): WhaleBridge {
  if (!bridge) bridge = createBridge()
  return bridge
}

export function installFetchShim(): void {
  const realFetch = window.fetch.bind(window)
  const patched: typeof window.fetch = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url
    if (!isWhalePath(url)) return realFetch(input as RequestInfo, init)
    const method = (init?.method ?? (typeof input === 'object' && input !== null && 'method' in input ? (input as Request).method : 'GET')).toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : undefined
    const res = await getBridge().request(method, url, body)
    return new Response(res.body, {
      status: res.status,
      headers: { 'Content-Type': res.contentType },
    })
  }
  window.fetch = patched
}

export interface MediaRegistry {
  resolve(url: string): string | null
  add(entries: Record<string, string>): void
  size(): number
}

export function createMediaRegistry(initial: Map<string, string>): MediaRegistry {
  const map = new Map(initial)
  return {
    resolve(url) {
      const key = normalizeMediaKey(url)
      const direct = map.get(key)
      if (direct) return direct
      const { path } = splitPathQuery(url)
      return map.get(path) ?? null
    },
    add(entries) {
      for (const [key, value] of Object.entries(entries)) {
        if (typeof value === 'string' && value.length > 0) map.set(normalizeMediaKey(key), value)
      }
    },
    size() {
      return map.size
    },
  }
}

function rewriteUrl(registry: MediaRegistry, value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value
  if (!isWhalePath(value)) return value
  return registry.resolve(value) ?? value
}

export function installMediaShim(registry: MediaRegistry): void {
  const imgDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
  if (imgDescriptor?.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      enumerable: imgDescriptor.enumerable,
      get: imgDescriptor.get,
      set(value: string) {
        imgDescriptor.set!.call(this, rewriteUrl(registry, value))
      },
    })
  }

  const audioDescriptor = Object.getOwnPropertyDescriptor(HTMLAudioElement.prototype, 'src')
  if (audioDescriptor?.set) {
    Object.defineProperty(HTMLAudioElement.prototype, 'src', {
      configurable: true,
      enumerable: audioDescriptor.enumerable,
      get: audioDescriptor.get,
      set(value: string) {
        audioDescriptor.set!.call(this, rewriteUrl(registry, value))
      },
    })
  }

  const sourceDescriptor = Object.getOwnPropertyDescriptor(HTMLSourceElement.prototype, 'src')
  if (sourceDescriptor?.set) {
    Object.defineProperty(HTMLSourceElement.prototype, 'src', {
      configurable: true,
      enumerable: sourceDescriptor.enumerable,
      get: sourceDescriptor.get,
      set(value: string) {
        sourceDescriptor.set!.call(this, rewriteUrl(registry, value))
      },
    })
  }

  const NativeAudio = window.Audio
  window.Audio = function (this: HTMLAudioElement, src?: string) {
    const el = new NativeAudio()
    if (typeof src === 'string') el.src = src
    return el
  } as unknown as typeof window.Audio
  window.Audio.prototype = NativeAudio.prototype

  window.addEventListener('dshw:event', ((event: CustomEvent) => {
    const detail = event.detail as { name?: string; payload?: unknown }
    if (detail?.name !== MEDIA_EVENT_NAME) return
    if (detail.payload && typeof detail.payload === 'object') {
      registry.add(detail.payload as Record<string, string>)
    }
  }) as EventListener)
}

export function readInjectedMediaMap(): Map<string, string> {
  const el = document.getElementById(MEDIA_MAP_ELEMENT_ID)
  return parseMediaMap(el?.textContent ?? '')
}

export function installShims(): { bridge: WhaleBridge; media: MediaRegistry } {
  const media = createMediaRegistry(readInjectedMediaMap())
  installFetchShim()
  installMediaShim(media)
  return { bridge: getBridge(), media }
}
```

其中 `patch` 辅助函数未被使用（上面三处是显式写的），删掉它以免 `noUnusedLocals` 报错——**最终版本不含 `patch` 函数与末尾的 `void patch`**。

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 3: 构建确认能打包为 IIFE**

Run: `npm run build`
Expected: 输出包含 `dist/dshw-shim.js`，无警告。

- [ ] **Step 4: 跑全量测试确认没破坏纯逻辑**

Run: `npm run test`
Expected: PASS（registry 15 + shim 12）。

- [ ] **Step 5: Commit**

```bash
git add src/webview/shim.ts
git commit -m "feat(webview): fetch shim 合成 Response 与媒体 URL 改写"
```

---

## Task 6: WebviewHost 抽象与 CSP HTML

**Files:**
- Create: `src/webview/host.ts`, `test/host.test.ts`

- [ ] **Step 1: 写失败测试 `test/host.test.ts`**

`buildHtml` 接收已解析好的 URI 字符串，因此可脱离 VSCode 测试。

```ts
import { describe, expect, it } from 'vitest'
import { buildCsp, buildHtml, MEDIA_MAP_ELEMENT_ID } from '../src/webview/host'

const uris = {
  shim: 'vscode-webview-resource://x/dist/dshw-shim.js',
  probe: 'vscode-webview-resource://x/dist/probe.js',
  media: 'vscode-webview-resource://x/media',
}

describe('buildCsp', () => {
  it('禁止默认来源，只放行 nonce 脚本与 cspSource 资源', () => {
    const csp = buildCsp('vscode-webview-resource://x', 'NONCE123')
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'nonce-NONCE123'")
    expect(csp).toContain('img-src vscode-webview-resource://x data:')
    expect(csp).toContain('media-src vscode-webview-resource://x blob:')
    expect(csp).toContain("connect-src 'none'")
  })
})

describe('buildHtml', () => {
  it('注入两个脚本并带 nonce', () => {
    const html = buildHtml({ cspSource: 'vscode-webview-resource://x', nonce: 'NONCE123', uris, mediaMap: {} })
    expect(html).toContain('<script nonce="NONCE123" src="vscode-webview-resource://x/dist/dshw-shim.js"></script>')
    expect(html).toContain('<script nonce="NONCE123" src="vscode-webview-resource://x/dist/probe.js"></script>')
  })

  it('shim 排在 probe 之前（probe 依赖 shim 先装好）', () => {
    const html = buildHtml({ cspSource: 'c', nonce: 'n', uris, mediaMap: {} })
    expect(html.indexOf('dshw-shim.js')).toBeLessThan(html.indexOf('probe.js'))
  })

  it('媒体映射以 application/json 脚本注入（不执行，故不受 CSP 限制）', () => {
    const html = buildHtml({
      cspSource: 'c', nonce: 'n', uris,
      mediaMap: { '/dsh-whale/image.png': 'vscode-webview-resource://x/media/placeholder-whale.png' },
    })
    expect(html).toContain(`<script type="application/json" id="${MEDIA_MAP_ELEMENT_ID}">`)
    expect(html).toContain('placeholder-whale.png')
  })

  it('转义 JSON 里的尖括号，避免提前闭合脚本标签', () => {
    const html = buildHtml({ cspSource: 'c', nonce: 'n', uris, mediaMap: { '/a</script>': 'u' } })
    expect(html).not.toContain('</script><')
    expect(html).toContain('\\u003c/script>')
  })

  it('带上 CSP meta 与本扩展的资源根', () => {
    const html = buildHtml({ cspSource: 'vscode-webview-resource://x', nonce: 'n', uris, mediaMap: {} })
    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain('img-src vscode-webview-resource://x')
  })

  it('包含探针挂载点', () => {
    const html = buildHtml({ cspSource: 'c', nonce: 'n', uris, mediaMap: {} })
    expect(html).toContain('id="probe"')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/host.test.ts`
Expected: FAIL — 无法解析 `../src/webview/host`。

- [ ] **Step 3: 实现 `src/webview/host.ts`**

```ts
import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'
import {
  CHANNEL, RouteTable, decodeRequest, encodeEvent, encodeResponse,
} from '../routes/registry'
import { MEDIA_MAP_ELEMENT_ID } from './shim'

export interface HtmlUris {
  shim: string
  probe: string
  media: string
}

export interface BuildHtmlInput {
  cspSource: string
  nonce: string
  uris: HtmlUris
  mediaMap: Record<string, string>
}

export function buildCsp(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data:`,
    `media-src ${cspSource} blob:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `connect-src 'none'`,
  ].join('; ')
}

function escapeJsonForScript(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

export function buildHtml(input: BuildHtmlInput): string {
  const { cspSource, nonce, uris, mediaMap } = input
  const csp = buildCsp(cspSource, nonce)
  const mediaJson = escapeJsonForScript(JSON.stringify(mediaMap))
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>小鲸鱼</title>
<style>
  body { margin: 0; padding: 8px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
</style>
</head>
<body>
<div id="probe">正在自检…</div>
<script type="application/json" id="${MEDIA_MAP_ELEMENT_ID}">${mediaJson}</script>
<script nonce="${nonce}" src="${uris.shim}"></script>
<script nonce="${nonce}" src="${uris.probe}"></script>
</body>
</html>`
}

export interface HostOptions {
  extensionUri: vscode.Uri
  routeTable: RouteTable
  mediaMap: () => Record<string, string>
  log: (line: string) => void
}

interface Attachable {
  webview: vscode.Webview
  onDidReceiveMessage?: (cb: (message: unknown) => void) => vscode.Disposable
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
    webview.html = buildHtml({
      cspSource: webview.cspSource,
      nonce,
      uris: {
        shim: webview.asWebviewUri(vscode.Uri.joinPath(this.options.extensionUri, 'dist', 'dshw-shim.js')).toString(),
        probe: webview.asWebviewUri(vscode.Uri.joinPath(this.options.extensionUri, 'dist', 'probe.js')).toString(),
        media: webview.asWebviewUri(vscode.Uri.joinPath(this.options.extensionUri, 'media')).toString(),
      },
      mediaMap: this.options.mediaMap(),
    })
    this.targets.add(webview)
    if (target.onDidReceiveMessage) {
      this.disposables.push(target.onDidReceiveMessage(msg => { void this.handle(webview, msg) }))
    }
  }

  detach(webview: vscode.Webview): void {
    this.targets.delete(webview)
  }

  broadcast(name: string, payload: unknown): void {
    const env = encodeEvent(name, payload)
    for (const webview of this.targets) void webview.postMessage(env)
  }

  private async handle(webview: vscode.Webview, raw: unknown): Promise<void> {
    const req = decodeRequest(raw)
    if (!req) return
    const res = await this.options.routeTable.dispatch(req)
    if (res.status >= 400) {
      this.options.log(`route ${req.method} ${req.path} -> ${res.status}`)
    }
    const id = (raw as { id?: number }).id
    if (typeof id !== 'number') return
    void webview.postMessage(encodeResponse(id, res))
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/host.test.ts`
Expected: PASS，7 个测试全绿。

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add src/webview/host.ts test/host.test.ts
git commit -m "feat(webview): WebviewHost 抽象与 CSP/nonce HTML 生成"
```

---

## Task 7: 探针前端与侧边栏注册 → **M1 人工验收**

**Files:**
- Create: `src/webview/probe.ts`, `src/webview/sidebar.ts`, `src/log.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: 写 `src/webview/probe.ts`**

探针同时验证两件事：媒体 shim（`img.src` 改写）与 fetch shim（合成 `Response` 的 `.json()` / `.ok` / `.status`）。

```ts
import { installShims } from './shim'

const root = document.getElementById('probe')
const lines: string[] = []

function report(label: string, ok: boolean, detail: string): void {
  const icon = ok ? '✅' : '❌'
  lines.push(`${icon} ${label} — ${detail}`)
}

async function run(): Promise<void> {
  installShims()

  // 媒体 shim：把 /dsh-whale/image.png 改写成 asWebviewUri
  const img = document.createElement('img')
  img.width = 96
  img.height = 96
  const loaded = new Promise<boolean>(resolve => {
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
  })
  img.src = '/dsh-whale/image.png?v=2'
  document.body.appendChild(img)
  const mediaOk = await loaded
  report('媒体 shim', mediaOk, mediaOk ? `已改写为 ${img.src.slice(0, 48)}…` : '图片加载失败')
  report('媒体 URL 已不在 /dsh-whale 前缀', !img.src.startsWith('/dsh-whale/'), img.src.slice(0, 64))

  // fetch shim：合成 Response 的语义
  try {
    const res = await fetch('/dsh-whale/balance.json', { cache: 'no-store' })
    report('fetch shim 返回 Response', res instanceof Response, res.constructor.name)
    report('response.status 可读', typeof res.status === 'number', `status=${res.status}`)
    report('response.ok 正确', res.ok === (res.status >= 200 && res.status < 300), `ok=${res.ok}`)
    const data = await res.json() as { ok?: boolean }
    report('response.json() 可解析', typeof data === 'object' && data !== null, JSON.stringify(data).slice(0, 120))
  } catch (err) {
    report('fetch shim', false, err instanceof Error ? err.message : String(err))
  }

  // PUT 路径
  try {
    const res = await fetch('/dsh-whale/size.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ probe: true }),
    })
    const data = await res.json() as { ok?: boolean }
    report('PUT 透传', res.status === 200 && data.ok === true, `status=${res.status} body=${JSON.stringify(data).slice(0, 80)}`)
  } catch (err) {
    report('PUT 透传', false, err instanceof Error ? err.message : String(err))
  }

  if (root) {
    root.innerHTML = `<pre style="white-space:pre-wrap;font-size:12px;line-height:1.6">${lines.join('\n')}</pre>`
  }
}

void run()
```

- [ ] **Step 2: 写 `src/log.ts`**

```ts
import * as vscode from 'vscode'

let channel: vscode.OutputChannel | null = null

export function log(line: string): void {
  if (!channel) channel = vscode.window.createOutputChannel('鲸鱼记账挂件')
  const stamp = new Date().toISOString().slice(11, 19)
  channel.appendLine(`[${stamp}] ${line}`)
}

export function showLog(): void {
  if (!channel) channel = vscode.window.createOutputChannel('鲸鱼记账挂件')
  channel.show(true)
}

export function disposeLog(): void {
  channel?.dispose()
  channel = null
}
```

- [ ] **Step 3: 写 `src/webview/sidebar.ts`**

```ts
import * as vscode from 'vscode'
import { WebviewHost } from './host'

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
```

- [ ] **Step 4: 改 `src/extension.ts` 接线（三条路由此处先用存根，Task 13 换实现）**

```ts
import * as vscode from 'vscode'
import { RouteTable, jsonResponse } from './routes/registry'
import { WebviewHost } from './webview/host'
import { registerSidebar } from './webview/sidebar'
import { log, showLog } from './log'

export function activate(context: vscode.ExtensionContext): void {
  const routeTable = new RouteTable()

  // Task 13 会用真实实现替换下面两条存根
  routeTable.register('/dsh-whale/balance.json', () =>
    jsonResponse({ ok: true, totalBalance: 0, currency: 'CNY', todayUsage: null, stub: true }))

  routeTable.register('/dsh-whale/size.json', req => {
    if (req.method === 'PUT') return jsonResponse({ ok: true })
    return jsonResponse({})
  })

  const host = new WebviewHost({
    extensionUri: context.extensionUri,
    routeTable,
    mediaMap: () => ({
      '/dsh-whale/image.png': host.asMediaUri('placeholder-whale.png'),
    }),
    log,
  })

  registerSidebar(context, host)

  context.subscriptions.push(
    vscode.commands.registerCommand('whale.showLog', showLog),
    vscode.commands.registerCommand('whale.refresh', () => {
      host.broadcast('probe', { at: Date.now() })
    })
  )
}

export function deactivate(): void {}
```

- [ ] **Step 5: 让媒体映射按 webview 会话计算**

媒体 URI 依赖具体 webview 会话（不同 session 的 host 组件不同），所以 `HostOptions.mediaMap` 不能是静态对象，而要是一个**接收「文件名 → URI」工厂、返回映射表**的函数，由 `attach()` 在每次挂载时调用。

因此回到 Task 6 的 `src/webview/host.ts`，把 `HostOptions.mediaMap` 的签名改为：

```ts
  mediaMap: (mediaUri: (fileName: string) => string) => Record<string, string>
```

并把 `attach()` 里构造 HTML 的那一处改成：

```ts
      mediaMap: this.options.mediaMap(
        fileName => webview.asWebviewUri(vscode.Uri.joinPath(this.options.extensionUri, 'media', fileName)).toString()
      ),
```

`test/host.test.ts` 只测 `buildHtml` / `buildCsp`，不涉及 `WebviewHost`，**无需改动**。

- [ ] **Step 6: 构建**

Run: `npm run build`
Expected: 三个 dist 文件产出，无错误。

- [ ] **Step 7: 跑测试**

Run: `npm run test`
Expected: PASS（38 个测试）。

- [ ] **Step 8: 🔍 M1 人工验收（关键的探针环节）**

1. 在 VSCode 里打开 `D:\github_project\vscode_whale_widget`
2. 按 `F5` → 弹出扩展开发宿主窗口
3. 在宿主窗口点左侧 Activity Bar 的鲸鱼图标
4. 侧边栏应出现：**一张蓝色占位鲸鱼图** + 一段自检报告

Expected（逐条核对，这是 spec §4.1 M1 的验收）：
```
✅ 媒体 shim — 已改写为 vscode-webview-resource://…
✅ 媒体 URL 已不在 /dsh-whale 前缀
✅ fetch shim 返回 Response — Response
✅ response.status 可读 — status=200
✅ response.ok 正确 — ok=true
✅ response.json() 可解析 — {"ok":true,...}
✅ PUT 透传 — status=200 body={"ok":true}
```

**若出现 ❌**：把整段报告与宿主窗口的 `帮助 → 切换开发人员工具 → Console` 报错贴出来，**不要继续 Task 8**——M1 的失败意味着分治桥方案需要重新设计。

- [ ] **Step 9: 把 M1 结论写进 spec §12**

把 spec `2026-09-19-skeleton-and-bridge-design.md` §12 表格中「webview CSP 对 blob / data URL 的限制 | M1 验证」一行的状态改为实测结果（`已验证` 或失败记录）。

- [ ] **Step 10: Commit**

```bash
git add src/ test/ docs/
git commit -m "feat(webview): 探针前端与侧边栏注册，M1 验收通过

媒体 shim 与 fetch shim 在真实 VSCode webview 中验证成立：
- img.src 被改写为 asWebviewUri 并可正常加载
- shim 合成的 Response 具备 status/ok/json() 正确语义
- PUT 请求的 method 与 body 正确透传"
```

---

# 阶段 B · M2 完整骨架

## Task 8: 搬运记账内核（逐字节 + 行为保证）

**Files:**
- Create: `src/core/accounting.mjs`（从上游复制）, `src/core/accounting.d.mts`, `test/accounting.test.ts`

- [ ] **Step 1: 复制内核并校验逐字节一致**

Run:
```bash
curl -sL "https://codeload.github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/tar.gz/refs/heads/main" -o /tmp/upstream.tgz
mkdir -p /tmp/upstream && tar xzf /tmp/upstream.tgz -C /tmp/upstream
cp /tmp/upstream/DeepSeek-Balance-Whale-Widget-main/lib/accounting.mjs src/core/accounting.mjs
mkdir -p src/core
cp /tmp/upstream/DeepSeek-Balance-Whale-Widget-main/lib/accounting.mjs src/core/accounting.mjs
sha256sum /tmp/upstream/DeepSeek-Balance-Whale-Widget-main/lib/accounting.mjs src/core/accounting.mjs
```

Expected: 两行 **sha256 完全相同**。

- [ ] **Step 2: 写 `src/core/accounting.d.mts`**

```ts
export declare const ACCOUNTING_VERSION: 1

export interface Ledger {
  accounting?: {
    version: number
    active: string
    books: Record<string, Book>
    migratedAt?: number
    legacyHistory?: Record<string, number>
  }
  date?: string
  dayStart?: number
  lastBalance?: number
  todayUsage?: number
  history?: Record<string, number>
  events?: { day: string; cost: number }[]
  [key: string]: unknown
}

export interface Book {
  currency: string
  days: Record<string, DayRow>
  lastAt?: number
}

export interface DayRow {
  day: string
  firstAt: number
  lastAt: number
  openingUnits: number
  lastUnits: number
  debitUnits: number
  creditUnits: number
  revision: number
  correction: unknown
}

export interface BalanceSummary {
  day: string
  amount: number
  currency: string
  source: 'balance-observed' | 'balance-corrected' | 'balance-needs-review'
  label: string
  firstObservedAt: number
  lastObservedAt: number
  openingBalance: number
  currentBalance: number
  observedDecrease: number
  observedIncrease: number
  needsReview: boolean
  partialDay: true
  revision: string
  credits: number | null
  otherDebits: number | null
  correctedAt: number | null
}

export interface BalanceSnapshotInput {
  at?: number
  balance: unknown
  currency?: string
  scope?: string
}

export declare function moneyUnits(value: unknown): number
export declare function preciseMoney(value: unknown): number
export declare function addMoney(a: unknown, b: unknown): number
export declare function sumMoney(values: unknown[]): number
export declare function beijingDay(time?: number): string
export declare function dayOffset(day: string, offset: number): string
export declare function accountingDays(ledger: Ledger): string[]
export declare function balanceSummary(ledger: Ledger, day?: string): BalanceSummary | null
export declare function observeBalance(ledger: Ledger, snapshot: BalanceSnapshotInput): BalanceSummary | null
export declare function reconcileBalance(
  ledger: Ledger,
  input: { day: string; revision: string; action?: string; confirmed?: boolean; credits?: unknown; otherDebits?: unknown },
  now?: number
): BalanceSummary
export declare function eventEstimate(ledger: Ledger, day: string): number
export declare function daySummary(ledger: Ledger, day: string): Record<string, unknown>
```

- [ ] **Step 3: 写失败测试 `test/accounting.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  balanceSummary, beijingDay, moneyUnits, observeBalance, preciseMoney, sumMoney,
} from '../src/core/accounting.mjs'

// 2026-09-19 10:00:00 +08:00
const T0 = Date.parse('2026-09-19T02:00:00Z')
const HOUR = 3600_000

function fresh() {
  return {} as Record<string, unknown>
}

describe('定点金额', () => {
  it('8 位小数精确往返', () => {
    expect(preciseMoney('0.00000001')).toBe(0.00000001)
    expect(moneyUnits('23.45')).toBe(2345000000)
  })

  it('求和避免浮点误差', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
  })

  it('非法金额抛错', () => {
    expect(() => moneyUnits('abc')).toThrow()
    expect(() => moneyUnits(Infinity)).toThrow()
  })
})

describe('beijingDay', () => {
  it('按北京时间切日', () => {
    expect(beijingDay(Date.parse('2026-09-18T16:00:00Z'))).toBe('2026-09-19')
    expect(beijingDay(Date.parse('2026-09-18T15:59:59Z'))).toBe('2026-09-18')
  })
})

describe('observeBalance', () => {
  it('首次观测只建立起点，消费为 0', () => {
    const ledger = fresh()
    const s = observeBalance(ledger, { at: T0, balance: 100, currency: 'CNY', scope: 'deepseek' })
    expect(s?.amount).toBe(0)
    expect(s?.openingBalance).toBe(100)
    expect(s?.currentBalance).toBe(100)
  })

  it('余额下降计为消费', () => {
    const ledger = fresh()
    observeBalance(ledger, { at: T0, balance: 100, currency: 'CNY', scope: 'deepseek' })
    const s = observeBalance(ledger, { at: T0 + HOUR, balance: 97.5, currency: 'CNY', scope: 'deepseek' })
    expect(s?.amount).toBe(2.5)
    expect(s?.observedDecrease).toBe(2.5)
  })

  it('余额上升（充值）不冲抵已有消费', () => {
    const ledger = fresh()
    observeBalance(ledger, { at: T0, balance: 100, currency: 'CNY', scope: 'deepseek' })
    observeBalance(ledger, { at: T0 + HOUR, balance: 97.5, currency: 'CNY', scope: 'deepseek' })
    const s = observeBalance(ledger, { at: T0 + 2 * HOUR, balance: 197.5, currency: 'CNY', scope: 'deepseek' })
    expect(s?.amount).toBe(2.5)
    expect(s?.observedIncrease).toBe(100)
    expect(s?.needsReview).toBe(true)
  })

  it('重复或乱序的观测被忽略', () => {
    const ledger = fresh()
    observeBalance(ledger, { at: T0, balance: 100, currency: 'CNY', scope: 'deepseek' })
    const s = observeBalance(ledger, { at: T0 - HOUR, balance: 50, currency: 'CNY', scope: 'deepseek' })
    expect(s?.currentBalance).toBe(100)
  })

  it('不同币种互不干扰', () => {
    const ledger = fresh()
    observeBalance(ledger, { at: T0, balance: 100, currency: 'CNY', scope: 'deepseek' })
    const s = observeBalance(ledger, { at: T0 + HOUR, balance: 10, currency: 'USD', scope: 'deepseek' })
    expect(s?.currency).toBe('USD')
    expect(s?.amount).toBe(0)
    expect(balanceSummary(ledger, beijingDay(T0 + HOUR))?.currency).toBe('USD')
  })

  it('非法币种抛错', () => {
    expect(() => observeBalance(fresh(), { at: T0, balance: 1, currency: 'RMB', scope: 'x' })).toThrow()
  })
})
```

- [ ] **Step 4: 运行测试确认通过（内核是既有的，所以直接应为 PASS）**

Run: `npx vitest run test/accounting.test.ts`
Expected: PASS。若有 FAIL，说明搬运或 `.d.ts` 有误，修正后再继续。

- [ ] **Step 5: 类型检查（确认 `.d.ts` 与实现匹配）**

Run: `npm run typecheck`
Expected: 无错误。若 `.d.ts` 与实际签名不符，TS 会在此报错。

- [ ] **Step 6: Commit**

```bash
git add src/core/accounting.mjs src/core/accounting.d.mts test/accounting.test.ts
git commit -m "feat(core): 搬运上游记账内核（逐字节一致）+ 类型声明与行为测试

来源 MeteorNOX/DeepSeek-Balance-Whale-Widget (MIT, Copyright (c) 2026 MeteorNOX)
文件未做任何修改，见 NOTICE.md"
```

---

## Task 9: 文件存储与账本（原子写）

**Files:**
- Create: `src/core/store.ts`, `src/core/ledger.ts`, `test/store.test.ts`

- [ ] **Step 1: 写失败测试 `test/store.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileStore } from '../src/core/store'

const dirs: string[] = []

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dshw-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('FileStore', () => {
  it('写入后可读回', async () => {
    const store = new FileStore(scratch())
    await store.writeText('a.json', '{"x":1}')
    expect(await store.readText('a.json')).toBe('{"x":1}')
  })

  it('读取不存在的文件返回 null', async () => {
    const store = new FileStore(scratch())
    expect(await store.readText('nope.json')).toBeNull()
  })

  it('目录不存在时自动创建', async () => {
    const store = new FileStore(join(scratch(), 'deep', 'nested'))
    await store.writeText('a.txt', 'hi')
    expect(await store.readText('a.txt')).toBe('hi')
  })

  it('原子写不留下临时文件', async () => {
    const dir = scratch()
    const store = new FileStore(dir)
    await store.writeText('a.json', '{"x":1}')
    expect(readdirNames(dir).filter(n => n.includes('.tmp'))).toEqual([])
  })

  it('原子写覆盖旧内容', async () => {
    const dir = scratch()
    const store = new FileStore(dir)
    await store.writeText('a.json', '{"x":1}')
    await store.writeText('a.json', '{"x":2}')
    expect(JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8'))).toEqual({ x: 2 })
  })

  it('读 JSON：缺失返回 null，损坏抛错', async () => {
    const store = new FileStore(scratch())
    expect(await store.readJson('none.json')).toBeNull()
    await store.writeText('bad.json', '{oops')
    await expect(store.readJson('bad.json')).rejects.toThrow()
  })
})

function readdirNames(dir: string): string[] {
  return readdirSync(dir)
}
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/store.test.ts`
Expected: FAIL — 无法解析 `../src/core/store`。

- [ ] **Step 3: 实现 `src/core/store.ts`**

```ts
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export class FileStore {
  constructor(private readonly root: string) {}

  private resolve(name: string): string {
    return join(this.root, name)
  }

  async readText(name: string): Promise<string | null> {
    try {
      return await readFile(this.resolve(name), 'utf8')
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  async readJson<T>(name: string): Promise<T | null> {
    const text = await this.readText(name)
    if (text === null) return null
    return JSON.parse(text) as T
  }

  async writeText(name: string, data: string): Promise<void> {
    const target = this.resolve(name)
    await mkdir(dirname(target), { recursive: true })
    const tmp = join(dirname(target), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
    await writeFile(tmp, data, 'utf8')
    await rename(tmp, target)
  }

  async writeJson(name: string, value: unknown): Promise<void> {
    await this.writeText(name, JSON.stringify(value, null, 2))
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/store.test.ts`
Expected: PASS，6 个测试。

- [ ] **Step 5: 写 `src/core/ledger.ts`**

```ts
import type { Ledger } from './accounting.mjs'
import type { FileStore } from './store'

export const LEDGER_FILE = 'ledger.json'

export async function loadLedger(store: FileStore): Promise<Ledger> {
  const raw = await store.readJson<Ledger>(LEDGER_FILE)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw
}

export async function saveLedger(store: FileStore, ledger: Ledger): Promise<void> {
  await store.writeJson(LEDGER_FILE, ledger)
}
```

- [ ] **Step 6: 类型检查 + 提交**

Run: `npm run typecheck`
Expected: 无错误。

```bash
git add src/core/store.ts src/core/ledger.ts test/store.test.ts
git commit -m "feat(core): 文件存储（原子写）与账本读写"
```

---

## Task 10: DeepSeek 余额查询

**Files:**
- Create: `src/provider/types.ts`, `src/provider/deepseek.ts`, `test/deepseek.test.ts`

- [ ] **Step 1: 写 `src/provider/types.ts`**

```ts
export interface BalanceSnapshot {
  balance: number
  currency: string
}

export type BalanceErrorCode = 'AUTH' | 'NETWORK' | 'TIMEOUT' | 'FORMAT'

export class BalanceError extends Error {
  constructor(message: string, readonly code: BalanceErrorCode) {
    super(message)
    this.name = 'BalanceError'
  }
}
```

- [ ] **Step 2: 写失败测试 `test/deepseek.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { BalanceError } from '../src/provider/types'
import { DEEPSEEK_BALANCE_URL, fetchBalance, parseBalanceResponse } from '../src/provider/deepseek'

const OK_BODY = {
  is_available: true,
  balance_infos: [
    { currency: 'CNY', total_balance: '23.45', granted_balance: '0.00', topped_up_balance: '23.45' },
  ],
}

describe('parseBalanceResponse', () => {
  it('解析字符串金额与币种', () => {
    expect(parseBalanceResponse(OK_BODY)).toEqual({ balance: 23.45, currency: 'CNY' })
  })

  it('币种大写化', () => {
    expect(parseBalanceResponse({ balance_infos: [{ currency: 'usd', total_balance: '1' }] }))
      .toEqual({ balance: 1, currency: 'USD' })
  })

  it('缺少币种时默认 CNY', () => {
    expect(parseBalanceResponse({ balance_infos: [{ total_balance: '1' }] }))
      .toEqual({ balance: 1, currency: 'CNY' })
  })

  it('缺少 balance_infos 抛 FORMAT', () => {
    expect(() => parseBalanceResponse({})).toThrow(BalanceError)
    try { parseBalanceResponse({}) } catch (err) { expect((err as BalanceError).code).toBe('FORMAT') }
  })

  it('空数组抛 FORMAT', () => {
    expect(() => parseBalanceResponse({ balance_infos: [] })).toThrow(BalanceError)
  })

  it('金额非法抛 FORMAT', () => {
    expect(() => parseBalanceResponse({ balance_infos: [{ total_balance: 'abc' }] })).toThrow(BalanceError)
  })

  it('非对象抛 FORMAT', () => {
    expect(() => parseBalanceResponse(null)).toThrow(BalanceError)
    expect(() => parseBalanceResponse('x')).toThrow(BalanceError)
  })
})

describe('fetchBalance', () => {
  it('带上 Bearer 头请求正确地址', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify(OK_BODY), { status: 200 })
    }) as unknown as typeof fetch
    const snap = await fetchBalance({ key: 'sk-test', fetchImpl: fake })
    expect(snap).toEqual({ balance: 23.45, currency: 'CNY' })
    expect(calls[0]?.url).toBe(DEEPSEEK_BALANCE_URL)
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('401 抛 AUTH', async () => {
    const fake = (async () => new Response('{"error":"bad key"}', { status: 401 })) as unknown as typeof fetch
    await expect(fetchBalance({ key: 'x', fetchImpl: fake })).rejects.toMatchObject({ code: 'AUTH' })
  })

  it('5xx 抛 NETWORK', async () => {
    const fake = (async () => new Response('oops', { status: 503 })) as unknown as typeof fetch
    await expect(fetchBalance({ key: 'x', fetchImpl: fake })).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('网络异常抛 NETWORK', async () => {
    const fake = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    await expect(fetchBalance({ key: 'x', fetchImpl: fake })).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('超时抛 TIMEOUT', async () => {
    const fake = ((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch
    await expect(fetchBalance({ key: 'x', fetchImpl: fake, timeoutMs: 5 })).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('非 JSON 响应抛 FORMAT', async () => {
    const fake = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    await expect(fetchBalance({ key: 'x', fetchImpl: fake })).rejects.toMatchObject({ code: 'FORMAT' })
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run test/deepseek.test.ts`
Expected: FAIL — 无法解析 `../src/provider/deepseek`。

- [ ] **Step 4: 实现 `src/provider/deepseek.ts`**

```ts
import { BalanceError, type BalanceSnapshot } from './types'

export const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance'
export const DEFAULT_TIMEOUT_MS = 8000

export interface FetchBalanceOptions {
  key: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  url?: string
}

export function parseBalanceResponse(raw: unknown): BalanceSnapshot {
  if (!raw || typeof raw !== 'object') {
    throw new BalanceError('响应不是对象', 'FORMAT')
  }
  const infos = (raw as { balance_infos?: unknown }).balance_infos
  if (!Array.isArray(infos) || infos.length === 0) {
    throw new BalanceError('响应缺少 balance_infos', 'FORMAT')
  }
  const first = infos[0] as { total_balance?: unknown; currency?: unknown }
  const balance = Number(first?.total_balance)
  if (!Number.isFinite(balance)) {
    throw new BalanceError(`total_balance 不是有效数字：${String(first?.total_balance)}`, 'FORMAT')
  }
  const currency = String(first?.currency ?? 'CNY').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BalanceError(`币种无效：${currency}`, 'FORMAT')
  }
  return { balance, currency }
}

export async function fetchBalance(options: FetchBalanceOptions): Promise<BalanceSnapshot> {
  const doFetch = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await doFetch(options.url ?? DEEPSEEK_BALANCE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.key}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
  } catch (err) {
    const aborted = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
    throw new BalanceError(aborted ? `请求超时（${timeoutMs}ms）` : `网络请求失败：${messageOf(err)}`, aborted ? 'TIMEOUT' : 'NETWORK')
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401 || response.status === 403) {
    throw new BalanceError('API Key 无效或无权限', 'AUTH')
  }
  if (!response.ok) {
    throw new BalanceError(`HTTP ${response.status}`, 'NETWORK')
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BalanceError(`响应不是 JSON：${text.slice(0, 500)}`, 'FORMAT')
  }
  return parseBalanceResponse(parsed)
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run test/deepseek.test.ts`
Expected: PASS，13 个测试。

- [ ] **Step 6: Commit**

```bash
git add src/provider/ test/deepseek.test.ts
git commit -m "feat(provider): DeepSeek 余额查询与响应解析"
```

---

## Task 11: 密钥解析链

**Files:**
- Create: `src/credentials.ts`, `test/credentials.test.ts`

- [ ] **Step 1: 写失败测试 `test/credentials.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { KEY_SECRET_NAME, keyFromEnv, resolveKey, type SecretStore } from '../src/credentials'

function secrets(initial: Record<string, string> = {}): SecretStore & { store: Record<string, string> } {
  return {
    store: { ...initial },
    async get(key) { return this.store[key] },
    async set(key, value) { this.store[key] = value },
    async delete(key) { delete this.store[key] },
  } as SecretStore & { store: Record<string, string> }
}

const noEnv = () => undefined

describe('keyFromEnv', () => {
  it('读取非空环境变量', () => {
    expect(keyFromEnv(n => (n === 'K' ? 'sk-a' : undefined), 'K')).toBe('sk-a')
  })

  it('去空白', () => {
    expect(keyFromEnv(() => '  sk-a  ', 'K')).toBe('sk-a')
  })

  it('空串与纯空白视为未配置', () => {
    expect(keyFromEnv(() => '', 'K')).toBeNull()
    expect(keyFromEnv(() => '   ', 'K')).toBeNull()
  })

  it('未定义视为未配置', () => {
    expect(keyFromEnv(noEnv, 'K')).toBeNull()
  })
})

describe('resolveKey', () => {
  it('SecretStorage 优先于环境变量', async () => {
    const result = await resolveKey({
      secrets: secrets({ [KEY_SECRET_NAME]: 'sk-secret' }),
      getenv: () => 'sk-env',
      envVarName: 'K',
    })
    expect(result).toEqual({ key: 'sk-secret', source: 'secret' })
  })

  it('SecretStorage 为空时回退到环境变量', async () => {
    const result = await resolveKey({ secrets: secrets(), getenv: () => 'sk-env', envVarName: 'K' })
    expect(result).toEqual({ key: 'sk-env', source: 'env' })
  })

  it('SecretStorage 只有空白时回退到环境变量', async () => {
    const result = await resolveKey({
      secrets: secrets({ [KEY_SECRET_NAME]: '   ' }),
      getenv: () => 'sk-env',
      envVarName: 'K',
    })
    expect(result).toEqual({ key: 'sk-env', source: 'env' })
  })

  it('两者都没有返回 null', async () => {
    expect(await resolveKey({ secrets: secrets(), getenv: noEnv, envVarName: 'K' })).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/credentials.test.ts`
Expected: FAIL — 无法解析 `../src/credentials`。

- [ ] **Step 3: 实现 `src/credentials.ts`**

```ts
import * as vscode from 'vscode'

export const KEY_SECRET_NAME = 'vscode-whale-widget.deepseekApiKey'

export interface SecretStore {
  get(key: string): Promise<string | undefined>
  store(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface KeySource {
  key: string
  source: 'secret' | 'env'
}

export interface ResolveInput {
  secrets: SecretStore
  getenv: (name: string) => string | undefined
  envVarName: string
}

export function nonEmpty(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function keyFromEnv(getenv: (name: string) => string | undefined, envVarName: string): string | null {
  return nonEmpty(getenv(envVarName))
}

export async function resolveKey(input: ResolveInput): Promise<KeySource | null> {
  const stored = nonEmpty(await input.secrets.get(KEY_SECRET_NAME))
  if (stored) return { key: stored, source: 'secret' }
  const fromEnv = keyFromEnv(input.getenv, input.envVarName)
  return fromEnv ? { key: fromEnv, source: 'env' } : null
}

export class Credentials {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private get envVarName(): string {
    return vscode.workspace.getConfiguration('whaleWidget').get<string>('envVarName', 'DEEPSEEK_API_KEY')
  }

  resolve(): Promise<KeySource | null> {
    return resolveKey({
      secrets: this.context.secrets,
      getenv: name => process.env[name],
      envVarName: this.envVarName,
    })
  }

  async set(key: string): Promise<void> {
    await this.context.secrets.store(KEY_SECRET_NAME, key.trim())
  }

  async clear(): Promise<void> {
    await this.context.secrets.delete(KEY_SECRET_NAME)
  }

  async promptAndStore(): Promise<boolean> {
    const value = await vscode.window.showInputBox({
      title: 'DeepSeek API Key',
      prompt: '只写入系统凭据管理器（VSCode SecretStorage），不会落进任何配置文件',
      placeHolder: 'sk-…',
      password: true,
      ignoreFocusOut: true,
      validateInput: input => (nonEmpty(input) ? undefined : '不能为空'),
    })
    if (value === undefined) return false
    await this.set(value)
    return true
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/credentials.test.ts`
Expected: PASS，8 个测试。

- [ ] **Step 5: Commit**

```bash
git add src/credentials.ts test/credentials.test.ts
git commit -m "feat(credentials): SecretStorage 优先、环境变量回退的密钥解析链"
```

---

## Task 12: 刷新编排

**Files:**
- Create: `src/core/refresh.ts`, `test/refresh.test.ts`

这是让验收标准 4（密钥错）与 5（断网沿用旧值）可被自动测试的关键模块。

- [ ] **Step 1: 写失败测试 `test/refresh.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { FileStore } from '../src/core/store'
import { createRefresher } from '../src/core/refresh'
import { BalanceError } from '../src/provider/types'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const T0 = Date.parse('2026-09-19T02:00:00Z')

function deps(overrides: Partial<Parameters<typeof createRefresher>[0]> = {}) {
  return {
    resolveKey: async () => ({ key: 'sk-a', source: 'secret' as const }),
    fetchBalance: async () => ({ balance: 100, currency: 'CNY' }),
    store: new FileStore(mkdtempSync(join(tmpdir(), 'dshw-r-'))),
    now: () => T0,
    log: () => {},
    ...overrides,
  }
}

describe('createRefresher', () => {
  it('首次成功返回 ok 且今日消费为 0', async () => {
    const refresh = createRefresher(deps())
    const result = await refresh()
    expect(result.state).toBe('ok')
    expect(result.balance).toBe(100)
    expect(result.todayUsage).toBe(0)
    expect(result.stale).toBe(false)
  })

  it('没有密钥时返回 no-key', async () => {
    const refresh = createRefresher(deps({ resolveKey: async () => null }))
    expect((await refresh()).state).toBe('no-key')
  })

  it('密钥无效时返回 auth-error', async () => {
    const refresh = createRefresher(deps({
      fetchBalance: async () => { throw new BalanceError('bad', 'AUTH') },
    }))
    expect((await refresh()).state).toBe('auth-error')
  })

  it('网络失败且无历史时返回 network-error', async () => {
    const refresh = createRefresher(deps({
      fetchBalance: async () => { throw new BalanceError('down', 'NETWORK') },
    }))
    const result = await refresh()
    expect(result.state).toBe('network-error')
    expect(result.balance).toBeUndefined()
  })

  it('网络失败但已有历史时沿用旧值并标 stale', async () => {
    let fail = false
    const refresh = createRefresher(deps({
      fetchBalance: async () => {
        if (fail) throw new BalanceError('down', 'NETWORK')
        return { balance: 88.8, currency: 'CNY' }
      },
    }))
    await refresh()
    fail = true
    const result = await refresh()
    expect(result.state).toBe('ok')
    expect(result.balance).toBe(88.8)
    expect(result.stale).toBe(true)
  })

  it('恢复后 stale 变回 false', async () => {
    let fail = false
    const refresh = createRefresher(deps({
      fetchBalance: async () => {
        if (fail) throw new BalanceError('down', 'NETWORK')
        return { balance: 50, currency: 'CNY' }
      },
    }))
    await refresh()
    fail = true
    await refresh()
    fail = false
    expect((await refresh()).stale).toBe(false)
  })

  it('余额下降后今日消费被累计', async () => {
    let balance = 100
    const refresh = createRefresher(deps({
      fetchBalance: async () => ({ balance, currency: 'CNY' }),
      now: () => T0,
    }))
    await refresh()
    balance = 90
    const result = await refresh()
    expect(result.todayUsage).toBe(10)
  })

  it('账本写入失败不阻塞返回', async () => {
    const store = new FileStore(mkdtempSync(join(tmpdir(), 'dshw-r-')))
    store.writeJson = async () => { throw new Error('disk full') }
    const logged: string[] = []
    const refresh = createRefresher(deps({ store, log: line => logged.push(line) }))
    const result = await refresh()
    expect(result.state).toBe('ok')
    expect(logged.some(l => l.includes('落盘失败'))).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/refresh.test.ts`
Expected: FAIL — 无法解析 `../src/core/refresh`。

- [ ] **Step 3: 实现 `src/core/refresh.ts`**

```ts
import { observeBalance, balanceSummary, beijingDay } from './accounting.mjs'
import { loadLedger, saveLedger } from './ledger'
import type { FileStore } from './store'
import { BalanceError, type BalanceSnapshot } from '../provider/types'
import type { KeySource } from '../credentials'

export type RefreshState = 'ok' | 'no-key' | 'auth-error' | 'network-error'

export interface RefreshResult {
  state: RefreshState
  balance?: number
  currency?: string
  todayUsage?: number | null
  stale?: boolean
  observedAt?: number
  message?: string
}

export interface RefreshDeps {
  resolveKey: () => Promise<KeySource | null>
  fetchBalance: (key: string) => Promise<BalanceSnapshot>
  store: FileStore
  now: () => number
  log: (line: string) => void
  scope?: string
}

export interface Refresher {
  (force?: boolean): Promise<RefreshResult>
  last(): RefreshResult | null
}

export function createRefresher(deps: RefreshDeps): Refresher {
  const scope = deps.scope ?? 'deepseek'
  let cached: RefreshResult | null = null

  const run = async (): Promise<RefreshResult> => {
    const resolved = await deps.resolveKey()
    if (!resolved) {
      cached = { state: 'no-key', message: '未配置 API Key' }
      return cached
    }

    let snapshot: BalanceSnapshot
    try {
      snapshot = await deps.fetchBalance(resolved.key)
    } catch (err) {
      const code = err instanceof BalanceError ? err.code : 'NETWORK'
      const message = err instanceof Error ? err.message : String(err)
      deps.log(`余额拉取失败（${code}）：${message}`)
      if (code === 'AUTH') {
        cached = { state: 'auth-error', message }
        return cached
      }
      if (cached && cached.state === 'ok' && cached.balance !== undefined) {
        cached = { ...cached, stale: true, message }
        return cached
      }
      cached = { state: 'network-error', message }
      return cached
    }

    const at = deps.now()
    const ledger = await loadLedger(deps.store)
    const summary = observeBalance(ledger, {
      at,
      balance: snapshot.balance,
      currency: snapshot.currency,
      scope,
    })
    try {
      await saveLedger(deps.store, ledger)
    } catch (err) {
      deps.log(`落盘失败（不影响显示）：${err instanceof Error ? err.message : String(err)}`)
    }

    const today = summary ?? balanceSummary(ledger, beijingDay(at))
    cached = {
      state: 'ok',
      balance: snapshot.balance,
      currency: snapshot.currency,
      todayUsage: today ? today.amount : null,
      stale: false,
      observedAt: at,
    }
    deps.log(`余额 ${snapshot.balance} ${snapshot.currency}，今日已用 ${cached.todayUsage}`)
    return cached
  }

  const refresher = run as Refresher
  refresher.last = () => cached
  return refresher
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/refresh.test.ts`
Expected: PASS，8 个测试。

> 说明：`createRefresher` 返回的函数**每次调用都会真实拉取**（provider 层无缓存），因此它忽略传入的 `force` 参数。
> 缓存语义由路由层负责：只有 `?refresh=1` 或尚无缓存结果时，路由才会调用它（见 Task 14）。

若「网络失败但已有历史时沿用旧值并标 stale」失败：确认 `fetchBalance` 的失败分支在写入 `cached` 前读取的是上一次的 `cached`（本实现已如此）。

- [ ] **Step 5: 全量测试 + 类型检查**

Run: `npm run test && npm run typecheck`
Expected: 全部 PASS，类型无错误。

- [ ] **Step 6: Commit**

```bash
git add src/core/refresh.ts test/refresh.test.ts
git commit -m "feat(core): 刷新编排（凭据->拉取->记账->落盘，含 stale 沿用旧值）"
```

---

## Task 13: 状态栏渲染

**Files:**
- Create: `src/statusbar.ts`, `test/statusbar.test.ts`

- [ ] **Step 1: 写失败测试 `test/statusbar.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { formatMoney, renderStatus } from '../src/statusbar'

describe('formatMoney', () => {
  it('CNY 用 ¥ 且保留两位', () => {
    expect(formatMoney(23.456, 'CNY')).toBe('¥23.46')
  })

  it('USD 用 $', () => {
    expect(formatMoney(1.5, 'USD')).toBe('$1.50')
  })

  it('其他币种用代码加空格', () => {
    expect(formatMoney(7.1, 'JPY')).toBe('JPY 7.10')
  })

  it('零显示为两位小数', () => {
    expect(formatMoney(0, 'CNY')).toBe('¥0.00')
  })
})

describe('renderStatus', () => {
  it('未配置密钥时提示点击设置', () => {
    const view = renderStatus({ state: 'no-key' })
    expect(view.text).toBe('$(key) 鲸鱼 · 未配置')
    expect(view.command).toBe('whale.setApiKey')
    expect(view.tooltip).toContain('设置')
  })

  it('密钥无效时给出警告图标与刷新入口', () => {
    const view = renderStatus({ state: 'auth-error' })
    expect(view.text).toContain('Key 无效')
    expect(view.text.startsWith('$(alert)')).toBe(true)
    expect(view.command).toBe('whale.setApiKey')
  })

  it('成功时显示余额与今日已用', () => {
    const view = renderStatus({ state: 'ok', balance: 23.45, currency: 'CNY', todayUsage: 1.02 })
    expect(view.text).toBe('🐋 ¥23.45 · 今日 ¥1.02')
    expect(view.command).toBe('whale.refresh')
  })

  it('stale 时前缀 ~', () => {
    const view = renderStatus({ state: 'ok', balance: 23.45, currency: 'CNY', todayUsage: 1.02, stale: true })
    expect(view.text.startsWith('~ ')).toBe(true)
    expect(view.tooltip).toContain('上次')
  })

  it('今日已用未知时显示 --', () => {
    const view = renderStatus({ state: 'ok', balance: 5, currency: 'CNY', todayUsage: null })
    expect(view.text).toBe('🐋 ¥5.00 · 今日 --')
  })

  it('网络异常且无历史值时提示网络', () => {
    const view = renderStatus({ state: 'network-error' })
    expect(view.text).toContain('网络异常')
    expect(view.command).toBe('whale.refresh')
  })

  it('tooltip 带上观测时间与来源', () => {
    const view = renderStatus({
      state: 'ok', balance: 1, currency: 'CNY', todayUsage: 0,
      observedAt: Date.parse('2026-09-19T02:34:00Z'),
    })
    expect(view.tooltip).toContain('2026-09-19')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/statusbar.test.ts`
Expected: FAIL — 无法解析 `../src/statusbar`。

- [ ] **Step 3: 实现 `src/statusbar.ts`**

```ts
import * as vscode from 'vscode'
import type { RefreshResult } from './core/refresh'

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

const SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥', GBP: '£' }

export function formatMoney(value: number, currency: string): string {
  const symbol = SYMBOLS[currency]
  const amount = value.toFixed(2)
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`
}

function beijingStamp(ms: number): string {
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/statusbar.test.ts`
Expected: PASS，11 个测试。

- [ ] **Step 5: Commit**

```bash
git add src/statusbar.ts test/statusbar.test.ts
git commit -m "feat(statusbar): 状态栏渲染纯函数与控制器"
```

---

## Task 14: 三条真实路由 + 侧边栏数据

**Files:**
- Create: `src/routes/balance.ts`, `test/routes-balance.test.ts`
- Modify: `src/webview/host.ts`（加 `mediaMap` 工厂，若 Task 7 已改则跳过）

- [ ] **Step 1: 写失败测试 `test/routes-balance.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { RouteTable } from '../src/routes/registry'
import { registerBalanceRoutes } from '../src/routes/balance'
import type { RefreshResult } from '../src/core/refresh'

function table(results: RefreshResult[], store?: { readJson: (n: string) => Promise<unknown>; writeJson: (n: string, v: unknown) => Promise<void> }) {
  const queue = [...results]
  const refresher = Object.assign(async () => queue.shift() ?? results[results.length - 1], {
    last: () => results[results.length - 1] ?? null,
  }) as { (force?: boolean): Promise<RefreshResult>; last(): RefreshResult | null }
  const t = new RouteTable()
  registerBalanceRoutes(t, {
    refresh: refresher,
    readSize: async () => (store ? (await store.readJson('size.json')) as Record<string, unknown> : {}),
    writeSize: async value => { if (store) await store.writeJson('size.json', value) },
  })
  return t
}

const OK: RefreshResult = {
  state: 'ok', balance: 23.45, currency: 'CNY', todayUsage: 1.02, stale: false,
  observedAt: Date.parse('2026-09-19T02:00:00Z'),
}

describe('balance.json', () => {
  it('返回上游字段形状', async () => {
    const res = await table([OK]).dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      ok: true, totalBalance: 23.45, currency: 'CNY', todayUsage: 1.02, stale: false,
      observedAt: Date.parse('2026-09-19T02:00:00Z'),
    })
  })

  it('未配置密钥时 ok=false 且带 code', async () => {
    const res = await table([{ state: 'no-key', message: '未配置 API Key' }])
      .dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: 'NO_KEY' })
  })

  it('密钥无效映射为 AUTH', async () => {
    const res = await table([{ state: 'auth-error', message: 'bad' }])
      .dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(JSON.parse(res.body).code).toBe('AUTH')
  })

  it('网络异常映射为 NETWORK', async () => {
    const res = await table([{ state: 'network-error', message: 'down' }])
      .dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(JSON.parse(res.body).code).toBe('NETWORK')
  })

  it('?refresh=1 触发实际拉取；无该参数且已有缓存则直接用缓存', async () => {
    const seen: boolean[] = []
    const t = new RouteTable()
    registerBalanceRoutes(t, {
      refresh: Object.assign(async (force?: boolean) => { seen.push(force === true); return OK }, { last: () => OK }),
      readSize: async () => ({}),
      writeSize: async () => {},
    })
    await t.dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: 'refresh=1' })
    await t.dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(seen).toEqual([true])
  })

  it('只接受 GET', async () => {
    const res = await table([OK]).dispatch({ method: 'PUT', path: '/dsh-whale/balance.json', query: '' })
    expect(res.status).toBe(405)
  })
})

describe('size.json', () => {
  it('GET 返回已存配置', async () => {
    const t = table([OK], { readJson: async () => ({ scale: 1.2 }), writeJson: async () => {} })
    const res = await t.dispatch({ method: 'GET', path: '/dsh-whale/size.json', query: '' })
    expect(JSON.parse(res.body)).toEqual({ scale: 1.2 })
  })

  it('PUT 写入并回 ok', async () => {
    let saved: unknown = null
    const t = table([OK], { readJson: async () => ({}), writeJson: async (_n, v) => { saved = v } })
    const res = await t.dispatch({
      method: 'PUT', path: '/dsh-whale/size.json', query: '',
      body: JSON.stringify({ scale: 0.8 }),
    })
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect(saved).toEqual({ scale: 0.8 })
  })

  it('PUT 非法 JSON 返回 400', async () => {
    const t = table([OK], { readJson: async () => ({}), writeJson: async () => {} })
    const res = await t.dispatch({ method: 'PUT', path: '/dsh-whale/size.json', query: '', body: '{oops' })
    expect(res.status).toBe(400)
  })

  it('PUT 非对象返回 400', async () => {
    const t = table([OK], { readJson: async () => ({}), writeJson: async () => {} })
    const res = await t.dispatch({ method: 'PUT', path: '/dsh-whale/size.json', query: '', body: '[1]' })
    expect(res.status).toBe(400)
  })
})

describe('image.png', () => {
  it('媒体不走路由：返回 404 并提示应走 asWebviewUri', async () => {
    const res = await table([OK]).dispatch({ method: 'GET', path: '/dsh-whale/image.png', query: 'v=2' })
    expect(res.status).toBe(404)
    expect(res.body).toContain('asWebviewUri')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/routes-balance.test.ts`
Expected: FAIL — 无法解析 `../src/routes/balance`。

- [ ] **Step 3: 实现 `src/routes/balance.ts`**

```ts
import { jsonResponse, parseQuery, type RouteRequest, type RouteResponse, type RouteTable } from './registry'
import type { RefreshResult } from '../core/refresh'

export interface BalanceRouteDeps {
  refresh: { (force?: boolean): Promise<RefreshResult>; last(): RefreshResult | null }
  readSize: () => Promise<Record<string, unknown>>
  writeSize: (value: Record<string, unknown>) => Promise<void>
}

const CODE_BY_STATE: Record<string, string> = {
  'no-key': 'NO_KEY',
  'auth-error': 'AUTH',
  'network-error': 'NETWORK',
}

export function registerBalanceRoutes(table: RouteTable, deps: BalanceRouteDeps): void {
  table.register('/dsh-whale/balance.json', async (req: RouteRequest): Promise<RouteResponse> => {
    if (req.method !== 'GET') {
      return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
    }
    const force = parseQuery(req.query).refresh === '1'
    const result = force || !deps.refresh.last() ? await deps.refresh(force) : deps.refresh.last()!
    if (result.state !== 'ok') {
      return jsonResponse({ ok: false, code: CODE_BY_STATE[result.state] ?? 'UNKNOWN', error: result.message ?? '' })
    }
    return jsonResponse({
      ok: true,
      totalBalance: result.balance,
      currency: result.currency,
      todayUsage: result.todayUsage ?? null,
      stale: result.stale === true,
      observedAt: result.observedAt,
    })
  })

  table.register('/dsh-whale/size.json', async (req: RouteRequest): Promise<RouteResponse> => {
    if (req.method === 'GET') {
      return jsonResponse(await deps.readSize())
    }
    if (req.method === 'PUT') {
      let parsed: unknown
      try {
        parsed = JSON.parse(req.body ?? '')
      } catch {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400)
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return jsonResponse({ ok: false, error: 'expected a json object' }, 400)
      }
      await deps.writeSize(parsed as Record<string, unknown>)
      return jsonResponse({ ok: true })
    }
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
  })

  // 媒体不走路由：前端 img.src 由媒体 shim 改写成 asWebviewUri，这里只作兜底提示
  table.register('/dsh-whale/image.png', (req: RouteRequest): RouteResponse => {
    if (req.method !== 'GET') {
      return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
    }
    return { status: 404, contentType: 'text/plain', body: 'media is served via asWebviewUri' }
  })
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/routes-balance.test.ts`
Expected: PASS，11 个测试。

- [ ] **Step 5: Commit**

```bash
git add src/routes/balance.ts test/routes-balance.test.ts
git commit -m "feat(routes): balance.json / size.json / image.png 三条路由"
```

---

## Task 15: 装配根与命令

**Files:**
- Modify: `src/extension.ts`（替换 Task 7 的存根）

- [ ] **Step 1: 重写 `src/extension.ts`**

```ts
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
```

- [ ] **Step 2: 类型检查

Run: `npm run typecheck && npm run test`
Expected: 类型无错误；测试全绿（registry 15 + shim 12 + host 7 + placeholder 4 + accounting 10 + store 6 + deepseek 13 + credentials 8 + refresh 8 + statusbar 11 + routes 11 = 105）。

- [ ] **Step 3: 构建**

Run: `npm run build`
Expected: 三个 dist 文件，无错误。

- [ ] **Step 4: Commit**

```bash
git add src/ test/
git commit -m "feat: 装配扩展根：状态栏轮询、命令、路由接线"
```

---

## Task 16: 许可与归属

**Files:**
- Create: `LICENSE`, `NOTICE.md`, `README.md`

- [ ] **Step 1: 写 `LICENSE`**

```
MIT License

Copyright (c) 2026 shen-1358

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: 写 `NOTICE.md`**

````markdown
# 第三方归属声明

## DeepSeek-Balance-Whale-Widget（记账内核）

- 来源：https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget
- 许可：MIT License，Copyright (c) 2026 MeteorNOX
- 使用方式：`src/core/accounting.mjs` 为该仓库 `lib/accounting.mjs` 的**逐字节原样复制**，未做任何修改
- 校验：`sha256sum` 与上游 `main` 分支同名文件一致

该文件的完整 MIT 许可文本见仓库根 `LICENSE`（与本项目同一许可类型）。
本项目对上游代码未做修改，因此不产生衍生作品声明；若未来需要修改该文件，须在文件头保留上游版权声明。

## 未使用的上游资产

上游仓库 `assets/` 目录下的图片、动图与音效**不在 MIT 覆盖范围内**（见上游 `PROVENANCE.md`），
本项目**未使用**其中任何文件。

本项目 `media/` 下的图形由 `tools/make-placeholder.mjs` 以纯几何方式生成，
为本项目原创，随本项目 MIT 许可发布。
````

- [ ] **Step 3: 写 `README.md`**

````markdown
# vscode_whale_widget

在 VSCode 里实时查看 DeepSeek API 余额的小鲸鱼挂件。

> 当前进度：**#0 骨架与通信层**。状态栏已可显示真实余额；鲸鱼形象与交互在 #1 落地。
> 规划见 `docs/superpowers/specs/`。

## 功能（#0）

- 状态栏常驻：`🐋 ¥23.45 · 今日 ¥1.02`
- 60 秒自动刷新（可配置，最小 15 秒），点击立即刷新
- 侧边栏自检页，用于验证通信层
- 今日已用 = 当日余额下降的累计值；充值不冲抵消费
- 密钥存于系统凭据管理器，可回退读取环境变量

## 安装

从 GitHub Releases 下载 `vscode-whale-widget-<version>.vsix`，然后：

```bash
code --install-extension vscode-whale-widget-0.0.1.vsix
```

## 配置密钥

命令面板（`Ctrl+Shift+P`）执行 **鲸鱼: 设置 DeepSeek API Key**。

密钥写入 VSCode `SecretStorage`（Windows 走凭据管理器），不落进 `settings.json`。
也可以改用环境变量：设置 `whaleWidget.envVarName`（默认 `DEEPSEEK_API_KEY`）指向的环境变量。

## 命令

| 命令 | 说明 |
|---|---|
| 鲸鱼: 设置 DeepSeek API Key | 输入并保存密钥 |
| 鲸鱼: 清除已保存的 API Key | 删除凭据管理器中的密钥 |
| 鲸鱼: 立即刷新余额 | 跳过定时器立刻刷新 |
| 鲸鱼: 显示日志 | 打开输出面板 |

## 开发

```bash
npm install
npm run build     # 三入口：extension / shim / probe
npm run watch     # 监听构建
npm run typecheck
npm run test      # vitest
npm run package   # 产出 .vsix
```

按 `F5` 启动扩展开发宿主。

## 设计文档

- 设计：`docs/superpowers/specs/2026-09-19-skeleton-and-bridge-design.md`
- 实现计划：`docs/superpowers/plans/2026-09-19-skeleton-and-bridge.md`

## 许可

MIT。记账内核复用自 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（MIT, Copyright (c) 2026 MeteorNOX），详见 `NOTICE.md`。上游的美术素材不在 MIT 范围内，本项目未使用。
````

- [ ] **Step 4: Commit**

```bash
git add LICENSE NOTICE.md README.md
git commit -m "docs: 许可证、第三方归属声明与 README"
```

---

## Task 17: 全量验收与打包

**Files:** 无新增

- [ ] **Step 1: 清理环境后跑全量测试**

Run:
```bash
rm -rf node_modules dist
npm install
npm run typecheck
npm run test
```

Expected: 依赖安装成功；类型 0 错误；**105 个测试全绿**。

- [ ] **Step 2: 校验内核仍与上游逐字节一致**

Run:
```bash
curl -sL "https://codeload.github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/tar.gz/refs/heads/main" -o /tmp/up.tgz
mkdir -p /tmp/up && tar xzf /tmp/up.tgz -C /tmp/up
sha256sum /tmp/up/DeepSeek-Balance-Whale-Widget-main/lib/accounting.mjs src/core/accounting.mjs
```

Expected: 两行 sha256 **完全相同**。

- [ ] **Step 3: 打包**

Run: `npm run package`
Expected: 产出 `vscode-whale-widget-0.0.1.vsix`；若报 `Invalid extension "name"` 说明 `package.json` 的 `name` 里混入了下划线。

- [ ] **Step 4: 🔍 在干净 VSCode 中安装并逐条验收（spec §11）**

```bash
code --install-extension vscode-whale-widget-0.0.1.vsix
```

逐条核对：

| # | 验收项 | 期望 |
|---|---|---|
| 1 | 启动 VSCode | 状态栏出现 `$(key) 鲸鱼 · 未配置` |
| 2 | 执行 `鲸鱼: 设置 DeepSeek API Key` 并填入真实密钥 | 10 秒内状态栏出现真实余额 |
| 3 | 打开侧边栏 | 占位页余额与状态栏数字一致 |
| 4 | 把密钥改错（填入 `sk-wrong`）后刷新 | 状态栏显示 `Key 无效`，扩展不崩 |
| 5 | 断开网络后点刷新 | 显示旧值 + `~` 前缀；恢复网络后自动转正常 |
| 6 | `npm run test` | 全绿 |
| 7 | `npm run package` | 产出 `.vsix` 且可安装 |
| 8 | 查 `docs/.../spec` §12 | M1 结论已记录 |

- [ ] **Step 5: 打 tag 并提交**

```bash
git tag -a v0.0.1 -m "#0 骨架与通信层：状态栏余额 + 分治桥通信层"
git log --oneline
```

- [ ] **Step 6: 输出 #0 的最终汇报**

在 `docs/superpowers/plans/` 中追加 `2026-09-19-skeleton-and-bridge-completion.md`，记录：
1. 每条验收项的实际结果
2. M1 探针的实测结论（spec §12 的两项）
3. 与计划的偏差及原因
4. 遗留给 #1 的问题清单

---

## 完成定义

- 全部 17 个 Task 的 checkbox 已勾选
- `npm run typecheck` 0 错误，`npm run test` 105 个测试全绿
- spec §11 的 8 条验收全部通过
- `src/core/accounting.mjs` 与上游 sha256 一致
- 产出可安装的 `.vsix`

---

# 执行偏差记录

## 预检修正（动手前发现，已在计划中修正）

| # | 问题 | 若不修的后果 | 修正 |
|---|---|---|---|
| 1 | `esbuild.mjs` 是三入口，但 `src/webview/shim.ts` / `probe.ts` 要到 Task 4/7 才创建 | Task 1 的 `npm run build` 直接报 `Could not resolve`，**第 9 步就卡死** | Task 1 Step 8 改为创建三个占位源文件 |
| 2 | 内核的类型声明命名为 `accounting.d.ts` | TypeScript 对 `x.mjs` 只认 `x.d.mts`；`accounting.d.ts` 会被忽略 → `import type { Ledger } from './accounting.mjs'` 报类型错误 | 重命名为 `accounting.d.mts`，并把 `tsconfig.include` 加上 `src/**/*.mts` |
| 3 | 缺 `.vscodeignore` | `.vsix` 会把 `src/`、`test/`、`docs/` 一起打进去 | Task 1 Step 1 增加 `.vscodeignore` |

## Task 1 执行记录

**依赖版本上调**（计划原定 vitest ^2.1.8 / esbuild ^0.24.2）：

- `npm audit` 报 5 个漏洞（3 moderate / 1 high / 1 critical），全部集中在 vitest / vite / esbuild 的开发期依赖树
- 逐个核实触发条件：**均只在"起 dev server / Vitest UI server"时成立**，本项目只用 `vitest run`（批处理）与 esbuild CLI 构建，技术上不受影响
- 鉴于本仓库要公开发布，且**当时一个测试都还没写（升 vitest 的零迁移成本时刻）**，决定升级：
  - `vitest` 2.1.9 → **5.0.1**
  - `esbuild` 0.24.2 → **0.28.2**
  - `typescript` 保持 5.7.2（不在审计范围内，5→7 跨两个大版本属无谓风险）
- 升级过程：首次 `npm install` 因旧 lock 文件的 vite 5.x 与 vitest 5 的 `peer vite@^6|^7|^8` 冲突而 ERESOLVE，清掉 `node_modules` + `package-lock.json` 后重装成功
- 结果：**`npm audit` → found 0 vulnerabilities**；`npm run build` 与 `npm run typecheck` 均通过

**本 Step 的已知状态**：`npx vitest run` 此时报 `No test files found, exiting with code 1`，属预期——第一个测试文件在 Task 2 才出现。

## Task 3 执行记录

**新增 `test/placeholder-image.test.ts`（4 个测试）** —— 计划的 Task 3 原本只有"用资源管理器打开看图"这一步人工确认。执行时该步骤**抓出了两个真 bug**：

| 现象 | 原因 |
|---|---|
| 眼睛整个消失 | 判定顺序：`if (在身体内) return` 写在眼睛判定之前 → 眼睛分支永远不可达 |
| 瞳孔消失、只剩白眼白 | 修了上一条后：眼白判定写在瞳孔判定之前 → 瞳孔分支永远不可达 |
| 嘴消失 | 腹部判定 `return BELLY` 提前返回 → 写在它之后的嘴判定被短路 |

这三个都是同一类错误（**`if` 链的判定顺序让分支不可达**），且在 96px 的显示尺寸下**肉眼几乎无法发现**——
第一版图形看起来"像只蓝色的东西"，真实情况是眼睛、瞳孔、嘴**全都没画出来**。

因此把那次临时验证固化成测试：用零依赖 PNG 解码器采样 7 个部位 + 背景的颜色。
判定顺序再次写反时，测试会直接指出是哪个部位不对。

> ⚠️ #1 用真实鲸鱼形象替换占位图时，此测试需同步更新或删除。

测试总数因此由 101 变为 **105**。
