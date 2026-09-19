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

// ---------------------------------------------------------------------------
// 以下部分直接操作 DOM，只能在真实 webview（Chromium）中运行，
// 因此由 Task 7 的探针页面实测，不纳入 Node 单元的测试范围。
// 上面那些纯函数则被 test/shim.test.ts 覆盖。
// ---------------------------------------------------------------------------

export interface ShimResponse {
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
  // acquireVsCodeApi() 每个 webview 会话只能调用一次，所以整个挂件共用这一个实例。
  const vscode = acquireVsCodeApi()
  const pending = new Map<number, Pending>()
  let seq = 0

  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as {
      ch?: string
      kind?: string
      id?: number
      status?: number
      contentType?: string
      body?: string
      name?: string
      payload?: unknown
    }
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
      window.dispatchEvent(
        new CustomEvent('dshw:event', { detail: { name: msg.name, payload: msg.payload } })
      )
    }
  })

  return {
    post(message) {
      vscode.postMessage(message)
    },
    request(method, url, body) {
      const id = ++seq
      const { path, query } = splitPathQuery(url)
      return new Promise<ShimResponse>(resolve => {
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

/**
 * 数据类请求的拦截：/dsh-whale/* 的 fetch 不发往网络，
 * 而是包成信封交给宿主的路由表，再合成一个真正的 Response 返回。
 * 因为是真正的 Response，上游前端的 .json() / .ok / .status 全部原样可用。
 */
export function installFetchShim(): void {
  const realFetch = window.fetch.bind(window)

  const patched = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url

    if (!isWhalePath(url)) return realFetch(input as RequestInfo, init)

    const method = (
      init?.method ??
      (typeof input === 'object' && input !== null && 'method' in input ? input.method : 'GET')
    ).toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : undefined

    const res = await getBridge().request(method, url, body)
    return new Response(res.body, {
      status: res.status,
      headers: { 'Content-Type': res.contentType },
    })
  }

  window.fetch = patched as typeof fetch
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

/**
 * 媒体类资源不走 fetch（上游用 img.src / new Audio()），
 * 因此必须在 URL 赋值点改写成 asWebviewUri 指向的地址，
 * 让浏览器通过 VSCode 原生文件服务加载，不经过消息通道。
 */
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

  // new Audio(url) 不走 src setter，需要单独接管构造入口。
  const NativeAudio = window.Audio
  const PatchedAudio = function (this: unknown, src?: string) {
    const el = new NativeAudio()
    if (typeof src === 'string') el.src = src
    return el
  } as unknown as typeof window.Audio
  PatchedAudio.prototype = NativeAudio.prototype
  window.Audio = PatchedAudio

  // 运行期新增的媒体（#4 的用户上传图库）由宿主以事件推送映射。
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
