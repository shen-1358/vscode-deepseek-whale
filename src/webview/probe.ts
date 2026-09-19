/**
 * M1 探针：在真实 webview 中验证分治桥的两个 shim 是否成立。
 *
 * 这是整个 #0 的关键验收点——如果这里的任何一条失败，
 * 说明「数据过消息通道 + 媒体走 asWebviewUri」的方案不成立，需要回头重新设计。
 *
 * 保留为常驻自检页：以后改了 shim 或 CSP，打开侧边栏就能立刻看出问题。
 */
import { installShims } from './shim'

const root = document.getElementById('probe')
const lines: string[] = []

function report(label: string, ok: boolean, detail: string): void {
  lines.push(`${ok ? '✅' : '❌'} ${label} — ${detail}`)
}

function render(): void {
  if (!root) return
  const failed = lines.filter(l => l.startsWith('❌')).length
  const summary = failed === 0 ? '全部通过' : `${failed} 项失败`
  root.innerHTML =
    `<p style="margin:0 0 8px;font-weight:600">通信层自检：${summary}</p>` +
    `<pre style="white-space:pre-wrap;font-size:12px;line-height:1.6;margin:0">${lines.join('\n')}</pre>`
}

async function checkMediaShim(): Promise<void> {
  const img = document.createElement('img')
  img.width = 96
  img.height = 96
  img.alt = '占位鲸鱼'
  img.style.display = 'block'
  img.style.margin = '0 0 8px'

  const loaded = new Promise<boolean>(resolve => {
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
  })

  // 故意带上查询串，同时验证「查询串保留」这条规则
  img.src = '/dsh-whale/image.png?v=2'
  document.body.insertBefore(img, root)

  // 注意：img.src 的 getter 永远返回解析后的绝对 URL，
  // 所以不能用「是否仍以 /dsh-whale/ 开头」来判断是否被改写（那恒为真）。
  // 改为检查是否指向映射目标文件，这才是「改写发生了」的证据。
  const rewritten = img.src.includes('placeholder-whale.png')
  report('媒体 URL 被改写为映射目标', rewritten, img.src.slice(0, 72))

  const ok = await loaded
  report('图片实际加载成功', ok, ok ? `${img.naturalWidth}×${img.naturalHeight}` : 'onerror 触发')
}

async function checkBalanceRoute(): Promise<void> {
  const res = await fetch('/dsh-whale/balance.json', { cache: 'no-store' })
  report('fetch 返回 Response 实例', res instanceof Response, res.constructor.name)
  report('response.status 可读', typeof res.status === 'number', `status=${res.status}`)
  report('response.ok 语义正确', res.ok === (res.status >= 200 && res.status < 300), `ok=${res.ok}`)
  const data = (await res.json()) as { ok?: boolean; stub?: boolean }
  report('response.json() 可解析', typeof data === 'object' && data !== null, JSON.stringify(data).slice(0, 96))
}

async function checkPutPassThrough(): Promise<void> {
  const res = await fetch('/dsh-whale/size.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ probe: true }),
  })
  const data = (await res.json()) as { ok?: boolean }
  report('PUT 的 method 与 body 透传', res.status === 200 && data.ok === true, `status=${res.status} body=${JSON.stringify(data)}`)
}

async function checkUnknownRoute(): Promise<void> {
  const res = await fetch('/dsh-whale/definitely-not-registered.json')
  report('未注册路由返回 404 而非抛错', res.status === 404, `status=${res.status}`)
}

async function run(): Promise<void> {
  try {
    const { media } = installShims()
    report('注入的媒体映射条目数', media.size() > 0, String(media.size()))
    await checkMediaShim()
    await checkBalanceRoute()
    await checkPutPassThrough()
    await checkUnknownRoute()
  } catch (err) {
    report('未捕获异常', false, err instanceof Error ? `${err.name}: ${err.message}` : String(err))
  } finally {
    // 无论中途是否抛错都要渲染，否则用户看到的是一片空白、无从排查
    render()
  }
}

void run()
